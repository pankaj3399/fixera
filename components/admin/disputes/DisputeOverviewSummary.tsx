import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const WARRANTY_QUEUE_HREF = "/admin/warranty-claims"
export const REFUND_QUEUE_HREF = "/admin/cancellation-requests?status=escalated"

export interface SeparateDisputeQueues {
  activeWarrantyClaims: number
  escalatedRefundRequests: number
  warrantyClaimsHref?: string
  refundRequestsHref?: string
}

// Booking-dispute totals, with the same filters as the Open / Resolved / All
// views. Warranty claims and refund requests are reported in `separateQueues`
// and are never added into these totals.
export interface DisputeAnalytics {
  totalOpen: number
  totalResolved: number
  totalDisputes: number
  separateQueues?: SeparateDisputeQueues
}

export function BookingDisputeCards({ analytics }: { analytics: DisputeAnalytics }) {
  return (
    <div className="space-y-2" data-testid="booking-dispute-cards">
      <p className="text-xs text-gray-500">
        Booking disputes only. Warranty claims and refund requests are separate queues and are counted below.
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

export function SeparateQueueCounts({ queues }: { queues: SeparateDisputeQueues }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm" data-testid="separate-queue-counts">
      <Button asChild size="sm" variant="outline">
        <Link href={queues.warrantyClaimsHref || WARRANTY_QUEUE_HREF}>
          Active warranty claims: {queues.activeWarrantyClaims}
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href={queues.refundRequestsHref || REFUND_QUEUE_HREF}>
          Escalated refund requests: {queues.escalatedRefundRequests}
        </Link>
      </Button>
    </div>
  )
}
