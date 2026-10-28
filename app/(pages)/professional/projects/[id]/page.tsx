'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import MeetingScheduler from "@/components/professional/meetings/MeetingScheduler"
import WeeklyAvailabilityCalendar, { type CalendarEvent } from "@/components/calendar/WeeklyAvailabilityCalendar"
import { getAuthToken } from "@/lib/utils"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Edit,
  Send,
  Briefcase,
  MapPin,
  Users,
  Settings,
  HelpCircle,
  MessageSquare,
  ImageIcon,
  Award,
  Shield,
  ExternalLink,

} from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const MAX_BOOKINGS = 100

// Extended interfaces to match the full project model
interface ICertification {
  name: string
  fileUrl: string
  uploadedAt: string
  isRequired: boolean
}

interface IDistance {
  address: string
  useCompanyAddress: boolean
  maxKmRange?: number
  noBorders: boolean
}

interface IIntakeMeeting {
  enabled: boolean
  resources: string[]
}

interface IRenovationPlanning {
  fixeraManaged?: boolean
  resources: string[]
}

interface IMedia {
  images: string[]
  video?: string
}

interface IPricing {
  type: 'fixed' | 'unit' | 'rfq'
  amount?: number
  priceRange?: { min: number; max: number }
  minProjectValue?: number
}

interface IIncludedItem {
  name: string
  description?: string
  isCustom: boolean
}

interface IExecutionDuration {
  value?: number
  unit: 'hours' | 'days'
  range?: { min?: number; max?: number }
}

interface IBuffer {
  value: number
  unit: 'hours' | 'days'
}

interface IIntakeDuration {
  value: number
  unit: 'hours' | 'days'
  buffer?: number
}

interface ISubproject {
  name: string
  description: string
  projectType?: string[]
  customProjectType?: string
  professionalInputs?: Array<{
    fieldName: string
    value: string | number | { min: number; max: number }
  }>
  pricing: IPricing
  included: IIncludedItem[]
  materialsIncluded: boolean
  preparationDuration?: { value?: number; unit: 'hours' | 'days' }
  executionDuration: IExecutionDuration
  buffer?: IBuffer
  intakeDuration?: IIntakeDuration
  warrantyPeriod: { value: number; unit: 'months' | 'years' }
}

interface IExtraOption {
  name: string
  description?: string
  price: number
  isCustom: boolean
}

interface ITermCondition {
  name: string
  description: string
  type?: 'condition' | 'warning'
  additionalCost?: number
  isCustom: boolean
}

interface IFAQ {
  question: string
  answer: string
  isGenerated: boolean
}

interface IRFQQuestion {
  question: string
  type: 'text' | 'multiple_choice' | 'attachment'
  options?: string[]
  isRequired: boolean
  professionalAttachments?: string[]
}

interface IPostBookingQuestion {
  question: string
  type: 'text' | 'multiple_choice' | 'attachment'
  options?: string[]
  isRequired: boolean
  professionalAttachments?: string[]
}

interface IQualityCheck {
  category: string
  status: 'passed' | 'failed' | 'warning'
  message: string
  checkedAt: string
}

interface Project {
  _id: string
  // Step 1: Basic Info
  professionalId: string
  category: string
  service: string
  areaOfWork?: string
  certifications: ICertification[]
  distance: IDistance
  intakeMeeting?: IIntakeMeeting
  renovationPlanning?: IRenovationPlanning
  resources: string[]
  projectType: string[]
  description: string
  priceModel: 'fixed' | 'meter' | 'm2' | 'hour' | 'day' | 'room'
  keywords: string[]
  title: string
  media: IMedia

  // Step 2: Subprojects
  subprojects: ISubproject[]

  // Step 3: Extra Options
  extraOptions: IExtraOption[]
  termsConditions: ITermCondition[]

  // Step 4: FAQ
  faq: IFAQ[]

  // Step 5: RFQ Questions
  rfqQuestions: IRFQQuestion[]

  // Step 6: Post-Booking Questions
  postBookingQuestions: IPostBookingQuestion[]

  // Step 7: Custom Confirmation
  customConfirmationMessage?: string

