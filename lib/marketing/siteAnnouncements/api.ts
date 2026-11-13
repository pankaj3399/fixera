import type { SiteAnnouncement } from "./types";
import { GEO_COUNTRY_COOKIE, GEO_LOCALE_COOKIE } from "./constants";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Active announcements for this visitor. `locale` is the UI language the
 * visitor is reading (their chosen/preferred language); the backend serves
 * the announcement translated into it when a translation exists, else the
 * source text. Falls back to the geo locale cookie, then English.
 */
export async function fetchPublicSiteAnnouncements(
  init?: RequestInit,
  uiLocale?: string,
): Promise<SiteAnnouncement[]> {
  const country = readCookie(GEO_COUNTRY_COOKIE)?.toUpperCase();
  const locale = (uiLocale && /^[a-z]{2}(-[a-z]{2})?$/i.test(uiLocale) ? uiLocale : null)
    || readCookie(GEO_LOCALE_COOKIE)
    || "en";
  const params = new URLSearchParams({ locale });
  if (country && /^[A-Z]{2}$/.test(country)) {
    params.set("country", country);
  }

  const res = await fetch(
    `${API_BASE}/api/public/site-announcements?${params}`,
    { credentials: "omit", ...init },
  );
  const json: unknown = await res.json();

  if (
    !res.ok ||
    typeof json !== "object" ||
    json === null ||
    !("success" in json) ||
    !(json as { success: unknown }).success
  ) {
    throw new Error("Failed to load site announcements");
  }

  const data = (json as { data?: { announcements?: SiteAnnouncement[] } }).data;
  return Array.isArray(data?.announcements) ? data.announcements : [];
}
