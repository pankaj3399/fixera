'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
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
import { bookingCalendarEventType } from "@/lib/calendar/bookingEvents"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"

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
    status?: string
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
  const t = useTranslations("proTools")
  const getErrorText = useErrorMessage()
  const tCalendar = useTranslations("calendar")
  const { intl } = useFormatLocale()
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
          toast.error(getErrorText(data, t("employeeAvailability.toast.loadFailed")))
        }
      } else {
        console.error('Failed to load availability - server error')
        toast.error(t("employeeAvailability.toast.loadFailed"))
      }
    } catch (error) {
      console.error('Error loading availability:', error)
      toast.error(t("employeeAvailability.toast.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [getErrorText, t])

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
        toast.error(getErrorText(data, t("employeeAvailability.toast.updateFailed")))
        return false
      }
      toast.error(t("employeeAvailability.toast.updateFailed"))
      return false
    } catch (error) {
      console.error('Error updating blocked periods:', error)
      toast.error(t("employeeAvailability.toast.updateFailed"))
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
      toast.error(t("employeeAvailability.toast.invalidStartEnd"))
      return false
    }
    if (startDate < now) {
      toast.error(t("employeeAvailability.toast.noPastBlock"))
      return false
    }
    if (startDate >= endDate) {
      toast.error(t("employeeAvailability.toast.startBeforeEnd"))
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
      toast.success(t("employeeAvailability.toast.blockedPeriodSaved"))
      return true
    }

    setBlockedRanges(previousRanges)
    return false
  }

  const addBlockedRange = async () => {
    if (!newBlockedRange.startDate || !newBlockedRange.endDate) {
      toast.error(t("employeeAvailability.toast.selectStartEndValues"))
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
      toast.success(t("employeeAvailability.toast.blockedPeriodRemoved"))
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
      toast.error(t("employeeAvailability.toast.selectStartEndValues"))
      return
    }
    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error(t("employeeAvailability.toast.invalidStartEnd"))
      return
    }
    const now = Date.now()
    if (startDate.getTime() < now) {
      toast.error(t("employeeAvailability.toast.noPastBlock"))
      return
    }
    if (endDate.getTime() < now) {
      toast.error(t("employeeAvailability.toast.endInPast"))
      return
    }
    if (startDate >= endDate) {
      toast.error(t("employeeAvailability.toast.startBeforeEnd"))
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
      toast.success(t("employeeAvailability.toast.blockedPeriodUpdated"))
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
      toast.success(t("employeeAvailability.toast.blockedPeriodRemoved"))
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

  const weekdayLabels = useMemo(() => {
    const monday = new Date()
    monday.setHours(12, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday)
      day.setDate(monday.getDate() + index)
      const name = day.toLocaleDateString(intl, { weekday: 'long' })
      return name.charAt(0).toUpperCase() + name.slice(1)
    })
  }, [intl])

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
        title: tCalendar('eventTitles.personalBlock'),
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
        title: range.isHoliday ? tCalendar('eventTitles.holiday') : tCalendar('eventTitles.companyClosure'),
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
        title: item.isHoliday ? tCalendar('eventTitles.holiday') : tCalendar('eventTitles.companyClosure'),
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
      if (range.reason === 'booking-buffer') {
        events.push({
          id: `booking-${range.bookingId || index}`,
          type: 'booking-buffer',
          title: tCalendar('eventTitles.buffer'),
          start,
          end,
          meta: {
            bookingId: range.bookingId,
            bookingNumber: range.bookingNumber,
            customerName: range.customerName,
            location: range.location
          }
        })
        return
      }
      // Status-derived colour: pending renders blue, in-progress indigo,
      // completed emerald. Ranges without a status fall back to pending blue.
      const bookingType = bookingCalendarEventType(range.status)
      if (!bookingType) return
      events.push({
        id: `booking-${range.bookingId || index}`,
        type: bookingType,
        title: tCalendar('eventTitles.booking'),
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
  }, [availabilityData, blockedRanges, tCalendar])

  if (user?.role !== 'employee') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t("employeeAvailability.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-2" />
            <p className="text-sm">{t("employeeAvailability.employeesOnly")}</p>
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
            {t("employeeAvailability.yourAvailability")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 py-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-16 rounded bg-gray-200/70 animate-pulse" />
              <div className="h-4 flex-1 rounded bg-gray-200/70 animate-pulse" />
            </div>
          ))}
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
            {t("employeeAvailability.yourAvailability")}
          </CardTitle>
          <CardDescription>
            {t("employeeAvailability.description")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-medium">{t("employeeAvailability.addBlockedPeriod")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("employeeAvailability.addBlockedPeriodHint")}
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee-start-date">{t("employeeAvailability.startDate")}</Label>
                <Input
                  id="employee-start-date"
                  type="datetime-local"
                  value={newBlockedRange.startDate}
                  onChange={(e) => setNewBlockedRange(prev => ({ ...prev, startDate: e.target.value }))}
                  min={toLocalInputValue(new Date().toISOString())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-end-date">{t("employeeAvailability.endDate")}</Label>
                <Input
                  id="employee-end-date"
                  type="datetime-local"
                  value={newBlockedRange.endDate}
                  onChange={(e) => setNewBlockedRange(prev => ({ ...prev, endDate: e.target.value }))}
                  min={newBlockedRange.startDate || toLocalInputValue(new Date().toISOString())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-block-reason">{t("employeeAvailability.reasonOptionalTitleCase")}</Label>
                <Input
                  id="employee-block-reason"
                  placeholder={t("employeeAvailability.reasonPlaceholder")}
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
                {t("employeeAvailability.blockPeriod")}
              </Button>
            </div>
          </div>

          {availabilityData && (
            <WeeklyAvailabilityCalendar
              title={tCalendar('weeklyAvailabilityCalendar.defaultTitle')}
              description={tCalendar('weeklyAvailabilityCalendar.description')}
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
                {t("employeeAvailability.companyWorkingHours")}
              </CardTitle>
              <CardDescription>
                {t("employeeAvailability.companyWorkingHoursDescription")}
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
              {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day, index) => {
                const dayData = availabilityData.availability[day]
                const label = weekdayLabels[index]
                return (
                  <div key={day} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    {dayData?.available ? (
                      <span className="text-green-600">
                        {dayData.startTime || '09:00'} - {dayData.endTime || '17:00'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("employeeAvailability.notAvailable")}</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {t("employeeAvailability.noCompanySchedule")}
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
            <DialogTitle>{t("employeeAvailability.editBlockDialog.title")}</DialogTitle>
            <DialogDescription>{t("employeeAvailability.editBlockDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-employee-start">{t("employeeAvailability.editBlockDialog.start")}</Label>
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
                <Label htmlFor="edit-employee-end">{t("employeeAvailability.editBlockDialog.end")}</Label>
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
                <Label htmlFor="edit-employee-reason">{t("employeeAvailability.editBlockDialog.reasonOptional")}</Label>
                <Input
                  id="edit-employee-reason"
                  value={editingRange?.reason || ''}
                  onChange={(e) =>
                    setEditingRange((prev) =>
                      prev ? { ...prev, reason: e.target.value } : prev
                    )
                  }
                  placeholder={t("employeeAvailability.editBlockDialog.reasonPlaceholder")}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="destructive" disabled={saving} onClick={deleteBlockedRange}>
                {t("employeeAvailability.editBlockDialog.removeBlock")}
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setEditingRange(null)} disabled={saving}>
                  {t("employeeAvailability.cancel")}
                </Button>
                <Button onClick={updateBlockedRange} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("employeeAvailability.editBlockDialog.saveChanges")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
