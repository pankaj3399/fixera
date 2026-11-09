'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authFetch } from '@/lib/utils'
import {
  DASHBOARD_BASELINE_KEYS,
  DASHBOARD_BASELINES_PATH,
  DASHBOARD_BASELINE_NOTE_MAX_LENGTH,
  formatBaselineDate,
  normalizeResetNote,
  parseDashboardBaselineSnapshot,
  resetRequestPath,
  undoRequestPath,
  type DashboardBaselineHistoryEvent,
  type DashboardBaselineKey,
  type DashboardBaselineSnapshot,
  type DashboardBaselineView,
} from '@/lib/admin/dashboardBaselines'

/** A reset waiting for confirmation: one dashboard, or every dashboard. */
export type PendingDashboardReset = { target: DashboardBaselineKey | 'all' }

const LABEL_KEY = {
  disputes: 'dashboards.disputes.label',
  warrantyClaims: 'dashboards.warrantyClaims.label',
  cancellations: 'dashboards.cancellations.label',
  bookingKpis: 'dashboards.bookingKpis.label',
} as const satisfies Record<DashboardBaselineKey, string>

const DESCRIPTION_KEY = {
  disputes: 'dashboards.disputes.description',
  warrantyClaims: 'dashboards.warrantyClaims.description',
  cancellations: 'dashboards.cancellations.description',
  bookingKpis: 'dashboards.bookingKpis.description',
} as const satisfies Record<DashboardBaselineKey, string>

type ViewProps = {
  snapshot: DashboardBaselineSnapshot | null
  loading: boolean
  loadFailed: boolean
  pending: PendingDashboardReset | null
  note: string
  busy: boolean
  locale: string
  onRequestReset: (target: DashboardBaselineKey | 'all') => void
  onCancelReset: () => void
  onNoteChange: (value: string) => void
  onConfirmReset: () => void
  onUndo: (key: DashboardBaselineKey, expectedResetAt: string | null) => void
  onRetry: () => void
}

/**
 * Presentational "Reset dashboards" section (super-admin settings). It is pure
 * props in, markup out, so the reset list, confirmation and history can be
 * rendered and tested without any network calls.
 */
