import type {
  AnnouncementType,
  AnnouncementFrequency,
  SiteAnnouncement as LiveSiteAnnouncement,
} from "@/lib/marketing/siteAnnouncements/types";
import { authFetch } from "@/lib/utils";
import { ApiRequestError, apiErrorFromBody } from "@/lib/apiErrors";
import { EU_COUNTRIES } from "@/lib/countries";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

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

export const FREQUENCY_OPTIONS: ReadonlyArray<{ value: AnnouncementFrequency; label: string }> = [
  { value: "once", label: "Once" },
  { value: "once_week", label: "Once/week" },
  { value: "once_3_days", label: "Once/3 days" },
  { value: "once_day", label: "Once/1 day" },
  { value: "once_session", label: "Once/session" },
  { value: "once_pageview", label: "Once/pageview" },
];

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

/** Upper-case locale codes that have a stored translation, e.g. ["NL", "FR"]. */
export function translatedLocaleCodes(a: Pick<AdminSiteAnnouncement, "translations" | "locale">): string[] {
  const source = (a.locale || "en").split("-")[0];
  return Object.entries(a.translations ?? {})
    .filter(([locale, value]) => locale !== source && Boolean(value?.title))
    .map(([locale]) => locale.toUpperCase())
    .sort();
}

export function frequencyLabel(frequency: AnnouncementFrequency): string {
  return FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label ?? frequency;
}

export function announcementUsesOverlay(type: AnnouncementType): boolean {
  return type === "modal" || type === "exit_intent";
}

/** Match server: date-only schedules use Europe/Brussels. */
export const ANNOUNCEMENT_MARKET_TZ = "Europe/Brussels";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatAnnouncementMarketDate(d: Date): string {
  return formatInTimeZone(d, ANNOUNCEMENT_MARKET_TZ, "yyyy-MM-dd");
}

