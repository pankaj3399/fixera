'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import Image from "next/image"
import MeetingScheduler from "@/components/professional/meetings/MeetingScheduler"
import WeeklyAvailabilityCalendar, { type CalendarEvent } from "@/components/calendar/WeeklyAvailabilityCalendar"
import { getAuthToken } from "@/lib/utils"
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
  fixeraManaged: boolean
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
              title: booking.project?.title || project.title || 'Booking',
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
                  title: 'Buffer',
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
  }, [project, user, refreshMeetings])

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
        setError('Failed to fetch project details')
      }
    } catch (error) {
      console.error('Failed to fetch project:', error)
      setError('Failed to fetch project details')
    } finally {
      setIsLoading(false)
    }
  }, [params.id])

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
        alert(`${errorData.error || 'Failed to submit project'}`);
      }
    } catch (error) {
      console.error('Failed to submit project', error);
      alert('Failed to submit project');
    } finally {
      setIsSubmitting(false);
    }
  };


  const formatPricing = (pricing: IPricing) => {
    if (pricing.type === 'fixed' && pricing.amount) {
      return `€${pricing.amount.toLocaleString()}`
    } else if (pricing.type === 'unit' && pricing.priceRange) {
      return `€${pricing.priceRange.min.toLocaleString()} - €${pricing.priceRange.max.toLocaleString()}`
    } else if (pricing.type === 'rfq') {
      return 'Request for Quote'
    }
    return 'Price not set'
  }

  const formatDuration = (duration: IExecutionDuration) => {
    if (duration.value != null) {
      return `${duration.value} ${duration.unit}`
    } else if (duration.range) {
      if (duration.range.min != null && duration.range.max != null) {
        return `${duration.range.min}–${duration.range.max} ${duration.unit}`
      } else if (duration.range.min != null) {
        return `≥${duration.range.min} ${duration.unit}`
      } else if (duration.range.max != null) {
        return `≤${duration.range.max} ${duration.unit}`
      }
    }
    return 'Not set'
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading project details...</p>
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
              <h3 className="text-lg font-medium text-red-900 mb-2">Error Loading Project</h3>
              <p className="text-red-700 mb-4">{error || 'Project not found'}</p>
              <Button
                onClick={() => router.push('/professional/projects/manage')}
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Projects
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
              <span className="hidden sm:inline">Back to Projects</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2 md:gap-3">
                <Briefcase className="h-6 w-6 md:h-8 md:w-8 text-blue-600 flex-shrink-0" />
                <span className="truncate">Project Details</span>
              </h1>
              <p className="text-sm md:text-base text-gray-600">View and manage your project</p>
            </div>
          </div>
          <Badge className={`${getStatusColor(project.status)} border text-sm flex-shrink-0`}>
            {getStatusIcon(project.status)}
            <span className="ml-2 capitalize">{project.status.replace('_', ' ')}</span>
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
                    <span className="font-medium text-gray-600">Category:</span>
                    <p className="capitalize">{project.category}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Service:</span>
                    <p className="capitalize">{project.service}</p>
                  </div>
                  {project.areaOfWork && (
                    <div>
                      <span className="font-medium text-gray-600">Area of Work:</span>
                      <p className="capitalize">{project.areaOfWork}</p>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-gray-600">Price Model:</span>
                    <p className="capitalize">{project.priceModel}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Current Step:</span>
                    <p>{project.currentStep} of 8</p>
                  </div>
                </div>

                {project.keywords && project.keywords.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-600 text-sm">Keywords:</span>
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
                    <span className="font-medium text-gray-600 text-sm">Project Types:</span>
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
                  Service Area
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Address:</span>
                    <p className="break-words">{project.distance.address}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Max Range:</span>
                    <p>{project.distance.noBorders ? 'No borders' : (project.distance.maxKmRange != null ? `${project.distance.maxKmRange} km` : '—')}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Company Address:</span>
                    <p>{project.distance.useCompanyAddress ? 'Yes' : 'No'}</p>
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
                    Media
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-4">
                  {project.media.images.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-600 mb-2">Images ({project.media.images.length})</h4>
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
                              <span className="text-gray-600 text-sm">+{project.media.images.length - 8} more</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {project.media.video && (
                    <div>
                      <h4 className="font-medium text-gray-600 mb-2">Video</h4>
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

            {/* Subprojects/Pricing */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5" />
                  Pricing Options ({project.subprojects.length})
                </CardTitle>
                <CardDescription>Your project pricing variations</CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-4">
                {project.subprojects.map((subproject, index) => (
                  <Card key={index} className="border border-gray-200">
                    <CardHeader className="px-4 py-3">
                      <CardTitle className="text-base">{subproject.name}</CardTitle>
                      <CardDescription className="text-sm break-words">{subproject.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 py-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">Pricing:</span>
                          <p className="font-semibold text-green-600">{formatPricing(subproject.pricing)}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Duration:</span>
                          <p>{formatDuration(subproject.executionDuration)}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Warranty:</span>
                          <p>{subproject.warrantyPeriod.value === 0 ? 'No warranty' : `${subproject.warrantyPeriod.value} ${subproject.warrantyPeriod.unit}`}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Materials:</span>
                          <p>{subproject.materialsIncluded ? 'Included' : 'Not included'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Preparation:</span>
                          <p>
                            {(() => {
                              const preparationValue = subproject.preparationDuration?.value;
                              if (preparationValue == null) return 'Not set';
                              const preparationUnit =
                                subproject.preparationDuration?.unit ??
                                subproject.executionDuration?.unit ??
                                'days';
                              return `${preparationValue} ${preparationUnit}`;
                            })()}
                          </p>
                        </div>
                        {subproject.intakeDuration && (
                          <div>
                            <span className="font-medium text-gray-600">Intake:</span>
                            <p>{subproject.intakeDuration.value} {subproject.intakeDuration.unit}</p>
                          </div>
                        )}
                      </div>

                      {subproject.included.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-600 text-sm">Included Items:</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {subproject.included.map((item, itemIndex) => (
                              <div key={itemIndex} className="bg-gray-50 rounded-md p-2">
                                <p className="font-medium text-sm">{item.name}</p>
                                {item.description && (
                                  <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>

            {/* Extra Options */}
            {project.extraOptions.length > 0 && (
              <Card>
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Settings className="h-5 w-5" />
                    Extra Options ({project.extraOptions.length})
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
                        <p className="font-semibold text-green-600 mt-2 text-sm">€{option.price.toLocaleString()}</p>
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
                    Terms & Conditions ({project.termsConditions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.termsConditions.map((term, index) => (
                    <div key={index} className={`border-l-4 ${term.type === 'warning' ? 'border-yellow-300' : 'border-blue-200'} pl-4`}>
                      <h4 className="font-medium text-sm">
                        {term.name}
                        {term.type === 'warning' && <span className="ml-1 text-xs text-yellow-600">(Warning)</span>}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1 break-words">{term.description}</p>
                      {term.type !== 'warning' && typeof term.additionalCost === 'number' && term.additionalCost >= 0 && (
                        <p className="text-sm font-medium text-orange-600 mt-1">
                          Additional cost: €{term.additionalCost.toLocaleString()}
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
                    FAQ ({project.faq.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-4">
                  {project.faq.map((faq, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <h4 className="font-medium text-sm mb-2">{faq.question}</h4>
                      <p className="text-sm text-gray-600 break-words">{faq.answer}</p>
                      {faq.isGenerated && (
                        <Badge variant="outline" className="text-xs mt-2">
                          AI Generated
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
                    RFQ Questions ({project.rfqQuestions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.rfqQuestions.map((question, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-sm flex-1">{question.question}</h4>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {question.type}
                        </Badge>
                      </div>
                      {question.isRequired && (
                        <Badge variant="destructive" className="text-xs mt-2">
                          Required
                        </Badge>
                      )}
                      {question.options && question.options.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 mb-1">Options:</p>
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
                    Post-Booking Questions ({project.postBookingQuestions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.postBookingQuestions.map((question, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-sm flex-1">{question.question}</h4>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {question.type}
                        </Badge>
                      </div>
                      {question.isRequired && (
                        <Badge variant="destructive" className="text-xs mt-2">
                          Required
                        </Badge>
                      )}
                      {question.options && question.options.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 mb-1">Options:</p>
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
                    Custom Confirmation Message
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
                    Certifications ({project.certifications.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.certifications.map((cert, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{cert.name}</h4>
                        <p className="text-xs text-gray-600">
                          Uploaded: {new Date(cert.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {cert.isRequired && (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        )}
                        <Button size="sm" variant="outline" className="text-xs">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View
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
                    Admin Feedback
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
                    Quality Checks ({project.qualityChecks.length})
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
                          {new Date(check.checkedAt).toLocaleString()}
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
                    Team Meetings
                  </CardTitle>
                  <Button
                    onClick={() => setShowMeetingScheduler(!showMeetingScheduler)}
                    size="sm"
                  >
                    {showMeetingScheduler ? 'Hide Scheduler' : 'Schedule Meeting'}
                  </Button>
                </div>
                <CardDescription>
                  Schedule and manage team meetings for this project
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
                  title="Booking Calendar"
                  description="Bookings and blocks for this project"
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
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-3">
                {/* Always show edit button */}
                <Button
                  onClick={() => router.push(`/projects/create?id=${project._id}`)}
                  className="w-full"
                  variant="outline"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Project
                </Button>

                {/* Show status-specific actions */}
                {project.status === 'draft' && (
                  <Button
                    onClick={submitProject}
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Submit for Approval
                  </Button>
                )}

                {project.status === 'rejected' && (
                  <Button
                    onClick={submitProject}
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Resubmit for Approval
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Project Timeline */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Created</span>
                  <span className="font-medium">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Last Updated</span>
                  <span className="font-medium">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Auto-saved</span>
                  <span className="font-medium">
                    {new Date(project.autoSaveTimestamp).toLocaleDateString()}
                  </span>
                </div>

                {project.submittedAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Submitted</span>
                    <span className="font-medium">
                      {new Date(project.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}

                {project.approvedAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Approved</span>
                    <span className="font-medium">
                      {new Date(project.approvedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Project Stats */}
            <Card>
              <CardHeader className="px-4 md:px-6">
                <CardTitle className="text-lg">Project Info</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Category</span>
                  <span className="font-medium capitalize">{project.category}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Service</span>
                  <span className="font-medium capitalize">{project.service}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Subprojects</span>
                  <span className="font-medium">{project.subprojects.length}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Extra Options</span>
                  <span className="font-medium">{project.extraOptions.length}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">FAQ Items</span>
                  <span className="font-medium">{project.faq.length}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Progress</span>
                  <span className="font-medium">{project.currentStep}/8 steps</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Status</span>
                  <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                    {project.status.replace('_', ' ')}
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
                    Team & Meetings
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6 space-y-3">
                  {project.intakeMeeting?.enabled && (
                    <div>
                      <span className="font-medium text-gray-600 text-sm">Intake Meeting:</span>
                      <p className="text-sm">Enabled</p>
                      {project.intakeMeeting.resources.length > 0 && (
                        <p className="text-xs text-gray-600">{project.intakeMeeting.resources.length} team members assigned</p>
                      )}
                    </div>
                  )}

                  {project.renovationPlanning?.fixeraManaged && (
                    <div>
                      <span className="font-medium text-gray-600 text-sm">Renovation Planning:</span>
                      <p className="text-sm">Fixera Managed</p>
                      {project.renovationPlanning.resources.length > 0 && (
                        <p className="text-xs text-gray-600">{project.renovationPlanning.resources.length} team members assigned</p>
                      )}
                    </div>
                  )}

                  {project.resources.length > 0 && (
                    <div>
                      <span className="font-medium text-gray-600 text-sm">Resources:</span>
                      <p className="text-sm">{project.resources.length} team members</p>
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
                alt="Project image"
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
