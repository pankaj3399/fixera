/**
 * Admin client for site announcement auto-translation (per-locale status,
 * retry/force runs, manual edits). The admin UI stays English.
 */
import { authFetch } from "@/lib/utils";
import { ApiRequestError, apiErrorFromBody } from "@/lib/apiErrors";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export type AnnouncementLocaleState =
  | "source"
  | "pending"
  | "up_to_date"
  | "stale"
  | "missing"
  | "failed"
  | "manual";

export interface AnnouncementLocaleTranslation {
  title: string;
  message: string;
  ctaLabel?: string;
  mode: "machine" | "manual";
  updatedAt?: string;
}

export interface AnnouncementLocaleStatus {
  locale: string;
  state: AnnouncementLocaleState;
  sourceChanged?: boolean;
  translation?: AnnouncementLocaleTranslation;
  lastResult?: { status: string; errorCode?: string; error?: string; at?: string };
}

export interface AnnouncementTranslationStatus {
  enabled: boolean;
  supported: boolean;
  sourceLocale: string;
  running: boolean;
  queued: boolean;
  lastRunAt?: string;
  locales: AnnouncementLocaleStatus[];
}

export const TRANSLATION_LOCALE_LABELS: Record<string, string> = {
  en: "English",
  nl: "Dutch",
  fr: "French",
  de: "German",
};

export const TRANSLATION_STATE_META: Record<AnnouncementLocaleState, { label: string; tone: string }> = {
  source: { label: "Source", tone: "bg-slate-100 text-slate-700" },
  pending: { label: "Translating…", tone: "bg-sky-100 text-sky-700" },
  up_to_date: { label: "Machine translated", tone: "bg-emerald-100 text-emerald-700" },
  stale: { label: "Outdated (source changed)", tone: "bg-amber-100 text-amber-700" },
  missing: { label: "Not translated", tone: "bg-slate-100 text-slate-600" },
  failed: { label: "Failed", tone: "bg-rose-100 text-rose-700" },
  manual: { label: "Edited manually", tone: "bg-violet-100 text-violet-700" },
};

/** Poll while a background run is in flight or any locale is pending. */
export function shouldPollTranslationStatus(status: AnnouncementTranslationStatus | null | undefined): boolean {
  if (!status) return false;
  return status.running || status.queued || status.locales.some((l) => l.state === "pending");
}

/** What visitors in this locale currently see. */
export function visitorTextSource(entry: AnnouncementLocaleStatus): "source" | "translation" {
  if (entry.state === "manual" || entry.state === "up_to_date") return "translation";
  return "source";
}

export function parseTranslationStatus(value: unknown): AnnouncementTranslationStatus | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.locales)) return null;
  const locales = raw.locales.flatMap((entry): AnnouncementLocaleStatus[] => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.locale !== "string" || typeof e.state !== "string" || !(e.state in TRANSLATION_STATE_META)) {
      return [];
    }
    const t = e.translation as Record<string, unknown> | undefined;
    return [
      {
        locale: e.locale,
        state: e.state as AnnouncementLocaleState,
        ...(e.sourceChanged === true ? { sourceChanged: true } : {}),
        ...(t && typeof t.title === "string" && typeof t.message === "string"
          ? {
              translation: {
                title: t.title,
                message: t.message,
                ...(typeof t.ctaLabel === "string" ? { ctaLabel: t.ctaLabel } : {}),
                mode: t.mode === "manual" ? "manual" : "machine",
                ...(typeof t.updatedAt === "string" ? { updatedAt: t.updatedAt } : {}),
              },
            }
          : {}),
        ...(e.lastResult && typeof e.lastResult === "object"
          ? { lastResult: e.lastResult as AnnouncementLocaleStatus["lastResult"] }
          : {}),
      },
    ];
  });
  return {
    enabled: raw.enabled === true,
    supported: raw.supported !== false,
    sourceLocale: typeof raw.sourceLocale === "string" ? raw.sourceLocale : "en",
    running: raw.running === true,
    queued: raw.queued === true,
    ...(typeof raw.lastRunAt === "string" ? { lastRunAt: raw.lastRunAt } : {}),
    locales,
  };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
}

async function statusRequest(url: string, init: RequestInit, fallback: string) {
  const res = await authFetch(url, init);
  const json = (await readJson(res)) as { success?: unknown; data?: { translationStatus?: unknown } } | null;
  if (!res.ok || !json?.success) {
    throw apiErrorFromBody(json, fallback, { status: res.status });
  }
  const status = parseTranslationStatus(json.data?.translationStatus);
  if (!status) {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  return status;
}

export function fetchAnnouncementTranslations(id: string, init?: RequestInit) {
  return statusRequest(
    `${API_BASE}/api/admin/site-announcements/${encodeURIComponent(id)}/translations`,
    { ...init },
    "Could not load translations",
  );
}

/** Retry (missing/stale/failed) or, with force, overwrite the given locales (manual included). */
export function runAnnouncementTranslations(id: string, options: { locales?: string[]; force?: boolean } = {}) {
  return statusRequest(
    `${API_BASE}/api/admin/site-announcements/${encodeURIComponent(id)}/translations/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(options.locales?.length ? { locales: options.locales } : {}),
        ...(options.force ? { force: true } : {}),
      }),
    },
    "Could not start translation",
  );
}

export function saveAnnouncementTranslation(
  id: string,
  locale: string,
  value: { title: string; message: string; ctaLabel?: string },
) {
  return statusRequest(
    `${API_BASE}/api/admin/site-announcements/${encodeURIComponent(id)}/translations/${encodeURIComponent(locale)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: value.title.trim(),
        message: value.message.trim(),
        ...(value.ctaLabel?.trim() ? { ctaLabel: value.ctaLabel.trim() } : {}),
      }),
    },
    "Could not save translation",
  );
}