  // Step 8: Review & Status
  status: 'draft' | 'pending_approval' | 'published' | 'rejected' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'awaiting_confirmation' | 'closed' | 'disputed'
  qualityChecks: IQualityCheck[]
  adminFeedback?: string
  submittedAt?: string
  approvedAt?: string
  approvedBy?: string

  // Auto-save tracking
  autoSaveTimestamp: string
  currentStep: number

  // Metadata
  createdAt: string
  updatedAt: string
}

export default function ProjectDetailPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const t = useTranslations("proProjects")
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [showMeetingScheduler, setShowMeetingScheduler] = useState(false)
  const [refreshMeetings, setRefreshMeetings] = useState(0)
  const [bookingEvents, setBookingEvents] = useState<CalendarEvent[]>([])
  const [calendarDayStart, setCalendarDayStart] = useState('09:00')
  const [calendarDayEnd, setCalendarDayEnd] = useState('17:00')
  const [calendarVisibleDays, setCalendarVisibleDays] = useState<number[]>([1, 2, 3, 4, 5])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login?redirect=/professional/projects/manage')
    } else if (!loading && user?.role !== 'professional') {
      router.push('/dashboard')
    }
  }, [isAuthenticated, loading, router, user])

  // Fetch bookings and working hours for the calendar
  useEffect(() => {
    if (!project || !user) return

    const controller = new AbortController()
    const { signal } = controller
    let mounted = true

    const resetCalendarState = () => {
      if (!mounted || signal.aborted) return
      setBookingEvents([])
      setCalendarDayStart('09:00')
      setCalendarDayEnd('17:00')
      setCalendarVisibleDays([1, 2, 3, 4, 5])
    }

    const fetchBookingsAndHours = async () => {
      try {
        // Fetch bookings and working hours in parallel
        const token = getAuthToken()
        const [bookingsRes, hoursRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/bookings/my-bookings?limit=${MAX_BOOKINGS}`, {
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal
          }),
          fetch(`${API_BASE_URL}/api/public/projects/${project._id}/working-hours`, {
            signal
          })
        ])

        // Process bookings and hours independently
        const events: CalendarEvent[] = []

        // Process bookings (independent of hours response)
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json()
          if (!mounted || signal.aborted) return

          const bookings = bookingsData.bookings || []

          for (const booking of bookings) {
            if (!booking.scheduledStartDate) continue
            const projectMatch = booking.project?._id === project._id || String(booking.project) === project._id
            if (!projectMatch) continue

            const start = new Date(booking.scheduledStartDate)
            const end = booking.scheduledExecutionEndDate
              ? new Date(booking.scheduledExecutionEndDate)
              : booking.scheduledEndDate
                ? new Date(booking.scheduledEndDate)
                : new Date(start.getTime() + 8 * 60 * 60 * 1000) // fallback 8h

            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue

            const customerName = typeof booking.customer === 'object'
              ? booking.customer?.name
              : undefined
            const loc = booking.location

            events.push({
              id: booking._id,
              type: 'booking',
              title: booking.project?.title || project.title || t('detail.meetings.bookingFallback'),
              start,
              end,
              meta: {
                bookingId: booking._id,
                bookingNumber: booking.bookingNumber,
                customerName,
                location: loc ? {
                  address: loc.address,
                  city: loc.city,
                  country: loc.country,
                  postalCode: loc.postalCode,
                } : undefined,
              },
              readOnly: true,
            })

            // Add buffer as separate event
            if (booking.scheduledBufferStartDate && booking.scheduledBufferEndDate) {
              const bufferStart = new Date(booking.scheduledBufferStartDate)
              const bufferEnd = new Date(booking.scheduledBufferEndDate)
              if (!Number.isNaN(bufferStart.getTime()) && !Number.isNaN(bufferEnd.getTime())) {
                events.push({
                  id: `${booking._id}-buffer`,
                  type: 'booking-buffer',
                  title: t('detail.meetings.buffer'),
                  start: bufferStart,
                  end: bufferEnd,
                  meta: {
                    bookingId: booking._id,
                    bookingNumber: booking.bookingNumber,
                    customerName,
                    location: loc ? {
                      address: loc.address,
                      city: loc.city,
                      country: loc.country,
                      postalCode: loc.postalCode,
                    } : undefined,
                  },
                  readOnly: true,
                })
              }
            }
          }
        }

        // Process working hours (independent of bookings response)
        let nextDayStart = '09:00'
        let nextDayEnd = '17:00'
        let nextVisibleDays: number[] = [1, 2, 3, 4, 5]

        if (hoursRes.ok) {
          const hoursData = await hoursRes.json()
          if (!mounted || signal.aborted) return


          if (hoursData.success && hoursData.availability) {
            const avail = hoursData.availability
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            let earliest = '23:59'
            let latest = '00:00'
            const activeDayIndices: number[] = []

            dayNames.forEach((name, index) => {
              const day = avail[name]
              if (day?.available && day.startTime && day.endTime) {
                activeDayIndices.push(index)
                if (day.startTime < earliest) earliest = day.startTime
                if (day.endTime > latest) latest = day.endTime
              }
            })

            if (activeDayIndices.length > 0) {
              nextDayStart = earliest
              nextDayEnd = latest
              nextVisibleDays = activeDayIndices
            }
          }
        }

        if (!mounted || signal.aborted) return
        setBookingEvents(events)
        setCalendarDayStart(nextDayStart)
        setCalendarDayEnd(nextDayEnd)
        setCalendarVisibleDays(nextVisibleDays)
      } catch (err) {
        if (signal.aborted) return
        console.error('Failed to fetch bookings/hours for calendar:', err)
        resetCalendarState()
      }
    }

    fetchBookingsAndHours()

    return () => {
      mounted = false
      controller.abort()
    }
  }, [project, user, refreshMeetings, t])

  const fetchProject = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${params.id}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const projectData = await response.json()
        setProject(projectData)
      } else {
        setError(t('detail.loadFailed'))
      }
    } catch (error) {
      console.error('Failed to fetch project:', error)
      setError(t('detail.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [params.id, t])

  useEffect(() => {
    if (user?.role === 'professional' && params.id) {
      fetchProject()
    }
  }, [user, params.id, fetchProject])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'published':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <FileText className="h-4 w-4" />
      case 'pending_approval':
        return <Clock className="h-4 w-4" />
      case 'published':
        return <CheckCircle className="h-4 w-4" />
      case 'rejected':
        return <XCircle className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const submitProject = async () => {
    if (!project || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${project._id}/submit`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        // Redirect to projects manage page on success
        router.push('/professional/projects/manage');
        router.refresh(); // Optional: refresh the manage page data
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || t('errors.submitProject'));
      }
    } catch (error) {
      console.error('Failed to submit project', error);
      toast.error(t('errors.submitProject'));
    } finally {
      setIsSubmitting(false);
    }
  };


  const formatPricing = (pricing: IPricing) => {
    if (pricing.type === 'fixed' && pricing.amount != null) {
      return formatMoney(pricing.amount)
    } else if (pricing.type === 'unit' && pricing.priceRange) {
      return `${formatMoney(pricing.priceRange.min)} - ${formatMoney(pricing.priceRange.max)}`
    } else if (pricing.type === 'rfq') {
      return t('detail.pricing.requestForQuote')
    }
    return t('detail.pricing.notSet')
  }

  type DurationUnit = 'hours' | 'days' | 'months' | 'years'

  const formatUnit = (value: number, unit: DurationUnit) => t(`units.${unit}`, { count: value })

  const formatDuration = (duration: IExecutionDuration) => {
    if (duration.value != null) {
      return formatUnit(duration.value, duration.unit)
    } else if (duration.range) {
      if (duration.range.min != null && duration.range.max != null) {
        return t(`duration.range.${duration.unit}`, { min: duration.range.min, max: duration.range.max })
      } else if (duration.range.min != null) {
        return t(`duration.min.${duration.unit}`, { min: duration.range.min })
      } else if (duration.range.max != null) {
        return t(`duration.max.${duration.unit}`, { max: duration.range.max })
      }
    }
    return t('common.notSet')
  }

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return t('status.draft')
      case 'pending_approval':
        return t('status.pendingApproval')
      case 'published':
        return t('status.published')
      case 'rejected':
        return t('status.rejected')
      case 'quoted':
        return t('status.quoted')
      case 'booked':
        return t('status.booked')
      case 'in_progress':
        return t('status.inProgress')
      case 'completed':
        return t('status.completed')
      case 'awaiting_confirmation':
        return t('status.awaitingConfirmation')
      case 'closed':
        return t('status.closed')
      case 'disputed':
        return t('status.disputed')
      default:
        return status
    }
  }

  const formatPriceModelLabel = (value: string) => {
    switch (value) {
      case 'fixed':
        return t('priceModels.fixed')
      case 'meter':
        return t('priceModels.meter')
      case 'm2':
        return t('priceModels.m2')
      case 'hour':
        return t('priceModels.hour')
      case 'day':
        return t('priceModels.day')
      case 'room':
        return t('priceModels.room')
      default:
        return value
    }
  }

  const formatQuestionTypeLabel = (value: string) => {
    switch (value) {
      case 'text':
        return t('questionTypes.text')
      case 'multiple_choice':
        return t('questionTypes.multipleChoice')
      case 'attachment':
        return t('questionTypes.attachment')
      default:
        return value
    }
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4">
        <div className="max-w-7xl mx-auto pt-16 md:pt-20">
          <div className="mb-6 md:mb-8 flex items-center gap-4">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
                  <Skeleton className="h-6 w-40" />
                  <div className="grid md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(j => (
                      <div key={j} className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-3">
                <Skeleton className="h-6 w-32" />
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== 'professional') {
    return null
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4">
        <div className="max-w-4xl mx-auto pt-16 md:pt-20">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-red-900 mb-2">{t('detail.errorTitle')}</h3>
              <p className="text-red-700 mb-4">{error || t('detail.projectNotFound')}</p>
              <Button
                onClick={() => router.push('/professional/projects/manage')}
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('detail.backToProjects')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4">
      <div className="max-w-7xl mx-auto pt-16 md:pt-20">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Button
              onClick={() => router.push('/professional/projects/manage')}
              variant="outline"
              size="sm"
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t('detail.backToProjects')}</span>
              <span className="sm:hidden">{t('detail.back')}</span>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2 md:gap-3">
                <Briefcase className="h-6 w-6 md:h-8 md:w-8 text-blue-600 flex-shrink-0" />
                <span className="truncate">{t('detail.title')}</span>
              </h1>
              <p className="text-sm md:text-base text-gray-600">{t('detail.subtitle')}</p>
            </div>
          </div>
          <Badge className={`${getStatusColor(project.status)} border text-sm flex-shrink-0`}>
            {getStatusIcon(project.status)}
            <span className="ml-2 capitalize">{formatStatusLabel(project.status)}</span>
          </Badge>
        </div>

        <div className="grid lg:grid-cols-4 gap-4 md:gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-4 md:space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="text-xl md:text-2xl break-words">{project.title}</CardTitle>
                <CardDescription className="text-sm md:text-base break-words">{project.description}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">{t('detail.basicInfo.category')}</span>
                    <p className="capitalize">{project.category}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('detail.basicInfo.service')}</span>
                    <p className="capitalize">{project.service}</p>
                  </div>
                  {project.areaOfWork && (
                    <div>
                      <span className="font-medium text-gray-600">{t('detail.basicInfo.areaOfWork')}</span>
                      <p className="capitalize">{project.areaOfWork}</p>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-gray-600">{t('detail.basicInfo.priceModel')}</span>
                    <p className="capitalize">{formatPriceModelLabel(project.priceModel)}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('detail.basicInfo.currentStep')}</span>
                    <p>{t('detail.basicInfo.stepOfTotal', { step: project.currentStep })}</p>
                  </div>
                </div>

                {project.keywords && project.keywords.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-600 text-sm">{t('detail.basicInfo.keywords')}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {project.keywords.map((keyword, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {project.projectType && project.projectType.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-600 text-sm">{t('detail.basicInfo.projectTypes')}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {project.projectType.map((type, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Distance & Location */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5" />
                  {t('detail.serviceArea.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">{t('detail.serviceArea.address')}</span>
                    <p className="break-words">{project.distance.address}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('detail.serviceArea.maxRange')}</span>
                    <p>{project.distance.noBorders ? t('detail.serviceArea.noBorders') : (project.distance.maxKmRange != null ? t('detail.serviceArea.km', { km: project.distance.maxKmRange }) : '—')}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">{t('detail.serviceArea.companyAddress')}</span>
                    <p>{project.distance.useCompanyAddress ? t('common.yes') : t('common.no')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Media */}
            {(project.media.images.length > 0 || project.media.video) && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ImageIcon className="h-5 w-5" />
                    {t('detail.media.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-4">
                  {project.media.images.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-600 mb-2">{t('detail.media.images', { count: project.media.images.length })}</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {project.media.images.slice(0, 8).map((imageUrl, index) => (
                          <div
                            key={index}
                            className="aspect-square bg-white border rounded-lg p-2"
                            onClick={() => setSelectedImage(imageUrl)}
                          >
                            <div
                              className="w-full h-full bg-gray-200 rounded cursor-pointer"
                              style={{
                                backgroundImage: `url(${imageUrl})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat'
                              }}
                            />
                          </div>
                        ))}
                        {project.media.images.length > 8 && (
                          <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                            <div className="text-center">
                              <ImageIcon className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                              <span className="text-gray-600 text-sm">{t('detail.media.more', { count: project.media.images.length - 8 })}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {project.media.video && (
                    <div>
                      <h4 className="font-medium text-gray-600 mb-2">{t('detail.media.video')}</h4>
                      <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden group cursor-pointer hover:shadow-md transition-shadow">
                        <video
                          src={project.media.video}
                          className="w-full h-full object-cover"
                          controls
                          preload="metadata"
                          onError={(e) => {
                            const target = e.target as HTMLVideoElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.innerHTML = `
                                <div class="w-full h-full flex items-center justify-center">
                                  <svg class="h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6 4h6M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                  </svg>
                                </div>
                              `;
                            }
                          }}
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all pointer-events-none" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Subprojects/Pricing - Side by Side Card Grid */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5" />
                  {t('detail.pricing.title', { count: project.subprojects.length })}
                </CardTitle>
                <CardDescription>{t('detail.pricing.description')}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6">
                <div className={`grid gap-4 ${project.subprojects.length === 1 ? 'grid-cols-1' : project.subprojects.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                  {project.subprojects.map((subproject, index) => (
                    <Card key={index} className="border border-gray-200 flex flex-col">
                      <CardHeader className="px-4 py-3">
                        <CardTitle className="text-base">{subproject.name}</CardTitle>
                        <CardDescription className="text-sm break-words">{subproject.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="px-4 py-3 space-y-3 flex-1">
                        {/* Pricing */}
                        <div>
                          <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.label')}</span>
                          <p className="font-semibold text-green-600">{formatPricing(subproject.pricing)}</p>
                          {subproject.pricing.type === 'unit' && subproject.pricing.minProjectValue != null && (
                            <p className="text-xs text-gray-500 mt-0.5">{t('detail.pricing.minOrder', { price: formatMoney(subproject.pricing.minProjectValue) })}</p>
                          )}
                        </div>

                        {/* Duration */}
                        <div>
                          <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.duration')}</span>
                          <p className="text-sm">{formatDuration(subproject.executionDuration)}</p>
                        </div>

                        {/* Preparation */}
                        <div>
                          <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.preparation')}</span>
                          <p className="text-sm">
                            {(() => {
                              const preparationValue = subproject.preparationDuration?.value;
                              if (preparationValue == null) return t('common.notSet');
                              const preparationUnit =
                                subproject.preparationDuration?.unit ??
                                subproject.executionDuration?.unit ??
                                'days';
                              return formatUnit(preparationValue, preparationUnit);
                            })()}
                          </p>
                        </div>

                        {/* Buffer */}
                        {subproject.buffer && subproject.buffer.value > 0 && (
                          <div>
                            <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.buffer')}</span>
                            <p className="text-sm">{formatUnit(subproject.buffer.value, subproject.buffer.unit)}</p>
                          </div>
                        )}

                        {/* Intake */}
                        {subproject.intakeDuration && (
                          <div>
                            <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.intake')}</span>
                            <p className="text-sm">{formatUnit(subproject.intakeDuration.value, subproject.intakeDuration.unit)}</p>
                          </div>
                        )}

                        {/* Warranty */}
                        <div>
                          <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.warranty')}</span>
                          <p className="text-sm">{subproject.warrantyPeriod.value === 0 ? t('detail.pricing.noWarranty') : formatUnit(subproject.warrantyPeriod.value, subproject.warrantyPeriod.unit)}</p>
                        </div>

                        {/* Materials */}
                        <div>
                          <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.materials')}</span>
                          <p className="text-sm">{subproject.materialsIncluded ? t('detail.pricing.included') : t('detail.pricing.notIncluded')}</p>
                        </div>

                        {/* Service Parameters */}
                        {subproject.professionalInputs && subproject.professionalInputs.length > 0 && (
                          <div>
                            <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.serviceParameters')}</span>
                            <div className="mt-1 space-y-1">
                              {subproject.professionalInputs.map((input, i) => (
                                <div key={i} className="flex justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                                  <span className="font-medium">{input.fieldName}</span>
                                  <span>
                                    {typeof input.value === 'object' && input.value !== null && 'min' in input.value && 'max' in input.value
                                      ? `${(input.value as { min: number; max: number }).min} - ${(input.value as { min: number; max: number }).max}`
                                      : String(input.value ?? '')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Included Items */}
                        {subproject.included.length > 0 && (
                          <div>
                            <span className="font-medium text-gray-600 text-sm">{t('detail.pricing.includedItems')}</span>
                            <div className="mt-1 space-y-1">
                              {subproject.included.map((item, itemIndex) => (
                                <div key={itemIndex} className="bg-gray-50 rounded-md px-2 py-1">
                                  <p className="font-medium text-xs">{item.name}</p>
                                  {item.description && (
                                    <p className="text-xs text-gray-600">{item.description}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Extra Options */}
            {project.extraOptions.length > 0 && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Settings className="h-5 w-5" />
                    {t('detail.extraOptions.title', { count: project.extraOptions.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {project.extraOptions.map((option, index) => (
                      <div key={index} className="border rounded-lg p-3">
                        <h4 className="font-medium text-sm">{option.name}</h4>
                        {option.description && (
                          <p className="text-xs text-gray-600 mt-1">{option.description}</p>
                        )}
                        <p className="font-semibold text-green-600 mt-2 text-sm">{formatMoney(option.price)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Terms & Conditions */}
            {project.termsConditions.length > 0 && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Shield className="h-5 w-5" />
                    {t('detail.terms.title', { count: project.termsConditions.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.termsConditions.map((term, index) => (
                    <div key={index} className={`border-l-4 ${term.type === 'warning' ? 'border-yellow-300' : 'border-blue-200'} pl-4`}>
                      <h4 className="font-medium text-sm">
                        {term.name}
                        {term.type === 'warning' && <span className="ml-1 text-xs text-yellow-600">{t('detail.terms.warning')}</span>}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1 break-words">{term.description}</p>
                      {term.type !== 'warning' && term.additionalCost != null && Number.isFinite(term.additionalCost) && term.additionalCost >= 0 && (
                        <p className="text-sm font-medium text-orange-600 mt-1">
                          {t('detail.terms.additionalCost', { price: formatMoney(term.additionalCost) })}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* FAQ */}
            {project.faq.length > 0 && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <HelpCircle className="h-5 w-5" />
                    {t('detail.faq.title', { count: project.faq.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-4">
                  {project.faq.map((faq, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <h4 className="font-medium text-sm mb-2">{faq.question}</h4>
                      <p className="text-sm text-gray-600 break-words">{faq.answer}</p>
                      {faq.isGenerated && (
                        <Badge variant="outline" className="text-xs mt-2">
                          {t('detail.faq.aiGenerated')}
                        </Badge>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* RFQ Questions */}
            {project.rfqQuestions.length > 0 && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MessageSquare className="h-5 w-5" />
                    {t('detail.rfq.title', { count: project.rfqQuestions.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.rfqQuestions.map((question, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-sm flex-1">{question.question}</h4>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {formatQuestionTypeLabel(question.type)}
                        </Badge>
                      </div>
                      {question.isRequired && (
                        <Badge variant="destructive" className="text-xs mt-2">
                          {t('common.required')}
                        </Badge>
                      )}
                      {question.options && question.options.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 mb-1">{t('detail.rfq.options')}</p>
                          <div className="flex flex-wrap gap-1">
                            {question.options.map((option, optionIndex) => (
                              <Badge key={optionIndex} variant="outline" className="text-xs">
                                {option}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Post-Booking Questions */}
            {project.postBookingQuestions.length > 0 && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5" />
                    {t('detail.postBooking.title', { count: project.postBookingQuestions.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.postBookingQuestions.map((question, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-sm flex-1">{question.question}</h4>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {formatQuestionTypeLabel(question.type)}
                        </Badge>
                      </div>
                      {question.isRequired && (
                        <Badge variant="destructive" className="text-xs mt-2">
                          {t('common.required')}
                        </Badge>
                      )}
                      {question.options && question.options.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 mb-1">{t('detail.rfq.options')}</p>
                          <div className="flex flex-wrap gap-1">
                            {question.options.map((option, optionIndex) => (
                              <Badge key={optionIndex} variant="outline" className="text-xs">
                                {option}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Custom Confirmation Message */}
            {project.customConfirmationMessage && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MessageSquare className="h-5 w-5" />
                    {t('detail.customMessage')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6">
                  <p className="text-sm break-words bg-blue-50 p-3 rounded-lg">{project.customConfirmationMessage}</p>
                </CardContent>
              </Card>
            )}

            {/* Certifications */}
            {project.certifications.length > 0 && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Award className="h-5 w-5" />
                    {t('detail.certifications.title', { count: project.certifications.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.certifications.map((cert, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{cert.name}</h4>
                        <p className="text-xs text-gray-600">
                          {t('detail.certifications.uploaded', { date: new Date(cert.uploadedAt).toLocaleDateString(intl) })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {cert.isRequired && (
                          <Badge variant="destructive" className="text-xs">
                            {t('common.required')}
                          </Badge>
                        )}
                        <Button size="sm" variant="outline" className="text-xs">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          {t('common.view')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Admin Feedback */}
            {project.status === 'rejected' && project.adminFeedback && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="text-red-800 flex items-center gap-2 text-lg">
                    <XCircle className="h-5 w-5" />
                    {t('detail.adminFeedback')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6">
                  <p className="text-red-700 break-words">{project.adminFeedback}</p>
                </CardContent>
              </Card>
            )}

            {/* Quality Checks */}
            {project.qualityChecks && project.qualityChecks.length > 0 && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CheckCircle className="h-5 w-5" />
                    {t('detail.qualityChecks.title', { count: project.qualityChecks.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.qualityChecks.map((check, index) => (
                    <div key={index} className={`flex items-start gap-3 p-3 rounded-lg ${check.status === 'passed'
                      ? 'bg-green-50 border border-green-200'
                      : check.status === 'warning'
                        ? 'bg-yellow-50 border border-yellow-200'
                        : 'bg-red-50 border border-red-200'
                      }`}>
                      {check.status === 'passed'
                        ? <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        : check.status === 'warning'
                          ? <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          : <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                      }
                      <div className="min-w-0 flex-1">
                        <h5 className={`font-medium capitalize text-sm ${check.status === 'passed' ? 'text-green-800' : check.status === 'warning' ? 'text-yellow-800' : 'text-red-800'
                          }`}>
                          {check.category}
                        </h5>
                        <p className={`text-sm break-words ${check.status === 'passed' ? 'text-green-700' : check.status === 'warning' ? 'text-yellow-700' : 'text-red-700'
                          }`}>
                          {check.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(check.checkedAt).toLocaleString(intl)}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Meetings Section */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5" />
                    {t('detail.meetings.title')}
                  </CardTitle>
                  <Button
                    onClick={() => setShowMeetingScheduler(!showMeetingScheduler)}
                    size="sm"
                  >
                    {showMeetingScheduler ? t('detail.meetings.hideScheduler') : t('common.scheduleMeeting')}
                  </Button>
                </div>
                <CardDescription>
                  {t('detail.meetings.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-4">
                {showMeetingScheduler && (
                  <MeetingScheduler
                    projectId={project._id}
                    onMeetingCreated={() => {
                      setRefreshMeetings(prev => prev + 1)
                      setShowMeetingScheduler(false)
                    }}
                  />
                )}
                <WeeklyAvailabilityCalendar
                  title={t('detail.meetings.bookingCalendar')}
                  description={t('detail.meetings.bookingCalendarDescription')}
                  events={bookingEvents}
                  dayStart={calendarDayStart}
                  dayEnd={calendarDayEnd}
                  visibleDays={calendarVisibleDays}
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4 md:space-y-6">
            {/* Actions */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="text-lg">{t('detail.actions.title')}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-3">
                {/* Always show edit button */}
                <Button
                  onClick={() => router.push(`/projects/create?id=${project._id}`)}
                  className="w-full"
                  variant="outline"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  {t('common.editProject')}
                </Button>

                {/* Show status-specific actions */}
                {project.status === 'draft' && (
                  <Button
                    onClick={submitProject}
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {t('detail.actions.submitForApproval')}
                  </Button>
                )}

                {project.status === 'rejected' && (
                  <Button
                    onClick={submitProject}
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {t('detail.actions.resubmitForApproval')}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Project Timeline */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5" />
                  {t('detail.timeline.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.timeline.created')}</span>
                  <span className="font-medium">
                    {new Date(project.createdAt).toLocaleDateString(intl)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.timeline.lastUpdated')}</span>
                  <span className="font-medium">
                    {new Date(project.updatedAt).toLocaleDateString(intl)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.timeline.autoSaved')}</span>
                  <span className="font-medium">
                    {new Date(project.autoSaveTimestamp).toLocaleDateString(intl)}
                  </span>
                </div>

                {project.submittedAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{t('detail.timeline.submitted')}</span>
                    <span className="font-medium">
                      {new Date(project.submittedAt).toLocaleDateString(intl)}
                    </span>
                  </div>
                )}

                {project.approvedAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{t('detail.timeline.approved')}</span>
                    <span className="font-medium">
                      {new Date(project.approvedAt).toLocaleDateString(intl)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Project Stats */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="text-lg">{t('detail.info.title')}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.info.category')}</span>
                  <span className="font-medium capitalize">{project.category}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.info.service')}</span>
                  <span className="font-medium capitalize">{project.service}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.info.subprojects')}</span>
                  <span className="font-medium">{project.subprojects.length}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.info.extraOptions')}</span>
                  <span className="font-medium">{project.extraOptions.length}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.info.faqItems')}</span>
                  <span className="font-medium">{project.faq.length}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.info.progress')}</span>
                  <span className="font-medium">{t('detail.info.steps', { step: project.currentStep })}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('detail.info.status')}</span>
                  <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                    {formatStatusLabel(project.status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Intake & Team */}
            {(project.intakeMeeting || project.renovationPlanning || project.resources.length > 0) && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5" />
                    {t('detail.team.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.intakeMeeting?.enabled && (
                    <div>
                      <span className="font-medium text-gray-600 text-sm">{t('detail.team.intakeMeeting')}</span>
                      <p className="text-sm">{t('detail.team.enabled')}</p>
                      {project.intakeMeeting.resources.length > 0 && (
                        <p className="text-xs text-gray-600">{t('detail.team.membersAssigned', { count: project.intakeMeeting.resources.length })}</p>
                      )}
                    </div>
                  )}

                  {(project.renovationPlanning?.fixeraManaged) && (
                    <div>
                      <span className="font-medium text-gray-600 text-sm">{t('detail.team.renovationPlanning')}</span>
                      <p className="text-sm">{t('detail.team.fixtractManaged')}</p>
                      {project.renovationPlanning.resources.length > 0 && (
                        <p className="text-xs text-gray-600">{t('detail.team.membersAssigned', { count: project.renovationPlanning.resources.length })}</p>
                      )}
                    </div>
                  )}

                  {project.resources.length > 0 && (
                    <div>
                      <span className="font-medium text-gray-600 text-sm">{t('detail.team.resources')}</span>
                      <p className="text-sm">{t('detail.team.members', { count: project.resources.length })}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Image Modal */}
        {selectedImage && (
          <div
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedImage(null)}
          >
            <div className="relative max-w-4xl max-h-full w-full h-full flex items-center justify-center">
              <Image
                src={selectedImage}
                alt={t('detail.media.imageAlt')}
                fill
                className="object-contain"
                sizes="100vw"
                onError={() => setSelectedImage(null)}
              />
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
