"use client"

import { AlertTriangle, Eye, Languages, Loader2, Pencil, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CMS_CONTENT_LOCALE_LABELS,
  cmsTranslationInFlight,
  getPublicPathForCms,
  cmsLiveUrl,
  type CmsContentLocale,
  type CmsContentType,
  type CmsTranslationLocaleStatus,
  type CmsTranslationResult,
  type CmsTranslationStatus,
} from "@/lib/cms";
import {
  CMS_TRANSLATION_RESULT_LABELS,
  cmsAutoTranslateDisabled,
  cmsImmediateResultsToShow,
  cmsLocaleRowActions,
  cmsLocaleStateBadge,
  cmsStatusRows,
  cmsTranslationActions,
  cmsTranslationLocaleLabel,
  cmsTranslationResultTone,
  type CmsTranslationPanelState,
  type CmsTranslationRole,
  type CmsTranslationTone,
} from "@/lib/cmsTranslationState";
import type { CmsTranslationLoadState, CmsTranslationPollPhase } from "./useCmsTranslationStatus";

const TONE_CLASSES: Record<CmsTranslationTone, string> = {
  error: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  neutral: "border-gray-200 bg-gray-50 text-gray-600",
  progress: "border-violet-200 bg-violet-50 text-violet-700",
};

const BADGE_CLASSES: Record<CmsTranslationTone, string> = {
  error: "bg-rose-100 text-rose-700",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-700",
  success: "bg-emerald-100 text-emerald-700",
  neutral: "bg-gray-100 text-gray-600",
  progress: "bg-violet-100 text-violet-700",
};

export interface CmsTranslationPanelProps {
  mode: "create" | "edit";
  /** Content type, for the public "live" link of published language versions. */
  type?: CmsContentType;
  role: CmsTranslationRole;
  /** Id of the open document (marks "this page" in the rows). */
  currentId?: string;
  /** Locales the server translates a source into. */
  targets: string[];
  /** Immediate results of the last save/retry request in this session. */
  panel: CmsTranslationPanelState;
  /** The family's translation status (contract v2), polled while pending. */
  status?: CmsTranslationStatus;
  loadState: CmsTranslationLoadState;
  phase: CmsTranslationPollPhase;
  saving: boolean;
  translating: boolean;
  busy: boolean;
  /** cms write access; without it the actions are hidden (backend enforces cms.manage). */
  canManage: boolean;
  /** Plain re-run (creates missing, refreshes stale, retries failed; manual kept). */
  onRetry: () => void;
  /** Asks to overwrite these manual translations (the form confirms first). */
  onForce: (locales: CmsContentLocale[]) => void;
  /** Re-reads the status (after a timeout or a failed load). */
  onRefresh: () => void;
}

function variantHref(id: string) {
  return `/admin/cms/${encodeURIComponent(id)}/edit`;
}

