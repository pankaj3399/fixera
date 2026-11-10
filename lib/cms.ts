import { authFetch, getAuthToken } from "@/lib/utils";
import { ApiRequestError, apiErrorFromBody } from "@/lib/apiErrors";
import { PUBLIC_REVALIDATE_SECONDS } from "@/lib/publicCache";
import { keepLocaleInUrl } from "@/lib/seo/localeUrls";

export type CmsContentType = "blog" | "news" | "faq" | "policy" | "landing";
export type CmsContentStatus = "draft" | "published";

/** Languages the CMS supports (English is the source locale). */
export const CMS_CONTENT_LOCALES = ["en", "nl", "fr"] as const;
export type CmsContentLocale = (typeof CMS_CONTENT_LOCALES)[number];

export const CMS_CONTENT_LOCALE_LABELS: Record<CmsContentLocale, string> = {
  en: "English",
  nl: "Dutch",
  fr: "French",
};

/** Clamp arbitrary CMS locale values to a supported en/nl/fr code. */
export function normalizeCmsContentLocale(value: unknown): CmsContentLocale {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (CMS_CONTENT_LOCALES as readonly string[]).includes(normalized)
    ? (normalized as CmsContentLocale)
    : "en";
}

/**
 * CMS auto-translation types: backend contract v2 (async). A save or retry
 * returns immediate per-locale results (`pending` while the background run
 * translates) plus a `CmsTranslationStatus` the admin UI polls until nothing
 * is pending. See docs/i18n-currency.md.
 */

/** Outcome of one sync step for one target locale. */
export type CmsTranslationResultStatus =
  | "created"
  | "updated"
  | "synced"
  | "pending"
  | "skipped_manual"
  | "failed"
  | "disabled";

export type CmsTranslationErrorCode =
  | "rate_limited"
  | "quota_exceeded"
  | "auth"
  | "timeout"
  | "provider_error"
  | "budget_exceeded"
  | "slug_conflict"
  | "changed_during_run"
  | "interrupted"
  | "internal";

export interface CmsTranslationResult {
  /** Target locale, or "*" when the whole sync crashed. */
  locale: CmsContentLocale | "*";
  status: CmsTranslationResultStatus;
  /** Only when status is "failed". */
  errorCode?: CmsTranslationErrorCode;
  /** Admin-safe sentence from the server; shown verbatim. */
  error?: string;
}

/** Per-target-locale state the admin badges show. */
export type CmsLocaleTranslationState =
  | "source"
  | "pending"
  | "up_to_date"
  | "stale"
  | "missing"
  | "failed"
  | "manual"
  | "blocked";

export interface CmsTranslationLocaleDocument {
  _id: string;
  slug: string;
  title: string;
  status: CmsContentStatus;
  autoTranslated: boolean;
  translatedFrom?: string;
  updatedAt?: string;
}

export interface CmsTranslationLocaleStatus {
  locale: CmsContentLocale;
  state: CmsLocaleTranslationState;
  /** The doc occupying this locale, if any. */
  document?: CmsTranslationLocaleDocument;
  /** Last background run outcome for this locale. */
  lastResult?: CmsTranslationResult & { at: string };
}

/** `GET /api/admin/cms/:id/translations` (and `translationStatus` on admin reads/saves). */
export interface CmsTranslationStatus {
  /** Translator configured on the server. */
  enabled: boolean;
  /** The origin doc (for a translation: its source). */
  sourceId: string;
  sourceLocale: CmsContentLocale;
  /** A background run holds the lease right now. */
  running: boolean;
  /** A run was requested and not yet picked up. */
  queued: boolean;
  lastRunAt?: string;
  /** All 3 locales in CMS order (the source as state "source"). */
  locales: CmsTranslationLocaleStatus[];
}

export interface CmsSaveResult {
  content: CmsContent;
  translations: CmsTranslationResult[];
  /** `data.translationStatus`; undefined when the server could not load it. */
  status?: CmsTranslationStatus;
}

