import type { SiteAnnouncement } from "./types";
import { GEO_COUNTRY_COOKIE, GEO_LOCALE_COOKIE } from "./constants";
import { readCookie } from "./cookies";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export async function fetchPublicSiteAnnouncements(
  init?: RequestInit,
): Promise<SiteAnnouncement[]> {
  const country = readCookie(GEO_COUNTRY_COOKIE)?.toUpperCase();
  const locale = readCookie(GEO_LOCALE_COOKIE) || "en";
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
  return data?.announcements ?? [];
}
