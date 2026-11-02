import type { SiteAnnouncement } from "./types";

/**
 * First-party announcement counters (admin overview: impressions, clicks,
 * dismissals). Wire contract: POST /api/public/site-announcements/:id/event
 * with { event } → 204. The request carries no cookies or user identifier;
 * it only increments aggregate counters, so it is independent of the
 * consent-gated external analytics in ./analytics.ts.
 *
 * Each event is sent at most once per page load for the same announcement
 * version and occurrence: one impression per reveal (a `once_pageview` modal
 * re-reveals on every page and counts each time), one click and one
 * dismissal. Admin previews are never recorded.
 */
export type AnnouncementEvent = "impression" | "click" | "dismissal";

type Send = (url: string, init: RequestInit) => unknown;

const defaultSend: Send = (url, init) => {
  if (typeof fetch !== "function") return;
  // Fire-and-forget: counters must never break or delay the page.
  void fetch(url, init).catch(() => undefined);
};

export function createAnnouncementEventRecorder({
  apiBase,
  send = defaultSend,
}: {
  apiBase: string;
  send?: Send;
}) {
  const recorded = new Set<string>();
  return (
    announcement: Pick<SiteAnnouncement, "_id" | "updatedAt">,
    event: AnnouncementEvent,
    occurrence = "page",
  ): boolean => {
    if (!announcement?._id) return false;
    const key = `${announcement._id}:${announcement.updatedAt}:${event}:${occurrence}`;
    if (recorded.has(key)) return false;
    recorded.add(key);
    try {
      send(`${apiBase}/api/public/site-announcements/${encodeURIComponent(announcement._id)}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
        credentials: "omit",
        // Lets a click survive a full-page navigation away from the CTA.
        keepalive: true,
      });
    } catch {
      // Never surface counter failures to visitors.
    }
    return true;
  };
}

export const recordAnnouncementEvent = createAnnouncementEventRecorder({
  apiBase: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000",
});
