import type { SiteAnnouncement } from "./types";

/** Prefer explicit CTA URL; otherwise deep-link discount into services. */
export function resolveAnnouncementHref(
  announcement: SiteAnnouncement,
): string | undefined {
  if (announcement.ctaUrl) return announcement.ctaUrl;
  if (announcement.discountCode) {
    return `/services?discount=${encodeURIComponent(announcement.discountCode)}`;
  }
  return undefined;
}