export function DashboardBaselineSettingsView({
  snapshot,
  loading,
  loadFailed,
  pending,
  note,
  busy,
  locale,
  onRequestReset,
  onCancelReset,
  onNoteChange,
  onConfirmReset,
  onUndo,
  onRetry,
}: ViewProps) {
  const t = useTranslations('adminDashboards')
  const dialogRef = useRef<HTMLDivElement | null>(null)
  // The control that opened the confirmation, so focus can return to it.
  const returnFocusRef = useRef<{ focus?: () => void } | null>(null)

  // WAI-ARIA alertdialog: move focus into the dialog when it opens, and give it
  // back to the opening control when the dialog closes (cancel or confirm).
  useEffect(() => {
    if (!pending) return
    if (!returnFocusRef.current && typeof document !== 'undefined') {
      returnFocusRef.current = document.activeElement as { focus?: () => void } | null
    }
    dialogRef.current?.focus()
  }, [pending])

  useEffect(() => {
    if (pending) return
    const returnTo = returnFocusRef.current
    returnFocusRef.current = null
    returnTo?.focus?.()
  }, [pending])

  const viewFor = (key: DashboardBaselineKey): DashboardBaselineView | undefined =>
    snapshot?.dashboards.find((d) => d.key === key)

  const baselineText = (view: DashboardBaselineView | undefined) => {
    if (!view?.resetAt) return t('settings.notSetYet')
    const date = formatBaselineDate(view.resetAt, locale)
    return view.resetBy?.name
      ? t('settings.countingSince', { date, name: view.resetBy.name })
      : t('settings.countingSinceNoName', { date })
  }

  const historyText = (event: DashboardBaselineHistoryEvent) => {
    const action = event.action === 'undo' ? t('settings.historyAction.undo') : t('settings.historyAction.reset')
    const date = formatBaselineDate(event.createdAt, locale)
    return t('settings.historyEntry', { action, date, name: event.actorName || '—' })
  }

  const dashboardLabel = (key: DashboardBaselineKey) => t(LABEL_KEY[key])

  const confirmTitle = pending
    ? pending.target === 'all'
      ? t('settings.confirmTitleAll')
      : t('settings.confirmTitle', { dashboard: dashboardLabel(pending.target) })
    : ''
  const confirmCta = pending?.target === 'all' ? t('settings.confirmResetAll') : t('settings.confirmReset')

  return (
    <Card data-testid="dashboard-reset-section" className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              {t('settings.title')}
            </CardTitle>
            <CardDescription>{t('settings.description')}</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onRequestReset('all')}
            disabled={busy || loading || loadFailed}
          >
            {t('settings.resetAll')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('settings.loading')}
          </p>
        )}
        {loadFailed && !loading && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-red-600">{t('settings.loadError')}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={busy}>
              {t('settings.retry')}
            </Button>
          </div>
        )}

        {snapshot && (
          <ul className="divide-y rounded-md border" data-testid="dashboard-reset-list">
            {DASHBOARD_BASELINE_KEYS.map((key) => {
              const view = viewFor(key)
              return (
                <li key={key} data-dashboard={key} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-gray-900">{dashboardLabel(key)}</p>
                    <p className="text-sm text-gray-600">{t(DESCRIPTION_KEY[key])}</p>
                    <p className="text-xs text-gray-500" data-testid={`baseline-${key}`}>
                      {baselineText(view)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {view?.canUndo && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onUndo(key, view.resetAt)} disabled={busy}>
                        {t('settings.undo')}
                      </Button>
                    )}
                    <Button type="button" size="sm" onClick={() => onRequestReset(key)} disabled={busy || loading}>
                      {t('settings.reset')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {pending && (
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="false"
            aria-labelledby="dashboard-reset-title"
            aria-describedby="dashboard-reset-body"
            data-testid="dashboard-reset-confirm"
            className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4"
          >
            <h3 id="dashboard-reset-title" className="font-semibold text-gray-900">
              {confirmTitle}
            </h3>
            <div id="dashboard-reset-body" className="space-y-2 text-sm text-gray-700">
              <p>{t('settings.confirmBody')}</p>
              <p>{t('settings.confirmOpenItems')}</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="dashboard-reset-note" className="text-sm font-medium text-gray-900">
                {t('settings.noteLabel')}
              </label>
              <textarea
                id="dashboard-reset-note"
                name="dashboard-reset-note"
                rows={2}
                maxLength={DASHBOARD_BASELINE_NOTE_MAX_LENGTH}
                value={note}
                placeholder={t('settings.notePlaceholder')}
                onChange={(event) => onNoteChange(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
              />
              <p className="text-xs text-gray-500">{t('settings.noteHelp')}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancelReset} disabled={busy}>
                {t('settings.confirmCancel')}
              </Button>
              <Button type="button" onClick={onConfirmReset} disabled={busy} data-testid="dashboard-reset-confirm-cta">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {confirmCta}
              </Button>
            </div>
          </div>
        )}

        {snapshot && (
          <section aria-labelledby="dashboard-reset-history-title" className="space-y-2">
            <h3 id="dashboard-reset-history-title" className="text-sm font-semibold text-gray-900">
              {t('settings.historyTitle')}
            </h3>
            {snapshot.history.length === 0 ? (
              <p className="text-sm text-gray-500">{t('settings.historyEmpty')}</p>
            ) : (
              <ul className="space-y-1 text-sm text-gray-700" data-testid="dashboard-reset-history">
                {snapshot.history.map((event, index) => (
                  <li key={`${event.dashboardKey}-${event.createdAt ?? index}-${index}`}>
                    <span className="font-medium">{dashboardLabel(event.dashboardKey)}</span>
                    {': '}
                    {historyText(event)}
                    {event.note ? ` — ${event.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Container for the reset section. Renders nothing unless `canManage` is true
 * (super admins only). The server enforces the same rule on every call.
 */
export default function DashboardBaselineSettingsCard({ canManage }: { canManage: boolean }) {
  const t = useTranslations('adminDashboards')
  const locale = useLocale()
  const [snapshot, setSnapshot] = useState<DashboardBaselineSnapshot | null>(null)
  const [loading, setLoading] = useState(canManage)
  const [loadFailed, setLoadFailed] = useState(false)
  const [pending, setPending] = useState<PendingDashboardReset | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${DASHBOARD_BASELINES_PATH}`)
      const parsed = res.ok ? parseDashboardBaselineSnapshot(await res.json().catch(() => null)) : null
      if (parsed) setSnapshot(parsed)
      else setLoadFailed(true)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManage) void load()
  }, [canManage, load])

  const applyResponse = async (res: Response) => {
    const parsed = res.ok ? parseDashboardBaselineSnapshot(await res.json().catch(() => null)) : null
    if (!parsed) throw new Error('dashboard-baseline-request-failed')
    setSnapshot(parsed)
  }

  const confirmReset = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${resetRequestPath(pending.target)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: normalizeResetNote(note) }),
      })
      await applyResponse(res)
      toast.success(
        pending.target === 'all'
          ? t('settings.resetAllDone')
          : t('settings.resetDone', { dashboard: t(LABEL_KEY[pending.target]) }),
      )
      setPending(null)
      setNote('')
    } catch {
      toast.error(t('settings.error'))
    } finally {
      setBusy(false)
    }
  }

  const undo = async (key: DashboardBaselineKey, expectedResetAt: string | null) => {
    setBusy(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${undoRequestPath(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The reset this admin is looking at. The server refuses the undo if it has moved on.
        body: JSON.stringify({ expectedResetAt }),
      })
      const conflict = res.status === 409
        ? await res.clone().json().catch(() => null) as { code?: unknown } | null
        : null
      if (conflict?.code === 'BASELINE_CHANGED') {
        // Someone else reset this dashboard after this page loaded. Show the current state and do not undo.
        await load()
        toast.error(t('settings.undoBaselineChanged'))
        return
      }
      await applyResponse(res)
      toast.success(t('settings.undoDone', { dashboard: t(LABEL_KEY[key]) }))
    } catch {
      toast.error(t('settings.error'))
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) return null

  return (
    <DashboardBaselineSettingsView
      snapshot={snapshot}
      loading={loading}
      loadFailed={loadFailed}
      pending={pending}
      note={note}
      busy={busy}
      locale={locale}
      onRequestReset={(target) => {
        setNote('')
        setPending({ target })
      }}
      onCancelReset={() => {
        setPending(null)
        setNote('')
      }}
      onNoteChange={setNote}
      onConfirmReset={() => void confirmReset()}
      onUndo={(key, expectedResetAt) => void undo(key, expectedResetAt)}
      onRetry={() => void load()}
    />
  )
}
