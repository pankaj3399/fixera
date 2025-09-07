'use client'

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  Calendar, 
  Clock, 
  Building,
  User,
  Loader2,
  Save,
  RefreshCw
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"

interface TeamMemberAvailabilityProps {
  className?: string
}

interface AvailabilityData {
  availabilityPreference: 'personal' | 'same_as_company'
  effectiveAvailability: any
  effectiveBlockedDates: Date[]
  effectiveBlockedRanges: any[]
}

export default function TeamMemberAvailability({ className }: TeamMemberAvailabilityProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
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

  // Check if user is a team member
  if (user?.role !== 'team_member') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Team Member Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-2" />
            <p className="text-sm">This feature is only available for team members</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Fetch effective availability
  const fetchAvailability = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/team/availability/effective`, {
        method: 'GET',
        credentials: 'include'
      })
      
      const data = await response.json()
      
      if (data.success) {
        setAvailabilityData(data.data)
        setAvailabilityPreference(data.data.availabilityPreference)
        
        // If personal preference, load personal availability
        if (data.data.availabilityPreference === 'personal' && data.data.effectiveAvailability) {
          setAvailability(data.data.effectiveAvailability)
        }
      } else {
        console.error('Failed to fetch availability:', data.msg)
        toast.error('Failed to load availability')
      }
    } catch (error) {
      console.error('Error fetching availability:', error)
      toast.error('Failed to load availability')
    } finally {
      setLoading(false)
    }
  }

  // Update availability preference
  const updatePreference = async (preference: 'personal' | 'same_as_company') => {
    try {
      setSaving(true)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/team/availability/preference`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ availabilityPreference: preference })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setAvailabilityPreference(preference)
        toast.success('Availability preference updated')
        fetchAvailability() // Refresh to get new effective availability
      } else {
        toast.error(data.msg || 'Failed to update preference')
      }
    } catch (error) {
      console.error('Error updating preference:', error)
      toast.error('Failed to update preference')
    } finally {
      setSaving(false)
    }
  }

  // Update personal availability
  const updatePersonalAvailability = async () => {
    try {
      setSaving(true)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/team/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ availability })
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success('Personal availability updated')
        fetchAvailability() // Refresh data
      } else {
        toast.error(data.msg || 'Failed to update availability')
      }
    } catch (error) {
      console.error('Error updating availability:', error)
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

  // Load availability on mount
  useEffect(() => {
    fetchAvailability()
  }, [])

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Team Member Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading availability...</span>
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
              onClick={() => updatePreference('personal')}
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
              onClick={() => updatePreference('same_as_company')}
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
                    Follow your company's availability schedule
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
              <Button onClick={updatePersonalAvailability} disabled={saving}>
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
                    No availability schedule set
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}