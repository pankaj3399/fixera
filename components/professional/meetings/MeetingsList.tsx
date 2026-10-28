'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Users, MapPin, Link, Video, FileText, X } from "lucide-react"
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { useFormatLocale } from '@/lib/i18n/useFormatLocale'

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
    role: 'professional' | 'employee'
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
  const t = useTranslations('proProjects')
  const { dateFns } = useFormatLocale()
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
        toast.error(t('meetingsList.errors.load'))
      }
    } catch (error) {
      console.error('Failed to fetch meetings:', error)
      toast.error(t('meetingsList.errors.load'))
    } finally {
      setLoading(false)
    }
  }

  const handleCancelMeeting = async (meetingId: string) => {
    if (!confirm(t('meetingsList.cancelConfirm'))) return

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
        toast.success(t('meetingsList.cancelled'))
        fetchMeetings()
      } else {
        toast.error(t('meetingsList.errors.cancel'))
      }
    } catch (error) {
      console.error('Failed to cancel meeting:', error)
      toast.error(t('meetingsList.errors.cancel'))
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      scheduled: { variant: 'default' },
      completed: { variant: 'secondary' },
      cancelled: { variant: 'destructive' },
      rescheduled: { variant: 'outline' }
    }
    const getStatusLabel = (value: string) => {
      switch (value) {
        case 'scheduled':
          return t('meetingStatus.scheduled')
        case 'completed':
          return t('meetingStatus.completed')
        case 'cancelled':
          return t('meetingStatus.cancelled')
        case 'rescheduled':
          return t('meetingStatus.rescheduled')
        default:
          return value
      }
    }
    const config = variants[status] || variants.scheduled
    return <Badge variant={config.variant}>{getStatusLabel(status)}</Badge>
  }

  const getMeetingTypeBadge = (type: string) => {
    return type === 'planning' ? (
      <Badge variant="outline" className="bg-blue-50">{t('meetingType.planning')}</Badge>
    ) : (
      <Badge variant="outline" className="bg-purple-50">{t('meetingType.team')}</Badge>
    )
  }

  const getAttendeeStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return t('attendeeStatus.pending')
      case 'accepted':
        return t('attendeeStatus.accepted')
      case 'declined':
        return t('attendeeStatus.declined')
      default:
        return status
    }
  }

  const filteredMeetings = filter === 'all'
    ? meetings
    : meetings.filter(m => m.status === filter)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('meetingsList.title')}</CardTitle>
            <CardDescription>{t('meetingsList.description')}</CardDescription>
          </div>
          {!projectId && (
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                {t('meetingsList.all')}
              </Button>
              <Button
                variant={filter === 'scheduled' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('scheduled')}
              >
                {t('meetingStatus.scheduled')}
              </Button>
              <Button
                variant={filter === 'completed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('completed')}
              >
                {t('meetingStatus.completed')}
              </Button>
              <Button
                variant={filter === 'cancelled' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('cancelled')}
              >
                {t('meetingStatus.cancelled')}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gray-200/70 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-gray-200/70 animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-gray-200/70 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('meetingsList.noMeetings')}
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
                        <span>{format(parseISO(meeting.scheduledDate), 'PPP', { locale: dateFns })}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {meeting.startTime} - {meeting.endTime} {t('meetingsList.duration', { count: meeting.duration })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {meeting.isOnline ? (
                          <>
                            <Video className="h-4 w-4" />
                            <span>{t('meetingsList.onlineMeeting')}</span>
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
                        <span>{t('meetingsList.attendees', { count: meeting.attendees.length })}</span>
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
                          {t('meetingsList.joinMeeting')}
                        </a>
                      </div>
                    )}

                    {/* Attendees */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Users className="h-4 w-4" />
                        {t('meetingsList.attendeesTitle')}
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
                            {attendee.name} ({getAttendeeStatusLabel(attendee.status)})
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Agenda */}
                    {meeting.agenda && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4" />
                          {t('meetingsList.agenda')}
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {meeting.agenda}
                        </p>
                      </div>
                    )}

                    {/* Notes */}
                    {meeting.notes && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{t('meetingsList.notes')}</div>
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
