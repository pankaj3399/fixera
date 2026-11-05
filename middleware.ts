import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  GEO_COUNTRY_COOKIE,
  GEO_LOCALE_COOKIE,
} from "@/lib/marketing/siteAnnouncements/constants";
import {
  CURRENCY_COOKIE,
  CURRENCY_REQUEST_HEADER,
  DEFAULT_LOCALE,
  DOCUMENT_LOCALE_REQUEST_HEADER,
  LOCALE_COOKIE,
  LOCALE_REQUEST_HEADER,
  PREFERENCE_COOKIE_MAX_AGE,
  type Locale,
  isLocale,
} from "@/i18n/config";
import { countryToLocale, firstPreferredLocale } from "@/i18n/localeResolution";
import {
  GEO_CURRENCY_COOKIE,
  countryToCurrency,
  isSupportedCurrency,
  type CurrencyCode,
} from "@/lib/currency";
import { resolveRequestCountry } from "@/lib/i18n/autoConversion";
import { loadAutoConversionState } from "@/lib/i18n/autoConversionLoader";
import {
  CONTENT_COUNTRY_REQUEST_HEADER,
  PLATFORM_COUNTRY_REQUEST_HEADER,
} from "@/lib/geo/contentCountryHeader";

/**
 * Locale/currency resolution (Booking.com style, no i18n routing).
 *
 * Locale:   ?lang=xx  >  NEXT_LOCALE cookie  >  geo country (BE via
 *           Accept-Language then x-vercel-ip-country-region, CH via
 *           Accept-Language)  >  Accept-Language  >  en.
 * Currency: NEXT_CURRENCY cookie  >  geo country  >  EUR.
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
 * The effective country reaches server renders through the first-party
 * `x-fixera-content-country` request header: any client-supplied value is
 * deleted first, then the middleware sets it.
 *
 * The resolved values are forwarded as request headers because cookies set on
 * this response are not visible to the server render of the same request.
 * Cookies are only written when their value changes, so the common case adds
 * no Set-Cookie to the response (keeps responses cache-friendly).
 */

const GEO_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

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

  // --- Locale: explicit ?lang= wins (any environment, and is persisted) ---
  const queryLang = request.nextUrl.searchParams.get("lang");
  const manualLang = isLocale(queryLang) ? queryLang : undefined;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    manualLang ??
    (isLocale(cookieLocale) ? cookieLocale : undefined) ??
    geoLocale;

  // --- Currency: display only, payments stay in EUR ---
  const geoCurrency: CurrencyCode = countryToCurrency(country);
  const cookieCurrency = request.cookies.get(CURRENCY_COOKIE)?.value;
  const currency: CurrencyCode = isSupportedCurrency(cookieCurrency)
    ? cookieCurrency
    : geoCurrency;

  const requestHeaders = new Headers(request.headers);
  // Server-side CMS/catalog reads use the content country; outside the
  // roll-out they must receive the default country's content. Never trust a
  // client-supplied value of our own header.
  requestHeaders.delete(CONTENT_COUNTRY_REQUEST_HEADER);
  if (country) {
    requestHeaders.set(CONTENT_COUNTRY_REQUEST_HEADER, country);
    // Kept for readers that still use the platform header. Whether the host
    // forwards a middleware override of its own x-vercel-* header unchanged
    // is not relied upon by our readers.
    if (country !== vercelCountry) requestHeaders.set(PLATFORM_COUNTRY_REQUEST_HEADER, country);
  }
  requestHeaders.set(LOCALE_REQUEST_HEADER, locale);
  requestHeaders.set(CURRENCY_REQUEST_HEADER, currency);
  // Admin UI is English-only; `lang` on <html> must say so for accessibility
  // and spellcheck. The locale cookie/preference itself is not changed.
  const isAdminPath =
    request.nextUrl.pathname === "/admin" ||
    request.nextUrl.pathname.startsWith("/admin/");
  requestHeaders.set(DOCUMENT_LOCALE_REQUEST_HEADER, isAdminPath ? "en" : locale);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Geo cookies persist only decisions taken from an authoritative config, so
  // an isolate that cannot reach the backend never overwrites them.
  if (authoritative) {
    if (country) {
      setCookieIfChanged(response, request, GEO_COUNTRY_COOKIE, country, GEO_COOKIE_MAX_AGE);
    }
    // geo_locale is only ever en|nl|fr (consumers assume a supported locale).
    setCookieIfChanged(response, request, GEO_LOCALE_COOKIE, geoLocale, GEO_COOKIE_MAX_AGE);
    setCookieIfChanged(response, request, GEO_CURRENCY_COOKIE, geoCurrency, GEO_COOKIE_MAX_AGE);
  }

  if (manualLang) {
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