const CMS_TRANSLATION_RESULT_STATUSES: readonly CmsTranslationResultStatus[] = [
  "created",
  "updated",
  "synced",
  "pending",
  "skipped_manual",
  "failed",
  "disabled",
];

const CMS_TRANSLATION_ERROR_CODES: readonly CmsTranslationErrorCode[] = [
  "rate_limited",
  "quota_exceeded",
  "auth",
  "timeout",
  "provider_error",
  "budget_exceeded",
  "slug_conflict",
  "changed_during_run",
  "interrupted",
  "internal",
];

export const CMS_LOCALE_TRANSLATION_STATES: readonly CmsLocaleTranslationState[] = [
  "source",
  "pending",
  "up_to_date",
  "stale",
  "missing",
  "failed",
  "manual",
  "blocked",
];

export function isCmsTranslationResultStatus(value: unknown): value is CmsTranslationResultStatus {
  return (CMS_TRANSLATION_RESULT_STATUSES as readonly unknown[]).includes(value);
}

function isCmsContentLocale(value: unknown): value is CmsContentLocale {
  return (CMS_CONTENT_LOCALES as readonly unknown[]).includes(value);
}

function normalizeCmsTranslationResult(raw: unknown): CmsTranslationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const rawLocale = typeof record.locale === "string" ? record.locale.trim().toLowerCase() : "";
  // A missing or unknown locale is reported as the whole sync ("*"), never dropped.
  const locale = isCmsContentLocale(rawLocale) ? rawLocale : "*";
  const status = isCmsTranslationResultStatus(record.status) ? record.status : "failed";
  const errorCode =
    status === "failed" && (CMS_TRANSLATION_ERROR_CODES as readonly unknown[]).includes(record.errorCode)
      ? (record.errorCode as CmsTranslationErrorCode)
      : undefined;
  const error =
    typeof record.error === "string" && record.error.trim()
      ? record.error.trim()
      : status === "failed" && record.status !== "failed"
        ? "Unexpected translation response"
        : undefined;
  return { locale, status, ...(errorCode ? { errorCode } : {}), ...(error ? { error } : {}) };
}

/**
 * Defensive parser for the top-level `translations` array in save/translate
 * envelopes. An unknown status is reported as `failed` (never dropped, never
 * upgraded to success), and a missing locale means the whole sync ("*").
 */
export function normalizeCmsTranslationResults(input: unknown): CmsTranslationResult[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw) => {
    const result = normalizeCmsTranslationResult(raw);
    return result ? [result] : [];
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function normalizeLocaleStatus(raw: unknown): CmsTranslationLocaleStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isCmsContentLocale(record.locale)) return null;
  // An unknown state is not claimed as anything good: treat it as failed.
  const state = (CMS_LOCALE_TRANSLATION_STATES as readonly unknown[]).includes(record.state)
    ? (record.state as CmsLocaleTranslationState)
    : "failed";
  const entry: CmsTranslationLocaleStatus = { locale: record.locale, state };
  const doc = record.document;
  if (doc && typeof doc === "object" && typeof (doc as Record<string, unknown>)._id === "string") {
    const d = doc as Record<string, unknown>;
    entry.document = {
      _id: d._id as string,
      slug: typeof d.slug === "string" ? d.slug : "",
      title: typeof d.title === "string" ? d.title : "",
      status: d.status === "published" ? "published" : "draft",
      autoTranslated: d.autoTranslated === true,
      ...(optionalString(d.translatedFrom) ? { translatedFrom: d.translatedFrom as string } : {}),
      ...(optionalString(d.updatedAt) ? { updatedAt: d.updatedAt as string } : {}),
    };
  }
  const last = normalizeCmsTranslationResult(record.lastResult);
  if (last) {
    const at = optionalString((record.lastResult as Record<string, unknown>).at) ?? "";
    entry.lastResult = { ...last, at };
  }
  return entry;
}

/**
 * Defensive parser for a `TranslationStatus` payload. Returns undefined when
 * the input is not one (so the UI says "unknown" instead of inventing state).
 */
