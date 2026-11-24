"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Globe2, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { getErrorMessage } from "@/lib/apiErrors"
import {
  adminGetCmsTranslationOverview,
  adminGetContentTranslationStatus,
  adminRunCmsTranslationBackfill,
  adminRunContentTranslationBackfill,
  revalidateAllPublicCms,
  type CmsTranslationOverview,
  type ContentTranslationStatus,
} from "@/lib/cms"

const POLL_MS = 5_000

const DEFAULT_DISABLED_REASON =
  "Auto-translation is disabled: AZURE_TRANSLATOR_KEY is not set on the API server."

/** True while a background run still has work queued or in flight. */
export function cmsBackfillActive(overview: CmsTranslationOverview | null): boolean {
  return Boolean(overview && overview.enabled && (overview.queued > 0 || overview.running > 0))
}

export function contentBackfillActive(status: ContentTranslationStatus | null): boolean {
  return Boolean(status && status.enabled && (status.pending > 0 || status.running > 0))
}

/**
 * Site-wide auto-translation status for the Content Studio: whether the API
 * can translate at all (AZURE_TRANSLATOR_KEY), how much existing CMS content
 * still lacks a Dutch/French/English version, and the catalogue + project text
 * translation memory. Super admins can translate everything that exists.
 */
export default function AutoTranslateOverview({ canRun }: { canRun: boolean }) {
  const [cms, setCms] = useState<CmsTranslationOverview | null>(null)
  const [content, setContent] = useState<ContentTranslationStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"cms" | "content" | null>(null)
  const wasCmsActive = useRef(false)

  const load = useCallback(async () => {
    try {
      const [nextCms, nextContent] = await Promise.all([
        adminGetCmsTranslationOverview(),
        adminGetContentTranslationStatus(),
      ])
      setCms(nextCms)
      setContent(nextContent)
      setError(null)
      // A CMS run just finished: public pages are cached, flush them once.
      const active = cmsBackfillActive(nextCms)
      if (wasCmsActive.current && !active) {
        revalidateAllPublicCms().catch((err) => console.warn("CMS revalidation after translation failed", err))
      }
      wasCmsActive.current = active
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load the translation status."))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const polling = cmsBackfillActive(cms) || contentBackfillActive(content)
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [polling, load])

  const runCms = async () => {
    setBusy("cms")
    try {
      setCms(await adminRunCmsTranslationBackfill())
      wasCmsActive.current = true
      toast.success("Translating existing content in the background.")
      setTimeout(() => void load(), 1_500)
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't start the translation."))
    } finally {
      setBusy(null)
    }
  }

  const runContent = async () => {
    setBusy("content")
    try {
      setContent(await adminRunContentTranslationBackfill({ retryFailed: true }))
      toast.success("Translating the service catalogue and projects in the background.")
      setTimeout(() => void load(), 1_500)
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't start the translation."))
    } finally {
      setBusy(null)
    }
  }

  const disabled = (cms && !cms.enabled) || (content && !content.enabled)
  const disabledReason = cms?.disabledReason || content?.disabledReason || DEFAULT_DISABLED_REASON

  return (
    <div className="mt-6 rounded-2xl border border-pink-200 bg-white/70 p-5 shadow-sm" data-testid="auto-translate-overview">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Globe2 size={16} className="mt-0.5 text-rose-500" />
          <div>
            <h2 className="text-sm font-semibold text-rose-900">Automatic translation (Dutch / French / English)</h2>
            <p className="text-xs text-rose-500">
              New and edited content is translated in the background. Content written before auto-translation was
              enabled is only translated when you run it below.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-md border border-pink-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-pink-50"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <span>{error}</span>
        </div>
      )}

      {disabled && (
        <div
          className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          data-testid="auto-translate-disabled"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <strong className="font-semibold">Auto-translate is disabled on the server.</strong> {disabledReason}{" "}
            Visitors see every blog, news item, FAQ and project in the language it was written in. Ask the developer
            to set <code>AZURE_TRANSLATOR_KEY</code> (and <code>AZURE_TRANSLATOR_REGION</code> if the Azure resource
            is regional) on the API deployment, then run the translation below.
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-pink-100 bg-white p-4" data-testid="auto-translate-cms">
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-400">Blogs, news, FAQ &amp; pages</div>
          {cms ? (
            <p className="mt-1 text-sm text-rose-900">
              {cms.missing === 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 size={14} /> All {cms.sources} items have every language.
                </span>
              ) : (
                <>
                  <strong>{cms.missing}</strong> of {cms.sources} items are missing a translation.
                </>
              )}
              {cmsBackfillActive(cms) && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-rose-500">
                  <Loader2 size={12} className="animate-spin" /> translating ({cms.queued} queued)
                </span>
              )}
            </p>
          ) : (
            <p className="mt-1 text-xs text-rose-400">Loading…</p>
          )}
          {canRun && (
            <button
              type="button"
              onClick={() => void runCms()}
              disabled={!cms?.enabled || busy !== null || cmsBackfillActive(cms) || cms?.missing === 0}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === "cms" && <Loader2 size={12} className="animate-spin" />}
              Translate all existing content
            </button>
          )}
        </div>

        <div className="rounded-xl border border-pink-100 bg-white p-4" data-testid="auto-translate-content">
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-400">Service catalogue &amp; projects</div>
          {content ? (
            <p className="mt-1 text-sm text-rose-900">
              <strong>{content.done}</strong> texts translated
              {content.pending > 0 && <>, {content.pending} waiting</>}
              {content.failed > 0 && <span className="text-red-700">, {content.failed} failed</span>}.
              {contentBackfillActive(content) && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-rose-500">
                  <Loader2 size={12} className="animate-spin" /> translating
                </span>
              )}
            </p>
          ) : (
            <p className="mt-1 text-xs text-rose-400">Loading…</p>
          )}
          {canRun && (
            <button
              type="button"
              onClick={() => void runContent()}
              disabled={!content?.enabled || busy !== null}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === "content" && <Loader2 size={12} className="animate-spin" />}
              Translate catalogue &amp; existing projects
            </button>
          )}
        </div>
      </div>
      {!canRun && (
        <p className="mt-3 text-[11px] text-rose-400">Only a super admin can translate all existing content at once.</p>
      )}
    </div>
  )
}
