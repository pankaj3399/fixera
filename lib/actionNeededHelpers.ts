import type { BookingStatus } from "./dashboardBookingHelpers"

export interface ActionNeededBooking {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  customer?: { _id: string; name?: string }
  professional?: { _id: string; name?: string; businessInfo?: { companyName?: string } }
  rfqData?: { serviceType?: string; description?: string; preferredStartDate?: string }
  project?: { _id: string; title?: string }
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  scheduledEndDate?: string
  createdAt?: string
}

export const PROFESSIONAL_ACTION_ITEM_KEYS = [
  "acceptOrDeclineRfq",
  "confirmStart",
  "rescheduleDecision",
  "confirmCompletion",
  "disputeResponse",
] as const

export const CUSTOMER_ACTION_ITEM_KEYS = [
  "acceptOrDeclineQuotation",
  "paymentNeeded",
  "acceptOrDeclineRescheduling",
  "reviewCompletion",
  "reviewDispute",
] as const

export type ProfessionalActionItemKey = (typeof PROFESSIONAL_ACTION_ITEM_KEYS)[number]
export type CustomerActionItemKey = (typeof CUSTOMER_ACTION_ITEM_KEYS)[number]

export interface ActionItem<Key extends string = ProfessionalActionItemKey | CustomerActionItemKey> {
  booking: ActionNeededBooking
  /** Translation key suffix; consumers map it to their namespace at render time. */
  labelKey: Key
  severity: "warning" | "urgent"
}

/**
 * Count working days (Mon-Fri) between a date and now.
 */
function workingDaysSince(dateStr: string): number {
  const start = new Date(dateStr)
  const now = new Date()
  let count = 0
  const current = new Date(start)
  current.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  while (current < today) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

function isPastDate(dateStr: string | undefined): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

export function getProfessionalActionItems(bookings: ActionNeededBooking[]): ActionItem<ProfessionalActionItemKey>[] {
  const items: ActionItem<ProfessionalActionItemKey>[] = []

  for (const booking of bookings) {
    // RFQ awaiting professional decision
    if (booking.status === "rfq") {
      const isOverdue = booking.createdAt && workingDaysSince(booking.createdAt) >= 4
      items.push({
        booking,
        labelKey: "acceptOrDeclineRfq",
        severity: isOverdue ? "urgent" : "warning",
      })
    }

    // Start date passed, still in booked status
    if (booking.status === "booked" && isPastDate(booking.scheduledStartDate)) {
      items.push({ booking, labelKey: "confirmStart", severity: "warning" })
    }

    if (booking.status === "rescheduling_requested") {
      items.push({ booking, labelKey: "rescheduleDecision", severity: "warning" })
    }

    // Completion date passed, still in progress
    const endDate = booking.scheduledExecutionEndDate ?? booking.scheduledEndDate
    if (booking.status === "in_progress" && isPastDate(endDate)) {
      items.push({ booking, labelKey: "confirmCompletion", severity: "warning" })
    }

    // Dispute needs response
    if (booking.status === "dispute") {
      items.push({ booking, labelKey: "disputeResponse", severity: "urgent" })
    }
  }

  return items
}

export function getCustomerActionItems(bookings: ActionNeededBooking[]): ActionItem<CustomerActionItemKey>[] {
  const items: ActionItem<CustomerActionItemKey>[] = []

  for (const booking of bookings) {
    // Quote awaiting decision
    if (booking.status === "quoted") {
      items.push({ booking, labelKey: "acceptOrDeclineQuotation", severity: "warning" })
    }

    // Payment needed
    if (booking.status === "payment_pending" || booking.status === "quote_accepted") {
      items.push({ booking, labelKey: "paymentNeeded", severity: "urgent" })
    }

    if (booking.status === "rescheduling_requested") {
      items.push({ booking, labelKey: "acceptOrDeclineRescheduling", severity: "urgent" })
    }

    if (booking.status === "professional_completed") {
      items.push({ booking, labelKey: "reviewCompletion", severity: "urgent" })
    }

    // Dispute needs customer response
    if (booking.status === "dispute") {
      items.push({ booking, labelKey: "reviewDispute", severity: "urgent" })
    }
  }

  return items
}
