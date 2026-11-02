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
 *
 * Transport: the backend is another origin, so the body is sent as
 * `application/x-www-form-urlencoded` (`event=impression`), a CORS-safelisted
 * type. The POST is a "simple" request with no OPTIONS preflight, which keeps
 * `keepalive` (needed for clicks that navigate away) clear of browsers that
 * reject or drop preflighted keepalive requests. The backend's global
 * `express.urlencoded` parser already yields `req.body.event` for this body,
 * exactly as `express.json` does for the JSON form.
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
        // URLSearchParams sets the safelisted urlencoded Content-Type itself;
        // a JSON Content-Type would force a preflight.
        body: new URLSearchParams({ event }),
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
  // Same convention as the other backend callers: the env var, no localhost
  // fallback baked into production builds.
  apiBase: process.env.NEXT_PUBLIC_BACKEND_URL ?? "",
});
