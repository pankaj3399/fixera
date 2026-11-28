'use client'

import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import type { CancellationRequestDto } from "@/types/bookingDetails"
import RefundRequestActions from "@/components/booking/RefundRequestActions"

interface CancellationRequestCardProps {
  bookingId: string
  request: CancellationRequestDto
  viewerRole: 'customer' | 'professional' | 'admin' | null
  currency?: string | null
  /** Booking price: the highest counter-offer the professional may send. */
  maxCounterAmount?: number | null
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
  maxCounterAmount,
  onResolved,
}: CancellationRequestCardProps) {
  const t = useTranslations("bookings")
  const tx = t as unknown as (key: string, params?: Record<string, string | number>) => string
  const hasTx = t.has as unknown as (key: string) => boolean
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()

  const requesterName =
    request.requestedBy?.name ||
    (request.requestedRole === 'professional'
      ? t("cancellationRequest.professionalFallback")
      : t("cancellationRequest.customerFallback"))
  const status = request.status || 'pending'
  const isPending = status === 'pending' || status === 'negotiating'
  // Review item 7: verified against the backend — professionalRespondToCancellation
  // rejects anything but status 'pending' (400), so the buttons correctly stay
  // hidden during 'negotiating'/'escalated'. The actions are the dashboard's
  // own (RefundRequestActions): approve full refund, negotiate, reject (FT3 #3A).
  const canAct =
    viewerRole === 'professional' && (request.status === 'pending') && !TERMINAL_STATUSES.has(status)
  const displayCurrency = request.currency || currency || 'EUR'

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
          <RefundRequestActions
            bookingId={bookingId}
            maxAmount={maxCounterAmount ?? 0}
            currency={displayCurrency}
            onResolved={() => onResolved?.()}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
