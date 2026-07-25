import type { AnnouncementType } from "@/lib/marketing/siteAnnouncements";
import { EU_COUNTRIES } from "@/lib/countries";

/** Primary markets for site announcement targeting. */
export const SITE_ANNOUNCEMENT_COUNTRY_CODES = ["BE", "NL", "FR", "DE", "LU"] as const;

export const SITE_ANNOUNCEMENT_COUNTRY_OPTIONS = SITE_ANNOUNCEMENT_COUNTRY_CODES.map((code) => {
  const country = EU_COUNTRIES.find((c) => c.code === code);
  return {
    value: code,
    label: country?.name ?? code,
    hint: code,
  };
});

export const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "nl", label: "Dutch" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
] as const;

export const DELAY_OPTIONS = [
  { value: "0", label: "Immediately" },
  { value: "1", label: "After 1 second" },
  { value: "3", label: "After 3 seconds" },
  { value: "5", label: "After 5 seconds" },
  { value: "10", label: "After 10 seconds" },
] as const;

export const PRIORITY_OPTIONS = [
  { value: "0", label: "Normal" },
  { value: "5", label: "Higher" },
  { value: "10", label: "Highest" },
] as const;

export const PLACEMENT_OPTIONS = [
  { value: "top_bar", label: "Banner under navbar" },
  { value: "modal", label: "Popup on the page" },
  { value: "exit_intent", label: "Exit offer" },
] as const;

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "disabled", label: "Disabled" },
] as const;

export const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "top_bar", label: "Banner" },
  { value: "modal", label: "Popup" },
  { value: "exit_intent", label: "Exit offer" },
] as const;

export const TYPE_LABELS: Record<AnnouncementType, string> = {
  top_bar: "Banner",
  modal: "Popup",
  exit_intent: "Exit offer",
};

export const SELECT_TRIGGER_CLASS = "h-9 w-full text-sm";

const ALLOWED_DELAYS = [0, 1, 3, 5, 10] as const;

export function nearestDelay(seconds: number): string {
  const best = ALLOWED_DELAYS.reduce((a, b) =>
    Math.abs(b - seconds) < Math.abs(a - seconds) ? b : a,
  );
  return String(best);
}

export function nearestPriority(priority: number): string {
  if (priority >= 8) return "10";
  if (priority >= 3) return "5";
  return "0";
}

export function localeLabel(locale: string): string {
  return LOCALE_OPTIONS.find((l) => l.value === locale)?.label ?? locale;
}

export function announcementUsesOverlay(type: AnnouncementType): boolean {
  return type === "modal" || type === "exit_intent";
}
