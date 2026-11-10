"use client"

import type { ReactNode } from "react";
import { AlertTriangle, Eye, Languages, Loader2, Pencil, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CMS_CONTENT_LOCALE_LABELS,
  getPublicPathForCms,
  withCmsLangParam,
  type CmsContentType,
  type CmsLocaleVariant,
  type CmsTranslationResult,
} from "@/lib/cms";
import {
  CMS_TRANSLATION_STATUS_LABELS,
  cmsAutoTranslateDisabled,
  cmsLocaleRows,
  cmsTranslationLocaleLabel,
  cmsTranslationStatusTone,
  hasRetryableCmsTranslations,
  unplacedCmsTranslationResults,
  type CmsLocaleRow,
  type CmsLocaleRowKind,
  type CmsTranslationPanelState,
  type CmsTranslationRole,
} from "@/lib/cmsTranslationState";

const TONE_CLASSES: Record<ReturnType<typeof cmsTranslationStatusTone>, string> = {
  error: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const ROLE_LABELS: Record<CmsTranslationRole, string> = {
  source: "Original",
  machine: "Machine",
  manual: "Manual",
};

const KIND_LABELS: Record<Exclude<CmsLocaleRowKind, "current">, string> = {
  original: "Original",
  machine: "Machine",
  manual: "Manual",
  unlinked: "Same slug, not linked",
  missing: "Not translated",
};

const KIND_CLASSES: Record<CmsLocaleRowKind, string> = {
  current: "bg-rose-100 text-rose-700",
  original: "bg-rose-100 text-rose-700",
  machine: "bg-sky-100 text-sky-700",
  manual: "bg-amber-100 text-amber-800",
  unlinked: "bg-gray-100 text-gray-600",
  missing: "bg-gray-100 text-gray-500",
};

export interface CmsTranslationPanelProps {
  mode: "create" | "edit";
  /** Content type, for the public "live" link of published language versions. */
  type?: CmsContentType;
  role: CmsTranslationRole;
  /** Locale of the saved document (rows are listed around it). */
  locale?: string;
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

function ResultChip({ result, label }: { result: CmsTranslationResult; label: string }) {
  return (
    <div
      data-translation-locale={result.locale}
      data-translation-status={result.status}
      className={cn("mt-1 rounded-md border px-2 py-1", TONE_CLASSES[cmsTranslationStatusTone(result.status)])}
    >
      <div className="flex items-center justify-between gap-2 font-medium">
        <span>{label}</span>
        <span>{CMS_TRANSLATION_STATUS_LABELS[result.status]}</span>
      </div>
      {result.error ? <p className="mt-0.5 break-words opacity-90">{result.error}</p> : null}
    </div>
  );
}

/** Public URL of a published language version (same URL, language via ?lang=). */
function liveHref(type: CmsContentType | undefined, variant: CmsLocaleVariant): string | null {
  if (!type || variant.status !== "published" || !variant.slug) return null;
  const path = getPublicPathForCms(type, variant.slug);
  return path ? withCmsLangParam(path, variant.locale) : null;
}

function LocaleRow({
  row,
  type,
  role,
  variantsState,
}: {
  row: CmsLocaleRow;
  type?: CmsContentType;
  role: CmsTranslationRole;
  variantsState: CmsTranslationPanelProps["variantsState"];
}) {
  const label = row.kind === "current" ? `${ROLE_LABELS[role]} · this page` : KIND_LABELS[row.kind];
  const pill = (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", KIND_CLASSES[row.kind])}>{label}</span>
  );
  const head = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="font-semibold uppercase" title={CMS_CONTENT_LOCALE_LABELS[row.locale]}>
        {row.locale}
      </span>
      {row.variant ? <span className="truncate">{row.variant.title || row.variant.slug}</span> : null}
    </span>
  );

  let body: ReactNode;
  if (row.variant) {
    const live = liveHref(type, row.variant);
    body = (
      <div className="flex items-center justify-between gap-2">
        <a
          href={variantHref(row.variant._id)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Edit the ${CMS_CONTENT_LOCALE_LABELS[row.locale]} version in a new tab (keeps your unsaved edits here)`}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-rose-700 hover:underline"
        >
          {head}
          <span className="flex shrink-0 items-center gap-1.5 text-rose-500">
            {pill}
            <span className={row.variant.status === "published" ? "text-emerald-600" : ""}>{row.variant.status}</span>
            <Pencil size={11} aria-hidden />
          </span>
        </a>
        {live ? (
          <a
            href={live}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View the live ${CMS_CONTENT_LOCALE_LABELS[row.locale]} page`}
            title={`View the live ${CMS_CONTENT_LOCALE_LABELS[row.locale]} page`}
            className="shrink-0 rounded p-0.5 text-rose-500 hover:bg-rose-100 hover:text-rose-700"
          >
            <Eye size={12} aria-hidden />
          </a>
        ) : null}
      </div>
    );
  } else {
    const pending = row.kind === "missing" && (variantsState === "loading" || variantsState === "idle");
    const unknown = row.kind === "missing" && variantsState === "error";
    body = (
      <div className="flex items-center justify-between gap-2 text-rose-700">
        {head}
        <span className="flex shrink-0 items-center gap-1.5">
          {pending ? (
            <span className="text-rose-400">Loading…</span>
          ) : unknown ? (
            <span className="text-rose-400">Unknown</span>
          ) : (
            pill
          )}
        </span>
      </div>
    );
  }

  return (
    <li
      data-locale-row={row.locale}
      data-locale-kind={row.kind}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-[11px]",
        row.kind === "current" ? "border-rose-200 bg-rose-50/60" : "border-pink-100"
      )}
    >
      {body}
      {row.result ? <ResultChip result={row.result} label="Last run" /> : null}
    </li>
  );
}

