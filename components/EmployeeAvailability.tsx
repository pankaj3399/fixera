'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Calendar, CalendarX, Loader2, RefreshCw, User, X } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import WeeklyAvailabilityCalendar, { CalendarEvent } from "@/components/calendar/WeeklyAvailabilityCalendar"
import { toLocalInputValue, getDateValue, toIsoDateTime, type DateInput } from "@/lib/dateUtils"
import { getScheduleWindow, getVisibleScheduleDays } from "@/lib/scheduleUtils"

interface BlockedRange {
  startDate: string
  endDate: string
  reason?: string
}

interface EmployeeAvailabilityProps {
  className?: string
}

interface AvailabilityData {
  availability: {
    [day: string]: {
      available: boolean
      startTime?: string
      endTime?: string
    }
  }
  blockedDates: Array<{ date: string; reason?: string }>
  blockedRanges: Array<{
    startDate: string
    endDate: string
    reason?: string
  }>
  bookingBlockedRanges: Array<{
    startDate: string
    endDate: string
    reason?: string
    bookingId?: string
    bookingNumber?: string
    customerName?: string
    location?: {
      address?: string
      city?: string
      country?: string
      postalCode?: string
    }
  }>
  companyBlockedDates: Array<{ date: string; reason?: string; isHoliday?: boolean }>
  companyBlockedRanges: Array<{
    startDate: string
    endDate: string
    reason?: string
    isHoliday?: boolean
  }>
}

