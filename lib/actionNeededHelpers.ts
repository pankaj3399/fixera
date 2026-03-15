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
  createdAt?: string
}

export interface ActionItem {
  booking: ActionNeededBooking
  label: string
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

export function getProfessionalActionItems(bookings: ActionNeededBooking[]): ActionItem[] {
  const items: ActionItem[] = []

  for (const booking of bookings) {
    // RFQ not quoted for 4+ working days
    if (booking.status === "rfq" && booking.createdAt && workingDaysSince(booking.createdAt) >= 4) {
      items.push({ booking, label: "Quote or reject", severity: "urgent" })
    }

    // Start date passed, still in booked status
    if (booking.status === "booked" && isPastDate(booking.scheduledStartDate)) {
      items.push({ booking, label: "Confirm start or reschedule", severity: "warning" })
    }

    // Completion date passed, still in progress
    if (booking.status === "in_progress" && isPastDate(booking.scheduledExecutionEndDate)) {
      items.push({ booking, label: "Confirm completion or extend", severity: "warning" })
    }

    // Dispute needs response
    if (booking.status === "dispute") {
      items.push({ booking, label: "Accept, negotiate or reject", severity: "urgent" })
    }
  }

  return items
}

export function getCustomerActionItems(bookings: ActionNeededBooking[]): ActionItem[] {
  const items: ActionItem[] = []

  for (const booking of bookings) {
    // Quote awaiting decision
    if (booking.status === "quoted") {
      items.push({ booking, label: "Accept or reject quote", severity: "warning" })
    }

    // Payment needed
    if (booking.status === "payment_pending" || booking.status === "quote_accepted") {
      items.push({ booking, label: "Payment needed", severity: "urgent" })
    }

    // Dispute needs customer response
    if (booking.status === "dispute") {
      items.push({ booking, label: "Review dispute", severity: "urgent" })
    }
  }

  return items
}
