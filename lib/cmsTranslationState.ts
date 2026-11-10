import {
  CMS_CONTENT_LOCALES,
  cmsRefId,
  cmsTranslationInFlight,
  normalizeCmsContentLocale,
  normalizeCmsTranslationResults,
  type CmsContent,
  type CmsContentLocale,
  type CmsLocaleTranslationState,
  type CmsTranslationCleanup,
  type CmsTranslationErrorCode,
  type CmsTranslationLocaleStatus,
  type CmsTranslationResult,
  type CmsTranslationResultStatus,
  type CmsTranslationStatus,
} from "@/lib/cms";
import { canWriteAdminArea, hasAdminPermission, type AdminAccessUser } from "@/lib/adminRbac";

/**
 * Admin-side state and copy for CMS auto-translation (backend contract v2,
 * async). A save/retry returns immediate per-locale results (`pending` while
 * queued) and the family's `CmsTranslationStatus`, which the UI polls until
 * nothing is pending. This module only interprets what the server reported;
 * it never invents a translation outcome.
 */

export type CmsTranslationRole = "source" | "machine" | "manual";

/**
 * Only originals are translation sources: not a machine translation and not
 * linked to another document. Mirrors backend `isTranslationSource`.
 */
export function cmsTranslationRole(
  doc: Pick<Partial<CmsContent>, "autoTranslated" | "translatedFrom">
): CmsTranslationRole {
  if (doc.autoTranslated === true) return "machine";
  if (cmsRefId(doc.translatedFrom)) return "manual";
  return "source";
}

/**
 * Whether the admin may run translation actions. The backend guards every
 * `/api/admin/cms/*` route (including `/:id/translate`) with `cms.manage` and
 * a write level for writes; this mirrors it and fails closed.
 */
export function canManageCmsTranslations(user: AdminAccessUser | null | undefined): boolean {
  if (!user || user.role !== "admin") return false;
  const hasLevels =
    Object.keys(user.adminAccessLevels ?? {}).length > 0 ||
    Object.keys(user.adminPermissionLevels ?? {}).length > 0;
  if (hasLevels || user.adminRole === "super") return canWriteAdminArea(user, "cms");
  // Legacy account without a matrix: the server-derived permission pack decides.
  return Array.isArray(user.adminPermissions) && hasAdminPermission(user.adminPermissions, "cms.manage");
}

/** Locales the server will sync a source document into on save. */
export function cmsTranslationTargets(locale: unknown): string[] {
  const from = normalizeCmsContentLocale(locale);
  return CMS_CONTENT_LOCALES.filter((code) => code !== from);
}

export const CMS_TRANSLATION_RESULT_LABELS: Record<CmsTranslationResultStatus, string> = {
  created: "Created",
  updated: "Updated",
  synced: "Up to date",
  pending: "Queued",
  skipped_manual: "Manual kept",
  failed: "Failed",
  disabled: "Translator not configured",
};

export type CmsTranslationTone = "error" | "warning" | "info" | "success" | "neutral" | "progress";

export function cmsTranslationResultTone(status: CmsTranslationResultStatus): CmsTranslationTone {
  switch (status) {
    case "failed":
      return "error";
    case "disabled":
      return "warning";
    case "skipped_manual":
      return "info";
    case "pending":
      return "progress";
    default:
      return "success";
  }
}

/** Badge for each per-locale state (contract v2 `LocaleTranslationState`). */
export const CMS_LOCALE_STATE_BADGES: Record<CmsLocaleTranslationState, { label: string; tone: CmsTranslationTone }> = {
  source: { label: "Original", tone: "neutral" },
  pending: { label: "Translating…", tone: "progress" },
  up_to_date: { label: "Up to date", tone: "success" },
  stale: { label: "Out of date", tone: "warning" },
  missing: { label: "Not translated", tone: "neutral" },
  failed: { label: "Failed", tone: "error" },
  manual: { label: "Manual", tone: "info" },
  blocked: { label: "Blocked: unlinked page uses this slug", tone: "warning" },
};

