import { DISMISS_STORAGE_PREFIX } from "./constants";

export function isAnnouncementDismissed(id: string): boolean {
  try {
    return localStorage.getItem(`${DISMISS_STORAGE_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

export function dismissAnnouncement(id: string): void {
  try {
    localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${id}`, "1");
  } catch {
    // Private mode / blocked storage — session hide still works via React state.
  }
}
