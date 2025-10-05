'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar as CalendarIcon, Clock, Users, MapPin, Link, X, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from 'sonner'
import { format, addDays, isBefore, startOfDay, isWithinInterval, parseISO } from 'date-fns'

interface TeamMember {
  _id: string
  name: string
  email?: string
  isActive?: boolean
}

interface TeamAvailability {
  userId: string
  name: string
  email?: string
  availability: {
    [key: string]: {
      available: boolean
      startTime?: string
      endTime?: string
    }
  }
  blockedDates: Array<{
    date: Date
    reason?: string
  }>
  blockedRanges: Array<{
    startDate: Date
    endDate: Date
    reason?: string
  }>
  existingMeetings: Array<{
    meetingId: string
    date: Date
    startTime: string
    endTime: string
    duration: number
  }>
  availabilityPreference: 'personal' | 'same_as_company'
}

interface MeetingSchedulerProps {
  projectId: string
  onMeetingCreated?: () => void
}

export default function MeetingScheduler({ projectId, onMeetingCreated }: MeetingSchedulerProps) {
  const [meetingType, setMeetingType] = useState<'planning' | 'team'>('planning')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [agenda, setAgenda] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [duration, setDuration] = useState(60)
  const [isOnline, setIsOnline] = useState(false)
  const [location, setLocation] = useState('')
  const [meetingLink, setMeetingLink] = useState('')

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [availability, setAvailability] = useState<TeamAvailability[]>([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [creating, setCreating] = useState(false)

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calendarDates, setCalendarDates] = useState<Date[]>([])

  // Fetch team members
  useEffect(() => {
    fetchTeamMembers()
  }, [])

  // Generate calendar dates
  useEffect(() => {
    generateCalendarDates()
  }, [currentMonth])

  // Update meeting type title
  useEffect(() => {
    if (meetingType === 'planning') {
      setTitle('Project Planning Meeting')
    } else {
      setTitle('Team Meeting')
    }
  }, [meetingType])

  // Calculate duration when time changes
  useEffect(() => {
    if (startTime && endTime) {
      const [startHour, startMin] = startTime.split(':').map(Number)
      const [endHour, endMin] = endTime.split(':').map(Number)
      const calculatedDuration = (endHour * 60 + endMin) - (startHour * 60 + startMin)
      if (calculatedDuration > 0) {
        setDuration(calculatedDuration)
      }
    }
  }, [startTime, endTime])

  // Fetch availability when team members are selected
  useEffect(() => {
    if (selectedMembers.length > 0) {
      fetchTeamAvailability()
    }
  }, [selectedMembers])

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/team/members`, {
        credentials: 'include'
      })
      if (response.ok) {
        const result = await response.json()
        setTeamMembers(result.data?.teamMembers || [])
      }
    } catch (error) {
      console.error('Failed to fetch team members:', error)
      toast.error('Failed to load team members')
    }
  }

  const fetchTeamAvailability = async () => {
    if (selectedMembers.length === 0) return

    setLoadingAvailability(true)
    try {
      const startDate = startOfDay(currentMonth)
      const endDate = addDays(startDate, 60) // Fetch 60 days of availability

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/meetings/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          teamMemberIds: selectedMembers,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
      })

      if (response.ok) {
        const result = await response.json()
        setAvailability(result.data.teamMembers || [])
      } else {
        toast.error('Failed to load availability')
      }
    } catch (error) {
      console.error('Failed to fetch availability:', error)
      toast.error('Failed to load team availability')
    } finally {
      setLoadingAvailability(false)
    }
  }

  const generateCalendarDates = () => {
    const dates: Date[] = []
    const start = startOfDay(currentMonth)
    for (let i = 0; i < 31; i++) {
      dates.push(addDays(start, i))
    }
    setCalendarDates(dates)
  }

  const isDayAvailable = (date: Date): boolean => {
    if (isBefore(date, startOfDay(new Date()))) return false

    // If no team members selected or no availability data, show all future dates
    if (!availability || availability.length === 0) return true

    for (const member of availability) {
      // Check if day has blocked dates
      if (member.blockedDates && member.blockedDates.length > 0) {
        const isBlocked = member.blockedDates.some(blocked =>
          format(parseISO(blocked.date.toString()), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
        )
        if (isBlocked) return false
      }

      // Check if day is in blocked range
      if (member.blockedRanges && member.blockedRanges.length > 0) {
        const isInBlockedRange = member.blockedRanges.some(range =>
          isWithinInterval(date, {
            start: parseISO(range.startDate.toString()),
            end: parseISO(range.endDate.toString())
          })
        )
        if (isInBlockedRange) return false
      }
    }

    // If not explicitly blocked, the day is available
    return true
  }

  const handleMemberToggle = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    )
  }

  const handleCreateMeeting = async () => {
    // Validation
    if (!title.trim()) {
      toast.error('Meeting title is required')
      return
    }

    if (!selectedDate) {
      toast.error('Please select a meeting date')
      return
    }

    if (!startTime || !endTime) {
      toast.error('Please select meeting time')
      return
    }

    if (selectedMembers.length === 0) {
      toast.error('Please select at least one team member')
      return
    }

    if (isOnline && !meetingLink.trim()) {
      toast.error('Please provide a meeting link for online meetings')
      return
    }

    if (!isOnline && !location.trim()) {
      toast.error('Please provide a location for in-person meetings')
      return
    }

    setCreating(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId,
          meetingType,
          title,
          description,
          scheduledDate: selectedDate.toISOString(),
          startTime,
          endTime,
          duration,
          attendeeIds: selectedMembers,
          location: isOnline ? undefined : location,
          meetingLink: isOnline ? meetingLink : undefined,
          isOnline,
          agenda
        })
      })

      if (response.ok) {
        toast.success('Meeting created successfully')
        resetForm()
        if (onMeetingCreated) onMeetingCreated()
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to create meeting')
      }
    } catch (error) {
      console.error('Failed to create meeting:', error)
      toast.error('Failed to create meeting')
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setMeetingType('planning')
    setTitle('Project Planning Meeting')
    setDescription('')
    setAgenda('')
    setSelectedDate(new Date())
    setStartTime('09:00')
    setEndTime('10:00')
    setDuration(60)
    setIsOnline(false)
    setLocation('')
    setMeetingLink('')
    setSelectedMembers([])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Schedule Meeting
        </CardTitle>
        <CardDescription>
          Create planning or team meetings for renovation projects
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Meeting Type */}
        <div className="space-y-2">
          <Label>Meeting Type</Label>
          <Select value={meetingType} onValueChange={(value: 'planning' | 'team') => setMeetingType(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planning">Planning Meeting</SelectItem>
              <SelectItem value="team">Team Meeting</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Meeting Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter meeting title"
            maxLength={200}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter meeting description (optional)"
            rows={3}
            maxLength={1000}
          />
        </div>

        {/* Team Members Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Select Team Members *
          </Label>
          <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
            {teamMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members available</p>
            ) : (
              teamMembers.map((member) => (
                <div key={member._id} className="flex items-center space-x-2">
                  <Checkbox
                    id={member._id}
                    checked={selectedMembers.includes(member._id)}
                    onCheckedChange={() => handleMemberToggle(member._id)}
                  />
                  <label
                    htmlFor={member._id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                  >
                    {member.name} {member.email && `(${member.email})`}
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Calendar for date selection */}
        <div className="space-y-2">
          <Label>Select Date *</Label>
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(addDays(currentMonth, -31))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(addDays(currentMonth, 31))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {calendarDates.map((date) => {
                const isBlocked = selectedMembers.length > 0 && !isDayAvailable(date)
                const isSelected = selectedDate && format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
                const isPast = isBefore(date, startOfDay(new Date()))

                // Hide blocked dates completely
                if (isBlocked) return null

                return (
                  <Button
                    key={date.toISOString()}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    disabled={isPast}
                    onClick={() => setSelectedDate(date)}
                    className={`h-12 ${isPast ? 'opacity-50' : ''}`}
                  >
                    <div className="text-center">
                      <div className="text-xs">{format(date, 'EEE')}</div>
                      <div>{format(date, 'd')}</div>
                    </div>
                  </Button>
                )
              })}
            </div>

            {loadingAvailability && (
              <div className="text-center mt-4 text-sm text-muted-foreground">
                Loading availability...
              </div>
            )}
          </div>
        </div>

        {/* Time Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startTime" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Start Time *
            </Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endTime">End Time *</Label>
            <Input
              id="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          Duration: {duration} minutes
        </div>

        {/* Meeting Location */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isOnline"
              checked={isOnline}
              onCheckedChange={(checked) => setIsOnline(checked as boolean)}
            />
            <label htmlFor="isOnline" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
              This is an online meeting
            </label>
          </div>

          {isOnline ? (
            <div className="space-y-2">
              <Label htmlFor="meetingLink" className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                Meeting Link *
              </Label>
              <Input
                id="meetingLink"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://zoom.us/j/..."
                maxLength={500}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location *
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter meeting location"
                maxLength={300}
              />
            </div>
          )}
        </div>

        {/* Agenda */}
        <div className="space-y-2">
          <Label htmlFor="agenda">Agenda</Label>
          <Textarea
            id="agenda"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder="Enter meeting agenda (optional)"
            rows={4}
            maxLength={2000}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleCreateMeeting}
            disabled={creating || selectedMembers.length === 0}
            className="flex-1"
          >
            {creating ? 'Creating...' : 'Create Meeting'}
          </Button>
          <Button
            variant="outline"
            onClick={resetForm}
            disabled={creating}
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
