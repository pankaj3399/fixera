'use client'

import { useMemo, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { differenceInCalendarDays, eachDayOfInterval, format, isAfter, isBefore, parseISO, startOfDay, isSameDay } from "date-fns"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getAuthToken } from "@/lib/utils"
import { getBookingStatusMeta, getBookingTitle, type BookingStatus } from "@/lib/dashboardBookingHelpers"
import { Calendar, CheckCheck, CreditCard, Loader2, Play, RefreshCw, XCircle } from "lucide-react"

type ViewerRole = "customer" | "professional"

type ScheduleSnapshot = {
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  scheduledBufferStartDate?: string
  scheduledBufferEndDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
}

export interface TimelineBooking {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  createdAt?: string
  bookingNumber?: string
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
    totalAmount?: number
    budget?: { min?: number; max?: number; currency?: string }
  }
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  scheduledBufferStartDate?: string
  scheduledBufferEndDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  payment?: {
    status?: string
    currency?: string
    amount?: number
  }
  location?: {
    address?: string
    city?: string
    country?: string
  }
  customer?: {
    _id?: string
    name?: string
  }
  professional?: {
    _id: string
    name?: string
    businessInfo?: {
      companyName?: string
    }
  }
  project?: {
    _id: string
    title?: string
    category?: string
    service?: string
  }
  milestonePayments?: Array<{
    title?: string
    status?: string
    workStatus?: string
    amount?: number
  }>
  rescheduleRequest?: {
    status?: "pending" | "accepted" | "declined"
    reason?: string
    note?: string
    proposedSchedule?: ScheduleSnapshot
    previousSchedule?: ScheduleSnapshot
  }
  pricingSnapshot?: {
    totalAmount?: number
  }
}

interface BookingTimelineBoardProps {
  bookings: TimelineBooking[]
  viewerRole: ViewerRole
  title?: string
  description?: string
  emptyLabel?: string
  onBookingUpdated?: () => void | Promise<void>
}

const ACTIVE_TIMELINE_STATUSES = new Set<BookingStatus>([
  "quote_accepted",
  "payment_pending",
  "booked",
  "rescheduling_requested",
  "in_progress",
  "professional_completed",
  "dispute",
])

const VISIBLE_DAYS = 30
const MAX_SPAN_DAYS = 365
const DAY_WIDTH = 40
const ROW_LABEL_WIDTH = 200

const BAR_META: Record<string, { label: string; className: string }> = {
  awaiting_payment: {
    label: "Awaiting Payment",
    className: "bg-amber-500/90 border border-amber-600/80 text-white",
  },
  booked: {
    label: "Booked",
    className: "bg-red-500/90 border border-red-600/80 text-white",
  },
  rescheduling_requested: {
    label: "Rescheduling Request",
    className: "bg-sky-500/90 border border-sky-600/80 text-white",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-emerald-500/90 border border-emerald-600/80 text-white",
  },
  dispute: {
    label: "Dispute",
    className: "bg-rose-600/90 border border-rose-700/80 text-white",
  },
}

const getTimelineBarKey = (status: BookingStatus) => {
  if (status === "quote_accepted" || status === "payment_pending") return "awaiting_payment"
  if (status === "professional_completed") return "in_progress"
  if (status === "booked") return "booked"
  if (status === "rescheduling_requested") return "rescheduling_requested"
  if (status === "in_progress") return "in_progress"
  if (status === "dispute") return "dispute"
  return "booked"
}