export default function CmsTranslationPanel({
  mode,
  type,
  role,
  locale,
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
  const disabled = cmsAutoTranslateDisabled(panel.results);
  const rows = mode === "edit" ? cmsLocaleRows(locale, variants, panel.results) : [];
  const unplaced = unplacedCmsTranslationResults(panel.results);

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

      {disabled ? (
        <div
          role="alert"
          data-testid="cms-translation-disabled"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">Auto-translate is disabled on the server</strong> (no translation
            provider key is configured). Your content was saved; the other languages were not created or
            updated. Add them by hand, or retry once the provider is configured.
          </span>
        </div>
      ) : null}

      {inFlight ? (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {translating ? "Syncing translations…" : `Saving and translating into ${targetLabel}…`}
        </p>
      ) : null}

      {panel.results.length > 0 ? (
        <p className="text-[11px] font-medium text-rose-500">
          {panel.source === "retranslate" ? "Last resync" : "Last save"}
          {panel.stale ? " — content changed since, results may be out of date" : ""}
        </p>
      ) : mode === "edit" && role === "source" && !inFlight ? (
        <p className="text-[11px] text-rose-400" data-testid="cms-translation-empty">
          {panel.source
            ? `The server reported no translation results for the last ${panel.source === "save" ? "save" : "resync"}; automatic translation may be unavailable on this server.`
            : "No translation run in this session yet."}
        </p>
      ) : null}

      {unplaced.length > 0 ? (
        <div className="space-y-1 text-[11px]">
          {unplaced.map((result) => (
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
          <ul className="space-y-1">
            {rows.map((row) => (
              <LocaleRow key={row.locale} row={row} type={type} role={role} variantsState={variantsState} />
            ))}
          </ul>
          {variantsState === "error" ? (
            <p className="text-[11px] text-rose-500">Couldn&apos;t load the other language versions.</p>
          ) : null}
          {variantsSource === "slug-search" && variantsState === "ready" ? (
            <p className="text-[10px] text-rose-400">Found by slug; manual versions saved under another slug may not be listed.</p>
          ) : null}
          {panel.stale ? (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Save to translate the latest changes.
            </p>
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
