'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Users, MapPin, Link, Video, FileText, X } from "lucide-react"
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

interface Meeting {
  _id: string
  projectId: string
  meetingType: 'planning' | 'team'
  title: string
  description?: string
  scheduledDate: string
  startTime: string
  endTime: string
  duration: number
  attendees: Array<{
    userId: string
    name: string
    role: 'professional' | 'team_member'
    status: 'pending' | 'accepted' | 'declined'
  }>
  location?: string
  meetingLink?: string
  isOnline: boolean
  status: 'scheduled' | 'cancelled' | 'completed' | 'rescheduled'
  agenda?: string
  notes?: string
  createdAt: string
}

interface MeetingsListProps {
  projectId?: string
  onEdit?: (meetingId: string) => void
  refreshTrigger?: number
}

export default function MeetingsList({ projectId, refreshTrigger }: MeetingsListProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed' | 'cancelled'>('all')

  useEffect(() => {
    fetchMeetings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, filter, refreshTrigger])

  const fetchMeetings = async () => {
    setLoading(true)
    try {
      let url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/meetings`

      if (projectId) {
        url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/meetings/project/${projectId}`
      } else if (filter !== 'all') {
        url += `?status=${filter}`
      }

      const response = await fetch(url, {
        credentials: 'include'
      })

      if (response.ok) {
        const result = await response.json()
        setMeetings(result.data || [])
      } else {
        toast.error('Failed to load meetings')
      }
    } catch (error) {
      console.error('Failed to fetch meetings:', error)
      toast.error('Failed to load meetings')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting?')) return

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/meetings/${meetingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cancellationReason: 'Cancelled by professional'
        })
      })

      if (response.ok) {
        toast.success('Meeting cancelled successfully')
        fetchMeetings()
      } else {
        toast.error('Failed to cancel meeting')
      }
    } catch (error) {
      console.error('Failed to cancel meeting:', error)
      toast.error('Failed to cancel meeting')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      scheduled: { variant: 'default', label: 'Scheduled' },
      completed: { variant: 'secondary', label: 'Completed' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
      rescheduled: { variant: 'outline', label: 'Rescheduled' }
    }
    const config = variants[status] || variants.scheduled
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getMeetingTypeBadge = (type: string) => {
    return type === 'planning' ? (
      <Badge variant="outline" className="bg-blue-50">Planning</Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-50">Team</Badge>
    )
  }

  const filteredMeetings = filter === 'all'
    ? meetings
    : meetings.filter(m => m.status === filter)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Meetings</CardTitle>
            <CardDescription>View and manage your scheduled meetings</CardDescription>
          </div>
          {!projectId && (
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                All
              </Button>
              <Button
                variant={filter === 'scheduled' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('scheduled')}
              >
                Scheduled
              </Button>
              <Button
                variant={filter === 'completed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('completed')}
              >
                Completed
              </Button>
              <Button
                variant={filter === 'cancelled' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('cancelled')}
              >
                Cancelled
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading meetings...</div>
        ) : filteredMeetings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No meetings found
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMeetings.map((meeting) => (
              <Card key={meeting._id} className="border-l-4 border-l-primary">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{meeting.title}</h3>
                          {getMeetingTypeBadge(meeting.meetingType)}
                          {getStatusBadge(meeting.status)}
                        </div>
                        {meeting.description && (
                          <p className="text-sm text-muted-foreground">{meeting.description}</p>
                        )}
                      </div>
                      {meeting.status === 'scheduled' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelMeeting(meeting._id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Meeting Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{format(parseISO(meeting.scheduledDate), 'PPP')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {meeting.startTime} - {meeting.endTime} ({meeting.duration} min)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {meeting.isOnline ? (
                          <>
                            <Video className="h-4 w-4" />
                            <span>Online Meeting</span>
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4" />
                            <span>{meeting.location}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{meeting.attendees.length} attendees</span>
                      </div>
                    </div>

                    {/* Meeting Link */}
                    {meeting.isOnline && meeting.meetingLink && (
                      <div className="flex items-center gap-2 text-sm">
                        <Link className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={meeting.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Join Meeting
                        </a>
                      </div>
                    )}

                    {/* Attendees */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Users className="h-4 w-4" />
                        Attendees
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {meeting.attendees.map((attendee) => (
                          <Badge
                            key={attendee.userId}
                            variant={
                              attendee.status === 'accepted'
                                ? 'default'
                                : attendee.status === 'declined'
                                ? 'destructive'
                                : 'secondary'
                            }
                            className="text-xs"
                          >
                            {attendee.name} ({attendee.status})
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Agenda */}
                    {meeting.agenda && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4" />
                          Agenda
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {meeting.agenda}
                        </p>
                      </div>
                    )}

                    {/* Notes */}
                    {meeting.notes && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Notes</div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {meeting.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
