'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { differenceInMinutes } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { normalizeTimezone } from '@/lib/timezoneDisplay'
import { useFormatLocale } from '@/lib/i18n/useFormatLocale'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CalendarEventType = 'booking' | 'booking-active' | 'booking-completed' | 'booking-buffer' | 'personal' | 'company' | 'support'

export interface CalendarEventMeta {
  bookingId?: string
  bookingNumber?: string
  customerName?: string
  location?: {
    address?: string
    city?: string
    country?: string
    postalCode?: string
  }
  note?: string
  rangeIndex?: number
  ticketNumber?: string
}

export interface CalendarEvent {
  id: string
  type: CalendarEventType
  title: string
  start: Date
  end: Date
  meta?: CalendarEventMeta
  readOnly?: boolean
}

interface EventSegment extends CalendarEvent {
  segmentStart: Date
  segmentEnd: Date
  laneIndex: number
  laneCount: number
}

export interface WeeklyScheduleDay {
  available?: boolean
  startTime?: string
  endTime?: string
}

interface WeeklyAvailabilityCalendarProps {
  title?: string
  description?: string
  events: CalendarEvent[]
  dayStart?: string
  dayEnd?: string
  /** Day-of-week indices to show (0=Sun, 1=Mon, ..., 6=Sat). Defaults to Mon-Fri [1,2,3,4,5]. */
  visibleDays?: number[]
  /** IANA timezone used for day boundaries, labels, and event times. */
  timeZone?: string
  onEventClick?: (event: CalendarEvent) => void
  className?: string
  /**
   * Recurring weekly template (e.g. { monday: { available, startTime, endTime }, ... }).
   * Rendered for whichever week is currently displayed, so navigating weeks keeps
   * showing the schedule. One-off blocks stay in `events`.
   */
  weeklySchedule?: Record<string, WeeklyScheduleDay>
  /** IANA timezone the weeklySchedule is defined in. Defaults to `timeZone`. */
  weeklyScheduleTimeZone?: string
}

const parseTimeToMinutes = (value: string): number => {
  const parts = value.split(':')
  const hours = Number.parseInt(parts[0], 10)
  const minutes = parts[1] !== undefined ? Number.parseInt(parts[1], 10) : 0
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid time format: "${value}". Expected "HH:MM" format.`)
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time values: hours=${hours}, minutes=${minutes}. Hours must be 0-23, minutes must be 0-59.`)
  }
  return hours * 60 + minutes
}

const addIsoDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const buildDayTime = (day: Date, minutesFromMidnight: number, timeZone: string) => {
  const hours = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60
  const date = formatInTimeZone(day, timeZone, 'yyyy-MM-dd')
  return fromZonedTime(
    `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
    timeZone,
  )
}

const startOfWeekInTimeZone = (date: Date, timeZone: string) => {
  const dateValue = formatInTimeZone(date, timeZone, 'yyyy-MM-dd')
  const isoDay = Number(formatInTimeZone(date, timeZone, 'i'))
  return fromZonedTime(`${addIsoDays(dateValue, 1 - isoDay)}T00:00:00`, timeZone)
}

const parseScheduleClockTime = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?$/)
  if (!match) return undefined
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

const EVENT_STYLES: Record<
  CalendarEventType,
  { gradient: string; badge: string; text: string }
> = {
  booking: {
    gradient: 'from-sky-200 via-blue-200 to-indigo-200',
    badge: 'bg-sky-50 text-sky-800',
    text: 'text-sky-900',
  },
  'booking-active': {
    gradient: 'from-indigo-200 via-indigo-300 to-blue-300',
    badge: 'bg-indigo-50 text-indigo-800',
    text: 'text-indigo-900',
  },
  'booking-completed': {
    gradient: 'from-emerald-200 via-teal-200 to-green-200',
    badge: 'bg-emerald-50 text-emerald-800',
    text: 'text-emerald-900',
  },
  'booking-buffer': {
    gradient: 'from-violet-200 via-fuchsia-200 to-pink-200',
    badge: 'bg-fuchsia-50 text-fuchsia-800',
    text: 'text-fuchsia-900',
  },
  personal: {
    gradient: 'from-emerald-200 via-teal-200 to-lime-200',
    badge: 'bg-emerald-50 text-emerald-800',
    text: 'text-emerald-900',
  },
  company: {
    gradient: 'from-amber-200 via-orange-200 to-rose-200',
    badge: 'bg-amber-50 text-amber-800',
    text: 'text-amber-900',
  },
  support: {
    gradient: 'from-cyan-200 via-sky-200 to-blue-200',
    badge: 'bg-cyan-50 text-cyan-800',
    text: 'text-cyan-900',
  },
}

export default function WeeklyAvailabilityCalendar({
  title,
  description,
  events,
  dayStart = '09:00',
  dayEnd = '17:00',
  visibleDays,
  timeZone,
  onEventClick,
  className,
  weeklySchedule,
  weeklyScheduleTimeZone,
}: WeeklyAvailabilityCalendarProps) {
  const t = useTranslations('calendar')
  const { dateFns } = useFormatLocale()
  const resolvedTitle = title ?? t('weeklyAvailabilityCalendar.defaultTitle')
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const calendarTimeZone = normalizeTimezone(timeZone, browserTimeZone)
  const [weekStart, setWeekStart] = useState<Date>(
    () => startOfWeekInTimeZone(new Date(), calendarTimeZone)
  )

  const shiftWeek = (deltaWeeks: number) => {
    setWeekStart((prev) => {
      const weekStartDate = formatInTimeZone(prev, calendarTimeZone, 'yyyy-MM-dd')
      return fromZonedTime(`${addIsoDays(weekStartDate, deltaWeeks * 7)}T00:00:00`, calendarTimeZone)
    })
  }

  const startMinutes = parseTimeToMinutes(dayStart)
  const endMinutes = parseTimeToMinutes(dayEnd)
  const totalMinutes = Math.max(0, endMinutes - startMinutes)
  const minuteHeight = 1
  const hourHeight = 60 * minuteHeight
  const gridHeight = totalMinutes * minuteHeight
  const hourMarks = Math.ceil(totalMinutes / 60)

  const activeDaysKey = visibleDays ? visibleDays.join(',') : '1,2,3,4,5'
  const days = useMemo(() => {
    const dayIndices = [...(visibleDays ?? [1, 2, 3, 4, 5])].sort(
      (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
    )
    const weekStartDate = formatInTimeZone(weekStart, calendarTimeZone, 'yyyy-MM-dd')
    return dayIndices.map((dayIndex) => {
      // Keep the displayed Monday-to-Sunday dates in chronological order.
      const offset = (dayIndex + 6) % 7
      return fromZonedTime(
        `${addIsoDays(weekStartDate, offset)}T00:00:00`,
        calendarTimeZone,
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, activeDaysKey, calendarTimeZone])

  const scheduleTimeZone = normalizeTimezone(weeklyScheduleTimeZone, calendarTimeZone)

  const recurringEvents = useMemo<CalendarEvent[]>(() => {
    if (!weeklySchedule) return []
    const hasStoredTimes = Object.values(weeklySchedule).some(
      (day) => day?.startTime || day?.endTime,
    )
    // Anchor on the currently displayed week (not today) so navigating weeks
    // keeps rendering the recurring template. The +/-2 day buffer catches
    // schedules whose source-timezone day overlaps a neighbouring viewer day.
    const weekStartDate = formatInTimeZone(weekStart, calendarTimeZone, 'yyyy-MM-dd')
    const viewerWeekStart = fromZonedTime(`${weekStartDate}T00:00:00`, calendarTimeZone)
    const viewerWeekEnd = fromZonedTime(`${addIsoDays(weekStartDate, 7)}T00:00:00`, calendarTimeZone)
    const seedDate = formatInTimeZone(
      new Date(viewerWeekStart.getTime() - 2 * 24 * 60 * 60 * 1000),
      scheduleTimeZone,
      'yyyy-MM-dd',
    )
    const result: CalendarEvent[] = []
    for (let offset = 0; offset < 11; offset += 1) {
      const sourceDate = addIsoDays(seedDate, offset)
      let weekday: string
      try {
        weekday = formatInTimeZone(
          fromZonedTime(`${sourceDate}T12:00:00`, scheduleTimeZone),
          scheduleTimeZone,
          'EEEE',
        ).toLowerCase()
      } catch {
        continue
      }
      if (hasStoredTimes) {
        const schedule = weeklySchedule[weekday]
        if (!schedule?.available) continue
        const startTime = parseScheduleClockTime(schedule.startTime)
        const endTime = parseScheduleClockTime(schedule.endTime)
        if (!startTime || !endTime || endTime <= startTime) continue
        let start: Date
        let end: Date
        try {
          start = fromZonedTime(`${sourceDate}T${startTime}:00`, scheduleTimeZone)
          end = fromZonedTime(`${sourceDate}T${endTime}:00`, scheduleTimeZone)
        } catch {
          continue
        }
        if (end <= viewerWeekStart || start >= viewerWeekEnd) continue
        result.push({
          id: `recurring-availability-${weekday}-${sourceDate}`,
          type: 'personal',
          title: t('eventTitles.available'),
          start,
          end,
          readOnly: true,
        })
      } else {
        // No weekly hours configured -> available 24/7 (matches admin semantics).
        let start: Date
        let end: Date
        try {
          start = fromZonedTime(`${sourceDate}T00:00:00`, scheduleTimeZone)
          end = fromZonedTime(`${addIsoDays(sourceDate, 1)}T00:00:00`, scheduleTimeZone)
        } catch {
          continue
        }
        if (end <= viewerWeekStart || start >= viewerWeekEnd) continue
        result.push({
          id: `recurring-availability-24-7-${sourceDate}`,
          type: 'personal',
          title: t('eventTitles.allDay'),
          start,
          end,
          readOnly: true,
        })
      }
    }
    return result
  }, [weeklySchedule, weekStart, calendarTimeZone, scheduleTimeZone, t])

  const allEvents = useMemo(
    () => [...recurringEvents, ...events],
    [recurringEvents, events],
  )

  const segmentsByDay = useMemo(() => {
    const dayMap = new Map<number, EventSegment[]>()
    days.forEach((_, index) => { dayMap.set(index, []) })

    allEvents.forEach((event) => {
      if (!(event.start instanceof Date) || !(event.end instanceof Date)) return
      if (Number.isNaN(event.start.getTime()) || Number.isNaN(event.end.getTime())) return
      if (event.end <= event.start) return

      for (const [dayIndex, day] of days.entries()) {
        const dayStartTime = buildDayTime(day, startMinutes, calendarTimeZone)
        const dayEndTime = buildDayTime(day, endMinutes, calendarTimeZone)

        if (event.end <= dayStartTime || event.start >= dayEndTime) continue

        const segmentStart = event.start > dayStartTime ? event.start : dayStartTime
        const segmentEnd = event.end < dayEndTime ? event.end : dayEndTime

        if (segmentEnd <= segmentStart) continue

        dayMap.get(dayIndex)?.push({
          ...event,
          segmentStart,
          segmentEnd,
          laneIndex: 0,
          laneCount: 1,
        })
      }
    })

    dayMap.forEach((segments, dayIndex) => {
      const sorted = segments.sort(
        (a, b) => a.segmentStart.getTime() - b.segmentStart.getTime()
      )
      const lanes: number[] = []
      let maxLanes = 1

      sorted.forEach((segment) => {
        const startTime = segment.segmentStart.getTime()
        let laneIndex = lanes.findIndex((laneEnd) => laneEnd <= startTime)
        if (laneIndex === -1) {
          laneIndex = lanes.length
          lanes.push(segment.segmentEnd.getTime())
        } else {
          lanes[laneIndex] = segment.segmentEnd.getTime()
        }
        segment.laneIndex = laneIndex
        maxLanes = Math.max(maxLanes, lanes.length)
      })

      sorted.forEach((segment) => {
        segment.laneCount = maxLanes
      })

      dayMap.set(dayIndex, sorted)
    })

    return dayMap
  }, [days, allEvents, startMinutes, endMinutes, calendarTimeZone])

  const headerRange = `${formatInTimeZone(days[0], calendarTimeZone, 'MMM d', { locale: dateFns })} - ${formatInTimeZone(
    days[days.length - 1],
    calendarTimeZone,
    'MMM d',
    { locale: dateFns },
  )}`

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {resolvedTitle}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => shiftWeek(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[140px] text-center text-sm font-medium">
              {headerRange}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => shiftWeek(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        <div className="max-h-[min(70vh,44rem)] overflow-auto">
          <div
            className="gap-3"
            style={{
              display: 'grid',
              minWidth: `calc(4.5rem + ${days.length} * 7.5rem)`,
              gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(7.5rem, 1fr))`,
            }}
          >
          <div />
          {days.map((day) => (
            <div key={day.toISOString()} className="text-sm font-semibold text-slate-700">
              <div>{formatInTimeZone(day, calendarTimeZone, 'EEE', { locale: dateFns })}</div>
              <div className="text-xs text-slate-500">{formatInTimeZone(day, calendarTimeZone, 'MMM d', { locale: dateFns })}</div>
            </div>
          ))}

          <div className="flex flex-col items-end pr-2 text-xs text-slate-500">
            {Array.from({ length: hourMarks + 1 }).map((_, index) => {
              const minutes = startMinutes + index * 60
              if (minutes > endMinutes) return null
              const hour = Math.floor(minutes / 60)
              const label = `${String(hour).padStart(2, '0')}:00`
              return (
                <div
                  key={`hour-${minutes}`}
                  style={{ height: hourHeight }}
                  className="flex items-start justify-end"
                >
                  <span>{label}</span>
                </div>
              )
            })}
          </div>

          {days.map((day, dayIndex) => {
            const daySegments = segmentsByDay.get(dayIndex) || []
            const dayStartTime = buildDayTime(day, startMinutes, calendarTimeZone)

            return (
              <div
                key={`day-${dayIndex}`}
                className="relative rounded-2xl border border-slate-200 bg-white"
                style={{
                  height: gridHeight,
                  backgroundImage:
                    'linear-gradient(to bottom, rgba(226,232,240,0.9) 1px, transparent 1px)',
                  backgroundSize: `100% ${hourHeight}px`,
                }}
              >
                {daySegments.map((segment) => {
                  const style = EVENT_STYLES[segment.type]
                  const top =
                    differenceInMinutes(segment.segmentStart, dayStartTime) *
                    minuteHeight
                  const height = Math.max(
                    18,
                    differenceInMinutes(segment.segmentEnd, segment.segmentStart) *
                      minuteHeight
                  )
                  const width = `calc(${100 / segment.laneCount}% - 10px)`
                  const left = `calc(${(100 / segment.laneCount) * segment.laneIndex}% + 5px)`
                  const timeLabel = `${formatInTimeZone(segment.segmentStart, calendarTimeZone, 'HH:mm')} - ${formatInTimeZone(
                    segment.segmentEnd,
                    calendarTimeZone,
                    'HH:mm',
                  )}`

                  const location = segment.meta?.location
                  const locationLabel = location
                    ? [location.address, location.city, location.postalCode, location.country]
                        .filter(Boolean)
                        .join(', ')
                    : undefined
                  const bookingNumber = segment.meta?.bookingNumber
                  const customerName = segment.meta?.customerName
                  const isBookingSegment =
                    segment.type === 'booking' ||
                    segment.type === 'booking-active' ||
                    segment.type === 'booking-completed' ||
                    segment.type === 'booking-buffer'
                  const tooltipText = isBookingSegment
                    ? undefined
                    : (segment.meta?.note || segment.title)

                  return (
                    <button
                      key={`${segment.id}-${segment.segmentStart.toISOString()}`}
                      type="button"
                      onClick={() => {
                        if (segment.readOnly) return
                        onEventClick?.(segment)
                      }}
                      aria-disabled={segment.readOnly}
                      tabIndex={segment.readOnly ? -1 : 0}
                      className={cn(
                        'group absolute text-left',
                        segment.readOnly ? 'cursor-default' : 'cursor-pointer'
                      )}
                      style={{
                        top,
                        height,
                        left,
                        width,
                      }}
                      title={tooltipText}
                    >
                      <div
                        className={cn(
                          'h-full w-full rounded-xl bg-gradient-to-br p-[1px] shadow-sm',
                          style.gradient
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-full w-full flex-col rounded-[11px] bg-white/90 px-2 py-1 text-[11px] leading-tight backdrop-blur overflow-hidden',
                            style.text
                          )}
                        >
                          <div className="font-semibold truncate">{segment.title}</div>
                          {bookingNumber && (
                            <div className="text-[10px] opacity-90 truncate">#{bookingNumber}</div>
                          )}
                          {customerName && (
                            <div className="text-[10px] opacity-80 truncate">{customerName}</div>
                          )}
                          {locationLabel && (
                            <div className="text-[10px] opacity-70 truncate">{locationLabel}</div>
                          )}
                          <div className="text-[10px] opacity-80 mt-auto">{timeLabel}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          {(
            [
              { label: t('eventTitles.personalBlock'), type: 'personal' },
              { label: t('eventTitles.bookingPending'), type: 'booking' },
              { label: t('eventTitles.bookingActive'), type: 'booking-active' },
              { label: t('eventTitles.bookingCompleted'), type: 'booking-completed' },
              { label: t('eventTitles.buffer'), type: 'booking-buffer' },
              { label: t('eventTitles.companyClosure'), type: 'company' },
              { label: t('eventTitles.supportMeeting'), type: 'support' },
            ] as const
          ).map((item) => {
            const style = EVENT_STYLES[item.type]
            return (
              <div key={item.type} className="flex items-center gap-2">
                <span className={cn('h-3 w-3 rounded-full bg-gradient-to-br', style.gradient)} />
                <span className={cn('rounded-full px-2 py-0.5', style.badge)}>
                  {item.label}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