const toDate = (value?: string) => {
  if (!value) return null
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatDateLabel = (value?: string | Date | null) => {
  if (!value) return "Unscheduled"
  const parsed = value instanceof Date ? value : toDate(value)
  if (!parsed) return "Unscheduled"
  return format(parsed, "dd MMM yyyy")
}

const getDisplaySchedule = (booking: TimelineBooking) => {
  const persistedSchedule = {
    scheduledStartDate: booking.scheduledStartDate,
    scheduledExecutionEndDate: booking.scheduledExecutionEndDate,
    scheduledBufferStartDate: booking.scheduledBufferStartDate,
    scheduledBufferEndDate: booking.scheduledBufferEndDate,
    scheduledStartTime: booking.scheduledStartTime,
    scheduledEndTime: booking.scheduledEndTime,
  }

  if (booking.status !== "rescheduling_requested" || !booking.rescheduleRequest?.proposedSchedule) {
    return persistedSchedule
  }

  return {
    scheduledStartDate: booking.rescheduleRequest.proposedSchedule.scheduledStartDate ?? persistedSchedule.scheduledStartDate,
    scheduledExecutionEndDate: booking.rescheduleRequest.proposedSchedule.scheduledExecutionEndDate ?? persistedSchedule.scheduledExecutionEndDate,
    scheduledBufferStartDate: booking.rescheduleRequest.proposedSchedule.scheduledBufferStartDate ?? persistedSchedule.scheduledBufferStartDate,
    scheduledBufferEndDate: booking.rescheduleRequest.proposedSchedule.scheduledBufferEndDate ?? persistedSchedule.scheduledBufferEndDate,
    scheduledStartTime: booking.rescheduleRequest.proposedSchedule.scheduledStartTime ?? persistedSchedule.scheduledStartTime,
    scheduledEndTime: booking.rescheduleRequest.proposedSchedule.scheduledEndTime ?? persistedSchedule.scheduledEndTime,
  }
}

const getTimelineBounds = (booking: TimelineBooking) => {
  const schedule = getDisplaySchedule(booking)
  const start = toDate(schedule.scheduledStartDate || booking.rfqData?.preferredStartDate || booking.createdAt)
  if (!start) return null

  const end =
    toDate(schedule.scheduledBufferEndDate)
    || toDate(schedule.scheduledExecutionEndDate)
    || start

  return {
    start,
    end: isAfter(end, start) ? end : start,
  }
}

const getBookingPrice = (booking: TimelineBooking): string | null => {
  const amount =
    booking.pricingSnapshot?.totalAmount
    ?? booking.rfqData?.totalAmount
    ?? booking.payment?.amount
  if (amount == null) return null
  const currency = booking.rfqData?.budget?.currency || booking.payment?.currency || "EUR"
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "USD" ? "$" : currency
  return `${symbol}${amount.toFixed(2)}`
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }
  return null
}

