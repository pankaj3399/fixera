import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  GEO_COUNTRY_COOKIE,
  GEO_LOCALE_COOKIE,
} from "@/lib/marketing/siteAnnouncements/constants";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  PREFERENCE_COOKIE_MAX_AGE,
  type Locale,
  isLocale,
} from "@/i18n/config";
import { countryToLocale, firstPreferredLocale } from "@/i18n/localeResolution";
import { GEO_CURRENCY_COOKIE, countryToCurrency } from "@/lib/currency";
import { resolvePrefixRedirect, resolveLocalizedRequest, splitLocalePrefix } from "@/lib/seo/localeUrls";
import { resolveRequestCountry } from "@/lib/i18n/autoConversion";
import { loadAutoConversionState } from "@/lib/i18n/autoConversionLoader";
import { PLATFORM_COUNTRY_REQUEST_HEADER } from "@/lib/geo/contentCountryHeader";
import {
  formatRouteContext,
  listingFromSearchParams,
  type RouteContextMode,
} from "@/lib/routeContext";

/**
 * Locale/currency resolution (Booking.com style, no i18n routing).
 *
 * Locale:   /en|nl|fr prefix  >  ?lang=xx  >  NEXT_LOCALE cookie  >  geo country
 *           (BE via Accept-Language then x-vercel-ip-country-region, CH via
 *           Accept-Language)  >  Accept-Language  >  en.
 * Currency: NEXT_CURRENCY cookie  >  geo country  >  EUR.
 *
 * Currency is display-only and is resolved in the browser (contexts/CurrencyContext)
 * from the same cookies, so it never varies the server-rendered HTML.
 *
 * Every page request is rewritten to `/<ctx><path>` (app/[ctx], lib/routeContext.ts),
 * where `<ctx>` encodes the resolved locale, content country and URL shape. Pages
 * read it from their params, never from headers or cookies, so public pages are
 * cached as static HTML per context (ISR). Language-prefixed public pages
 * (`/nl/about`) are rewritten to the unprefixed route (`/<ctx>/about`) with the
 * prefix locale forced. Only allowlisted public routes match (see
 * lib/seo/localeUrls.ts), so private paths are never served under a prefix:
 * `/nl/login` becomes `/<ctx>/nl/login`, which no route matches (404). The same
 * holds for a request that already starts with a context segment, so internal
 * paths are not reachable directly. A prefixed visit does not write the
 * NEXT_LOCALE preference cookie: the path is the language.
 *
 * Auto-conversion roll-out (admin Platform settings, see
 * docs/i18n-currency.md): when configured, only visitors from an enabled
 * country get their own geo country; everyone else is treated as the admin's
 * default country for content, language and currency. Manual language/currency
 * choices still win. An authoritative "not configured" keeps the behaviour
 * above for every country. While the config is unknown (cold isolate, backend
 * outage) the previous decision (geo-country cookie) is kept, else the
 * platform default country is used, and no geo cookie is rewritten.
 *
 * The effective country reaches server renders through the route context.
 *
 * Cookies are only written when their value changes, so the common case adds
 * no Set-Cookie to the response (keeps responses cache-friendly).
 */

const GEO_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** Index pages whose `?page=&tag=` listing travels in the route context. */
const LISTING_PATHS: ReadonlySet<string> = new Set(["/blog", "/news"]);

/** Static files served next to the pages (public/, metadata routes). */
const FILE_EXTENSION = /\.(?:js|mjs|css|map|txt|xml|json|html|webmanifest|ico|pdf|woff2?)$/i;

/** Requests that are not page routes and keep their path. */
function isPageRequest(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/__")) return false;
  return !FILE_EXTENSION.test(pathname);
}

function setCookieIfChanged(
  response: NextResponse,
  request: NextRequest,
  name: string,
  value: string,
  maxAge: number
) {
  if (request.cookies.get(name)?.value === value) return;
  response.cookies.set(name, value, { path: "/", sameSite: "lax", maxAge });
}