export function normalizeCmsTranslationStatus(input: unknown): CmsTranslationStatus | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.locales) || typeof record.sourceId !== "string") return undefined;
  const byLocale = new Map<CmsContentLocale, CmsTranslationLocaleStatus>();
  for (const raw of record.locales) {
    const entry = normalizeLocaleStatus(raw);
    if (entry && !byLocale.has(entry.locale)) byLocale.set(entry.locale, entry);
  }
  return {
    // Only an explicit `true` counts as enabled; anything else shows the banner.
    enabled: record.enabled === true,
    sourceId: record.sourceId,
    sourceLocale: normalizeCmsContentLocale(record.sourceLocale),
    running: record.running === true,
    queued: record.queued === true,
    ...(optionalString(record.lastRunAt) ? { lastRunAt: record.lastRunAt as string } : {}),
    locales: CMS_CONTENT_LOCALES.flatMap((locale) => {
      const entry = byLocale.get(locale);
      return entry ? [entry] : [];
    }),
  };
}

/** True while a background run is queued/running or any locale is pending (contract §2). */
export function cmsTranslationInFlight(status: CmsTranslationStatus | undefined): boolean {
  if (!status) return false;
  return status.running || status.queued || status.locales.some((entry) => entry.state === "pending");
}

/** Id of the referenced CMS document (populated object or raw id). */
export function cmsRefId(
  value: CmsContent["translatedFrom"] | null | undefined
): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "object" && typeof value._id === "string") return value._id || undefined;
  return undefined;
}

export const CMS_TYPE_LABELS: Record<CmsContentType, string> = {
  blog: "Blog",
  news: "News",
  faq: "FAQ",
  policy: "Policy",
  landing: "Landing Page",
};

export const CMS_TYPE_ORDER: CmsContentType[] = ["blog", "news", "faq", "policy", "landing"];

export interface CmsSeo {
  titleTag?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
}

export interface CmsContent {
  _id: string;
  type: CmsContentType;
  title: string;
  slug: string;
  locale: string;
  body: string;
  excerpt?: string;
  coverImage?: string;
  /** Accessible/SEO alt text for the cover image. Falls back to title when empty. */
  coverImageAlt?: string;
  category?: string;
  tags: string[];
  status: CmsContentStatus;
  author?: { _id: string; name?: string; email?: string } | string;
  authorOverride?: string;
  publishedAt?: string;
  seo: CmsSeo;
  relatedContent?: Array<
    | string
    | {
        _id: string;
        title?: string;
        slug?: string;
        type?: CmsContentType;
        excerpt?: string;
        coverImage?: string;
        coverImageAlt?: string;
        publishedAt?: string;
        updatedAt?: string;
        createdAt?: string;
      }
  >;
  relatedServices?: Array<{ _id: string; name?: string; slug?: string } | string>;
  relatedServiceSlug?: string;
  /** ISO 3166-1 alpha-2 codes; empty = visible in all countries */
  activeCountries?: string[];
  /** True when this document was generated by the server translation sync. */
  autoTranslated?: boolean;
  /** Source document id when this document is a translation (machine or manual). */
  translatedFrom?: string | { _id: string; title?: string; slug?: string; locale?: string };
  /** Hash of the translatable source fields used to detect stale translations. */
  sourceHash?: string;
  /** Other-locale members of the translation family, by `translatedFrom` link (admin reads). */
  localeVariants?: CmsLocaleVariant[];
  /**
   * Admin reads/saves (contract v2): the family's translation status, raw from
   * the server (omitted if its lookup failed). Read it through
   * `normalizeCmsTranslationStatus`.
   */
  translationStatus?: unknown;
  viewCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** One other-locale document of a translation group, as shown in admin links. */
export interface CmsLocaleVariant {
  _id: string;
  locale: string;
  slug: string;
  title: string;
  status: CmsContentStatus;
  autoTranslated: boolean;
  translatedFrom?: string;
  updatedAt?: string;
}

export interface CmsUpsertPayload {
  type?: CmsContentType;
  title?: string;
  slug?: string;
  locale?: string;
  body?: string;
  excerpt?: string;
  coverImage?: string;
  coverImageAlt?: string | null;
  category?: string;
  tags?: string[];
  status?: CmsContentStatus;
  author?: string;
  authorOverride?: string;
  publishedAt?: string;
  seo?: CmsSeo;
  relatedContent?: string[];
  relatedServices?: string[];
  relatedServiceSlug?: string;
  activeCountries?: string[];
}

export interface CmsServiceOption {
  slug: string;
  label: string;
}

export function cmsAuthorName(item: Pick<CmsContent, "author" | "authorOverride">): string | undefined {
  if (item.authorOverride && item.authorOverride.trim()) return item.authorOverride.trim();
  if (typeof item.author === "object" && item.author) {
    const name = item.author.name?.trim();
    if (name) return name;
  }
  if (typeof item.author === "string" && item.author.trim()) return item.author.trim();
  return undefined;
}

/** Prefer explicit cover alt text; fall back to the content title for SEO/a11y. */
export function cmsCoverAlt(item: Pick<CmsContent, "title" | "coverImageAlt">): string {
  const alt = item.coverImageAlt?.trim();
  return alt || item.title || "Cover image";
}

/** Persist unsigned S3 locators. Preview may use a presigned URL; the API must not. */
export function persistableCmsMediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isS3 =
      /^[\w.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host) ||
      /^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host);
    if (!isS3) return trimmed;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString() || undefined;
  } catch {
    return trimmed;
  }
}

