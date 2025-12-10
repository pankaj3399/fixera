'use client'

import { useMemo, useState } from 'react'
import { addDays, format, startOfDay, startOfWeek } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

interface WeeklyTimeBlockerProps {
  blockedRanges: Array<{ startDate: string; endDate: string; reason?: string }>
  onAddBlockedRange: (startDate: string, endDate: string, reason?: string) => void
  onRemoveBlockedRange?: (index: number) => void
  title?: string
  description?: string
}

const getDayBoundaries = (date: Date) => {
  const dayStart = startOfDay(date)
  const dayEnd = addDays(dayStart, 1)
  return { dayStart, dayEnd }
}

const formatTimeRange = (start: Date, end: Date) => {
  const sameDay = start.toDateString() === end.toDateString()
  const startLabel = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endLabel = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (sameDay) {
    return `${startLabel} - ${endLabel}`
  }
  return `${format(start, 'MMM d HH:mm')} → ${format(end, 'MMM d HH:mm')}`
}

export default function WeeklyTimeBlocker({
  blockedRanges,
  onAddBlockedRange,
  onRemoveBlockedRange,
  title = 'Weekly Hour Blocks',
  description = 'Preview and add blocked hours for this week.',
}: WeeklyTimeBlockerProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [newRangeStart, setNewRangeStart] = useState('')
  const [newRangeEnd, setNewRangeEnd] = useState('')
  const [newRangeReason, setNewRangeReason] = useState('')

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
    [weekStart]
  )

  const rangesWithIndex = useMemo(
    () => blockedRanges.map((range, index) => ({ ...range, index })),
    [blockedRanges]
  )

  const weekRangeLabel = `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`

  const handleAddRange = () => {
    if (!newRangeStart || !newRangeEnd) return
    onAddBlockedRange(newRangeStart, newRangeEnd, newRangeReason || undefined)
    setNewRangeStart('')
    setNewRangeEnd('')
    setNewRangeReason('')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="text-base font-semibold text-gray-900">{title}</h4>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-gray-800">{weekRangeLabel}</span>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-7">
        {weekDays.map((day) => {
          const { dayStart, dayEnd } = getDayBoundaries(day)
          const dayRanges = rangesWithIndex
            .map(({ startDate, endDate, reason, index }) => {
              const start = new Date(startDate)
              const end = new Date(endDate)
              if (end <= dayStart || start >= dayEnd) {
                return null
              }
              const displayStart = start < dayStart ? dayStart : start
              const displayEnd = end > dayEnd ? dayEnd : end
              return { displayStart, displayEnd, reason, index }
            })
            .filter(Boolean) as Array<{
              displayStart: Date
              displayEnd: Date
              reason?: string
              index: number
            }>

          return (
            <div key={day.toISOString()} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">{format(day, 'EEE, MMM d')}</p>
              {dayRanges.length === 0 ? (
                <p className="mt-4 text-xs text-gray-400">No blocks</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {dayRanges.map(({ displayStart, displayEnd, reason, index }) => (
                    <div key={`${displayStart.toISOString()}-${displayEnd.toISOString()}`} className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-xs text-blue-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{formatTimeRange(displayStart, displayEnd)}</span>
                        {onRemoveBlockedRange && (
                          <button
                            type="button"
                            onClick={() => onRemoveBlockedRange(index)}
                            className="text-blue-500 hover:text-blue-700"
                            aria-label="Remove blocked range"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {reason && <p className="mt-1 text-[10px] text-blue-900/80">Reason: {reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <Label className="text-sm font-semibold text-gray-900">Add blocked hours</Label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            type="datetime-local"
            value={newRangeStart}
            onChange={(e) => setNewRangeStart(e.target.value)}
            placeholder="Start"
          />
          <Input
            type="datetime-local"
            value={newRangeEnd}
            onChange={(e) => setNewRangeEnd(e.target.value)}
            placeholder="End"
          />
        </div>
        <Input
          type="text"
          value={newRangeReason}
          onChange={(e) => setNewRangeReason(e.target.value)}
          placeholder="Reason (optional)"
        />
        <div className="flex justify-end">
          <Button type="button" onClick={handleAddRange} disabled={!newRangeStart || !newRangeEnd}>
            Add Hours
          </Button>
        </div>
      </div>

      {blockedRanges.length > 0 && (
        <p className="text-xs text-gray-500">
          Total blocked windows: <Badge variant="secondary">{blockedRanges.length}</Badge>
        </p>
      )}
    </div>
  )
}
