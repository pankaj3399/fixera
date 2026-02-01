'use client'

import { useMemo, useState } from 'react'
import { addDays, addWeeks, differenceInMinutes, format, startOfWeek } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CalendarEventType = 'booking' | 'booking-buffer' | 'personal' | 'company'

export interface CalendarEventMeta {
  bookingId?: string
  location?: {
    address?: string
    city?: string
    country?: string
    postalCode?: string
  }
  note?: string
  rangeIndex?: number
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

interface WeeklyAvailabilityCalendarProps {
  title?: string
  description?: string
  events: CalendarEvent[]
  dayStart?: string
  dayEnd?: string
  onEventClick?: (event: CalendarEvent) => void
  className?: string
}

const parseTimeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map((part) => Number.parseInt(part, 10))
  return hours * 60 + (Number.isNaN(minutes) ? 0 : minutes)
}

const buildDayTime = (day: Date, minutesFromMidnight: number) => {
  const hours = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60
  const value = new Date(day)
  value.setHours(hours, minutes, 0, 0)
  return value
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
}

export default function WeeklyAvailabilityCalendar({
  title = 'Weekly Availability',
  description,
  events,
  dayStart = '09:00',
  dayEnd = '17:00',
  onEventClick,
  className,
}: WeeklyAvailabilityCalendarProps) {
  const [weekStart, setWeekStart] = useState<Date>(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )

  const startMinutes = parseTimeToMinutes(dayStart)
  const endMinutes = parseTimeToMinutes(dayEnd)
  const totalMinutes = Math.max(0, endMinutes - startMinutes)
  const minuteHeight = 1
  const hourHeight = 60 * minuteHeight
  const gridHeight = totalMinutes * minuteHeight
  const hourMarks = Math.ceil(totalMinutes / 60)

  const days = useMemo(
    () => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  )

  const segmentsByDay = useMemo(() => {
    const dayMap = new Map<number, EventSegment[]>()
    days.forEach((_, index) => dayMap.set(index, []))

    events.forEach((event) => {
      if (!(event.start instanceof Date) || !(event.end instanceof Date)) return
      if (Number.isNaN(event.start.getTime()) || Number.isNaN(event.end.getTime())) return
      if (event.end <= event.start) return

      days.forEach((day, dayIndex) => {
        const dayStartTime = buildDayTime(day, startMinutes)
        const dayEndTime = buildDayTime(day, endMinutes)

        if (event.end <= dayStartTime || event.start >= dayEndTime) return

        const segmentStart = event.start > dayStartTime ? event.start : dayStartTime
        const segmentEnd = event.end < dayEndTime ? event.end : dayEndTime

        if (segmentEnd <= segmentStart) return

        dayMap.get(dayIndex)?.push({
          ...event,
          segmentStart,
          segmentEnd,
          laneIndex: 0,
          laneCount: 1,
        })
      })
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
  }, [days, events, startMinutes, endMinutes])

  const headerRange = `${format(days[0], 'MMM d')} - ${format(
    days[days.length - 1],
    'MMM d'
  )}`

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart((prev) => addWeeks(prev, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[140px] text-center text-sm font-medium">
              {headerRange}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart((prev) => addWeeks(prev, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[90px_repeat(5,1fr)] gap-3">
          <div />
          {days.map((day) => (
            <div key={day.toISOString()} className="text-sm font-semibold text-slate-700">
              <div>{format(day, 'EEE')}</div>
              <div className="text-xs text-slate-500">{format(day, 'MMM d')}</div>
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
            const dayStartTime = buildDayTime(day, startMinutes)

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
                  const timeLabel = `${format(segment.segmentStart, 'HH:mm')} - ${format(
                    segment.segmentEnd,
                    'HH:mm'
                  )}`

                  const location = segment.meta?.location
                  const locationLabel = location
                    ? [location.address, location.city].filter(Boolean).join(', ')
                    : undefined

                  const hoverLines = [
                    segment.meta?.bookingId
                      ? `Booking: ${segment.meta.bookingId}`
                      : undefined,
                    locationLabel,
                    segment.meta?.note,
                    timeLabel,
                  ].filter(Boolean) as string[]

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
                      title={hoverLines.join(' | ')}
                    >
                      <div
                        className={cn(
                          'h-full w-full rounded-xl bg-gradient-to-br p-[1px] shadow-sm',
                          style.gradient
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-full w-full flex-col justify-between rounded-[11px] bg-white/90 px-2 py-1 text-[11px] leading-tight backdrop-blur',
                            style.text
                          )}
                        >
                          <div className="font-semibold">{segment.title}</div>
                          <div className="text-[10px] opacity-80">{timeLabel}</div>
                        </div>
                      </div>
                      {hoverLines.length > 0 && (
                        <div className="pointer-events-none absolute left-2 top-full z-20 mt-2 w-56 rounded-lg border border-slate-200 bg-white/95 p-2 text-[11px] text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          {hoverLines.map((line) => (
                            <div key={line} className="truncate">
                              {line}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          {(
            [
              { label: 'Personal Block', type: 'personal' },
              { label: 'Booking', type: 'booking' },
              { label: 'Buffer', type: 'booking-buffer' },
              { label: 'Company Closure', type: 'company' },
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
