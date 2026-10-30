'use client'

import { useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, CheckCircle, Loader2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
import { authFetch } from "@/lib/utils"
import type { CancellationRequestDto } from "@/types/bookingDetails"
import { toast } from "sonner"

interface CancellationRequestCardProps {
  bookingId: string
  request: CancellationRequestDto
  viewerRole: 'customer' | 'professional' | 'admin' | null
  currency?: string | null
  onResolved?: () => void
}

const TERMINAL_STATUSES = new Set(['approved', 'denied'])

/**
 * Task 3: the cancellation request must be visible on the booking page itself
 * (deep links from cancel notifications target this page), rendered from the
 * booking-details cancellation DTO with status/reason/actor and a
 * role-appropriate action.
 */
export default function CancellationRequestCard({
  bookingId,
  request,
  viewerRole,
  currency,
  onResolved,
}: CancellationRequestCardProps) {
  const t = useTranslations("bookings")
  const tx = t as unknown as (key: string, params?: Record<string, string | number>) => string
  const hasTx = t.has as unknown as (key: string) => boolean
  const getErrorText = useErrorMessage()
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  const requesterName =
    request.requestedBy?.name ||
    (request.requestedRole === 'professional'
      ? t("cancellationRequest.professionalFallback")
      : t("cancellationRequest.customerFallback"))
  const status = request.status || 'pending'
  const isPending = status === 'pending' || status === 'negotiating'
  // Review item 7: verified against the backend — professionalRespondToCancellation
  // rejects anything but status 'pending' (400), so the buttons correctly stay
  // hidden during 'negotiating'/'escalated' (those continue in the dashboard).
  const canAct =
    viewerRole === 'professional' && (request.status === 'pending') && !TERMINAL_STATUSES.has(status)
  const displayCurrency = request.currency || currency || 'EUR'

  const respond = async (decision: 'approve' | 'reject') => {
    if (busy) return
    setBusy(decision)
    try {
      // Review item 8: authFetch injects the token + credentials:include.
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/cancellation/respond`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        }
      )
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        toast.error(getErrorText(json, t("cancellationRequest.toasts.respondFailed")))
        return
      }
      toast.success(
        decision === 'approve'
          ? t("cancellationRequest.toasts.approved")
          : t("cancellationRequest.toasts.rejected")
      )
      onResolved?.()
    } catch (err) {
      toast.error(getErrorText(err, t("cancellationRequest.toasts.respondFailed")))
    } finally {
      setBusy(null)
    }
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString(intl)
  }
  const createdLabel = formatDateTime(request.createdAt)
  const deadlineLabel = formatDateTime(request.responseDeadline)

  return (
    <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            {t("cancellationRequest.title")}
          </CardTitle>
          <Badge variant="outline" className="capitalize">
            {hasTx(`cancellationRequest.status.${status}`)
              ? tx(`cancellationRequest.status.${status}`)
              : status.replace(/_/g, " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-amber-900">
          <span className="font-medium">{t("cancellationRequest.requestedBy")}:</span>{' '}
          {requesterName}
          {request.requestedRole ? ` (${hasTx(`cancellationRequest.role.${request.requestedRole}`) ? tx(`cancellationRequest.role.${request.requestedRole}`) : request.requestedRole})` : null}
          {createdLabel ? (
            <span className="text-amber-700"> · {createdLabel}</span>
          ) : null}
        </p>
        {request.reasonCategory ? (
          <p className="text-amber-900">
            <span className="font-medium">{t("cancellationRequest.category")}:</span> {request.reasonCategory}
          </p>
        ) : null}
        {request.reason ? (
          <p className="text-amber-900">
            <span className="font-medium">{t("cancellationRequest.reason")}:</span> {request.reason}
          </p>
        ) : null}
        {request.professionalNote ? (
          <p className="text-xs italic text-amber-800">
            {tx("cancellationRequest.professionalNote", { note: request.professionalNote || "" })}
          </p>
        ) : null}
        {request.counterOfferAmount != null && (
          <p className="text-amber-900">
            <span className="font-medium">{t("cancellationRequest.counterOffer")}:</span>{' '}
            {formatMoney(request.counterOfferAmount, displayCurrency)}
          </p>
        )}
        {deadlineLabel && isPending ? (
          <p className="text-xs text-amber-700">
            {t("cancellationRequest.responseDeadline", { date: deadlineLabel })}
          </p>
        ) : null}
        {request.refundAmount != null && (
          <p className="text-amber-900">
            <span className="font-medium">{t("cancellationRequest.refundAmount")}:</span>{' '}
            {formatMoney(request.refundAmount, displayCurrency)}
          </p>
        )}
        {request.denyReason ? (
          <p className="text-xs text-amber-800">
            {/* Review item 4: denyReason is participant-safe — the backend
                sends it to the requester in the refund_denied notification
                and denial email, and the details DTO exposes it to all
                viewers (only adminResolutionNote is admin-gated). */}
            <span className="font-medium">{t("cancellationRequest.denyReason")}:</span> {request.denyReason}
          </p>
        ) : null}
        {/* Review item 3: the admin-authored resolution note renders for
            admin viewers only (the backend nulls it for everyone else). */}
        {viewerRole === 'admin' && request.adminResolutionNote ? (
          <p className="text-xs italic text-amber-800">
            {t("cancellationRequest.adminNote", { note: request.adminResolutionNote })}
          </p>
        ) : null}
        {canAct ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={busy !== null}
              onClick={() => void respond('approve')}
            >
              {busy === 'approve' ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
              )}
              {t("cancellationRequest.approve")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
              disabled={busy !== null}
              onClick={() => void respond('reject')}
            >
              {busy === 'reject' ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5 mr-1" />
              )}
              {t("cancellationRequest.reject")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
