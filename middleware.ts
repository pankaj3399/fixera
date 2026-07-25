import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COUNTRY_COOKIE = "fixera_geo_country";
const LOCALE_COOKIE = "fixera_geo_locale";

/** Map ISO country → default locale for Fixera markets */
function localeForCountry(country: string): string {
  switch (country) {
    case "BE":
    case "NL":
      return "nl";
    case "FR":
    case "LU":
      return "fr";
    case "DE":
    case "AT":
    case "CH":
      return "de";
    default:
      return "en";
  }
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Vercel injects x-vercel-ip-country on deployed requests; locally it is absent.
  const vercelCountry = (request.headers.get("x-vercel-ip-country") || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);

  // Allow local/dev override via query (?geo=BE) or existing cookie
  const queryGeo = request.nextUrl.searchParams.get("geo")?.trim().toUpperCase().slice(0, 2);
  const existing = request.cookies.get(COUNTRY_COOKIE)?.value?.toUpperCase();

  const country =
    (queryGeo && /^[A-Z]{2}$/.test(queryGeo) && queryGeo) ||
    (vercelCountry && /^[A-Z]{2}$/.test(vercelCountry) && vercelCountry) ||
    (existing && /^[A-Z]{2}$/.test(existing) && existing) ||
    "BE"; // default market for local/dev when geo headers missing

  const locale = localeForCountry(country);

  response.cookies.set(COUNTRY_COOKIE, country, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  response.headers.set("x-fixera-country", country);
  response.headers.set("x-fixera-locale", locale);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
