'use client'

import { useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, CalendarClock, CheckCircle, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
import { authFetch } from "@/lib/utils"
import type { RescheduleHistoryDto } from "@/types/bookingDetails"
import { ScheduleSummary } from "@/components/booking/details/DetailPrimitives"
import { formatInstant } from "@/lib/bookingDetails"
import { toast } from "sonner"

interface RescheduleRequestCardProps {
  bookingId: string
  reschedules: RescheduleHistoryDto[]
  viewerUserId?: string | null
  viewerRole?: 'customer' | 'professional' | 'admin' | string | null
  onResolved?: () => void
  onOpenDispute?: () => void
  /** When provided, the decline/refund button delegates to the caller
   * (e.g. to collect an optional note first) instead of answering directly. */
  onDeclineWithNote?: () => void
}

const TERMINAL_STATUSES = new Set(['accepted', 'declined', 'disputed', 'auto_cancelled'])

function normalizeStatus(status?: string | null): string {
  return (status || 'pending').toLowerCase()
}

/**
 * Tasks 9a/9c: render the full reschedule request information to the
 * customer — old and new/proposed schedule (dates + times), reason, optional
 * description, requester, status and history — not just the latest partial
 * info. Once a request is disputed/terminal (`canRespond === false`), the
 * accept/decline buttons are disabled and the disputed state is shown.
 */
export default function RescheduleRequestCard({
  bookingId,
  reschedules,
  viewerUserId,
  viewerRole,
  onResolved,
  onOpenDispute,
  onDeclineWithNote,
}: RescheduleRequestCardProps) {
  const t = useTranslations("bookings")
  const tx = t as unknown as (key: string, params?: Record<string, string | number>) => string
  const hasTx = t.has as unknown as (key: string) => boolean
  const getErrorText = useErrorMessage()
  const { intl } = useFormatLocale()
  const [busy, setBusy] = useState(false)

  if (!reschedules || reschedules.length === 0) return null

  // The live request is the one the backend flags as answerable. When there
  // is no live request, the latest entry is still shown as the main one so a
  // disputed/terminal state stays visible instead of vanishing into history.
  const ordered = [...reschedules]
  const active =
    ordered.find((entry) => entry.canRespond === true) ||
    [...ordered].reverse().find((entry) => normalizeStatus(entry.status) === 'pending') ||
    null
  const mainEntry = active || ordered[ordered.length - 1] || null
  const history = ordered.filter((entry) => entry !== mainEntry)

  const requesterName = (entry: RescheduleHistoryDto) =>
    entry.requestedBy?.name ||
    (entry.actorRecorded === false
      ? t("rescheduleRequest.actorNotRecorded")
      : t("rescheduleRequest.unknownRequester"))

  const formatDateTime = (value?: string | null) => formatInstant(value, intl) || null

  const respond = async (action: 'accept' | 'refund') => {
    if (busy) return
    setBusy(true)
    try {
      // Review item 8: authFetch injects the token + credentials:include.
      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/respond-reschedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      )
      const result = await response.json().catch(() => null)
      const code =
        result?.error?.code || result?.code || (result?.data as { code?: string } | undefined)?.code
      if (response.ok && result?.success) {
        toast.success(
          action === 'accept'
            ? t("reschedule.toasts.accepted")
            : t("reschedule.toasts.declinedRefunded")
        )
        onResolved?.()
        return
      }
      // Task 9c: a disputed request answers 409 RESCHEDULE_DISPUTED — surface
      // the disputed state instead of a generic failure.
      if (response.status === 409 || code === 'RESCHEDULE_DISPUTED') {
        toast.error(t("rescheduleRequest.toasts.disputed"))
        onResolved?.()
        return
      }
      toast.error(getErrorText(result, t("reschedule.toasts.respondFailed")))
    } catch (err) {
      toast.error(getErrorText(err, t("common.respondFailedRetry")))
    } finally {
      setBusy(false)
    }
  }

  const requestedByViewer = (entry: RescheduleHistoryDto) =>
    !!viewerUserId &&
    !!entry.requestedBy?.id &&
    String(entry.requestedBy.id) === String(viewerUserId)

  const renderEntry = (entry: RescheduleHistoryDto, key: string, isMain: boolean) => {
    const status = normalizeStatus(entry.status)
    // Only the customer can answer via respond-reschedule; the professional
    // side is covered by the dispute flow.
    const canViewerRespond = viewerRole === 'customer' && !requestedByViewer(entry)
    const showActions = isMain && entry.canRespond === true && canViewerRespond && !TERMINAL_STATUSES.has(status)
    const actionsDisabled = isMain && !showActions
    // Task 9c: a disputed request (explicit status or a terminal
    // canRespond === false) never offers accept/decline again.
    const isDisputed = status === 'disputed'

    return (
      <div key={key} className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-900">
            {t("rescheduleRequest.requestedTitle", {
              date: formatDateTime(entry.requestedAt) || t("rescheduleRequest.dateNotRecorded"),
            })}
          </p>
          <Badge variant="outline" className="capitalize">
            {hasTx(`rescheduleRequest.status.${status}`)
              ? tx(`rescheduleRequest.status.${status}`)
              : status.replace(/_/g, " ")}
          </Badge>
        </div>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {t("rescheduleRequest.requestedBy")}
            </dt>
            <dd className="mt-0.5 text-sm text-gray-800">{requesterName(entry)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {t("rescheduleRequest.reason")}
            </dt>
            <dd className="mt-0.5 text-sm text-gray-800">{entry.reason || t("rescheduleRequest.noReason")}</dd>
          </div>
        </dl>
        {entry.description ? (
          <p className="mt-2 whitespace-pre-wrap text-xs text-gray-700">{entry.description}</p>
        ) : null}
        {entry.responseNote ? (
          <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">
            {t("rescheduleRequest.responseNote", { note: entry.responseNote })}
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {t("rescheduleRequest.previousSchedule")}
            </dt>
            <dd className="mt-0.5">
              <ScheduleSummary schedule={entry.previousSchedule} intl={intl} timeZone={entry.timeZone} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {t("rescheduleRequest.proposedSchedule")}
            </dt>
            <dd className="mt-0.5">
              <ScheduleSummary schedule={entry.proposedSchedule} intl={intl} timeZone={entry.timeZone} />
            </dd>
          </div>
        </div>
        {isMain && isDisputed ? (
          <p className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {t("rescheduleRequest.disputedNotice")}
          </p>
        ) : null}
        {showActions ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={busy}
              onClick={() => void respond('accept')}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
              {t("common.accept")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
              disabled={busy}
              onClick={() => {
                if (onDeclineWithNote) onDeclineWithNote()
                else void respond('refund')
              }}
            >
              {t("common.refund")}
            </Button>
            {onOpenDispute ? (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                disabled={busy}
                onClick={onOpenDispute}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                {t("common.dispute")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {actionsDisabled && !isDisputed ? (
          <p className="mt-2 text-[11px] text-gray-500">{t("rescheduleRequest.noActionAvailable")}</p>
        ) : null}
      </div>
    )
  }

  return (
    <Card className="border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-sky-900">
          <CalendarClock className="h-5 w-5" />
          {t("rescheduleRequest.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {mainEntry ? renderEntry(mainEntry, mainEntry.id || 'latest', true) : null}
        {history.length > 0 ? (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-sky-800">
              {t("rescheduleRequest.historyTitle")}
            </p>
            {history.map((entry, index) => renderEntry(entry, entry.id || `history-${index}`, false))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
