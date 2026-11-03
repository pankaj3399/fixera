import {
  CMS_CONTENT_LOCALES,
  cmsRefId,
  normalizeCmsContentLocale,
  normalizeCmsTranslationResults,
  type CmsContent,
  type CmsLocaleVariant,
  type CmsTranslationResult,
  type CmsTranslationStatus,
} from "@/lib/cms";
import { canWriteAdminArea, hasAdminPermission, type AdminAccessUser } from "@/lib/adminRbac";

/**
 * Admin-side state and copy for CMS auto-translation. The server performs the
 * translation inside the create/update request (backend contract T1) and
 * reports one result per target locale; this module only interprets those
 * results. It never invents a translation outcome.
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

export const CMS_TRANSLATION_STATUS_LABELS: Record<CmsTranslationStatus, string> = {
  created: "Created",
  updated: "Updated",
  synced: "Up to date",
  skipped_manual: "Manual kept",
  failed: "Failed",
  disabled: "Translator not configured",
};

export type CmsTranslationTone = "success" | "info" | "warning";

export function cmsTranslationStatusTone(status: CmsTranslationStatus): "error" | "warning" | "info" | "success" {
  switch (status) {
    case "failed":
      return "error";
    case "disabled":
      return "warning";
    case "skipped_manual":
      return "info";
    default:
      return "success";
  }
}

export function cmsTranslationLocaleLabel(locale: string): string {
  return locale === "*" ? "All locales" : locale.toUpperCase();
}

function localeList(results: CmsTranslationResult[]): string {
  return results.map((result) => (result.locale === "*" ? "all locales" : result.locale.toUpperCase())).join(", ");
}

/** True when a plain (non-force) retry can still change something. */
export function hasRetryableCmsTranslations(results: CmsTranslationResult[]): boolean {
  return results.some((result) => result.status === "failed" || result.status === "disabled");
}

/**
 * The toast for a finished save or resync. `null` means "nothing extra to say"
 * (the regular "Draft saved"/"Published!" toast already covers it). The copy
 * says exactly what the server reported; a save is never presented as failed
 * because translation failed, and a skipped/disabled sync is never presented
 * as translated.
 */
export function summarizeCmsTranslationOutcome(
  results: CmsTranslationResult[],
  options: { trigger: "save" | "retranslate"; force?: boolean; expectResults?: boolean }
): { tone: CmsTranslationTone; message: string } | null {
  const prefix = options.trigger === "save" ? "Content saved, but " : "";
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    return {
      tone: "warning",
      message: `${prefix}${prefix ? "translation" : "Translation"} failed for ${localeList(failed)}. Your saved content is kept; use Retry translations.`,
    };
  }
  const disabled = results.filter((result) => result.status === "disabled");
  if (disabled.length > 0) {
    return {
      tone: "info",
      message:
        `${options.trigger === "save" ? "Content saved. " : ""}` +
        `Automatic translation is not configured on the server, so ${localeList(disabled)} ${disabled.length === 1 ? "was" : "were"} not translated. Retry after it is configured.`,
    };
  }
  if (results.length === 0) {
    // A source document always gets one result per target locale from a
    // translation-capable server; silence means the feature is unavailable.
    if (options.trigger === "retranslate") {
      return { tone: "info", message: "The server returned no translation results for this document." };
    }
    return options.expectResults
      ? { tone: "info", message: "Content saved. The server did not report any automatic translation for this save." }
      : null;
  }
  const manualKept = results.filter((result) => result.status === "skipped_manual");
  if (options.trigger === "retranslate") {
    if (manualKept.length > 0 && !options.force) {
      return { tone: "info", message: `Translations synced. Manual translations kept for ${localeList(manualKept)}.` };
    }
    return { tone: "success", message: options.force ? "Translations overwritten" : "Translations synced" };
  }
  return null;
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

/** Linked manual variants the explicit overwrite would replace. */
export function manualCmsVariantLocales(
  variants: CmsLocaleVariant[],
  current: Pick<Partial<CmsContent>, "autoTranslated" | "translatedFrom" | "locale">
): string[] {
  const locales = variants
    .filter((variant) => variant.relation === "linked" && !variant.autoTranslated)
    .map((variant) => variant.locale);
  // Forcing from a manual translation resyncs its origin, which overwrites
  // this document too (the server never overwrites the origin itself).
  if (cmsTranslationRole(current) === "manual") locales.push(normalizeCmsContentLocale(current.locale));
  return Array.from(new Set(locales)).sort(
    (a, b) => CMS_CONTENT_LOCALES.indexOf(a as never) - CMS_CONTENT_LOCALES.indexOf(b as never)
  );
}

/**
 * A resync started from a translation runs from its origin; when it reports
 * this document's locale as created/updated, the server rewrote the text the
 * admin is looking at (a forced overwrite of a manual translation, or a
 * refreshed machine translation).
 */
export function resyncRewroteCurrentDoc(
  current: Pick<Partial<CmsContent>, "autoTranslated" | "translatedFrom" | "locale">,
  results: CmsTranslationResult[]
): boolean {
  if (cmsTranslationRole(current) === "source") return false;
  const locale = normalizeCmsContentLocale(current.locale);
  return results.some(
    (result) => result.locale === locale && (result.status === "updated" || result.status === "created")
  );
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