export async function middleware(request: NextRequest) {
  // --- Geo country (unchanged consumers: site announcements + CMS filtering) ---
  // Vercel injects x-vercel-ip-country on deployed requests; locally it is absent.
  const vercelCountry = (request.headers.get(PLATFORM_COUNTRY_REQUEST_HEADER) || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);

  // Dev/local override only — production uses Vercel geo header.
  const allowGeoOverride =
    process.env.NODE_ENV === "development" ||
    request.nextUrl.hostname === "localhost" ||
    request.nextUrl.hostname === "127.0.0.1";
  const queryGeo = allowGeoOverride
    ? request.nextUrl.searchParams.get("geo")?.trim().toUpperCase().slice(0, 2)
    : undefined;
  const existingCountry = request.cookies
    .get(GEO_COUNTRY_COOKIE)
    ?.value?.toUpperCase();

  // Fresh geo (dev override or platform header) beats the cookie, which may
  // already hold an admin default country from an earlier request.
  const detectedCountry =
    (queryGeo && /^[A-Z]{2}$/.test(queryGeo) && queryGeo) ||
    (vercelCountry && /^[A-Z]{2}$/.test(vercelCountry) && vercelCountry) ||
    (existingCountry && /^[A-Z]{2}$/.test(existingCountry) && existingCountry) ||
    (allowGeoOverride ? "BE" : undefined);

  const autoConversion = await loadAutoConversionState();
  const { country, authoritative } = resolveRequestCountry(
    detectedCountry || undefined,
    existingCountry,
    autoConversion,
  );
  const usesDetectedCountry = country === detectedCountry;

  const acceptLanguage = request.headers.get("accept-language");
  // The region header describes the detected country only.
  const region = usesDetectedCountry ? request.headers.get("x-vercel-ip-country-region") : null;

  // Geo-derived locale. Without a country we still honour Accept-Language.
  const geoLocale: Locale = country
    ? countryToLocale(country, { acceptLanguage, region })
    : firstPreferredLocale(acceptLanguage) ?? DEFAULT_LOCALE;

  // A public page without a prefixed twin (`/nl/search`): keep the language via
  // ?lang= on the unprefixed page instead of a 404.
  const prefixRedirect = resolvePrefixRedirect(request.nextUrl.pathname);
  if (prefixRedirect) {
    const target = request.nextUrl.clone();
    target.pathname = prefixRedirect.path;
    target.searchParams.set("lang", prefixRedirect.locale);
    return NextResponse.redirect(target, 307);
  }

  // --- Locale: language prefix, then explicit ?lang= (persisted), cookie, geo ---
  const localized = resolveLocalizedRequest(request.nextUrl.pathname);
  // A prefixed path that is not a public route (`/nl/login`, `/fr/missing`) is not
  // rewritten and always ends on the 404 page; the prefix still names its language.
  const urlPrefixLocale = localized?.locale ?? splitLocalePrefix(request.nextUrl.pathname)?.locale;
  const queryLang = request.nextUrl.searchParams.get("lang");
  const manualLang = isLocale(queryLang) ? queryLang : undefined;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    urlPrefixLocale ??
    manualLang ??
    (isLocale(cookieLocale) ? cookieLocale : undefined) ??
    geoLocale;

  // --- Currency: display only (resolved in the browser), payments stay in EUR ---
  const geoCurrency = countryToCurrency(country);

  let response: NextResponse;
  if (isPageRequest(request.nextUrl.pathname)) {
    // Prefix stripped for a localized public page; any other path is kept, so an
    // unknown, private-under-prefix or already-internal path finds no route (404).
    const path = localized ? localized.path : request.nextUrl.pathname;
    // Admin UI is English-only; `lang` on <html> must say so for accessibility
    // and spellcheck. The locale cookie/preference itself is not changed.
    const isAdminPath = path === "/admin" || path.startsWith("/admin/");
    const mode: RouteContextMode = localized ? "p" : isAdminPath ? "a" : "u";
    const listing = LISTING_PATHS.has(path)
      ? listingFromSearchParams(request.nextUrl.searchParams)
      : undefined;
    const ctx = formatRouteContext({ locale, country, mode, listing });
    // The browser keeps the URL it asked for.
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = path === "/" ? `/${ctx}` : `/${ctx}${path}`;
    response = NextResponse.rewrite(rewriteUrl);
  } else {
    response = NextResponse.next();
  }

  // Geo cookies persist only decisions taken from an authoritative config, so
  // an isolate that cannot reach the backend never overwrites them.
  if (authoritative) {
    if (country) {
      setCookieIfChanged(response, request, GEO_COUNTRY_COOKIE, country, GEO_COOKIE_MAX_AGE);
    }
    // geo_locale is only ever en|nl|fr (consumers assume a supported locale).
    setCookieIfChanged(response, request, GEO_LOCALE_COOKIE, geoLocale, GEO_COOKIE_MAX_AGE);
    setCookieIfChanged(response, request, GEO_CURRENCY_COOKIE, geoCurrency, GEO_COOKIE_MAX_AGE);
  } else if (!request.cookies.has(GEO_CURRENCY_COOKIE)) {
    // The browser resolves the display currency from cookies, so it always needs
    // one. Without an authoritative config only a missing cookie is written (the
    // fallback country's currency); an existing decision is never overwritten.
    response.cookies.set(GEO_CURRENCY_COOKIE, geoCurrency, {
      path: "/",
      sameSite: "lax",
      maxAge: GEO_COOKIE_MAX_AGE,
    });
  }

  if (manualLang && !urlPrefixLocale) {
    setCookieIfChanged(response, request, LOCALE_COOKIE, manualLang, PREFERENCE_COOKIE_MAX_AGE);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|(?:sw\\.js|manifest\\.webmanifest|offline\\.html|firebase-messaging-sw-config\\.js|favicon\\.ico)$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|ico)$).*)",
  ],
};