export function cmsLocaleStateBadge(state: CmsLocaleTranslationState) {
  return CMS_LOCALE_STATE_BADGES[state] ?? CMS_LOCALE_STATE_BADGES.failed;
}

export function cmsTranslationLocaleLabel(locale: string): string {
  return locale === "*" ? "All locales" : locale.toUpperCase();
}

function localeList(results: Array<{ locale: string }>): string {
  return results.map((result) => (result.locale === "*" ? "all locales" : result.locale.toUpperCase())).join(", ");
}

/**
 * Errors a retry cannot fix (bad credentials, monthly quota used up): the UI
 * hides Retry for them (contract v2 §5).
 */
export function isNonRetryableCmsTranslationError(code: CmsTranslationErrorCode | undefined): boolean {
  return code === "auth" || code === "quota_exceeded";
}

/** The failure that blocks retries for the whole family, if any (auth/quota are provider-wide). */
export function cmsTranslationRetryBlocker(
  status: CmsTranslationStatus | undefined
): (CmsTranslationResult & { at: string }) | undefined {
  return status?.locales.find(
    (entry) =>
      entry.state === "failed" &&
      entry.lastResult?.status === "failed" &&
      isNonRetryableCmsTranslationError(entry.lastResult.errorCode)
  )?.lastResult;
}

/** Locales a forced run may overwrite: linked manual translations only, never blocked docs. */
export function cmsForceableLocales(status: CmsTranslationStatus | undefined): CmsContentLocale[] {
  return (status?.locales ?? []).filter((entry) => entry.state === "manual").map((entry) => entry.locale);
}

export interface CmsLocaleRowActions {
  /** A plain (non-force) re-run would create/refresh this locale. */
  retry: boolean;
  /** Overwrite this manual translation with machine text (per-locale force). */
  force: boolean;
}

/**
 * Per-row actions. Blocked rows never get any (not force-able); manual rows
 * get a per-locale force; missing/stale/failed rows get Retry unless the
 * failure is one a retry cannot fix. Nothing while a run is in flight or the
 * translator is disabled.
 */
export function cmsLocaleRowActions(
  entry: CmsTranslationLocaleStatus,
  status: CmsTranslationStatus,
  canManage: boolean
): CmsLocaleRowActions {
  const none = { retry: false, force: false };
  if (!canManage || !status.enabled || cmsTranslationInFlight(status)) return none;
  switch (entry.state) {
    case "manual":
      return { retry: false, force: true };
    case "missing":
    case "stale":
      return { retry: !cmsTranslationRetryBlocker(status), force: false };
    case "failed":
      return {
        retry: !isNonRetryableCmsTranslationError(entry.lastResult?.errorCode) && !cmsTranslationRetryBlocker(status),
        force: false,
      };
    default:
      return none;
  }
}

export interface CmsTranslationActions {
  /** Show the family-wide Retry/Resync button. */
  retry: boolean;
  /** Why Retry is hidden, when a provider-wide failure blocks it. */
  retryBlockedBy?: CmsTranslationResult;
  /** Manual locales the "Overwrite manual translations" action would force. */
  forceLocales: CmsContentLocale[];
}

/**
 * Family-wide actions. Without a status (lookup failed) only the plain resync
 * is offered: forcing needs to know exactly which locales are manual.
 */
export function cmsTranslationActions(status: CmsTranslationStatus | undefined): CmsTranslationActions {
  if (!status) return { retry: true, forceLocales: [] };
  if (!status.enabled) return { retry: false, forceLocales: [] };
  const blocker = cmsTranslationRetryBlocker(status);
  return {
    retry: !blocker,
    ...(blocker ? { retryBlockedBy: blocker } : {}),
    forceLocales: cmsForceableLocales(status),
  };
}

/**
 * Toast for a finished save or retry request (the run itself is still in the
 * background). `null` means "nothing extra to say": the regular "Draft
 * saved"/"Published!" toast covers it. A save is never presented as failed
 * because translation failed, and a skipped/disabled sync is never presented
 * as translated.
 */
