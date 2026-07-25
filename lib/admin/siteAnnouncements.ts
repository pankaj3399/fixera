import type {
  AnnouncementType,
  SiteAnnouncement as LiveSiteAnnouncement,
} from "@/lib/marketing/siteAnnouncements";
import { authFetch } from "@/lib/utils";
import { formatLocalIsoDate } from "@/lib/dateUtils";
import {
  LOCALE_OPTIONS,
  announcementUsesOverlay,
  nearestDelay,
  nearestPriority,
} from "@/lib/constants/siteAnnouncements";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export type AdminSiteAnnouncement = LiveSiteAnnouncement & {
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
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
    startsAt: formatLocalIsoDate(now),
    endsAt: formatLocalIsoDate(in30),
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
    startsAt: form.startsAt,
    endsAt: form.endsAt,
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
    startsAt: formatLocalIsoDate(new Date(a.startsAt)),
    endsAt: formatLocalIsoDate(new Date(a.endsAt)),
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
    delaySeconds: a.delaySeconds,
    dismissible: a.dismissible,
    requireMarketingConsent: a.requireMarketingConsent,
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
  if (form.endsAt < form.startsAt) {
    return "End date must be on or after the start date";
  }
  return null;
}

export async function fetchSiteAnnouncements(
  filters: AnnouncementListFilters,
  init?: RequestInit,
) {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.search.trim()) params.set("search", filters.search.trim());

  const res = await authFetch(
    `${API_BASE}/api/admin/site-announcements?${params}`,
    init,
  );
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.msg || "Failed to load announcements");
  }
  return (json.data.announcements || []) as AdminSiteAnnouncement[];
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
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.msg || "Save failed");
  }
}

export async function setSiteAnnouncementActive(id: string, isActive: boolean) {
  const res = await authFetch(`${API_BASE}/api/admin/site-announcements/${id}/active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.msg || "Update failed");
  }
}
