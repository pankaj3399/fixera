import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const WARRANTY_QUEUE_HREF = "/admin/warranty-claims"
export const REFUND_QUEUE_HREF = "/admin/cancellation-requests?status=escalated"

/** Open escalations handled in dispute management (any age). */
export interface DisputeEscalations {
  escalatedWarrantyClaims: number
  escalatedRefundRequests: number
  warrantyClaimsHref?: string
  refundRequestsHref?: string
}

/**
 * The dispute-management counter (same number as the nav badge): open booking
 * disputes, escalated refund requests and escalated warranty claims that came
 * in since the last reset (`resetAt`), or all of them when never reset.
 */
export interface DisputeManagementCounter {
  total: number
  bookingDisputes: number
  escalatedRefundRequests: number
  escalatedWarrantyClaims: number
  resetAt?: string | null
}

// Booking-dispute totals, with the same filters as the Open / Resolved / All
// views. Escalations are reported in `escalations` and are part of `counter`.
export interface DisputeAnalytics {
  totalOpen: number
  totalResolved: number
  totalDisputes: number
  escalations?: DisputeEscalations
  counter?: DisputeManagementCounter
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function DisputeCounterSummary({ counter }: { counter: DisputeManagementCounter }) {
  return (
    <p className="text-sm text-gray-700" data-testid="dispute-management-counter">
      <span className="font-semibold">Dispute management counter: {counter.total}</span>
      {' — '}
      {plural(counter.bookingDisputes, 'booking dispute', 'booking disputes')},{' '}
      {plural(counter.escalatedRefundRequests, 'escalated refund request', 'escalated refund requests')} and{' '}
      {plural(counter.escalatedWarrantyClaims, 'escalated warranty claim', 'escalated warranty claims')}
      {counter.resetAt
        ? ' that came in since the counter was last reset.'
        : ' waiting on an admin.'}
    </p>
  )
}

export function BookingDisputeCards({ analytics }: { analytics: DisputeAnalytics }) {
  return (
    <div className="space-y-2" data-testid="booking-dispute-cards">
      <p className="text-xs text-gray-500">
        Booking disputes. Escalated refund requests and escalated warranty claims are also handled here: they are listed below and count toward the Dispute Management counter.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600" data-testid="open-booking-disputes">{analytics.totalOpen}</div>
            <p className="text-sm text-gray-500">Open booking disputes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600" data-testid="resolved-booking-disputes">{analytics.totalResolved}</div>
            <p className="text-sm text-gray-500">Resolved (history)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-800" data-testid="bookings-in-dispute">{analytics.totalDisputes}</div>
            <p className="text-sm text-gray-500">Bookings in dispute</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function EscalationCounts({ escalations }: { escalations: DisputeEscalations }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm" data-testid="escalation-counts">
      <Button asChild size="sm" variant="outline">
        <Link href={escalations.warrantyClaimsHref || WARRANTY_QUEUE_HREF}>
          Escalated warranty claims: {escalations.escalatedWarrantyClaims}
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href={escalations.refundRequestsHref || REFUND_QUEUE_HREF}>
          Escalated refund requests: {escalations.escalatedRefundRequests}
        </Link>
      </Button>
    </div>
  )
}