function rewriteImgSrcAttributes(attrs: string, rewriteSrc: (src: string) => string): string {
  let out = "";
  let i = 0;
  while (i < attrs.length) {
    const ch = attrs[i];
    if (ch === '"' || ch === "'") {
      const end = attrs.indexOf(ch, i + 1);
      const take = end === -1 ? attrs.length : end + 1;
      out += attrs.slice(i, take);
      i = take;
      continue;
    }

    const rest = attrs.slice(i);
    const m = rest.match(/^(src)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>=]+))/i);
    const prev = i === 0 ? " " : attrs[i - 1];
    if (m && /[\s/]/.test(prev)) {
      const raw = m[3] ?? m[4] ?? m[5] ?? "";
      const next = rewriteSrc(raw);
      const quote = m[3] !== undefined ? '"' : m[4] !== undefined ? "'" : "";
      out += `src${m[2]}${quote}${next}${quote}`;
      i += m[0].length;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

function replaceImgTags(html: string, rewriteAttrs: (attrs: string) => string): string {
  let result = "";
  let i = 0;
  const needle = "<img";
  const lower = html.toLowerCase();
  while (i < html.length) {
    const start = lower.indexOf(needle, i);
    if (start === -1) {
      result += html.slice(i);
      break;
    }
    result += html.slice(i, start);
    let j = start + needle.length;
    let quote: '"' | "'" | null = null;
    while (j < html.length) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        const attrs = html.slice(start + needle.length, j);
        result += `<img${rewriteAttrs(attrs)}>`;
        i = j + 1;
        break;
      }
      j += 1;
    }
    if (j >= html.length) {
      result += html.slice(start);
      break;
    }
  }
  return result;
}

export function persistableCmsHtml(html?: string): string {
  if (!html) return "";
  if (!/<img\b/i.test(html)) return html;
  return replaceImgTags(html, (attrs) =>
    rewriteImgSrcAttributes(attrs, (src) => persistableCmsMediaUrl(src) || src),
  );
}

