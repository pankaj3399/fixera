'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { format, isSameDay, parseISO, startOfDay, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'

interface BlockedRange {
  startDate: string
  endDate: string
  reason?: string
}

interface AvailabilityApiResponse {
  success: boolean
  blockedDates?: string[]
  blockedRanges?: BlockedRange[]
}

interface AvailabilityDatePickerProps {
  projectId?: string
  value: string
  onChange: (date: string) => void
  minDate?: Date
  placeholder?: string
  disabled?: boolean
  id?: string
  ariaLabel?: string
}

const formatYMD = (d: Date) => format(d, 'yyyy-MM-dd')

export default function AvailabilityDatePicker({
  projectId,
  value,
  onChange,
  minDate,
  placeholder = 'Select date',
  disabled = false,
  id,
  ariaLabel,
}: AvailabilityDatePickerProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set())
  const [blockedRanges, setBlockedRanges] = useState<BlockedRange[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const initialMonth = useMemo(() => {
    if (value) {
      const parsed = parseISO(value)
      if (!isNaN(parsed.getTime())) return startOfMonth(parsed)
    }
    return startOfMonth(new Date())
  }, [value])
  const [viewMonth, setViewMonth] = useState<Date>(initialMonth)

  useEffect(() => {
    setViewMonth(initialMonth)
  }, [initialMonth])

  useEffect(() => {
    if (!projectId) {
      setBlockedDates(new Set())
      setBlockedRanges([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const fetchAvailability = async () => {
      try {
        const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${projectId}/availability`
        const res = await fetch(url)
        if (!res.ok) {
          if (!cancelled) {
            console.error(`Availability fetch failed: ${res.status} ${res.statusText}`)
            setBlockedDates(new Set())
            setBlockedRanges([])
          }
          return
        }
        const data: AvailabilityApiResponse = await res.json()
        if (cancelled) return
        if (data.success) {
          setBlockedDates(new Set((data.blockedDates || []).map((d) => d.slice(0, 10))))
          setBlockedRanges(data.blockedRanges || [])
        } else {
          setBlockedDates(new Set())
          setBlockedRanges([])
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Availability fetch error:', err)
          setBlockedDates(new Set())
          setBlockedRanges([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAvailability()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const today = startOfDay(new Date())
  const earliestDate = startOfDay(minDate || today)

  const normalizedRanges = useMemo(() => {
    return blockedRanges
      .map((range) => {
        const start = startOfDay(parseISO(range.startDate.slice(0, 10)))
        const end = startOfDay(parseISO(range.endDate.slice(0, 10)))
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
        return { start, end }
      })
      .filter((r): r is { start: Date; end: Date } => r !== null)
  }, [blockedRanges])

  const isDateBlocked = (date: Date): boolean => {
    const ymd = formatYMD(date)
    if (blockedDates.has(ymd)) return true
    const day = startOfDay(date)
    for (const { start, end } of normalizedRanges) {
      if (day >= start && day <= end) return true
    }
    return false
  }

  const isDateDisabled = (date: Date): boolean => {
    if (date < earliestDate) return true
    return isDateBlocked(date)
  }

  const monthDays = useMemo(() => {
    const start = startOfMonth(viewMonth)
    const end = endOfMonth(viewMonth)
    return eachDayOfInterval({ start, end })
  }, [viewMonth])

  const leadingBlanks = useMemo(() => {
    const firstDayOfMonth = startOfMonth(viewMonth)
    const dow = getDay(firstDayOfMonth)
    const mondayBased = (dow + 6) % 7
    return Array.from({ length: mondayBased })
  }, [viewMonth])

  const selectedDate = useMemo(() => {
    if (!value) return null
    const parsed = parseISO(value)
    return isNaN(parsed.getTime()) ? null : parsed
  }, [value])

  const handleSelectDay = (day: Date) => {
    if (isDateDisabled(day)) return
    onChange(formatYMD(day))
    setOpen(false)
  }

  const displayLabel = selectedDate ? format(selectedDate, 'dd MMM yyyy') : placeholder

  return (
    <div className="relative inline-block w-full" ref={containerRef}>
      <Button
        id={id}
        type="button"
        variant="outline"
        className="w-full justify-start text-left font-normal"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        <span className={selectedDate ? 'text-gray-900' : 'text-gray-500'}>{displayLabel}</span>
      </Button>

      {open && (
        <div className="absolute z-50 mt-2 w-[300px] rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium text-gray-900">{format(viewMonth, 'MMMM yyyy')}</div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1 text-center text-[10px] font-medium text-gray-500">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading availability...
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {leadingBlanks.map((_, idx) => (
                <div key={`blank-${idx}`} />
              ))}
              {monthDays.map((day) => {
                const disabledDay = isDateDisabled(day)
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const isToday = isSameDay(day, today)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    disabled={disabledDay}
                    className={`h-8 w-full rounded-md text-xs transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-semibold'
                        : disabledDay
                        ? 'text-gray-300 cursor-not-allowed line-through'
                        : isToday
                        ? 'bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
