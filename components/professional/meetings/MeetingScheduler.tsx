"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar as CalendarIcon, Clock, Users, MapPin, Link, ChevronLeft, ChevronRight } from "lucide-react"
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
  const [availableSlots, setAvailableSlots] = useState<string[]>([])

  // Fetch team members
  useEffect(() => {
    (async () => {
      try {
        // Get employees and current professional, then merge (professional first)
        const [empRes, meRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/list`, { credentials: 'include' }),
          fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/me`, { credentials: 'include' })
        ])

        let members: TeamMember[] = []
        if (empRes.ok) {
          const result = await empRes.json()
          type EmployeeApi = {
            _id: string
            name: string
            email?: string
            isActive?: boolean
          }
          const employees: EmployeeApi[] = result?.data?.employees || []
          members = employees.map((m: EmployeeApi) => ({
            _id: m._id,
            name: m.name,
            email: m.email,
            isActive: typeof m.isActive === 'boolean' ? m.isActive : true,
          }))
        }

        if (meRes.ok) {
          const me = await meRes.json()
          const user = me?.user
          if (user && user._id) {
            const selfMember: TeamMember = {
              _id: user._id,
              name: user.name,
              email: user.email,
              isActive: true,
            }
            members = [selfMember, ...members.filter(m => m._id !== selfMember._id)]
          }
        }

        setTeamMembers(members)
      } catch {
        toast.error('Failed to load team members')
      }
    })()
  }, [])

  // Generate calendar dates
  useEffect(() => {
    const dates: Date[] = []
    const start = startOfDay(currentMonth)
    for (let i = 0; i < 31; i++) dates.push(addDays(start, i))
    setCalendarDates(dates)
  }, [currentMonth])

  // Meeting type title
  useEffect(() => {
    setTitle(meetingType === 'planning' ? 'Project Planning Meeting' : 'Team Meeting')
  }, [meetingType])

  // Duration auto-calc
  useEffect(() => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      const d = (eh * 60 + em) - (sh * 60 + sm)
      if (d > 0) setDuration(d)
    }
  }, [startTime, endTime])

  // Fetch availability window for selected members
  useEffect(() => {
    if (selectedMembers.length === 0) return
    (async () => {
      setLoadingAvailability(true)
      try {
        const startDate = startOfDay(currentMonth)
        const endDate = addDays(startDate, 60)
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/meetings/availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ employeeIds: selectedMembers, startDate: startDate.toISOString(), endDate: endDate.toISOString() })
        })
        if (response.ok) {
          const result = await response.json()
          setAvailability(result?.data?.employees || [])
        } else {
          toast.error('Failed to load availability')
        }
      } catch {
        toast.error('Failed to load team availability')
      } finally {
        setLoadingAvailability(false)
      }
    })()
  }, [selectedMembers, currentMonth])

  // Compute available start slots (intersection of all members' free time)
  type Interval = { start:number; end:number }
  const toMinutes = (hhmm: string) => { const [h,m] = hhmm.split(':').map(Number); return h*60+m }
  const toHHMM = (mins:number) => { const h=Math.floor(mins/60), m=mins%60; const pad=(n:number)=>String(n).padStart(2,'0'); return `${pad(h)}:${pad(m)}` }
  const sameDay = (a: Date, b: Date) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
  const intersect = (a: Interval[], b: Interval[]) => { const out:Interval[]=[]; let i=0,j=0; while(i<a.length&&j<b.length){ const s=Math.max(a[i].start,b[j].start), e=Math.min(a[i].end,b[j].end); if(s<e) out.push({start:s,end:e}); if(a[i].end<b[j].end) i++; else j++; } return out }
  const subtract = (base: Interval[], blocks: Interval[]) => { let res=[...base]; for(const blk of blocks){ const next:Interval[]=[]; for(const iv of res){ if(blk.end<=iv.start||blk.start>=iv.end){ next.push(iv) } else { if(blk.start>iv.start) next.push({start:iv.start,end:blk.start}); if(blk.end<iv.end) next.push({start:blk.end,end:iv.end}); } } res=next } return res }

  useEffect(() => {
    if (!selectedDate || selectedMembers.length === 0 || availability.length === 0) { setAvailableSlots([]); return }
    const weekday = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][selectedDate.getDay()]
    const perMember: Interval[][] = []
    for (const member of availability) {
      const day = member.availability?.[weekday]
      if (!day || !day.available || !day.startTime || !day.endTime) { setAvailableSlots([]); return }
      let free: Interval[] = [{ start: toMinutes(day.startTime), end: toMinutes(day.endTime) }]
      const blocks: Interval[] = []
      if (member.blockedDates) {
        const hit = member.blockedDates.some((b) => sameDay(new Date(b.date), selectedDate))
        if (hit) free = []
      }
      if (free.length && member.blockedRanges) {
        for (const r of member.blockedRanges) {
          const rs = new Date(r.startDate), re = new Date(r.endDate)
          if (selectedDate >= startOfDay(rs) && selectedDate <= startOfDay(re)) blocks.push({ start:0, end:24*60 })
        }
      }
      if (free.length && member.existingMeetings) {
        for (const m of member.existingMeetings) {
          const d = new Date(m.date)
          if (sameDay(d, selectedDate)) blocks.push({ start: toMinutes(m.startTime), end: toMinutes(m.endTime) })
        }
      }
      if (blocks.length) free = subtract(free, blocks)
      if (!free.length) { setAvailableSlots([]); return }
      perMember.push(free)
    }
    let common = perMember[0]
    for (let i=1;i<perMember.length;i++) common = intersect(common, perMember[i])
    const nowMins = toMinutes(format(new Date(), 'HH:mm'))
    const slots: string[] = []
    for (const iv of common) {
      let t = iv.start
      while (t + duration <= iv.end) {
        if (!sameDay(selectedDate, new Date()) || t >= nowMins) slots.push(toHHMM(t))
        t += 15
      }
    }
    setAvailableSlots(slots)
  }, [availability, selectedMembers, selectedDate, duration])

  const isDayAvailable = (date: Date): boolean => {
    if (isBefore(date, startOfDay(new Date()))) return false
    if (!availability || availability.length === 0) return true
    for (const member of availability) {
      if (member.blockedDates?.some((b) => format(parseISO(b.date.toString()), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'))) return false
      if (member.blockedRanges?.some((r) => isWithinInterval(date, { start: parseISO(r.startDate.toString()), end: parseISO(r.endDate.toString()) }))) return false
    }
    return true
  }

  const handleMemberToggle = (memberId: string) => {
    setSelectedMembers(prev => prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId])
  }

  const handleCreateMeeting = async () => {
    if (!title.trim()) { toast.error('Meeting title is required'); return }
    if (!selectedDate) { toast.error('Please select a meeting date'); return }
    if (!startTime || !endTime) { toast.error('Please select meeting time'); return }
    if (selectedMembers.length === 0) { toast.error('Please select at least one team member'); return }
    if (isOnline && !meetingLink.trim()) { toast.error('Please provide a meeting link for online meetings'); return }
    if (!isOnline && !location.trim()) { toast.error('Please provide a location for in-person meetings'); return }
    if (availableSlots.length > 0 && !availableSlots.includes(startTime)) { toast.error('Selected time is not available for all participants'); return }

    setCreating(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/meetings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ projectId, meetingType, title, description, scheduledDate: selectedDate.toISOString(), startTime, endTime, duration, isOnline, location, meetingLink, attendeeIds: selectedMembers })
      })
      if (response.ok) {
        toast.success('Meeting created')
        onMeetingCreated?.()
      } else {
        toast.error('Failed to create meeting')
      }
    } catch {
      toast.error('Failed to create meeting')
    } finally { setCreating(false) }
  }

  return (
    <Card>
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarIcon className="h-5 w-5" />
          Schedule Meeting
        </CardTitle>
        <CardDescription>Pick a date and time that works for everyone</CardDescription>
      </CardHeader>
      <CardContent className="px-4 md:px-6 space-y-4">
        {/* Type */}
        <div className="space-y-2">
          <Label>Meeting Type</Label>
          <Select value={meetingType} onValueChange={(v: 'planning' | 'team') => setMeetingType(v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="team">Team</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {/* Date picker */}
        <div className="space-y-2">
          <Label>Select Date *</Label>
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addDays(currentMonth, -31))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addDays(currentMonth, 31))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {calendarDates.map((date) => {
                const isBlocked = selectedMembers.length > 0 && !isDayAvailable(date)
                const isSelected = selectedDate && format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
                const isPast = isBefore(date, startOfDay(new Date()))
                if (isBlocked) return null
                return (
                  <Button key={date.toISOString()} variant={isSelected ? "default" : "outline"} size="sm" disabled={isPast} onClick={() => setSelectedDate(date)} className={`h-12 ${isPast ? 'opacity-50' : ''}`}>
                    <div className="text-center"><div className="text-xs">{format(date, 'EEE')}</div><div>{format(date, 'd')}</div></div>
                  </Button>
                )
              })}
            </div>
            {loadingAvailability && <div className="text-center mt-4 text-sm text-muted-foreground">Loading availability...</div>}
          </div>
        </div>

        {/* Time Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startTime" className="flex items-center gap-2"><Clock className="h-4 w-4" />Start Time *</Label>
            {availableSlots.length > 0 ? (
              <select id="startTime" className="h-9 w-full border rounded px-2" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                {availableSlots.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            ) : (
              <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="endTime">End Time *</Label>
            <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div className="text-sm text-muted-foreground">Duration: {duration} minutes</div>

        {/* Online / Location */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox id="isOnline" checked={isOnline} onCheckedChange={(c) => setIsOnline(!!c)} />
            <label htmlFor="isOnline" className="text-sm font-medium cursor-pointer">This is an online meeting</label>
          </div>
          {isOnline ? (
            <div className="space-y-2">
              <Label htmlFor="meetingLink" className="flex items-center gap-2"><Link className="h-4 w-4" />Meeting Link *</Label>
              <Input id="meetingLink" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://zoom.us/j/..." />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-2"><MapPin className="h-4 w-4" />Location *</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Enter meeting location" />
            </div>
          )}
        </div>

        {/* Agenda */}
        <div className="space-y-2">
          <Label htmlFor="agenda">Agenda</Label>
          <Textarea id="agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={4} maxLength={2000} />
        </div>

        {/* Team members */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Users className="h-4 w-4" />Select Team Members *</Label>
          <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
            {teamMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members available</p>
            ) : (
              teamMembers.map((member) => (
                <div key={member._id} className="flex items-center space-x-2">
                  <Checkbox id={member._id} checked={selectedMembers.includes(member._id)} onCheckedChange={() => handleMemberToggle(member._id)} />
                  <label htmlFor={member._id} className="text-sm font-medium cursor-pointer flex-1">{member.name} {member.email && `(${member.email})`}</label>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button onClick={handleCreateMeeting} disabled={creating || selectedMembers.length === 0} className="flex-1">{creating ? 'Creating...' : 'Create Meeting'}</Button>
          <Button variant="outline" onClick={() => { setTitle(''); setDescription(''); setAgenda(''); setMeetingLink(''); setLocation(''); }} disabled={creating}>Reset</Button>
        </div>
      </CardContent>
    </Card>
  )
}