export function relatedContentIds(item: Pick<CmsContent, "relatedContent">): string[] {
  if (!Array.isArray(item.relatedContent)) return [];
  return item.relatedContent
    .map((r) => (typeof r === "string" ? r : r?._id))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function humanizeCmsSlug(slug: string): string {
  const cleaned = (slug || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Service";
  return cleaned
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export interface FaqCategory {
  slug: string;
  name: string;
}

export interface CmsListResponse {
  items: CmsContent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const API = process.env.NEXT_PUBLIC_BACKEND_URL || "";

interface ParsedCmsEnvelope<T> {
  data: T | undefined;
  translations: CmsTranslationResult[];
  /** The whole JSON body (undefined for 204), for other top-level fields. */
  payload: Record<string, unknown> | undefined;
}

/**
 * Reads the whole API envelope instead of only `data`: CMS saves attach the
 * per-locale translation outcome at the top level (`{ success, data,
 * translations }`), and dropping it would hide translation failures.
 */
async function parseCmsEnvelope<T>(res: Response): Promise<ParsedCmsEnvelope<T>> {
  if (res.status === 204) return { data: undefined, translations: [], payload: undefined };
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    await res.text().catch(() => "");
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  const payload = await res.json();
  if (!res.ok || payload?.success === false) {
    throw apiErrorFromBody(payload, "The request could not be completed. Please try again.", {
      status: res.status,
    });
  }
  return {
    data: payload?.data as T | undefined,
    translations: normalizeCmsTranslationResults(payload?.translations),
    payload: payload && typeof payload === "object" ? payload : undefined,
  };
}

async function parseJson<T>(res: Response): Promise<T | undefined> {
  return (await parseCmsEnvelope<T>(res)).data;
}

async function parseJsonRequired<T>(res: Response): Promise<T> {
  const data = await parseJson<T>(res);
  if (data === undefined) {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  return data;
}
async function revalidatePublicCms(
  type: CmsContentType | undefined,
  slugs: Array<string | undefined> = []
): Promise<void> {
  const token = getAuthToken();
  const response = await fetch("/api/cms/revalidate", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ type, slugs: slugs.filter(Boolean) }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`CMS cache revalidation failed (${response.status})`);
  }
}

// ---------- Admin ----------

export async function adminListCms(params: {
  type?: CmsContentType;
  status?: CmsContentStatus;
  search?: string;
  category?: string;
  locale?: CmsContentLocale;
  page?: number;
  limit?: number;
}): Promise<CmsListResponse> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", params.category);
  if (params.locale) qs.set("locale", params.locale);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));

  const res = await authFetch(`${API}/api/admin/cms?${qs.toString()}`);
  return parseJsonRequired<CmsListResponse>(res);
}

export async function adminGetCms(id: string): Promise<CmsContent> {
  const res = await authFetch(`${API}/api/admin/cms/${id}`);
  return parseJsonRequired<CmsContent>(res);
}

/**
 * Creates content and returns the server's per-locale translation outcome.
 * `content` is exactly what adminCreateCms returns.
 */
