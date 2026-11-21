import { DISMISS_STORAGE_PREFIX } from "./constants";
import type { AnnouncementFrequency, SiteAnnouncement } from "./types";

const FREQUENCY_STORAGE_PREFIX = "fixera-announce-frequency:";
const DEFAULT_FREQUENCY: AnnouncementFrequency = "once_pageview";

const FREQUENCY_MS: Partial<Record<AnnouncementFrequency, number>> = {
  once_week: 7 * 24 * 60 * 60 * 1000,
  once_3_days: 3 * 24 * 60 * 60 * 1000,
  once_day: 24 * 60 * 60 * 1000,
};

function storageKey(announcement: SiteAnnouncement): string {
  return `${DISMISS_STORAGE_PREFIX}${announcement._id}:${announcement.updatedAt}`;
}

function frequencyKey(announcement: SiteAnnouncement): string {
  const frequency = announcement.frequency || DEFAULT_FREQUENCY;
  return `${FREQUENCY_STORAGE_PREFIX}${announcement._id}:${announcement.updatedAt}:${frequency}`;
}

function storageFor(frequency: AnnouncementFrequency): Storage {
  return frequency === "once_session" || frequency === "once_pageview"
    ? window.sessionStorage
    : window.localStorage;
}

function hasValidSuppression(
  announcement: SiteAnnouncement,
  key: string,
): boolean {
  const frequency = announcement.frequency || DEFAULT_FREQUENCY;
  const storage = storageFor(frequency);
  const value = storage.getItem(key);
  if (!value) return false;
  if (frequency === "once" || frequency === "once_session" || frequency === "once_pageview") {
    return true;
  }
  const timestamp = Number(value);
  const duration = FREQUENCY_MS[frequency];
  if (!Number.isFinite(timestamp) || !duration) return false;
  return Date.now() - timestamp < duration;
}

export function isAnnouncementDismissed(announcement: SiteAnnouncement): boolean {
  try {
    if (localStorage.getItem(storageKey(announcement)) === "1") return true;
    // A dismissal holds for the browser session even for "once per page view"
    // campaigns (the frequency only governs how often an undismissed one shows).
    return hasValidSuppression(announcement, `${frequencyKey(announcement)}:dismissed`);
  } catch {
    return false;
  }
}

export function isAnnouncementFrequencyBlocked(
  announcement: SiteAnnouncement,
): boolean {
  if (announcement.type === "top_bar") return false;
  try {
    if (isAnnouncementDismissed(announcement)) return true;
    // A page view is the lifetime of the mounted page. The overlay hooks
    // reset on pathname changes, so this option needs no persistent storage.
    if (announcement.frequency === "once_pageview") return false;
    return (
      hasValidSuppression(announcement, frequencyKey(announcement))
    );
  } catch {
    return false;
  }
}

export function markAnnouncementShown(
  announcement: SiteAnnouncement,
): void {
  try {
    const frequency = announcement.frequency || DEFAULT_FREQUENCY;
    if (frequency === "once_pageview") return;
    const storage = storageFor(frequency);
    storage.setItem(
      frequencyKey(announcement),
      FREQUENCY_MS[frequency] ? String(Date.now()) : "1",
    );
  } catch {
    // Private mode / blocked storage — the current render still succeeds.
  }
}

export function dismissAnnouncement(announcement: SiteAnnouncement): void {
  try {
    const frequency = announcement.frequency || DEFAULT_FREQUENCY;
    // once_pageview: stored in sessionStorage, so a closed popup does not come
    // back on reload during the same visit (CA6).
    const storage = storageFor(frequency);
    storage.setItem(
      `${frequencyKey(announcement)}:dismissed`,
      FREQUENCY_MS[frequency] ? String(Date.now()) : "1",
    );
  } catch {
    // Private mode / blocked storage — session hide still works via React state.
  }
}
