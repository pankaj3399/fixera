"use client"

import { AlertTriangle, ExternalLink, Languages, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CMS_CONTENT_LOCALE_LABELS,
  normalizeCmsContentLocale,
  type CmsLocaleVariant,
} from "@/lib/cms";
import {
  CMS_TRANSLATION_STATUS_LABELS,
  cmsTranslationLocaleLabel,
  cmsTranslationStatusTone,
  hasRetryableCmsTranslations,
  type CmsTranslationPanelState,
  type CmsTranslationRole,
} from "@/lib/cmsTranslationState";

const TONE_CLASSES: Record<ReturnType<typeof cmsTranslationStatusTone>, string> = {
  error: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export interface CmsTranslationPanelProps {
  mode: "create" | "edit";
  role: CmsTranslationRole;
  /** Locales the server syncs into on save (source documents only). */
  targets: string[];
  panel: CmsTranslationPanelState;
  /** A save is in flight (the server translates inside that request). */
  saving: boolean;
  translating: boolean;
  busy: boolean;
  /** cms write access; without it the actions are hidden (backend enforces cms.manage). */
  canManage: boolean;
  variants: CmsLocaleVariant[];
  variantsState: "idle" | "loading" | "ready" | "error";
  /** "slug-search" means manual variants under another slug may be missing. */
  variantsSource?: "server" | "slug-search";
  onRetry: () => void;
  onForce: () => void;
}

function variantHref(id: string) {
  return `/admin/cms/${encodeURIComponent(id)}/edit`;
}

export default function CmsTranslationPanel({
  mode,
  role,
  targets,
  panel,
  saving,
  translating,
  busy,
  canManage,
  variants,
  variantsState,
  variantsSource,
  onRetry,
  onForce,
}: CmsTranslationPanelProps) {
  const inFlight = translating || (saving && role === "source");
  const targetLabel = targets.map((code) => code.toUpperCase()).join(", ");
  const retryable = hasRetryableCmsTranslations(panel.results);

  return (
    <div className="p-6 space-y-3" data-testid="cms-translation-panel">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-700">
        <Languages size={14} /> Translations
      </h3>

      {role === "manual" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Manual translation. Saving the original or a normal resync never overwrites this text; only
          the explicit overwrite below replaces it.
        </p>
      ) : role === "machine" ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800">
          Machine translation. Saving your edits here turns it into a manual translation that automatic
          syncs keep.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-rose-400">
          Automatic translation: each save of this original asks the server to translate it into{" "}
          {targetLabel}. Manual translations are never overwritten without your confirmation.
        </p>
      )}

      {inFlight ? (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {translating ? "Syncing translations…" : `Saving and translating into ${targetLabel}…`}
        </p>
      ) : null}

      {panel.results.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-rose-500">
            {panel.source === "retranslate" ? "Last resync" : "Last save"}
            {panel.stale ? " — content changed since, results may be out of date" : ""}
          </p>
          {panel.results.map((result) => (
            <div
              key={`${result.locale}-${result.status}`}
              data-translation-locale={result.locale}
              data-translation-status={result.status}
              className={cn("rounded-lg border px-3 py-2 text-[11px]", TONE_CLASSES[cmsTranslationStatusTone(result.status)])}
            >
              <div className="flex items-center justify-between gap-2 font-medium">
                <span>{cmsTranslationLocaleLabel(result.locale)}</span>
                <span>{CMS_TRANSLATION_STATUS_LABELS[result.status]}</span>
              </div>
              {result.error ? <p className="mt-1 break-words opacity-90">{result.error}</p> : null}
              {result.status === "disabled" ? (
                <p className="mt-1 opacity-90">
                  The server has no translation provider configured. Your content was saved; retry once it is
                  configured.
                </p>
              ) : null}
            </div>
          ))}
          {panel.stale ? (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Save to translate the latest changes.
            </p>
          ) : null}
        </div>
      ) : mode === "edit" && role === "source" && !inFlight ? (
        <p className="text-[11px] text-rose-400" data-testid="cms-translation-empty">
          {panel.source
            ? `The server reported no translation results for the last ${panel.source === "save" ? "save" : "resync"}; automatic translation may be unavailable on this server.`
            : "No translation run in this session yet."}
        </p>
      ) : null}

      {mode === "edit" ? (
        <div className="space-y-1.5" data-testid="cms-locale-variants">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">Other languages</p>
          {variantsState === "loading" ? (
            <p className="text-[11px] text-rose-400">Loading language versions…</p>
          ) : variantsState === "error" ? (
            <p className="text-[11px] text-rose-500">Couldn&apos;t load the other language versions.</p>
          ) : variants.length === 0 ? (
            <p className="text-[11px] text-rose-400">No other language versions yet.</p>
          ) : (
            <ul className="space-y-1">
              {variants.map((variant) => {
                const locale = normalizeCmsContentLocale(variant.locale);
                const kind =
                  variant.relation === "origin"
                    ? "Original"
                    : variant.relation === "same-slug"
                      ? "Same slug, not linked"
                      : variant.autoTranslated
                        ? "Machine"
                        : "Manual";
                return (
                  <li key={variant._id}>
                    <a
                      href={variantHref(variant._id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open the ${CMS_CONTENT_LOCALE_LABELS[locale]} version in a new tab (keeps your unsaved edits here)`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-pink-100 px-3 py-1.5 text-[11px] text-rose-700 transition hover:bg-rose-50"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="font-semibold uppercase">{locale}</span>
                        <span className="truncate">{variant.title || variant.slug}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-rose-500">
                        <span>{kind}</span>
                        <span className={variant.status === "published" ? "text-emerald-600" : ""}>· {variant.status}</span>
                        <ExternalLink size={11} />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {variantsSource === "slug-search" && variantsState === "ready" ? (
            <p className="text-[10px] text-rose-400">Found by slug; manual versions saved under another slug may not be listed.</p>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" && canManage ? (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-pink-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {translating ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />}
            {retryable ? "Retry translations" : role === "source" ? "Resync translations" : "Resync from original"}
          </button>
          <p className="text-[11px] leading-relaxed text-rose-400">
            Uses the saved version{role === "source" ? "" : " of the original"}; unsaved edits on this screen are kept
            and not sent. Manual translations are kept.
          </p>
          <button
            type="button"
            onClick={onForce}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
          >
            Overwrite manual translations…
          </button>
        </div>
      ) : mode === "create" ? (
        <p className="text-[11px] text-rose-400">
          Translations into {targetLabel} are requested when you first save.
        </p>
      ) : null}
    </div>
  );
}
