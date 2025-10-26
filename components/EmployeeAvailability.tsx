'use client'

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import {
  Calendar,
  Building,
  User,
  Loader2,
  Save,
  RefreshCw,
  X,
  Plus
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"

interface EmployeeAvailabilityProps {
  className?: string
}

interface AvailabilityData {
  availability: {
    [day: string]: {
      available: boolean;
      startTime?: string;
      endTime?: string;
    };
  }
  blockedDates: Array<{ date: string; reason?: string }>
  blockedRanges: Array<{
    startDate: string;
    endDate: string;
    reason?: string;
  }>
  companyBlockedDates: Array<{ date: string; reason?: string; isHoliday?: boolean }>
  companyBlockedRanges: Array<{
    startDate: string;
    endDate: string;
    reason?: string;
    isHoliday?: boolean;
  }>
}

export default function EmployeeAvailability({ className }: EmployeeAvailabilityProps) {
  const { user } = useAuth()
  const [, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData | null>(null)

  // Blocked dates and ranges states
  const [blockedDates, setBlockedDates] = useState<{ date: string; reason?: string }[]>([])
  const [blockedRanges, setBlockedRanges] = useState<{ startDate: string; endDate: string; reason?: string }[]>([])
  const [newBlockedDate, setNewBlockedDate] = useState('')
  const [newBlockedDateReason, setNewBlockedDateReason] = useState('')
  const [newRangeStart, setNewRangeStart] = useState('')
  const [newRangeEnd, setNewRangeEnd] = useState('')
  const [newRangeReason, setNewRangeReason] = useState('')

  // Fetch company schedule and employee blocked dates
  const fetchAvailability = async () => {
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

          // Load employee's personal blocked dates
          if (data.data.blockedDates) {
            setBlockedDates(data.data.blockedDates.map((item: { date: string; reason?: string }) => ({
              date: new Date(item.date).toISOString().split('T')[0],
              reason: item.reason
            })))
          }
          if (data.data.blockedRanges) {
            setBlockedRanges(data.data.blockedRanges.map((item: { startDate: string; endDate: string; reason?: string }) => ({
              startDate: new Date(item.startDate).toISOString().split('T')[0],
              endDate: new Date(item.endDate).toISOString().split('T')[0],
              reason: item.reason
            })))
          }

          console.log('✅ Company schedule and blocked dates loaded')
        } else {
          console.error('❌ Failed to load availability:', data.msg)
          toast.error(data.msg || 'Failed to load availability')
        }
      } else {
        console.error('❌ Failed to load availability - server error')
        toast.error('Failed to load availability')
      }
    } catch (error) {
      console.error('❌ Error loading availability:', error)
      toast.error('Failed to load availability')
    } finally {
      setLoading(false)
    }
  }

  // Save blocked dates (employees follow company weekly schedule)
  const saveBlockedDates = async () => {
    try {
      setSaving(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockedDates,
          blockedRanges
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast.success('✅ Blocked dates updated successfully!')

          // Reload to get updated effective availability
          await fetchAvailability()
        } else {
          toast.error(data.msg || 'Failed to update blocked dates')
        }
      } else {
        toast.error('Failed to update blocked dates')
      }
    } catch (error) {
      console.error('❌ Error updating blocked dates:', error)
      toast.error('Failed to update blocked dates')
    } finally {
      setSaving(false)
    }
  }

  // Add blocked date
  const addBlockedDate = () => {
    if (!newBlockedDate) {
      toast.error('Please select a date')
      return
    }
    setBlockedDates(prev => [...prev, { date: newBlockedDate, reason: newBlockedDateReason || undefined }])
    setNewBlockedDate('')
    setNewBlockedDateReason('')
  }

  // Remove blocked date
  const removeBlockedDate = (index: number) => {
    setBlockedDates(prev => prev.filter((_, i) => i !== index))
  }

  // Add blocked range
  const addBlockedRange = () => {
    if (!newRangeStart || !newRangeEnd) {
      toast.error('Please select both start and end dates')
      return
    }
    if (new Date(newRangeStart) > new Date(newRangeEnd)) {
      toast.error('Start date must be before end date')
      return
    }
    setBlockedRanges(prev => [...prev, {
      startDate: newRangeStart,
      endDate: newRangeEnd,
      reason: newRangeReason || undefined
    }])
    setNewRangeStart('')
    setNewRangeEnd('')
    setNewRangeReason('')
  }

  // Remove blocked range
  const removeBlockedRange = (index: number) => {
    setBlockedRanges(prev => prev.filter((_, i) => i !== index))
  }

  // Load availability on mount
  useEffect(() => {
    fetchAvailability()
  }, [])

  // Check if user is an employee
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

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Your Availability
        </CardTitle>
        <CardDescription>
          You follow the company&apos;s weekly schedule. Block specific dates when you&apos;re unavailable.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Company Schedule Display */}
        {availabilityData && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">
                Company Weekly Schedule
                <Badge variant="outline" className="ml-2">
                  Read-only
                </Badge>
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAvailability}
                disabled={saving}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="bg-muted/30 p-4 rounded-lg">
              <div className="space-y-2">
                {availabilityData.availability ? (
                  days.map((day, index) => {
                    const dayData = availabilityData.availability[day]
                    return (
                      <div key={day} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{dayLabels[index]}</span>
                        {dayData?.available ? (
                          <span className="text-green-600">
                            {dayData.startTime} - {dayData.endTime}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not available</span>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No company schedule set
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Blocked Dates Section */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Blocked Dates</Label>
          <p className="text-sm text-muted-foreground">Block specific dates when you&apos;re unavailable</p>

          {/* Add new blocked date */}
          <div className="flex gap-2">
            <Input
              type="date"
              value={newBlockedDate}
              onChange={(e) => setNewBlockedDate(e.target.value)}
              className="flex-1"
            />
            <Input
              type="text"
              placeholder="Reason (optional)"
              value={newBlockedDateReason}
              onChange={(e) => setNewBlockedDateReason(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addBlockedDate} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* List of blocked dates */}
          {blockedDates.length > 0 && (
            <div className="space-y-2">
              {blockedDates.map((blocked, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">
                      {new Date(blocked.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                    {blocked.reason && (
                      <p className="text-sm text-muted-foreground">{blocked.reason}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBlockedDate(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Blocked Ranges Section */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Blocked Date Ranges</Label>
          <p className="text-sm text-muted-foreground">Block date ranges for vacations or extended time off</p>

          {/* Add new blocked range */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="date"
                value={newRangeStart}
                onChange={(e) => setNewRangeStart(e.target.value)}
                placeholder="Start date"
                className="flex-1"
              />
              <Input
                type="date"
                value={newRangeEnd}
                onChange={(e) => setNewRangeEnd(e.target.value)}
                placeholder="End date"
                className="flex-1"
              />
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Reason (optional, e.g., 'Summer Vacation')"
                value={newRangeReason}
                onChange={(e) => setNewRangeReason(e.target.value)}
                className="flex-1"
              />
              <Button onClick={addBlockedRange} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Range
              </Button>
            </div>
          </div>

          {/* List of blocked ranges */}
          {blockedRanges.length > 0 && (
            <div className="space-y-2">
              {blockedRanges.map((range, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">
                      {new Date(range.startDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })} - {new Date(range.endDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                    {range.reason && (
                      <p className="text-sm text-muted-foreground">{range.reason}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBlockedRange(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button onClick={saveBlockedDates} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            <Save className="h-4 w-4 mr-2" />
            Save Blocked Dates
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}