export function summarizeCmsTranslationOutcome(
  results: CmsTranslationResult[],
  options: { trigger: "save" | "retranslate"; force?: boolean; expectResults?: boolean }
): { tone: Exclude<CmsTranslationTone, "neutral" | "progress" | "error">; message: string } | null {
  const saved = options.trigger === "save" ? "Content saved. " : "";
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    const prefix = options.trigger === "save" ? "Content saved, but " : "";
    return {
      tone: "warning",
      message: `${prefix}${prefix ? "translation" : "Translation"} failed for ${localeList(failed)}. Your saved content is kept; see Translations.`,
    };
  }
  const disabled = results.filter((result) => result.status === "disabled");
  if (disabled.length > 0) {
    return {
      tone: "info",
      message:
        `${saved}Automatic translation is not configured on the server, so ${localeList(disabled)} ` +
        `${disabled.length === 1 ? "was" : "were"} not translated.`,
    };
  }
  const pending = results.filter((result) => result.status === "pending");
  if (pending.length > 0) {
    return {
      tone: "info",
      message: `${saved}${options.force ? "Overwriting" : "Translating"} ${localeList(pending)} in the background…`,
    };
  }
  if (results.length === 0) {
    if (options.trigger === "retranslate") {
      return { tone: "info", message: "The server returned no translation results for this document." };
    }
    return options.expectResults
      ? { tone: "info", message: "Content saved. The server did not report any automatic translation for this save." }
      : null;
  }
  if (options.trigger === "retranslate") {
    const manualKept = results.filter((result) => result.status === "skipped_manual");
    if (manualKept.length > 0 && !options.force) {
      return { tone: "info", message: `Translations are up to date. Manual translations kept for ${localeList(manualKept)}.` };
    }
    return { tone: "success", message: "Translations are up to date" };
  }
  return null;
}

/** Toast once a background run that this screen started has settled. */
export function summarizeCmsTranslationSettled(
  status: CmsTranslationStatus
): { tone: "success" | "warning"; message: string } {
  const failed = status.locales.filter((entry) => entry.state === "failed");
  if (failed.length > 0) {
    return { tone: "warning", message: `Translation failed for ${localeList(failed)}. See Translations for details.` };
  }
  return { tone: "success", message: "Translations finished" };
}

export interface CmsTranslationPanelState {
  results: CmsTranslationResult[];
  source: "save" | "retranslate" | null;
  /** Results describe the last saved content; edits since then make them possibly stale. */
  stale: boolean;
}

export const INITIAL_CMS_TRANSLATION_PANEL: CmsTranslationPanelState = {
  results: [],
  source: null,
  stale: false,
};

/**
 * Applies the results of a finished save/resync. They describe the saved
 * document, so when the form changed during (or before, for a resync) the
 * request, they are marked stale instead of claiming to match the screen.
 */
export function cmsTranslationPanelAfterRun(
  results: CmsTranslationResult[],
  source: "save" | "retranslate",
  revisions: { current: number; saved: number }
): CmsTranslationPanelState {
  return { results, source, stale: revisions.current !== revisions.saved };
}

export function cmsTranslationPanelAfterEdit(prev: CmsTranslationPanelState): CmsTranslationPanelState {
  if (prev.stale || prev.results.length === 0) return prev;
  return { ...prev, stale: true };
}

/**
 * After a run settles: true when the server rewrote the open document, which
 * only happens to a translation (a machine refresh, or a forced overwrite of
 * a manual one). Compared by `updatedAt`, so it holds however the run ended.
 */
export function cmsStatusRewroteDoc(
  status: CmsTranslationStatus,
  doc: Pick<Partial<CmsContent>, "_id" | "autoTranslated" | "translatedFrom" | "updatedAt">
): boolean {
  if (cmsTranslationRole(doc) === "source" || !doc._id) return false;
  const entry = status.locales.find((candidate) => candidate.document?._id === doc._id);
  const serverUpdatedAt = entry?.document?.updatedAt;
  return Boolean(serverUpdatedAt && doc.updatedAt && serverUpdatedAt !== doc.updatedAt);
}

