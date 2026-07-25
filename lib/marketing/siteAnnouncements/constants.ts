export const ANNOUNCE_BANNER_HEIGHT_PX = "36px";

export const DISMISS_STORAGE_PREFIX = "fixera-announce-dismiss:";
export const PREVIEW_DURATION_MS = 5000;

export const GEO_COUNTRY_COOKIE = "fixera_geo_country";
export const GEO_LOCALE_COOKIE = "fixera_geo_locale";

export const SKIP_PATH_PREFIXES = [
  "/admin",
  "/login",
  "/signup",
  "/register",
] as const;

export function shouldSkipAnnouncements(pathname: string | null): boolean {
  if (!pathname) return false;
  return SKIP_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