export default function BookingTimelineBoard({
  bookings,
  viewerRole,
  title = "Project Timeline",
  description = "Active bookings timeline.",
  emptyLabel = "No active bookings to display.",
  onBookingUpdated,
}: BookingTimelineBoardProps) {
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeBooking, setActiveBooking] = useState<TimelineBooking | null>(null)
  const [dialogMode, setDialogMode] = useState<"cancel" | "reschedule" | "extend" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittingBookingId, setSubmittingBookingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [rescheduleDate, setRescheduleDate] = useState("")
  const [rescheduleTime, setRescheduleTime] = useState("")
  const [rescheduleReason, setRescheduleReason] = useState("")
  const [extendDate, setExtendDate] = useState("")
  const [extendReason, setExtendReason] = useState("")

  const today = startOfDay(new Date())

  const timelineBookings = useMemo(() => {
    return bookings
      .filter((booking) => ACTIVE_TIMELINE_STATUSES.has(booking.status))
      .map((booking) => {
        const bounds = getTimelineBounds(booking)
        return bounds ? { booking, bounds } : null
      })
      .filter((entry): entry is { booking: TimelineBooking; bounds: { start: Date; end: Date } } => !!entry)
      .sort((a, b) => a.bounds.start.getTime() - b.bounds.start.getTime())
  }, [bookings])

  const { rangeStart, rangeEnd, days } = useMemo(() => {
    if (timelineBookings.length === 0) {
      const s = today
      const daysArr = eachDayOfInterval({ start: s, end: new Date(s.getTime() + (VISIBLE_DAYS - 1) * 86400000) })
      return { rangeStart: s, rangeEnd: daysArr[daysArr.length - 1], days: daysArr }
    }

    let earliest = timelineBookings[0].bounds.start
    let furthest = timelineBookings[0].bounds.end
    for (const { bounds } of timelineBookings) {
      if (isBefore(bounds.start, earliest)) earliest = bounds.start
      if (isAfter(bounds.end, furthest)) furthest = bounds.end
    }

    const totalDays = differenceInCalendarDays(furthest, earliest) + 1
    const span = Math.min(Math.max(totalDays, VISIBLE_DAYS), MAX_SPAN_DAYS)
    const s = startOfDay(earliest)
    const e = new Date(s.getTime() + (span - 1) * 86400000)
    const daysArr = eachDayOfInterval({ start: s, end: e })
    return { rangeStart: s, rangeEnd: e, days: daysArr }
  }, [timelineBookings, today])

  const gridWidth = days.length * DAY_WIDTH

  const todayOffset = useMemo(() => {
    const diff = differenceInCalendarDays(today, rangeStart)
    if (diff < 0 || diff >= days.length) return null
    return diff * DAY_WIDTH + DAY_WIDTH / 2
  }, [today, rangeStart, days.length])

  const openDialog = (mode: "cancel" | "reschedule" | "extend", booking: TimelineBooking) => {
    setActiveBooking(booking)
    setDialogMode(mode)
    setCancelReason("")
    setRescheduleDate(booking.rescheduleRequest?.proposedSchedule?.scheduledStartDate?.slice(0, 10) || booking.scheduledStartDate?.slice(0, 10) || "")
    setRescheduleTime(booking.rescheduleRequest?.proposedSchedule?.scheduledStartTime || booking.scheduledStartTime || "")
    setRescheduleReason(booking.rescheduleRequest?.reason || "")
    setExtendDate(booking.scheduledExecutionEndDate?.slice(0, 10) || "")
    setExtendReason("")
  }

  const closeDialog = () => {
    if (isSubmitting) return
    setDialogMode(null)
    setActiveBooking(null)
  }

  const withAuthHeaders = (json = true) => {
    const token = getAuthToken()
    const headers: Record<string, string> = {}
    if (json) headers["Content-Type"] = "application/json"
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  const runMutation = async (bookingId: string, action: () => Promise<Response>, successMessage: string) => {
    setSubmittingBookingId(bookingId)
    try {
      const response = await action()
      const payload = await parseResponse(response)
      if (!response.ok || !payload?.success) {
        toast.error(payload?.error?.message || payload?.msg || "Request failed")
        return
      }

      toast.success(successMessage)
      await onBookingUpdated?.()
      closeDialog()
    } catch (error) {
      console.error("Booking timeline action failed:", error)
      toast.error("Request failed. Please try again.")
    } finally {
      setSubmittingBookingId((current) => (current === bookingId ? null : current))
    }
  }

  const submitCancel = async () => {
    if (!activeBooking || !cancelReason.trim()) {
      toast.error("Cancellation reason is required")
      return
    }
    setIsSubmitting(true)
    await runMutation(
      activeBooking._id,
      () =>
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${activeBooking._id}/cancel`, {
          method: "POST",
          credentials: "include",
          headers: withAuthHeaders(),
          body: JSON.stringify({ reason: cancelReason.trim() }),
        }),
      "Booking cancelled."
    )
    setIsSubmitting(false)
  }

  const submitReschedule = async () => {
    if (!activeBooking || !rescheduleDate || !rescheduleReason.trim()) {
      toast.error("New date and rescheduling reason are required")
      return
    }

    setIsSubmitting(true)
    await runMutation(
      activeBooking._id,
      () =>
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${activeBooking._id}/reschedule-request`, {
          method: "POST",
          credentials: "include",
          headers: withAuthHeaders(),
          body: JSON.stringify({
            scheduledStartDate: rescheduleDate,
            scheduledStartTime: rescheduleTime || undefined,
            reason: rescheduleReason.trim(),
          }),
        }),
      "Rescheduling request sent."
    )
    setIsSubmitting(false)
  }

  const submitExtendExecution = async () => {
    if (!activeBooking || !extendDate) {
      toast.error("New execution end date is required")
      return
    }

    setIsSubmitting(true)
    await runMutation(
      activeBooking._id,
      () =>
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${activeBooking._id}/extend-execution`, {
          method: "POST",
          credentials: "include",
          headers: withAuthHeaders(),
          body: JSON.stringify({
            newExecutionEndDate: extendDate,
            note: extendReason.trim() || undefined,
          }),
        }),
      "Execution extended."
    )
    setIsSubmitting(false)
  }

  const handleStartExecution = async (bookingId: string) => {
    await runMutation(
      bookingId,
      () =>
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/status`, {
          method: "PUT",
          credentials: "include",
          headers: withAuthHeaders(),
          body: JSON.stringify({ status: "in_progress" }),
        }),
      "Execution started."
    )
  }

  const handleMilestoneAction = async (
    bookingId: string,
    index: number,
    action: "start" | "complete"
  ) => {
    await runMutation(
      bookingId,
      () =>
        fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/milestones/${index}/work-status`,
          {
            method: "PATCH",
            credentials: "include",
            headers: withAuthHeaders(),
            body: JSON.stringify({ action }),
          }
        ),
      action === "start" ? "Milestone started." : "Milestone completed."
    )
  }

  const getNextMilestone = (booking: TimelineBooking) => {
    const milestones = booking.milestonePayments
    if (!milestones || milestones.length === 0) return null
    for (let i = 0; i < milestones.length; i++) {
      const ws = milestones[i].workStatus || "pending"
      if (ws === "in_progress") return { index: i, action: "complete" as const, title: milestones[i].title }
      if (ws === "pending") return { index: i, action: "start" as const, title: milestones[i].title }
    }
    return null
  }

  const handleConfirmCompletion = async (bookingId: string) => {
    const formData = new FormData()
    await runMutation(
      bookingId,
      () =>
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/professional-complete`, {
          method: "POST",
          credentials: "include",
          headers: withAuthHeaders(false),
          body: formData,
        }),
      "Completion confirmed. Awaiting customer confirmation."
    )
  }

  const handleRespondReschedule = async (bookingId: string, action: "accept" | "decline") => {
    const confirmed = window.confirm(
      action === "accept"
        ? "Accept the proposed reschedule?"
        : "Declining will cancel this booking. Continue?"
    )
    if (!confirmed) return

    await runMutation(
      bookingId,
      () =>
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/respond-reschedule`, {
          method: "POST",
          credentials: "include",
          headers: withAuthHeaders(),
          body: JSON.stringify({ action }),
        }),
      action === "accept" ? "Reschedule accepted." : "Reschedule declined."
    )
  }

  const handleBarDoubleClick = useCallback((bookingId: string) => {
    router.push(`/bookings/${bookingId}`)
  }, [router])

  const buildTooltip = (booking: TimelineBooking, bounds: { start: Date; end: Date }) => {
    const parts: string[] = []
    if (booking.bookingNumber) parts.push(`Booking: ${booking.bookingNumber}`)
    const addr = booking.location?.address
    if (addr) parts.push(`Address: ${addr}`)
    const price = getBookingPrice(booking)
    if (price) parts.push(`Price: ${price}`)
    parts.push(`Start: ${formatDateLabel(bounds.start)}`)
    parts.push(`End: ${formatDateLabel(bounds.end)}`)
    return parts.join("\n")
  }

  const renderActionButtons = (booking: TimelineBooking) => {
    const btns: React.ReactNode[] = []
    const busy = submittingBookingId === booking._id

    if (viewerRole === "professional" && booking.status === "booked") {
      btns.push(
        <Button key="cancel" variant="outline" size="sm" className="h-6 text-[10px] px-1.5 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => openDialog("cancel", booking)}>
          <XCircle className="mr-1 h-3 w-3" />Cancel
        </Button>,
        <Button key="reschedule" variant="outline" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => openDialog("reschedule", booking)}>
          <RefreshCw className="mr-1 h-3 w-3" />Reschedule
        </Button>
      )
      const hasMilestones = booking.milestonePayments && booking.milestonePayments.length > 0
      const next = getNextMilestone(booking)
      if (next) {
        btns.push(
          <Button key="milestone" size="sm" className="h-6 text-[10px] px-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => handleMilestoneAction(booking._id, next.index, next.action)} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
            {next.action === "start" ? "Start milestone" : "Complete milestone"}
          </Button>
        )
      } else if (!hasMilestones) {
        btns.push(
          <Button key="start" size="sm" className="h-6 text-[10px] px-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => handleStartExecution(booking._id)} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
            Start Execution
          </Button>
        )
      }
    }

    if (viewerRole === "professional" && booking.status === "in_progress") {
      const hasMilestones = booking.milestonePayments && booking.milestonePayments.length > 0
      const next = getNextMilestone(booking)
      if (next) {
        btns.push(
          <Button key="milestone-ip" size="sm" className="h-6 text-[10px] px-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => handleMilestoneAction(booking._id, next.index, next.action)} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
            {next.action === "start" ? "Start milestone" : "Complete milestone"}
          </Button>
        )
      }
      btns.push(
        <Button key="extend" variant="outline" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => openDialog("extend", booking)}>
          Extend
        </Button>
      )
      if (!next && !hasMilestones) {
        btns.push(
          <Button key="complete" size="sm" className="h-6 text-[10px] px-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => handleConfirmCompletion(booking._id)} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCheck className="mr-1 h-3 w-3" />}
            Complete
          </Button>
        )
      }
    }

    if (viewerRole === "customer" && booking.status === "rescheduling_requested") {
      btns.push(
        <Button key="accept" size="sm" className="h-6 text-[10px] px-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => handleRespondReschedule(booking._id, "accept")} disabled={busy}>
          Accept
        </Button>,
        <Button key="decline" variant="outline" size="sm" className="h-6 text-[10px] px-1.5 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => handleRespondReschedule(booking._id, "decline")} disabled={busy}>
          Decline
        </Button>
      )
    }

    if (viewerRole === "customer" && (booking.status === "payment_pending" || booking.status === "quote_accepted")) {
      btns.push(
        <Button key="pay" size="sm" className="h-6 text-[10px] px-1.5 bg-amber-600 text-white hover:bg-amber-700" onClick={() => router.push(`/bookings/${booking._id}/payment`)}>
          <CreditCard className="mr-1 h-3 w-3" />Pay
        </Button>
      )
    }

    return btns
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {Object.entries(BAR_META).map(([key, meta]) => (
            <span key={key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1">
              <span className={`h-2.5 w-2.5 rounded-full ${meta.className.split(" ")[0]}`} />
              {meta.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-600">
          <Calendar className="h-3.5 w-3.5" />
          Window: {format(rangeStart, "MMM d, yyyy")} &ndash; {format(rangeEnd, "MMM d, yyyy")}
        </div>

        {timelineBookings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {emptyLabel}
          </div>
        ) : (
          <div className="flex">
            {/* Fixed left column: booking labels + actions */}
            <div className="flex-shrink-0" style={{ width: `${ROW_LABEL_WIDTH}px` }}>
              {/* Header spacer */}
              <div className="h-[42px] border-b border-slate-200" />
              {/* Rows */}
              {timelineBookings.map(({ booking }) => {
                const projectName = booking.project?.title || booking.rfqData?.serviceType || "Booking"
                const counterpartyName = viewerRole === "professional"
                  ? booking.customer?.name
                  : booking.professional?.businessInfo?.companyName || booking.professional?.name
                const actions = renderActionButtons(booking)

                return (
                  <div key={booking._id} className="flex flex-col justify-center border-b border-slate-200 px-2 py-1.5" style={{ minHeight: "48px" }}>
                    <p className="text-xs font-semibold text-slate-900 truncate leading-tight">{projectName}</p>
                    {counterpartyName && (
                      <p className="text-[10px] text-slate-500 truncate leading-tight">{counterpartyName}</p>
                    )}
                    {actions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {actions}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Scrollable right area: timeline grid */}
            <div className="flex-1 overflow-x-auto" ref={scrollRef}>
              <div style={{ width: `${gridWidth}px`, position: "relative" }}>
                {/* Header row */}
                <div
                  className="flex border-b border-slate-200"
                  style={{ height: "42px" }}
                >
                  {days.map((day) => (
                    <div
                      key={day.toISOString()}
                      className={`flex-shrink-0 border-r border-slate-200 text-center text-[10px] flex flex-col justify-center ${isSameDay(day, today) ? "bg-blue-50 font-bold" : ""}`}
                      style={{ width: `${DAY_WIDTH}px` }}
                    >
                      <div className="font-medium text-slate-700 leading-tight">{format(day, "d")}</div>
                      <div className="text-slate-500 leading-tight">{format(day, "MMM")}</div>
                    </div>
                  ))}
                </div>

                {/* Booking rows */}
                {timelineBookings.map(({ booking, bounds }) => {
                  const barMeta = BAR_META[getTimelineBarKey(booking.status)]
                  const clippedStart = isBefore(bounds.start, rangeStart) ? rangeStart : bounds.start
                  const clippedEnd = isAfter(bounds.end, rangeEnd) ? rangeEnd : bounds.end
                  const left = differenceInCalendarDays(clippedStart, rangeStart) * DAY_WIDTH
                  const width = Math.max((differenceInCalendarDays(clippedEnd, clippedStart) + 1) * DAY_WIDTH, DAY_WIDTH)

                  const projectName = booking.project?.title || booking.rfqData?.serviceType || "Booking"
                  const counterpartyName = viewerRole === "professional"
                    ? booking.customer?.name
                    : booking.professional?.businessInfo?.companyName || booking.professional?.name
                  const barLabel = [projectName, counterpartyName].filter(Boolean).join(" — ")
                  const actions = renderActionButtons(booking)
                  const rowHeight = actions.length > 0 ? 48 + 24 : 48

                  return (
                    <div key={booking._id} className="relative border-b border-slate-200" style={{ height: `${rowHeight}px` }}>
                      {/* Day grid background */}
                      <div className="absolute inset-0 flex">
                        {days.map((day) => (
                          <div
                            key={`bg-${booking._id}-${day.toISOString()}`}
                            className={`flex-shrink-0 border-r border-slate-100 ${day.getDay() === 0 || day.getDay() === 6 ? "bg-slate-100/60" : ""}`}
                            style={{ width: `${DAY_WIDTH}px`, height: "100%" }}
                          />
                        ))}
                      </div>
                      {/* Bar */}
                      <div
                        className={`absolute top-2 h-7 rounded-md px-2 text-[10px] font-medium leading-7 shadow-sm cursor-pointer select-none ${barMeta.className}`}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        title={buildTooltip(booking, bounds)}
                        onDoubleClick={() => handleBarDoubleClick(booking._id)}
                      >
                        <span className="truncate block">{barLabel}</span>
                      </div>
                    </div>
                  )
                })}

                {/* Today vertical line */}
                {todayOffset !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
                    style={{ left: `${todayOffset}px` }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <Dialog open={dialogMode === "cancel"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>Add a short reason for the cancellation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="timeline-cancel-reason">Reason</Label>
              <Textarea
                id="timeline-cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                className="min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>Back</Button>
              <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={submitCancel} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Cancel Booking
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === "reschedule"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Rescheduling</DialogTitle>
            <DialogDescription>Propose a new start date for the customer to approve.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="timeline-reschedule-date">New start date</Label>
                <Input id="timeline-reschedule-date" type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeline-reschedule-time">Start time</Label>
                <Input id="timeline-reschedule-time" type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeline-reschedule-reason">Reason</Label>
              <Textarea
                id="timeline-reschedule-reason"
                value={rescheduleReason}
                onChange={(event) => setRescheduleReason(event.target.value)}
                className="min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>Back</Button>
              <Button onClick={submitReschedule} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === "extend"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Execution</DialogTitle>
            <DialogDescription>Move the execution end date forward.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="timeline-extend-date">New execution end date</Label>
              <Input id="timeline-extend-date" type="date" value={extendDate} onChange={(event) => setExtendDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeline-extend-reason">Reason</Label>
              <Textarea
                id="timeline-extend-reason"
                value={extendReason}
                onChange={(event) => setExtendReason(event.target.value)}
                className="min-h-[90px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>Back</Button>
              <Button onClick={submitExtendExecution} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Extend
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
