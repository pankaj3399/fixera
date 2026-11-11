"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Languages, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/apiErrors";
import {
  TRANSLATION_LOCALE_LABELS,
  TRANSLATION_STATE_META,
  fetchAnnouncementTranslations,
  runAnnouncementTranslations,
  saveAnnouncementTranslation,
  shouldPollTranslationStatus,
  visitorTextSource,
  type AnnouncementLocaleStatus,
  type AnnouncementTranslationStatus,
} from "@/lib/admin/siteAnnouncementTranslations";

const POLL_MS = 3_000;
const MAX_POLLS = 40;

type Draft = { title: string; message: string; ctaLabel: string };

function draftFrom(entry: AnnouncementLocaleStatus): Draft {
  return {
    title: entry.translation?.title ?? "",
    message: entry.translation?.message ?? "",
    ctaLabel: entry.translation?.ctaLabel ?? "",
  };
}

/**
 * Per-locale translations of one saved announcement: status, the text
 * visitors get, manual edits (kept until forced) and retry/retranslate.
 */
export function AnnouncementTranslationsPanel({
  announcementId,
  showCta,
  reloadToken,
}: {
  announcementId: string;
  showCta: boolean;
  /** Changes after the announcement itself is saved, to refresh status. */
  reloadToken?: number;
}) {
  const [status, setStatus] = useState<AnnouncementTranslationStatus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const pollsRef = useRef(0);

  const applyStatus = useCallback((next: AnnouncementTranslationStatus, resetDrafts: boolean) => {
    setStatus(next);
    setDrafts((prev) => {
      const out: Record<string, Draft> = {};
      for (const entry of next.locales) {
        if (entry.state === "source") continue;
        out[entry.locale] = resetDrafts || !prev[entry.locale] ? draftFrom(entry) : prev[entry.locale];
      }
      return out;
    });
  }, []);

  const load = useCallback(
    async (resetDrafts: boolean, signal?: AbortSignal) => {
      try {
        const next = await fetchAnnouncementTranslations(announcementId, { signal });
        applyStatus(next, resetDrafts);
      } catch (err) {
        if (signal?.aborted) return;
        toast.error(getErrorMessage(err, "Could not load translations"));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [announcementId, applyStatus],
  );

  useEffect(() => {
    const controller = new AbortController();
    pollsRef.current = 0;
    void load(true, controller.signal);
    return () => controller.abort();
  }, [load, reloadToken]);

  // Poll while a background run is in flight; refresh drafts when it settles.
  useEffect(() => {
    if (!shouldPollTranslationStatus(status) || pollsRef.current >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      pollsRef.current += 1;
      void load(true);
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [status, load]);

  const run = async (options: { locales?: string[]; force?: boolean }, key: string) => {
    setBusy(key);
    try {
      pollsRef.current = 0;
      applyStatus(await runAnnouncementTranslations(announcementId, options), false);
      toast.success(options.force ? "Retranslation started" : "Translation started");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not start translation"));
    } finally {
      setBusy(null);
    }
  };

  const save = async (locale: string) => {
    const draft = drafts[locale];
    if (!draft || draft.title.trim().length < 2 || draft.message.trim().length < 2) {
      toast.error("Title and message are required");
      return;
    }
    setBusy(`save-${locale}`);
    try {
      applyStatus(await saveAnnouncementTranslation(announcementId, locale, draft), true);
      toast.success(`${TRANSLATION_LOCALE_LABELS[locale] ?? locale} translation saved (kept as manual)`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save translation"));
    } finally {
      setBusy(null);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading translations…
      </div>
    );
  }
  if (!status) return null;

  const canMachineTranslate = status.enabled && status.supported;

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4" aria-label="Translations">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Languages className="h-4 w-4" /> Translations
        </p>
        {canMachineTranslate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy !== null}
            onClick={() => run({}, "retry")}
          >
            {busy === "retry" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Translate missing / retry failed
          </Button>
        ) : null}
      </div>

      {!status.enabled ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Auto-translation is off (no translator key configured). Visitors see the source text unless you add a
          translation manually below.
        </p>
      ) : !status.supported ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This source language cannot be machine-translated. Add translations manually below.
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Written once in {TRANSLATION_LOCALE_LABELS[status.sourceLocale] ?? status.sourceLocale}; machine-translated
          after saving. Edited translations are kept until you retranslate them.
        </p>
      )}

      {status.locales
        .filter((entry) => entry.state !== "source")
        .map((entry) => {
          const meta = TRANSLATION_STATE_META[entry.state];
          const draft = drafts[entry.locale] ?? draftFrom(entry);
          const label = TRANSLATION_LOCALE_LABELS[entry.locale] ?? entry.locale;
          const patchDraft = (partial: Partial<Draft>) =>
            setDrafts((prev) => ({ ...prev, [entry.locale]: { ...draft, ...partial } }));
          return (
            <div key={entry.locale} className="space-y-2 rounded-md bg-slate-50 p-3" data-locale={entry.locale}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>{meta.label}</span>
                {entry.sourceChanged ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Source changed since this edit
                  </span>
                ) : null}
                <span className="ml-auto text-[11px] text-slate-500">
                  Visitors see: {visitorTextSource(entry) === "translation" ? "this translation" : "source text"}
                </span>
              </div>
              {entry.state === "failed" && entry.lastResult?.error ? (
                <p className="text-xs text-rose-700">{entry.lastResult.error}</p>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor={`tr-${entry.locale}-title`} className="text-xs text-slate-600">
                  Headline
                </Label>
                <Input
                  id={`tr-${entry.locale}-title`}
                  value={draft.title}
                  onChange={(e) => patchDraft({ title: e.target.value })}
                  className="h-8 text-sm"
                  maxLength={320}
                />
                <Label htmlFor={`tr-${entry.locale}-message`} className="text-xs text-slate-600">
                  Supporting text
                </Label>
                <Input
                  id={`tr-${entry.locale}-message`}
                  value={draft.message}
                  onChange={(e) => patchDraft({ message: e.target.value })}
                  className="h-8 text-sm"
                  maxLength={1000}
                />
                {showCta ? (
                  <>
                    <Label htmlFor={`tr-${entry.locale}-cta`} className="text-xs text-slate-600">
                      Button text
                    </Label>
                    <Input
                      id={`tr-${entry.locale}-cta`}
                      value={draft.ctaLabel}
                      onChange={(e) => patchDraft({ ctaLabel: e.target.value })}
                      className="h-8 text-sm"
                      maxLength={120}
                    />
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {canMachineTranslate ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    disabled={busy !== null}
                    onClick={() => {
                      if (
                        entry.state === "manual" &&
                        !window.confirm(`Replace the manually edited ${label} text with a new machine translation?`)
                      ) {
                        return;
                      }
                      void run({ locales: [entry.locale], force: true }, `force-${entry.locale}`);
                    }}
                  >
                    {busy === `force-${entry.locale}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Retranslate
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={busy !== null}
                  onClick={() => void save(entry.locale)}
                >
                  {busy === `save-${entry.locale}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Save {label}
                </Button>
              </div>
            </div>
          );
        })}
    </section>
  );
}
