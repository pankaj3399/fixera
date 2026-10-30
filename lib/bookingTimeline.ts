/**
 * Project timeline helpers (client task 22c).
 *
 * The timeline shows execution time only: duration and bounds derive from
 * `scheduledExecutionEndDate` (and `scheduleSnapshot.executionDuration` when
 * available) — never from `scheduledBufferEndDate`. Buffer dates may be
 * displayed separately but must not extend the timeline.
 */

import { isAfter, parseISO } from 'date-fns'

export interface TimelineScheduleLike {
  scheduledStartDate?: string | null
  scheduledExecutionEndDate?: string | null
  scheduledBufferStartDate?: string | null
  scheduledBufferEndDate?: string | null
  scheduledStartTime?: string | null
  scheduledEndTime?: string | null
}

export interface TimelineBookingLike {
  scheduledStartDate?: string | null
  scheduledExecutionEndDate?: string | null
  scheduledBufferStartDate?: string | null
  scheduledBufferEndDate?: string | null
  scheduledStartTime?: string | null
  scheduledEndTime?: string | null
  createdAt?: string | null
  status?: string | null
  rfqData?: {
    preferredStartDate?: string | null
  } | null
  selectedSubprojectIndex?: number | null
  project?: {
    timeMode?: string | null
    executionDuration?: { value?: number; unit?: string | null } | null
    subprojects?: Array<{
      executionDuration?: { value?: number; unit?: string | null } | null
    } | null> | null
  } | null
  scheduleSnapshot?: {
    executionDuration?: { value?: number; unit?: string | null } | null
  } | null
  rescheduleRequest?: {
    status?: string | null
    proposedSchedule?: TimelineScheduleLike | null
  } | null
}

export const toTimelineDate = (value?: string | null): Date | null => {
  if (!value) return null
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normUnit = (unit?: string | null): 'hours' | 'days' | null => {
  if (unit === 'hours' || unit === 'days') return unit
  return null
}

export function resolveTimelineExecutionUnit(booking?: TimelineBookingLike | null): 'hours' | 'days' | null {
  // Recorded booking-time snapshot wins over live project data; both win
  // over the coarse project time mode. A project edited after booking must
  // not flip the timeline day/hour mode while the panels stay put.
  const snapshotUnit = normUnit(booking?.scheduleSnapshot?.executionDuration?.unit)
  if (snapshotUnit) return snapshotUnit
  const project = booking?.project
  const subprojects = project?.subprojects
  const selectedIndex = booking?.selectedSubprojectIndex
  if (subprojects && subprojects.length > 0) {
    const sub =
      typeof selectedIndex === 'number'
        ? subprojects[selectedIndex]
        : subprojects.length === 1
          ? subprojects[0]
          : undefined
    const unit = normUnit(sub?.executionDuration?.unit)
    if (unit) return unit
  }
  const projectUnit = normUnit(project?.executionDuration?.unit)
  if (projectUnit) return projectUnit
  const timeMode = project?.timeMode
  if (timeMode === 'hours' || timeMode === 'days') return timeMode
  return null
}

/** Days mode (the only mode that must never show times). */
export function resolveTimelineIsDaysMode(booking?: TimelineBookingLike | null): boolean {
  const unit = resolveTimelineExecutionUnit(booking)
  if (unit) return unit === 'days'
  return booking?.project?.timeMode === 'days'
}

/** Positive hour mode only. Unknown mode means date-only everywhere. */
export function resolveTimelineHourMode(booking?: TimelineBookingLike | null): boolean {
  const unit = resolveTimelineExecutionUnit(booking)
  if (unit) return unit === 'hours'
  return booking?.project?.timeMode === 'hours'
}

export function getTimelineDisplaySchedule(booking: TimelineBookingLike): TimelineScheduleLike {
  const persistedSchedule: TimelineScheduleLike = {
    scheduledStartDate: booking.scheduledStartDate,
    scheduledExecutionEndDate: booking.scheduledExecutionEndDate,
    scheduledBufferStartDate: booking.scheduledBufferStartDate,
    scheduledBufferEndDate: booking.scheduledBufferEndDate,
    scheduledStartTime: booking.scheduledStartTime,
    scheduledEndTime: booking.scheduledEndTime,
  }

  if (booking.status !== 'rescheduling_requested' || !booking.rescheduleRequest?.proposedSchedule) {
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

/**
 * Timeline bounds cover execution only. The buffer end is deliberately
 * ignored here; render it as a separate display when needed.
 */
export function getTimelineBounds(booking: TimelineBookingLike): { start: Date; end: Date } | null {
  const schedule = getTimelineDisplaySchedule(booking)
  const start = toTimelineDate(schedule.scheduledStartDate || booking.rfqData?.preferredStartDate || booking.createdAt)
  if (!start) return null

  const end = toTimelineDate(schedule.scheduledExecutionEndDate) || start

  return {
    start,
    end: isAfter(end, start) ? end : start,
  }
}

/**
 * Whether start/end times may be shown for this booking on the timeline:
 * positively hour mode with recorded times present. Day mode and unknown
 * mode stay date-only.
 */
export function resolveTimelineShowTimes(booking?: TimelineBookingLike | null): boolean {
  if (!booking || !resolveTimelineHourMode(booking)) return false
  const schedule = getTimelineDisplaySchedule(booking)
  return Boolean(schedule.scheduledStartTime && schedule.scheduledEndTime)
}
