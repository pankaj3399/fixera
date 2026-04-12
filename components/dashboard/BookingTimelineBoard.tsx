'use client'

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { addMonths, differenceInCalendarDays, eachDayOfInterval, endOfDay, format, isAfter, isBefore, parseISO, startOfDay } from "date-fns"
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
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
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

const DAY_WIDTH = 44

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
  return parsed.toLocaleDateString()
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
  description = "Active bookings in a two-month window centered on today.",
  emptyLabel = "No active bookings intersect this timeline window.",
  onBookingUpdated,
}: BookingTimelineBoardProps) {
  const router = useRouter()
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
  const rangeStart = startOfDay(addMonths(today, -1))
  const rangeEnd = endOfDay(addMonths(today, 1))
  const days = useMemo(() => eachDayOfInterval({ start: rangeStart, end: rangeEnd }), [rangeEnd, rangeStart])
  const boardWidth = days.length * DAY_WIDTH

  const timelineBookings = useMemo(() => {
    return bookings
      .filter((booking) => ACTIVE_TIMELINE_STATUSES.has(booking.status))
      .map((booking) => {
        const bounds = getTimelineBounds(booking)
        return bounds ? { booking, bounds } : null
      })
      .filter((entry): entry is { booking: TimelineBooking; bounds: { start: Date; end: Date } } => !!entry)
      .filter(({ bounds }) => !isBefore(bounds.end, rangeStart) && !isAfter(bounds.start, rangeEnd))
      .sort((a, b) => a.bounds.start.getTime() - b.bounds.start.getTime())
  }, [bookings, rangeEnd, rangeStart])

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
          Window: {format(rangeStart, "MMM d, yyyy")} to {format(rangeEnd, "MMM d, yyyy")}
        </div>

        {timelineBookings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto pb-1">
              <div
                className="grid text-[11px] text-slate-500"
                style={{ width: `${boardWidth}px`, gridTemplateColumns: `repeat(${days.length}, minmax(${DAY_WIDTH}px, 1fr))` }}
              >
                {days.map((day) => (
                  <div key={day.toISOString()} className="border-r border-slate-200 px-1 pb-2 text-center">
                    <div className="font-medium text-slate-700">{format(day, "d")}</div>
                    <div>{format(day, "MMM")}</div>
                  </div>
                ))}
              </div>
            </div>

            {timelineBookings.map(({ booking, bounds }) => {
              const titleLabel = getBookingTitle(booking)
              const statusMeta = getBookingStatusMeta(booking.status)
              const barMeta = BAR_META[getTimelineBarKey(booking.status)]
              const clippedStart = isBefore(bounds.start, rangeStart) ? rangeStart : bounds.start
              const clippedEnd = isAfter(bounds.end, rangeEnd) ? rangeEnd : bounds.end
              const left = differenceInCalendarDays(clippedStart, rangeStart) * DAY_WIDTH
              const width = Math.max((differenceInCalendarDays(clippedEnd, clippedStart) + 1) * DAY_WIDTH, DAY_WIDTH)
              const schedule = getDisplaySchedule(booking)
              const proposedStart = booking.rescheduleRequest?.proposedSchedule?.scheduledStartDate
              const proposedEnd =
                booking.rescheduleRequest?.proposedSchedule?.scheduledBufferEndDate
                || booking.rescheduleRequest?.proposedSchedule?.scheduledExecutionEndDate

              return (
                <div key={booking._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-900">{titleLabel}</h3>
                        <Badge variant="outline" className={`text-[11px] ${statusMeta.className}`}>
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        {booking.rfqData?.serviceType && <span>{booking.rfqData.serviceType}</span>}
                        <span>Start: {formatDateLabel(schedule.scheduledStartDate || bounds.start)}</span>
                        <span>End: {formatDateLabel(schedule.scheduledBufferEndDate || schedule.scheduledExecutionEndDate || bounds.end)}</span>
                        {booking.status === "rescheduling_requested" && proposedStart && (
                          <span>Proposed: {formatDateLabel(proposedStart)} to {formatDateLabel(proposedEnd)}</span>
                        )}
                      </div>
                      {booking.status === "rescheduling_requested" && booking.rescheduleRequest?.reason && (
                        <p className="mt-2 text-xs text-slate-600">
                          Reason: <span className="font-medium text-slate-800">{booking.rescheduleRequest.reason}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => router.push(`/bookings/${booking._id}`)}
                      >
                        View
                      </Button>

                      {viewerRole === "professional" && booking.status === "booked" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                            onClick={() => openDialog("cancel", booking)}
                          >
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Cancel
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => openDialog("reschedule", booking)}
                          >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Request Rescheduling
                          </Button>
                          {(() => {
                            const next = getNextMilestone(booking)
                            if (next) {
                              return (
                                <Button
                                  size="sm"
                                  className="text-xs bg-blue-600 text-white hover:bg-blue-700"
                                  onClick={() => handleMilestoneAction(booking._id, next.index, next.action)}
                                  disabled={submittingBookingId === booking._id}
                                >
                                  {submittingBookingId === booking._id ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Play className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  {next.action === "start" ? "Start milestone" : "Complete milestone"}
                                </Button>
                              )
                            }
                            return (
                              <Button
                                size="sm"
                                className="text-xs bg-blue-600 text-white hover:bg-blue-700"
                                onClick={() => handleStartExecution(booking._id)}
                                disabled={submittingBookingId === booking._id}
                              >
                                {submittingBookingId === booking._id ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Start Execution
                              </Button>
                            )
                          })()}
                        </>
                      )}

                      {viewerRole === "professional" && booking.status === "in_progress" && (() => {
                        const next = getNextMilestone(booking)
                        if (!next) return null
                        return (
                          <Button
                            size="sm"
                            className="text-xs bg-blue-600 text-white hover:bg-blue-700"
                            onClick={() => handleMilestoneAction(booking._id, next.index, next.action)}
                            disabled={submittingBookingId === booking._id}
                          >
                            {submittingBookingId === booking._id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {next.action === "start" ? "Start milestone" : "Complete milestone"}
                          </Button>
                        )
                      })()}

                      {viewerRole === "customer" && booking.status === "rescheduling_requested" && (
                        <>
                          <Button
                            size="sm"
                            className="text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => handleRespondReschedule(booking._id, "accept")}
                            disabled={submittingBookingId === booking._id}
                          >
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                            onClick={() => handleRespondReschedule(booking._id, "decline")}
                            disabled={submittingBookingId === booking._id}
                          >
                            Decline
                          </Button>
                        </>
                      )}

                      {viewerRole === "professional" && booking.status === "in_progress" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => openDialog("extend", booking)}
                          >
                            Extend Execution
                          </Button>
                          {getNextMilestone(booking) === null && (
                          <Button
                            size="sm"
                            className="text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => handleConfirmCompletion(booking._id)}
                            disabled={submittingBookingId === booking._id}
                          >
                            {submittingBookingId === booking._id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Confirm Completion
                          </Button>
                          )}
                        </>
                      )}

                      {viewerRole === "customer" && (booking.status === "payment_pending" || booking.status === "quote_accepted") && (
                        <Button
                          size="sm"
                          className="text-xs bg-amber-600 text-white hover:bg-amber-700"
                          onClick={() => router.push(`/bookings/${booking._id}/payment`)}
                        >
                          <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                          Pay
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto pb-1">
                    <div
                      className="relative h-12 rounded-lg border border-slate-200 bg-slate-50"
                      style={{ width: `${boardWidth}px` }}
                    >
                      <div
                        className="grid h-full"
                        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(${DAY_WIDTH}px, 1fr))` }}
                      >
                        {days.map((day) => (
                          <div
                            key={`${booking._id}-${day.toISOString()}`}
                            className={`border-r border-slate-200 ${day.getDay() === 0 || day.getDay() === 6 ? "bg-slate-100/80" : ""}`}
                          />
                        ))}
                      </div>
                      <div
                        className={`absolute top-1/2 h-7 -translate-y-1/2 rounded-md px-2 text-[11px] font-medium leading-7 shadow-sm ${barMeta.className}`}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        title={`${barMeta.label}: ${formatDateLabel(bounds.start)} to ${formatDateLabel(bounds.end)}`}
                      >
                        <span className="truncate">{barMeta.label}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