function formatAt(at: string | undefined): string | null {
  if (!at) return null;
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

function ResultChip({ result, label, at }: { result: CmsTranslationResult; label: string; at?: string }) {
  const when = formatAt(at);
  return (
    <div
      data-translation-locale={result.locale}
      data-translation-status={result.status}
      {...(result.errorCode ? { "data-translation-error": result.errorCode } : {})}
      className={cn("mt-1 rounded-md border px-2 py-1", TONE_CLASSES[cmsTranslationResultTone(result.status)])}
    >
      <div className="flex items-center justify-between gap-2 font-medium">
        <span>{label}</span>
        <span>
          {CMS_TRANSLATION_RESULT_LABELS[result.status]}
          {when ? <span className="font-normal opacity-75"> · {when}</span> : null}
        </span>
      </div>
      {result.error ? <p className="mt-0.5 break-words opacity-90">{result.error}</p> : null}
    </div>
  );
}

/** Public URL of a published language version (`/nl/blog/x`; same slug in every language). */
function liveHref(type: CmsContentType | undefined, locale: CmsContentLocale, doc: { slug: string; status: string }) {
  if (!type || doc.status !== "published" || !doc.slug) return null;
  const path = getPublicPathForCms(type, doc.slug);
  return path ? cmsLiveUrl(path, locale) : null;
}

const smallButton =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition disabled:opacity-50";

function LocaleRow({
  entry,
  current,
  status,
  type,
  canManage,
  busy,
  onRetry,
  onForce,
}: {
  entry: CmsTranslationLocaleStatus;
  current: boolean;
  status: CmsTranslationStatus;
  type?: CmsContentType;
  canManage: boolean;
  busy: boolean;
  onRetry: () => void;
  onForce: (locales: CmsContentLocale[]) => void;
}) {
  const badge = cmsLocaleStateBadge(entry.state);
  const doc = entry.document;
  const live = doc ? liveHref(type, entry.locale, doc) : null;
  const actions = cmsLocaleRowActions(entry, status, canManage);
  const name = CMS_CONTENT_LOCALE_LABELS[entry.locale];

  const head = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="font-semibold uppercase" title={name}>
        {entry.locale}
      </span>
      {doc ? <span className="truncate">{doc.title || doc.slug}</span> : null}
      {current ? <span className="shrink-0 text-[10px] font-medium text-rose-500">· this page</span> : null}
    </span>
  );

  return (
    <li
      data-locale-row={entry.locale}
      data-locale-state={entry.state}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-[11px]",
        current ? "border-rose-200 bg-rose-50/60" : "border-pink-100"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {doc && !current ? (
          <a
            href={variantHref(doc._id)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Edit the ${name} version in a new tab (keeps your unsaved edits here)`}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-rose-700 hover:underline"
          >
            {head}
            <Pencil size={11} aria-hidden className="shrink-0 text-rose-400" />
          </a>
        ) : (
          <span className="flex min-w-0 flex-1 text-rose-700">{head}</span>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            data-state-badge={entry.state}
            className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", BADGE_CLASSES[badge.tone])}
          >
            {entry.state === "pending" ? <Loader2 className="mr-0.5 inline h-2.5 w-2.5 animate-spin" aria-hidden /> : null}
            {badge.label}
          </span>
          {doc ? (
            <span className={doc.status === "published" ? "text-emerald-600" : "text-rose-400"}>{doc.status}</span>
          ) : null}
          {live ? (
            <a
              href={live}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View the live ${name} page`}
              title={`View the live ${name} page`}
              className="rounded p-0.5 text-rose-500 hover:bg-rose-100 hover:text-rose-700"
            >
              <Eye size={12} aria-hidden />
            </a>
          ) : null}
        </span>
      </div>
      {entry.state === "blocked" ? (
        <p className="mt-0.5 text-[10px] text-amber-700">
          Another {name} page with this slug is not linked to this original. It is never overwritten.
        </p>
      ) : null}
      {entry.lastResult ? <ResultChip result={entry.lastResult} label="Last run" at={entry.lastResult.at} /> : null}
      {actions.retry || actions.force ? (
        <div className="mt-1 flex justify-end gap-1">
          {actions.retry ? (
            <button
              type="button"
              data-row-action="retry"
              onClick={onRetry}
              disabled={busy}
              className={cn(smallButton, "text-rose-700 hover:bg-rose-100")}
            >
              <RefreshCw size={10} aria-hidden /> Retry
            </button>
          ) : null}
          {actions.force ? (
            <button
              type="button"
              data-row-action="force"
              onClick={() => onForce([entry.locale])}
              disabled={busy}
              className={cn(smallButton, "text-amber-700 hover:bg-amber-100")}
            >
              Overwrite with machine translation…
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function CmsTranslationPanel({
  mode,
  type,
  role,
  currentId,
  targets,
  panel,
  status,
  loadState,
  phase,
  saving,
  translating,
  busy,
  canManage,
  onRetry,
  onForce,
  onRefresh,
}: CmsTranslationPanelProps) {
  const requesting = translating || (saving && role === "source");
  const running = phase === "polling" || cmsTranslationInFlight(status);
  const targetLabel = targets.map((code) => code.toUpperCase()).join(", ");
  const disabled = cmsAutoTranslateDisabled(status, panel.results);
  const immediate = cmsImmediateResultsToShow(panel.results, status);
  const actions = cmsTranslationActions(status);
  const actionsBusy = busy || running;

  return (
    <div className="p-6 space-y-3" data-testid="cms-translation-panel">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-700">
        <Languages size={14} /> Translations
      </h3>

      {role === "manual" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Manual translation. Saving the original or a normal retry never overwrites this text; only the
          explicit overwrite replaces it.
        </p>
      ) : role === "machine" ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800">
          Machine translation. Saving your edits here turns it into a manual translation that automatic
          translation keeps.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-rose-400">
          Automatic translation: each save of this original translates it into {targetLabel} in the
          background. Manual translations are never overwritten without your confirmation.
        </p>
      )}

      {disabled ? (
        <div
          role="alert"
          data-testid="cms-translation-disabled"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">Auto-translate is disabled on the server</strong> (no translation
            provider is configured). Saving works, but the other languages are not created or updated. Add them
            by hand, or reload this page once the provider is configured.
          </span>
        </div>
      ) : null}

      {requesting ? (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {translating ? "Requesting translation…" : "Saving…"}
        </p>
      ) : phase === "polling" && loadState === "ready" ? (
        <p
          className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700"
          role="status"
          data-testid="cms-translation-polling"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Translating in the background. This updates automatically.
        </p>
      ) : null}

      {phase === "timed_out" ? (
        <div
          className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
          data-testid="cms-translation-timeout"
        >
          <span>Still translating. Refresh later to see the result.</span>
          <button type="button" onClick={onRefresh} className="shrink-0 font-semibold underline">
            Check again
          </button>
        </div>
      ) : null}

      {immediate.length > 0 ? (
        <div className="space-y-1 text-[11px]" data-testid="cms-translation-immediate">
          <p className="font-medium text-rose-500">
            {panel.source === "retranslate" ? "Last retry" : "Last save"}
            {panel.stale ? " — content changed since" : ""}
          </p>
          {immediate.map((result) => (
            <ResultChip
              key={`${result.locale}-${result.status}`}
              result={result}
              label={cmsTranslationLocaleLabel(result.locale)}
            />
          ))}
        </div>
      ) : null}

      {mode === "edit" ? (
        <div className="space-y-1.5" data-testid="cms-locale-variants">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">Languages</p>
          {status ? (
            <ul className="space-y-1">
              {cmsStatusRows(status, currentId).map((entry) => (
                <LocaleRow
                  key={entry.locale}
                  entry={entry}
                  current={entry.current}
                  status={status}
                  type={type}
                  canManage={canManage}
                  busy={busy}
                  onRetry={onRetry}
                  onForce={onForce}
                />
              ))}
            </ul>
          ) : loadState === "error" ? (
            <div className="flex items-center justify-between gap-2 text-[11px] text-rose-500">
              <span>Couldn&apos;t load the translation status.</span>
              <button type="button" onClick={onRefresh} className="font-semibold underline">
                Try again
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-rose-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          )}
          {phase === "stopped" && status ? (
            <p className="text-[11px] text-rose-500">
              Couldn&apos;t refresh the translation status.{" "}
              <button type="button" onClick={onRefresh} className="font-semibold underline">
                Try again
              </button>
            </p>
          ) : null}
          {panel.stale && role === "source" ? (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Save to translate the latest changes.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" && canManage ? (
        <div className="space-y-1.5">
          {actions.retry ? (
            <>
              <button
                type="button"
                data-testid="cms-translation-retry"
                onClick={onRetry}
                disabled={actionsBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-pink-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
              >
                {translating ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />}
                {role === "source" ? "Retry translations" : "Retry from original"}
              </button>
              <p className="text-[11px] leading-relaxed text-rose-400">
                Uses the saved version{role === "source" ? "" : " of the original"}; unsaved edits on this screen are
                kept and not sent. Manual translations are kept.
              </p>
            </>
          ) : actions.retryBlockedBy ? (
            <p className="text-[11px] leading-relaxed text-rose-600" data-testid="cms-translation-retry-blocked">
              Retrying will not help until this is fixed on the server:{" "}
              {actions.retryBlockedBy.error ?? "the translation service rejected the request."}
            </p>
          ) : null}
          {actions.forceLocales.length > 0 ? (
            <button
              type="button"
              data-testid="cms-translation-force"
              onClick={() => onForce(actions.forceLocales)}
              disabled={actionsBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
            >
              Overwrite manual translations ({actions.forceLocales.map((code) => code.toUpperCase()).join(", ")})…
            </button>
          ) : null}
        </div>
      ) : mode === "create" ? (
        <p className="text-[11px] text-rose-400">
          Translations into {targetLabel} start in the background when you first save.
        </p>
      ) : null}
    </div>
  );
}