/** Date-only → start/end of that market day as UTC ISO; other strings pass through if valid. */
export function toAnnouncementScheduleIso(value: string, isEnd: boolean): string {
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    const wall = isEnd ? `${trimmed}T23:59:59.999` : `${trimmed}T00:00:00.000`;
    return fromZonedTime(wall, ANNOUNCEMENT_MARKET_TZ).toISOString();
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString();
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export type AdminSiteAnnouncement = LiveSiteAnnouncement & {
  /** Per-locale translations (auto or manual); absent on untranslated announcements. */
  translations?: Partial<Record<string, { title?: string; mode?: "machine" | "manual" }>>;
  isActive: boolean;
  priority: number;
  createdAt: string;
  impressions: number;
  clicks: number;
  dismissals: number;
};

export interface AnnouncementFormState {
  name: string;
  type: AnnouncementType;
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  discountCode: string;
  countries: string[];
  locale: string;
  frequency: AnnouncementFrequency;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  priority: string;
  delaySeconds: string;
  dismissible: boolean;
  requireMarketingConsent: boolean;
}

export interface AnnouncementListFilters {
  status: string;
  type: string;
  search: string;
}

/** Closed = null; create = id null; edit = concrete id. */
export type AnnouncementEditor = {
  id: string | null;
  form: AnnouncementFormState;
} | null;

export function emptyAnnouncementForm(): AnnouncementFormState {
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return {
    name: "",
    type: "top_bar",
    title: "",
    message: "",
    ctaLabel: "Learn more",
    ctaUrl: "/services",
    discountCode: "",
    countries: [],
    locale: "en",
    frequency: "once_pageview",
    startsAt: formatAnnouncementMarketDate(now),
    endsAt: formatAnnouncementMarketDate(in30),
    isActive: true,
    priority: "0",
    delaySeconds: "3",
    dismissible: true,
    requireMarketingConsent: true,
  };
}

export function buildAnnouncementPayload(form: AnnouncementFormState) {
  const usesOverlay = announcementUsesOverlay(form.type);
  return {
    name: form.name.trim(),
    type: form.type,
    title: form.title.trim(),
    message: form.message.trim(),
    ctaLabel: form.type === "top_bar" ? undefined : form.ctaLabel.trim() || undefined,
    ctaUrl: form.ctaUrl.trim() || undefined,
    discountCode: form.discountCode.trim() || undefined,
    activeCountries: form.countries,
    locale: form.locale || "en",
    frequency: announcementUsesOverlay(form.type) ? form.frequency : "once_pageview",
    startsAt: toAnnouncementScheduleIso(form.startsAt, false),
    endsAt: toAnnouncementScheduleIso(form.endsAt, true),
    isActive: form.isActive,
    priority: Number(form.priority) || 0,
    delaySeconds: usesOverlay ? Number(form.delaySeconds) || 0 : 0,
    dismissible: usesOverlay ? form.dismissible : false,
    requireMarketingConsent: form.requireMarketingConsent,
  };
}

export function announcementToForm(a: AdminSiteAnnouncement): AnnouncementFormState {
  return {
    name: a.name,
    type: a.type,
    title: a.title,
    message: a.message,
    ctaLabel: a.ctaLabel || "",
    ctaUrl: a.ctaUrl || "",
    discountCode: a.discountCode || "",
    countries: [...a.activeCountries],
    locale: LOCALE_OPTIONS.some((l) => l.value === a.locale) ? a.locale : "en",
    frequency: FREQUENCY_OPTIONS.some((f) => f.value === a.frequency)
      ? a.frequency
      : "once_pageview",
    startsAt: formatAnnouncementMarketDate(new Date(a.startsAt)),
    endsAt: formatAnnouncementMarketDate(new Date(a.endsAt)),
    isActive: a.isActive,
    priority: nearestPriority(a.priority ?? 0),
    delaySeconds: nearestDelay(a.delaySeconds ?? 3),
    dismissible: a.dismissible !== false,
    requireMarketingConsent: a.requireMarketingConsent !== false,
  };
}

export function toLiveAnnouncement(a: AdminSiteAnnouncement): LiveSiteAnnouncement {
  return {
    _id: a._id,
    name: a.name,
    type: a.type,
    title: a.title,
    message: a.message,
    ctaLabel: a.ctaLabel,
    ctaUrl: a.ctaUrl,
    discountCode: a.discountCode,
    activeCountries: a.activeCountries,
    locale: a.locale,
    frequency: a.frequency,
    delaySeconds: a.delaySeconds,
    dismissible: a.dismissible,
    requireMarketingConsent: a.requireMarketingConsent,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    updatedAt: a.updatedAt,
  };
}

export function announcementStatus(a: AdminSiteAnnouncement): { label: string; tone: string } {
  const now = new Date();
  if (!a.isActive) return { label: "Disabled", tone: "bg-slate-200 text-slate-700" };
  if (now < new Date(a.startsAt)) return { label: "Scheduled", tone: "bg-amber-100 text-amber-700" };
  if (now > new Date(a.endsAt)) return { label: "Expired", tone: "bg-rose-100 text-rose-700" };
  return { label: "Active", tone: "bg-emerald-100 text-emerald-700" };
}

export function validateAnnouncementForm(form: AnnouncementFormState): string | null {
  if (!form.name.trim() || !form.title.trim() || !form.message.trim()) {
    return "Name, title, and message are required";
  }
  if (!form.startsAt.trim() || !form.endsAt.trim()) {
    return "Start and end dates are required";
  }
  if (form.endsAt < form.startsAt) {
    return "End date must be on or after the start date";
  }
  if (
    announcementUsesOverlay(form.type) &&
    !form.dismissible &&
    !form.ctaUrl.trim() &&
    !form.discountCode.trim()
  ) {
    return "A non-closable popup requires a link or discount code";
  }
  return null;
}

export async function fetchSiteAnnouncements(
  filters: AnnouncementListFilters,
  page = 1,
  init?: RequestInit,
) {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  params.set("page", String(page));
  params.set("limit", "20");

  const res = await authFetch(
    `${API_BASE}/api/admin/site-announcements?${params}`,
    init,
  );
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  if (
    !res.ok ||
    typeof json !== "object" ||
    json === null ||
    !("success" in json) ||
    !(json as { success: unknown }).success
  ) {
    throw apiErrorFromBody(json, "Failed to load announcements", { status: res.status });
  }
  const data = (json as {
    data?: { announcements?: unknown; total?: unknown; page?: unknown; limit?: unknown };
  }).data;
  const announcements = data?.announcements;
  return {
    items: (Array.isArray(announcements) ? announcements : []) as AdminSiteAnnouncement[],
    total: Math.max(0, Number(data?.total) || 0),
    page: Math.max(1, Number(data?.page) || page),
    limit: Math.max(1, Number(data?.limit) || 20),
  };
}

export async function saveSiteAnnouncement(
  editingId: string | null,
  form: AnnouncementFormState,
) {
  const payload = buildAnnouncementPayload(form);
  const url = editingId
    ? `${API_BASE}/api/admin/site-announcements/${editingId}`
    : `${API_BASE}/api/admin/site-announcements`;

  const res = await authFetch(url, {
    method: editingId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  const j = json as { success?: unknown; msg?: string } | null;
  if (!res.ok || !j?.success) {
    throw apiErrorFromBody(j, "Save failed", { status: res.status });
  }
}

export async function setSiteAnnouncementActive(id: string, isActive: boolean) {
  const res = await authFetch(`${API_BASE}/api/admin/site-announcements/${id}/active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  const j = json as { success?: unknown; msg?: string } | null;
  if (!res.ok || !j?.success) {
    throw apiErrorFromBody(j, "Update failed", { status: res.status });
  }
}
