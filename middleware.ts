import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  GEO_COUNTRY_COOKIE,
  GEO_LOCALE_COOKIE,
} from "@/lib/marketing/siteAnnouncements/constants";

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

  // Dev/local override only — production uses Vercel geo header.
  const allowGeoOverride =
    process.env.NODE_ENV === "development" ||
    request.nextUrl.hostname === "localhost" ||
    request.nextUrl.hostname === "127.0.0.1";
  const queryGeo = allowGeoOverride
    ? request.nextUrl.searchParams.get("geo")?.trim().toUpperCase().slice(0, 2)
    : undefined;
  const existing = request.cookies.get(GEO_COUNTRY_COOKIE)?.value?.toUpperCase();

  const country =
    (queryGeo && /^[A-Z]{2}$/.test(queryGeo) && queryGeo) ||
    (vercelCountry && /^[A-Z]{2}$/.test(vercelCountry) && vercelCountry) ||
    (existing && /^[A-Z]{2}$/.test(existing) && existing) ||
    (allowGeoOverride ? "BE" : undefined);

  if (country) {
    response.cookies.set(GEO_COUNTRY_COOKIE, country, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
    response.cookies.set(GEO_LOCALE_COOKIE, localeForCountry(country), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
  } else {
    // Unknown production geo: do not invent a country; keep a neutral locale default.
    const existingLocale = request.cookies.get(GEO_LOCALE_COOKIE)?.value;
    if (!existingLocale) {
      response.cookies.set(GEO_LOCALE_COOKIE, "en", {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
  }

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