export async function adminCreateCmsWithTranslations(
  payload: CmsUpsertPayload
): Promise<CmsSaveResult> {
  const res = await authFetch(`${API}/api/admin/cms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const { data: created, translations } = await parseCmsEnvelope<CmsContent>(res);
  if (!created || typeof created !== "object") {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  try {
    await revalidatePublicCms(created.type, [created.slug]);
  } catch (error) {
    console.error("CMS cache revalidation failed after create:", error);
  }
  return { content: created, translations, status: normalizeCmsTranslationStatus(created.translationStatus) };
}

export async function adminCreateCms(payload: CmsUpsertPayload): Promise<CmsContent> {
  return (await adminCreateCmsWithTranslations(payload)).content;
}

/**
 * Updates content and returns the server's per-locale translation outcome,
 * including slug-move conflicts and manual-translation protection.
 */
export async function adminUpdateCmsWithTranslations(
  id: string,
  payload: CmsUpsertPayload
): Promise<CmsSaveResult> {
  const previous = await adminGetCms(id);
  const res = await authFetch(`${API}/api/admin/cms/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const { data: updated, translations } = await parseCmsEnvelope<CmsContent>(res);
  if (!updated || typeof updated !== "object") {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  try {
    await revalidatePublicCms(updated.type, [previous.slug, updated.slug]);
  } catch (error) {
    console.error("CMS cache revalidation failed after update:", error);
  }
  return { content: updated, translations, status: normalizeCmsTranslationStatus(updated.translationStatus) };
}

export async function adminUpdateCms(id: string, payload: CmsUpsertPayload): Promise<CmsContent> {
  return (await adminUpdateCmsWithTranslations(id, payload)).content;
}

export interface CmsTranslateOptions {
  /** Also replace linked manual translations with machine text (needs explicit confirmation). */
  force?: boolean;
  /** Limits which manual translations a force replaces (default: all target locales). */
  locales?: CmsContentLocale[];
}

/** Request body for `POST /:id/translate`: `locales` only travels with a force. */
export function cmsTranslateRequestBody(options: CmsTranslateOptions = {}): {
  force: boolean;
  locales?: CmsContentLocale[];
} {
  const force = options.force === true;
  if (!force || !options.locales) return { force };
  const locales = CMS_CONTENT_LOCALES.filter((locale) => options.locales?.includes(locale));
  return { force, locales };
}

/**
 * Queues a server translation run for the document's family (contract v2
 * §3). Returns the immediate per-locale results (`pending` for locales that
 * need text) and the family status to poll from. Nothing is translated yet
 * when this resolves, so the public cache is flushed after polling settles
 * (see `revalidateCmsTranslationFamily`), not here.
 */
export async function adminTranslateCms(
  id: string,
  options: CmsTranslateOptions = {}
): Promise<{ translations: CmsTranslationResult[]; status?: CmsTranslationStatus }> {
  const res = await authFetch(`${API}/api/admin/cms/${id}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cmsTranslateRequestBody(options)),
  });
  const { data, translations } = await parseCmsEnvelope<unknown>(res);
  return { translations, status: normalizeCmsTranslationStatus(data) };
}

/**
 * `GET /api/admin/cms/:id/translations`. `:id` may be the source or any of its
 * translations. Throws ApiRequestError (with `status`) on 4xx/5xx.
 */
export async function adminGetCmsTranslationStatus(
  id: string,
  init: { signal?: AbortSignal } = {}
): Promise<CmsTranslationStatus> {
  const res = await authFetch(`${API}/api/admin/cms/${id}/translations`, { signal: init.signal });
  const { data } = await parseCmsEnvelope<unknown>(res);
  const status = normalizeCmsTranslationStatus(data);
  if (!status) {
    throw new ApiRequestError("The server returned an unexpected response. Please try again.", {
      kind: "invalidResponse",
      status: res.status,
    });
  }
  return status;
}

/** Distinct slugs of every document in a translation status (cache flushes). */
export function cmsTranslationStatusSlugs(status: CmsTranslationStatus | undefined): string[] {
  const slugs = (status?.locales ?? []).map((entry) => entry.document?.slug);
  return Array.from(
    new Set(slugs.filter((slug): slug is string => typeof slug === "string" && slug.trim() !== ""))
  );
}

/**
 * Flushes the public cache for a translation family once its background run
 * settled, so nl/fr pages show the new text instead of waiting for the
 * revalidate window (contract v2 §4). Best effort: never throws.
 */
export async function revalidateCmsTranslationFamily(
  type: CmsContentType | undefined,
  status: CmsTranslationStatus | undefined,
  extraSlugs: Array<string | undefined> = []
): Promise<void> {
  const slugs = Array.from(new Set([...cmsTranslationStatusSlugs(status), ...extraSlugs.filter(Boolean)]));
  if (!type || slugs.length === 0) return;
  try {
    await revalidatePublicCms(type, slugs);
  } catch (error) {
    console.error("CMS cache revalidation failed after translation:", error);
  }
}

/**
 * Distinct slugs of a document's translation family (cache flushes): its own
 * slug, its `localeVariants` and every doc in its `translationStatus`.
 */
export function cmsFamilySlugs(
  doc: Pick<CmsContent, "slug"> & { localeVariants?: Array<{ slug?: unknown }>; translationStatus?: unknown }
): string[] {
  const slugs = [
    doc.slug,
    ...(doc.localeVariants ?? []).map((variant) => variant?.slug),
    ...cmsTranslationStatusSlugs(normalizeCmsTranslationStatus(doc.translationStatus)),
  ];
  return Array.from(
    new Set(slugs.filter((slug): slug is string => typeof slug === "string" && slug.trim() !== ""))
  );
}

/**
 * What the server did to the translation family when a document was deleted
 * (backend: machine translations of a deleted original are deleted, manual
 * ones are kept and unlinked). Zeros when the server did not report it.
 */
export interface CmsTranslationCleanup {
  deleted: number;
  detached: number;
}

export function normalizeCmsTranslationCleanup(input: unknown): CmsTranslationCleanup {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  return { deleted: count(record.deleted), detached: count(record.detached) };
}

export async function adminDeleteCms(id: string): Promise<{ translationCleanup: CmsTranslationCleanup }> {
  const previous = await adminGetCms(id);
  const res = await authFetch(`${API}/api/admin/cms/${id}`, { method: "DELETE" });
  const { payload } = await parseCmsEnvelope<never>(res);
  const translationCleanup = normalizeCmsTranslationCleanup(payload?.translationCleanup);
  // Deleting an original also deletes its machine translations (same slug as
  // the original); flush every slug of the family.
  try {
    await revalidatePublicCms(previous.type, cmsFamilySlugs(previous));
  } catch (error) {
    console.error("CMS cache revalidation failed after delete:", error);
  }
  return { translationCleanup };
}

export async function adminUploadCmsImage(file: File): Promise<{ url: string; key: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await authFetch(`${API}/api/admin/cms/upload-image`, {
    method: "POST",
    body: form,
  });
  return parseJsonRequired<{ url: string; key: string }>(res);
}

export async function adminListFaqCategories(): Promise<FaqCategory[]> {
  const res = await authFetch(`${API}/api/admin/cms/faq-categories`);
  return parseJsonRequired<FaqCategory[]>(res);
}

export async function adminListCmsServiceOptions(): Promise<CmsServiceOption[]> {
  const res = await authFetch(`${API}/api/admin/cms/service-options`);
  const data = await parseJsonRequired<{ items: CmsServiceOption[] }>(res);
  return data.items || [];
}

export interface CmsLandingSlot {
  slug: string;
  label: string;
  usedFor: string;
  category?: string;
  reserved: boolean;
  item: {
    _id: string;
    status: CmsContentStatus;
    title: string;
    updatedAt: string;
  } | null;
}

export async function adminListLandingSlots(): Promise<CmsLandingSlot[]> {
  const res = await authFetch(`${API}/api/admin/cms/landing-slots`);
  const data = await parseJsonRequired<{ slots: CmsLandingSlot[] }>(res);
  return data.slots;
}

export async function adminSyncLandingSlots(): Promise<{ created: number }> {
  const res = await authFetch(`${API}/api/admin/cms/landing-slots/sync`, { method: "POST" });
  return parseJsonRequired<{ created: number }>(res);
}

// ---------- Public ----------

export interface FaqGroup {
  slug: string;
  name: string;
  items: Array<Pick<CmsContent, "_id" | "title" | "slug" | "body" | "category" | "publishedAt" | "updatedAt">>;
}

export interface PolicyLink {
  title: string;
  slug: string;
  path: string;
}

export async function publicListPolicyLinks(
  params: { locale?: string } = {}
): Promise<PolicyLink[]> {
  try {
    const qs = params.locale ? `?locale=${encodeURIComponent(params.locale)}` : '';
    const res = await fetch(`${API}/api/public/cms/policy-links${qs}`, {
      next: { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["cms", "cms:policy"] },
      signal: AbortSignal.timeout(8000),
    });
    const data = await parseJsonRequired<{ items: PolicyLink[] }>(res);
    return data.items ?? [];
  } catch {
    return [];
  }
}

export interface SitemapEntry {
  type: CmsContentType;
  slug: string;
  locale: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface SitemapPage {
  items: SitemapEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
}

export async function publicListSitemapEntries(
  params: { page?: number; limit?: number } = {}
): Promise<SitemapPage> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  // Cached by time like the other sitemap reads. Only a 200 is kept by the data cache, and a
  // failure throws, so a failed page is never cached as an empty or partial list.
  const res = await fetch(`${API}/api/public/cms/sitemap${suffix}`, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new ApiRequestError("The CMS sitemap listing could not be read.", {
      kind: "unavailable",
      status: res.status,
    });
  }
  return parseJsonRequired<SitemapPage>(res);
}

// ---------- Utils ----------

export interface CmsReservedPolicy {
  slug: string;
  label: string;
  path: string;
  usedFor: string;
}

export const CMS_RESERVED_POLICIES: CmsReservedPolicy[] = [
  { slug: "privacy-policy", label: "Privacy Policy", path: "/privacy-policy", usedFor: "Footer link" },
  { slug: "terms-of-service", label: "Terms of Service", path: "/pages/terms-of-service", usedFor: "Footer link + Pro onboarding T&C (read) link" },
  { slug: "cookie-policy", label: "Cookie Policy", path: "/pages/cookie-policy", usedFor: "Footer link" },
  { slug: "gdpr-compliance", label: "GDPR Compliance", path: "/pages/gdpr-compliance", usedFor: "Footer link" },
  { slug: "platform-rules", label: "Platform Rules", path: "/pages/platform-rules", usedFor: "Pro onboarding rules (read) link" },
  { slug: "self-billing-agreement", label: "Self-Billing Agreement", path: "/pages/self-billing-agreement", usedFor: "Pro onboarding self-billing (read) link" },
];

export const CMS_RESERVED_LANDINGS: CmsReservedPolicy[] = [
  { slug: "about", label: "About", path: "/about", usedFor: "About page (overrides hardcoded content)" },
];

const RESERVED_POLICY_PATHS: Record<string, string> = Object.fromEntries(
  CMS_RESERVED_POLICIES.map((r) => [r.slug, r.path])
);

const RESERVED_LANDING_PATHS: Record<string, string> = Object.fromEntries(
  CMS_RESERVED_LANDINGS.map((r) => [r.slug, r.path])
);

export function getPublicPathForCms(type: CmsContentType, slug: string): string | null {
  if (!slug) return null;
  switch (type) {
    case "blog":
      return `/blog/${slug}`;
    case "news":
      return `/news/${slug}`;
    case "landing":
      return RESERVED_LANDING_PATHS[slug] || `/pages/${slug}`;
    case "policy":
      return RESERVED_POLICY_PATHS[slug] || `/pages/${slug}`;
    case "faq":
      return `/faq#${slug}`;
    default:
      return null;
  }
}

/**
 * Adds `?lang=<locale>` to a public CMS path (before any hash) so the admin
 * "View live" link previews exactly the document's language. Other params are
 * preserved; FAQ anchors stay last.
 */
export function withCmsLangParam(path: string, locale: string): string {
  if (!path) return path;
  const [base, ...hashParts] = path.split("#");
  const [pathname, ...queryParts] = base.split("?");
  const params = new URLSearchParams(queryParts.join("?"));
  params.set("lang", normalizeCmsContentLocale(locale));
  const query = params.toString();
  const hash = hashParts.length ? `#${hashParts.join("#")}` : "";
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

/**
 * Public URL of one language version, for admin "View live" links. A route with
 * language-prefixed twins becomes `/nl/blog/x` (the URL that is indexed, and it
 * does not overwrite the admin's own language cookie); anything else falls back
 * to `?lang=`. CMS translations share one slug, so only the prefix changes.
 */
export function cmsLiveUrl(path: string, locale: string): string {
  if (!path) return path;
  const lang = normalizeCmsContentLocale(locale);
  const prefixed = keepLocaleInUrl(path, lang);
  return prefixed !== path ? prefixed : withCmsLangParam(path, lang);
}

export function getLandingServicePath(slug: string): string | null {
  if (!slug || RESERVED_LANDING_PATHS[slug]) return null;
  return `/services/${slug}`;
}

export function getPublicSlugPrefixForCms(type: CmsContentType): string | null {
  switch (type) {
    case "blog":
      return "/blog/";
    case "news":
      return "/news/";
    case "landing":
    case "policy":
      return "/pages/";
    case "faq":
    default:
      return null;
  }
}

export function slugify(input: string): string {
  const normalized = (input || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .trim();

  const ascii = normalized
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);

  if (ascii) return ascii;
  return `untitled-${Math.random().toString(36).slice(2, 8)}`;
}