export default function EmployeeAvailability({ className }: EmployeeAvailabilityProps) {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData | null>(null)

  const [blockedRanges, setBlockedRanges] = useState<BlockedRange[]>([])
  const [newBlockedRange, setNewBlockedRange] = useState({
    startDate: '',
    endDate: '',
    reason: ''
  })
  const [editingRange, setEditingRange] = useState<{
    index: number
    startValue: string
    endValue: string
    reason: string
  } | null>(null)

  const fetchAvailability = useCallback(async () => {
    try {
      setLoading(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/availability/effective`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAvailabilityData(data.data)

          const mergedRanges = new Map<string, BlockedRange>()
          const addRange = (range: BlockedRange) => {
            const key = `${range.startDate}-${range.endDate}-${range.reason || ''}`
            if (!mergedRanges.has(key)) {
              mergedRanges.set(key, range)
            }
          }

          if (data.data.blockedRanges) {
            data.data.blockedRanges.forEach((range: BlockedRange) => {
              const startDate = toIsoDateTime(range.startDate, false)
              const endDate = toIsoDateTime(range.endDate, true)
              if (startDate && endDate) {
                addRange({
                  startDate,
                  endDate,
                  reason: range.reason
                })
              }
            })
          }

          if (data.data.blockedDates) {
            data.data.blockedDates.forEach((item: { date: string; reason?: string }) => {
              const startDate = toIsoDateTime(item.date, false)
              const endDate = toIsoDateTime(item.date, true)
              if (startDate && endDate) {
                addRange({
                  startDate,
                  endDate,
                  reason: item.reason
                })
              }
            })
          }

          setBlockedRanges(Array.from(mergedRanges.values()))
        } else {
          console.error('Failed to load availability:', data.msg)
          toast.error(data.msg || 'Failed to load availability')
        }
      } else {
        console.error('Failed to load availability - server error')
        toast.error('Failed to load availability')
      }
    } catch (error) {
      console.error('Error loading availability:', error)
      toast.error('Failed to load availability')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveBlockedRanges = async (
    customRanges: BlockedRange[] = blockedRanges
  ) => {
    try {
      setSaving(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockedDates: [],
          blockedRanges: customRanges
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          await fetchAvailability()
          return true
        }
        toast.error(data.msg || 'Failed to update blocked periods')
        return false
      }
      toast.error('Failed to update blocked periods')
      return false
    } catch (error) {
      console.error('Error updating blocked periods:', error)
      toast.error('Failed to update blocked periods')
      return false
    } finally {
      setSaving(false)
    }
  }

  const addBlockedRangeEntry = async (startValue: string, endValue: string, reason?: string) => {
    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    const now = new Date()

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error('Please provide valid start and end times')
      return false
    }
    if (startDate < now) {
      toast.error('Cannot block time in the past')
      return false
    }
    if (startDate >= endDate) {
      toast.error('Start must be before end time')
      return false
    }

    const newRange = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      reason: reason || undefined
    }

    const previousRanges = blockedRanges
    const updatedRanges = [...blockedRanges, newRange]
    setBlockedRanges(updatedRanges)

    const success = await saveBlockedRanges(updatedRanges)
    if (success) {
      toast.success('Blocked period saved')
      return true
    }

    setBlockedRanges(previousRanges)
    return false
  }

  const addBlockedRange = async () => {
    if (!newBlockedRange.startDate || !newBlockedRange.endDate) {
      toast.error('Select start and end values')
      return
    }
    const success = await addBlockedRangeEntry(
      newBlockedRange.startDate,
      newBlockedRange.endDate,
      newBlockedRange.reason
    )
    if (success) {
      setNewBlockedRange({ startDate: '', endDate: '', reason: '' })
    }
  }

  const removeBlockedRange = async (index: number) => {
    const previousRanges = blockedRanges
    const updatedRanges = blockedRanges.filter((_, i) => i !== index)
    setBlockedRanges(updatedRanges)
    const success = await saveBlockedRanges(updatedRanges)
    if (success) {
      toast.success('Blocked period removed')
    } else {
      setBlockedRanges(previousRanges)
    }
  }

  const openEditRange = (index: number) => {
    const range = blockedRanges[index]
    if (!range) return
    setEditingRange({
      index,
      startValue: toLocalInputValue(range.startDate),
      endValue: toLocalInputValue(range.endDate),
      reason: range.reason || ''
    })
  }

  const updateBlockedRange = async () => {
    if (!editingRange) return
    const { index, startValue, endValue, reason } = editingRange
    if (!startValue || !endValue) {
      toast.error('Select start and end values')
      return
    }
    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error('Please provide valid start and end times')
      return
    }
    const now = Date.now()
    if (startDate.getTime() < now) {
      toast.error('Cannot block time in the past')
      return
    }
    if (endDate.getTime() < now) {
      toast.error('End time cannot be in the past')
      return
    }
    if (startDate >= endDate) {
      toast.error('Start must be before end time')
      return
    }

    const previousRanges = blockedRanges
    const updatedRanges = blockedRanges.map((range, rangeIndex) =>
      rangeIndex === index
        ? {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            reason: reason || undefined
          }
        : range
    )
    setBlockedRanges(updatedRanges)
    const success = await saveBlockedRanges(updatedRanges)
    if (success) {
      toast.success('Blocked period updated')
      setEditingRange(null)
    } else {
      setBlockedRanges(previousRanges)
    }
  }

  const deleteBlockedRange = async () => {
    if (!editingRange) return
    const previousRanges = blockedRanges
    const updatedRanges = blockedRanges.filter((_, index) => index !== editingRange.index)
    setBlockedRanges(updatedRanges)
    const success = await saveBlockedRanges(updatedRanges)
    if (success) {
      toast.success('Blocked period removed')
      setEditingRange(null)
    } else {
      setBlockedRanges(previousRanges)
    }
  }

  useEffect(() => {
    fetchAvailability()
  }, [fetchAvailability])

  const scheduleWindow = useMemo(
    () => getScheduleWindow(availabilityData?.availability),
    [availabilityData?.availability]
  )
  const visibleDays = useMemo(
    () => getVisibleScheduleDays(availabilityData?.availability),
    [availabilityData?.availability]
  )

  const calendarEvents = useMemo(() => {
    const events: CalendarEvent[] = []

    const toEventDate = (value: string, isEnd = false) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T${isEnd ? '23:59:59' : '00:00:00'}`)
      }
      return new Date(value)
    }

    blockedRanges.forEach((range, index) => {
      const start = toEventDate(range.startDate, false)
      const end = toEventDate(range.endDate, true)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return
      events.push({
        id: `personal-${index}`,
        type: 'personal',
        title: 'Personal Block',
        start,
        end,
        meta: { note: range.reason, rangeIndex: index }
      })
    })

    availabilityData?.companyBlockedRanges?.forEach((range, index) => {
      const start = toEventDate(range.startDate, false)
      const end = toEventDate(range.endDate, true)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return
      events.push({
        id: `company-${index}`,
        type: 'company',
        title: range.isHoliday ? 'Holiday' : 'Company Closure',
        start,
        end,
        meta: { note: range.reason },
        readOnly: true
      })
    })

    availabilityData?.companyBlockedDates?.forEach((item, index) => {
      const dateStr = item.date?.toString()
      if (!dateStr) return
      const start = toEventDate(dateStr, false)
      const end = toEventDate(dateStr, true)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return
      events.push({
        id: `company-date-${index}`,
        type: 'company',
        title: item.isHoliday ? 'Holiday' : 'Company Closure',
        start,
        end,
        meta: { note: item.reason },
        readOnly: true
      })
    })

    availabilityData?.bookingBlockedRanges?.forEach((range, index) => {
      const start = new Date(range.startDate)
      const end = new Date(range.endDate)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return
      const type = range.reason === 'booking-buffer' ? 'booking-buffer' : 'booking'
      events.push({
        id: `booking-${range.bookingId || index}`,
        type,
        title: type === 'booking-buffer' ? 'Buffer' : 'Booking',
        start,
        end,
        meta: {
          bookingId: range.bookingId,
          bookingNumber: range.bookingNumber,
          customerName: range.customerName,
          location: range.location
        }
      })
    })

    return events
  }, [availabilityData, blockedRanges])

  if (user?.role !== 'employee') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Availability Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-2" />
            <p className="text-sm">This feature is only available for employees</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading && !availabilityData) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Your Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading availability...
          </div>
        </CardContent>
      </Card>
    )
  }

  const rootClassName = className ? `space-y-6 ${className}` : 'space-y-6'

  return (
    <div className={rootClassName}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Your Availability
          </CardTitle>
          <CardDescription>
            You follow the company schedule. Use blocked periods for time you are unavailable.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-medium">Add Blocked Period</Label>
            <p className="text-xs text-muted-foreground">
              Choose the exact start and end time for the blocked period.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee-start-date">Start Date</Label>
                <Input
                  id="employee-start-date"
                  type="datetime-local"
                  value={newBlockedRange.startDate}
                  onChange={(e) => setNewBlockedRange(prev => ({ ...prev, startDate: e.target.value }))}
                  min={toLocalInputValue(new Date().toISOString())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-end-date">End Date</Label>
                <Input
                  id="employee-end-date"
                  type="datetime-local"
                  value={newBlockedRange.endDate}
                  onChange={(e) => setNewBlockedRange(prev => ({ ...prev, endDate: e.target.value }))}
                  min={newBlockedRange.startDate || toLocalInputValue(new Date().toISOString())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-block-reason">Reason (Optional)</Label>
                <Input
                  id="employee-block-reason"
                  placeholder="Vacation, appointment, etc."
                  value={newBlockedRange.reason}
                  onChange={(e) => setNewBlockedRange(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={addBlockedRange}
                disabled={
                  saving ||
                  !newBlockedRange.startDate ||
                  !newBlockedRange.endDate ||
                  newBlockedRange.endDate <= newBlockedRange.startDate
                }
                variant="outline"
              >
                <CalendarX className="h-4 w-4 mr-2" />
                Block Period
              </Button>
            </div>
          </div>

          {availabilityData && (
            <WeeklyAvailabilityCalendar
              title="Weekly Availability"
              description="Booking details are shown inside each block. Click personal blocks to edit. Click bookings to view."
              events={calendarEvents}
              dayStart={scheduleWindow.dayStart}
              dayEnd={scheduleWindow.dayEnd}
              visibleDays={visibleDays}
              onEventClick={(event) => {
                if (event.type === 'personal' && typeof event.meta?.rangeIndex === 'number') {
                  openEditRange(event.meta.rangeIndex)
                }
                if (
                  (event.type === 'booking' || event.type === 'booking-buffer') &&
                  event.meta?.bookingId
                ) {
                  router.push(`/bookings/${event.meta.bookingId}`)
                }
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Company Working Hours
              </CardTitle>
              <CardDescription>
                Read-only. Working hours follow the company schedule.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAvailability}
              disabled={saving}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {availabilityData?.availability ? (
            <div className="space-y-2">
              {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => {
                const dayData = availabilityData.availability[day]
                const label = day.charAt(0).toUpperCase() + day.slice(1)
                return (
                  <div key={day} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    {dayData?.available ? (
                      <span className="text-green-600">
                        {dayData.startTime || '09:00'} - {dayData.endTime || '17:00'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not available</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              No company schedule set.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editingRange}
        onOpenChange={(open) => {
          if (!open) setEditingRange(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Blocked Period</DialogTitle>
            <DialogDescription>Adjust the time range or remove the block.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-employee-start">Start</Label>
                <Input
                  id="edit-employee-start"
                  type="datetime-local"
                  value={editingRange?.startValue || ''}
                  min={toLocalInputValue(new Date().toISOString())}
                  onChange={(e) =>
                    setEditingRange((prev) =>
                      prev ? { ...prev, startValue: e.target.value } : prev
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-employee-end">End</Label>
                <Input
                  id="edit-employee-end"
                  type="datetime-local"
                  value={editingRange?.endValue || ''}
                  min={editingRange?.startValue || toLocalInputValue(new Date().toISOString())}
                  onChange={(e) =>
                    setEditingRange((prev) =>
                      prev ? { ...prev, endValue: e.target.value } : prev
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-employee-reason">Reason (optional)</Label>
                <Input
                  id="edit-employee-reason"
                  value={editingRange?.reason || ''}
                  onChange={(e) =>
                    setEditingRange((prev) =>
                      prev ? { ...prev, reason: e.target.value } : prev
                    )
                  }
                  placeholder="Vacation, appointment, etc."
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="destructive" disabled={saving} onClick={deleteBlockedRange}>
                Remove Block
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setEditingRange(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={updateBlockedRange} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