/** True when translation is switched off on the server (status first, else a "disabled" result). */
export function cmsAutoTranslateDisabled(
  status: CmsTranslationStatus | undefined,
  results: CmsTranslationResult[] = []
): boolean {
  if (status) return status.enabled === false;
  return results.some((result) => result.status === "disabled");
}

/**
 * Immediate results worth showing next to the status rows: failures (e.g. a
 * slug conflict while moving translations, or a crash "*"). Pending/disabled
 * results are already reflected by the status. Without a status, everything.
 */
export function cmsImmediateResultsToShow(
  results: CmsTranslationResult[],
  status: CmsTranslationStatus | undefined
): CmsTranslationResult[] {
  if (!status) return results;
  return results.filter((result) => result.status === "failed");
}

/** Status rows in CMS order, each marked when it is the open document. */
export function cmsStatusRows(
  status: CmsTranslationStatus,
  currentId: string | undefined
): Array<CmsTranslationLocaleStatus & { current: boolean }> {
  return CMS_CONTENT_LOCALES.flatMap((locale) => {
    const entry = status.locales.find((candidate) => candidate.locale === locale);
    if (!entry) return [];
    return [{ ...entry, current: Boolean(currentId && entry.document?._id === currentId) }];
  });
}

/**
 * What deleting the open document does to its translations (backend: only an
 * original cascades; its machine translations are deleted, its linked manual
 * translations are kept and unlinked). Unknown (null) without a status.
 * Blocked same-slug docs are not linked, so they are never listed.
 */
export function cmsDeleteImpact(
  current: Pick<Partial<CmsContent>, "_id" | "autoTranslated" | "translatedFrom">,
  status: CmsTranslationStatus | undefined
): { machineLocales: CmsContentLocale[]; manualLocales: CmsContentLocale[] } | null {
  if (cmsTranslationRole(current) !== "source") return { machineLocales: [], manualLocales: [] };
  if (!status || status.sourceId !== current._id) return null;
  const linked = status.locales.filter(
    (entry) => entry.state !== "source" && entry.document?.translatedFrom === status.sourceId
  );
  return {
    machineLocales: linked.filter((entry) => entry.document?.autoTranslated).map((entry) => entry.locale),
    manualLocales: linked.filter((entry) => !entry.document?.autoTranslated).map((entry) => entry.locale),
  };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Toast copy after a delete, from the server's own cleanup counts. */
export function summarizeCmsDeleteCleanup(cleanup: CmsTranslationCleanup): string {
  const parts = ["Deleted"];
  if (cleanup.deleted > 0) parts[0] += ` with ${plural(cleanup.deleted, "machine translation")}`;
  if (cleanup.detached > 0) {
    parts.push(`${plural(cleanup.detached, "manual translation")} kept and unlinked`);
  }
  return parts.join(". ");
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STASH_PREFIX = "fixera:cms:translation-results:";

function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * A create redirects to the edit page; carry the save's per-locale results
 * across that navigation so they are not silently lost.
 */
export function stashCmsTranslationResults(
  id: string,
  results: CmsTranslationResult[],
  storage: StorageLike | null = sessionStore()
): void {
  if (!results.length || !storage) return;
  try {
    storage.setItem(`${STASH_PREFIX}${id}`, JSON.stringify(results));
  } catch {
    // Storage can be unavailable (private mode/quota); the toast still reported it.
  }
}

/** Reads and removes the stashed results (one-shot). */
export function takeStashedCmsTranslationResults(
  id: string,
  storage: StorageLike | null = sessionStore()
): CmsTranslationResult[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(`${STASH_PREFIX}${id}`);
    if (!raw) return [];
    storage.removeItem(`${STASH_PREFIX}${id}`);
    return normalizeCmsTranslationResults(JSON.parse(raw));
  } catch {
    return [];
  }
}
