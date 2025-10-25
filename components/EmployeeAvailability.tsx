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
  availabilityPreference: 'personal' | 'same_as_company'
  effectiveAvailability: {
    [day: string]: {
      isAvailable: boolean;
      startTime?: string;
      endTime?: string;
    };
  }
  effectiveBlockedDates: Date[]
  effectiveBlockedRanges: {
    startDate: string;
    endDate: string;
    reason?: string;
  }[]
}

export default function EmployeeAvailability({ className }: EmployeeAvailabilityProps) {
  const { user } = useAuth()
  const [, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData | null>(null)
  const [availabilityPreference, setAvailabilityPreference] = useState<'personal' | 'same_as_company'>('personal')

  // Availability states for personal schedule
  const [availability, setAvailability] = useState({
    monday: { available: false, startTime: '09:00', endTime: '17:00' },
    tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
    wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
    thursday: { available: false, startTime: '09:00', endTime: '17:00' },
    friday: { available: false, startTime: '09:00', endTime: '17:00' },
    saturday: { available: false, startTime: '09:00', endTime: '17:00' },
    sunday: { available: false, startTime: '09:00', endTime: '17:00' }
  })

  // Blocked dates and ranges states
  const [blockedDates, setBlockedDates] = useState<{ date: string; reason?: string }[]>([])
  const [blockedRanges, setBlockedRanges] = useState<{ startDate: string; endDate: string; reason?: string }[]>([])
  const [newBlockedDate, setNewBlockedDate] = useState('')
  const [newBlockedDateReason, setNewBlockedDateReason] = useState('')
  const [newRangeStart, setNewRangeStart] = useState('')
  const [newRangeEnd, setNewRangeEnd] = useState('')
  const [newRangeReason, setNewRangeReason] = useState('')

  // Fetch effective availability
  const fetchAvailability = async () => {
    try {
      setLoading(true)

      // Fetch user data to get blocked dates and ranges
      const userResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })

      if (userResponse.ok) {
        const userData = await userResponse.json()
        if (userData.success && userData.user) {
          // Load blocked dates and ranges
          if (userData.user.blockedDates) {
            setBlockedDates(userData.user.blockedDates.map((item: { date: string; reason?: string }) => ({
              date: new Date(item.date).toISOString().split('T')[0],
              reason: item.reason
            })))
          }
          if (userData.user.blockedRanges) {
            setBlockedRanges(userData.user.blockedRanges.map((item: { startDate: string; endDate: string; reason?: string }) => ({
              startDate: new Date(item.startDate).toISOString().split('T')[0],
              endDate: new Date(item.endDate).toISOString().split('T')[0],
              reason: item.reason
            })))
          }
          if (userData.user.availability) {
            setAvailability(userData.user.availability)
          }
        }
      }

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
          setAvailabilityPreference(data.data.availabilityPreference)

          console.log('✅ Availability loaded')
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

  // Save availability preference
  const saveAvailabilityPreference = async (preference: 'personal' | 'same_as_company') => {
    try {
      setSaving(true)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/availability/preference`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ availabilityPreference: preference })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAvailabilityPreference(preference)
          toast.success('✅ Availability preference updated!')
          
          // Reload to get updated effective availability
          await fetchAvailability()
        } else {
          toast.error(data.msg || 'Failed to update preference')
        }
      } else {
        toast.error('Failed to update preference')
      }
    } catch (error) {
      console.error('❌ Error updating preference:', error)
      toast.error('Failed to update preference')
    } finally {
      setSaving(false)
    }
  }

  // Save personal availability
  const savePersonalAvailability = async () => {
    try {
      setSaving(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          availability,
          blockedDates,
          blockedRanges
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast.success('✅ Availability updated successfully!')

          // Reload to get updated effective availability
          await fetchAvailability()
        } else {
          toast.error(data.msg || 'Failed to update availability')
        }
      } else {
        toast.error('Failed to update availability')
      }
    } catch (error) {
      console.error('❌ Error updating availability:', error)
      toast.error('Failed to update availability')
    } finally {
      setSaving(false)
    }
  }

  // Handle day availability toggle
  const toggleDayAvailability = (day: string, available: boolean) => {
    setAvailability(prev => ({
      ...prev,
      [day]: { ...prev[day as keyof typeof prev], available }
    }))
  }

  // Handle time change
  const updateTime = (day: string, timeType: 'startTime' | 'endTime', time: string) => {
    setAvailability(prev => ({
      ...prev,
      [day]: { ...prev[day as keyof typeof prev], [timeType]: time }
    }))
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
          Manage your work schedule and availability preference
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Availability Preference */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Availability Preference</Label>
          
          <div className="space-y-3">
            <div 
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                availabilityPreference === 'personal' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted hover:border-muted-foreground/20'
              }`}
              onClick={() => saveAvailabilityPreference('personal')}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full border-2 ${
                  availabilityPreference === 'personal' 
                    ? 'border-primary bg-primary' 
                    : 'border-muted-foreground'
                }`}>
                  {availabilityPreference === 'personal' && (
                    <div className="w-full h-full rounded-full bg-white scale-50" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span className="font-medium">Personal Schedule</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Set and manage your own availability
                  </p>
                </div>
              </div>
            </div>

            <div 
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                availabilityPreference === 'same_as_company' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted hover:border-muted-foreground/20'
              }`}
              onClick={() => saveAvailabilityPreference('same_as_company')}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full border-2 ${
                  availabilityPreference === 'same_as_company' 
                    ? 'border-primary bg-primary' 
                    : 'border-muted-foreground'
                }`}>
                  {availabilityPreference === 'same_as_company' && (
                    <div className="w-full h-full rounded-full bg-white scale-50" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    <span className="font-medium">Same as Company</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Follow your company&apos;s availability schedule
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Badge variant={availabilityPreference === 'personal' ? 'default' : 'secondary'}>
              Current: {availabilityPreference === 'personal' ? 'Personal Schedule' : 'Company Schedule'}
            </Badge>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAvailability}
              disabled={saving}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Personal Availability Editor (only when personal preference) */}
        {availabilityPreference === 'personal' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Personal Schedule</Label>
              <Button onClick={savePersonalAvailability} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                <Save className="h-4 w-4 mr-2" />
                Save Schedule
              </Button>
            </div>
            
            <div className="space-y-3">
              {days.map((day, index) => (
                <div key={day} className="flex items-center space-x-4 p-3 border rounded-lg">
                  <div className="w-24 text-sm font-medium">
                    {dayLabels[index]}
                  </div>
                  
                  <Switch
                    checked={availability[day as keyof typeof availability].available}
                    onCheckedChange={(checked) => toggleDayAvailability(day, checked)}
                  />
                  
                  {availability[day as keyof typeof availability].available && (
                    <div className="flex items-center space-x-2 ml-4">
                      <Select 
                        value={availability[day as keyof typeof availability].startTime}
                        onValueChange={(value) => updateTime(day, 'startTime', value)}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, '0')
                            return (
                              <SelectItem key={`${hour}:00`} value={`${hour}:00`}>
                                {hour}:00
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      
                      <span className="text-muted-foreground">to</span>
                      
                      <Select 
                        value={availability[day as keyof typeof availability].endTime}
                        onValueChange={(value) => updateTime(day, 'endTime', value)}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, '0')
                            return (
                              <SelectItem key={`${hour}:00`} value={`${hour}:00`}>
                                {hour}:00
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Effective Availability Display */}
        {availabilityData && (
          <div className="space-y-3">
            <Label className="text-base font-medium">
              Current Effective Schedule
              <Badge variant="outline" className="ml-2">
                {availabilityPreference === 'personal' ? 'Personal' : 'Company'}
              </Badge>
            </Label>

            <div className="bg-muted/30 p-4 rounded-lg">
              <div className="space-y-2">
                {availabilityData.effectiveAvailability ? (
                  days.map((day, index) => {
                    const dayData = availabilityData.effectiveAvailability[day]
                    return (
                      <div key={day} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{dayLabels[index]}</span>
                        {dayData?.isAvailable ? (
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
                    No availability schedule set
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
      </CardContent>
    </Card>
  )
}