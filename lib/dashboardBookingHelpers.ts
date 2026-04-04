export const BOOKING_STATUSES = [
  "rfq",
  "rfq_accepted",
  "draft_quote",
  "quoted",
  "quote_accepted",
  "quote_rejected",
  "payment_pending",
  "booked",
  "in_progress",
  "professional_completed",
  "completed",
  "cancelled",
  "dispute",
  "refunded",
] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]

const bookingStatusSet: ReadonlySet<string> = new Set<string>(BOOKING_STATUSES)

export function isBookingStatus(value: string): value is BookingStatus {
  return bookingStatusSet.has(value)
}

export function parseBookingStatus(value: string | undefined | null): BookingStatus | null {
  if (value != null && isBookingStatus(value)) return value
  return null
}

export const BOOKING_STATUS_STYLES: Record<string, string> = {
  rfq: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  rfq_accepted: "bg-violet-50 text-violet-700 border border-violet-100",
  draft_quote: "bg-slate-50 text-slate-700 border border-slate-100",
  quoted: "bg-blue-50 text-blue-700 border border-blue-100",
  quote_accepted: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  quote_rejected: "bg-rose-50 text-rose-700 border border-rose-100",
  payment_pending: "bg-amber-50 text-amber-700 border border-amber-100",
  booked: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  in_progress: "bg-sky-50 text-sky-700 border border-sky-100",
  professional_completed: "bg-amber-50 text-amber-700 border border-amber-100",
  completed: "bg-teal-50 text-teal-700 border border-teal-100",
  cancelled: "bg-rose-50 text-rose-700 border border-rose-100",
  refunded: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100",
  dispute: "bg-red-50 text-red-700 border border-red-100",
  unknown: "bg-slate-50 text-slate-700 border border-slate-100",
}

export const QUOTE_STATUSES = new Set<BookingStatus>(["rfq", "rfq_accepted", "draft_quote", "quoted", "quote_accepted", "quote_rejected"])
export const QUOTE_FINISHED_STATUSES = new Set<BookingStatus>(["quote_accepted", "quote_rejected"])
export const BOOKING_FINISHED_STATUSES = new Set<BookingStatus>(["completed", "cancelled", "refunded"])

// Professional dashboard: booking-phase (non-quote) statuses
export const PROFESSIONAL_BOOKING_MODE_STATUSES = new Set<BookingStatus>([
  "booked", "in_progress", "professional_completed", "payment_pending", "completed", "cancelled", "dispute", "refunded",
])

// Customer dashboard: quote-phase statuses
export const CUSTOMER_QUOTE_STATUSES = new Set<BookingStatus>(["rfq", "rfq_accepted", "quoted", "quote_rejected"])
// Customer dashboard: booking-phase statuses
export const CUSTOMER_BOOKING_STATUSES = new Set<BookingStatus>([
  "quote_accepted", "payment_pending", "booked", "in_progress",
  "professional_completed",
  "completed", "cancelled", "dispute", "refunded",
])

// Status filter options for customer quotes tab
export const CUSTOMER_QUOTE_STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "rfq", label: "RFQ" },
  { id: "rfq_accepted", label: "RFQ Accepted" },
  { id: "quoted", label: "Quoted" },
  { id: "quote_rejected", label: "Rejected" },
]

// Status filter options for customer bookings tab
export const CUSTOMER_BOOKING_STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "booked", label: "Booked" },
  { id: "in_progress", label: "In Progress" },
  { id: "professional_completed", label: "Awaiting Your Confirmation" },
  { id: "payment_pending", label: "Awaiting Payment" },
  { id: "completed", label: "Completed" },
  { id: "dispute", label: "Dispute" },
  { id: "cancelled", label: "Cancelled" },
  { id: "refunded", label: "Refunded" },
]

export const getBookingStatusMeta = (status?: BookingStatus | string) => {
  const rawStatus = status || "unknown"
  return {
    rawStatus,
    label: rawStatus.replace(/_/g, " "),
    className:
      BOOKING_STATUS_STYLES[rawStatus] ||
      BOOKING_STATUS_STYLES.unknown,
  }
}

export interface BookingBase {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  rfqData?: {
    serviceType?: string
  }
  project?: {
    _id: string
    title?: string
  }
  professional?: {
    _id: string
    businessInfo?: {
      companyName?: string
    }
  }
}

export const getBookingTitle = (booking: BookingBase) => {
  const isProject = booking.bookingType === "project"
  return (
    (isProject ? booking.project?.title : booking.professional?.businessInfo?.companyName) ||
    booking.rfqData?.serviceType ||
    "Booking"
  )
}
