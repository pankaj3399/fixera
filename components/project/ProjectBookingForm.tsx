'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Calendar, Loader2, Upload, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays, isAfter, isBefore, parseISO, isWithinInterval, startOfDay } from 'date-fns'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'

interface Project {
  _id: string
  title: string
  priceModel?: string
  timeMode?: 'hours' | 'days'
  preparationDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
  executionDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
  bufferDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
  subprojects: Array<{
    name: string
    description: string
    pricing: {
      type: 'fixed' | 'unit' | 'rfq'
      amount?: number
      priceRange?: { min: number; max: number }
      minProjectValue?: number
    }
    deliveryPreparation?: number
    executionDuration?: {
      value?: number
      unit: 'hours' | 'days'
      range?: { min?: number; max?: number }
    }
    buffer?: {
      value?: number
      unit: 'hours' | 'days'
    }
  }>
  rfqQuestions: Array<{
    question: string
    type: 'text' | 'multiple_choice' | 'attachment'
    options?: string[]
    isRequired: boolean
  }>
  extraOptions: Array<{
    name: string
    description?: string
    price: number
  }>
}

interface ProjectBookingFormProps {
  project: Project
  onBack: () => void
  selectedSubprojectIndex?: number | null
}

interface RFQAnswer {
  question: string
  answer: string
  type: string
}

interface BlockedDates {
  blockedDates: string[]
  blockedRanges: Array<{
    startDate: string
    endDate: string
  }>
}

interface ScheduleProposalsResponse {
  success: boolean
  proposals?: {
    mode: 'hours' | 'days'
    earliestBookableDate: string
    earliestProposal?: {
      start: string
      end: string
    }
    shortestThroughputProposal?: {
      start: string
      end: string
    }
  }
}

interface DayAvailability {
  available: boolean
  startTime?: string
  endTime?: string
}

interface ProfessionalAvailability {
  monday?: DayAvailability
  tuesday?: DayAvailability
  wednesday?: DayAvailability
  thursday?: DayAvailability
  friday?: DayAvailability
  saturday?: DayAvailability
  sunday?: DayAvailability
}

interface WorkingHoursResponse {
  success: boolean
  availability?: ProfessionalAvailability
}

type ProjectExecutionDuration = NonNullable<Project['executionDuration']>
type SubprojectExecutionDuration = NonNullable<Project['subprojects'][number]['executionDuration']>
type AnyExecutionDuration = ProjectExecutionDuration | SubprojectExecutionDuration

const hasDurationRange = (
  duration?: AnyExecutionDuration
): duration is SubprojectExecutionDuration & { range: { min?: number; max?: number } } =>
  Boolean(duration && 'range' in duration && duration.range)

export default function ProjectBookingForm({ project, onBack, selectedSubprojectIndex }: ProjectBookingFormProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [blockedDates, setBlockedDates] = useState<BlockedDates>({ blockedDates: [], blockedRanges: [] })
  const [loadingAvailability, setLoadingAvailability] = useState(true)
  const [proposals, setProposals] = useState<ScheduleProposalsResponse['proposals'] | null>(null)
  const [professionalAvailability, setProfessionalAvailability] = useState<ProfessionalAvailability | null>(null)


  // Form state
  const [selectedPackageIndex, setSelectedPackageIndex] = useState<number | null>(
    typeof selectedSubprojectIndex === 'number' ? selectedSubprojectIndex : null
  )
  const [estimatedUsage, setEstimatedUsage] = useState<number>(1)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [showCalendar, setShowCalendar] = useState(false)
  const [rfqAnswers, setRFQAnswers] = useState<RFQAnswer[]>([])
  const [selectedExtraOptions, setSelectedExtraOptions] = useState<number[]>([])
  const [additionalNotes, setAdditionalNotes] = useState('')
  const selectedPackage = selectedPackageIndex !== null ? project.subprojects[selectedPackageIndex] : null

  useEffect(() => {
    if (typeof selectedSubprojectIndex === 'number') {
      setSelectedPackageIndex(selectedSubprojectIndex)
    }
  }, [selectedSubprojectIndex])

  useEffect(() => {
    fetchTeamAvailability()
    fetchScheduleProposals()
    fetchProfessionalWorkingHours()
  }, [])

  const fetchTeamAvailability = async () => {
    try {
      console.log('[BOOKING] Fetching team availability for project:', project._id)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/availability`
      )
      const data = await response.json()

      console.log('[BOOKING] Availability data received:', data)
      console.log('[BOOKING] Blocked ranges:', data.blockedRanges?.length || 0)

      if (data.success) {
        setBlockedDates(data)
        console.log('[BOOKING] Blocked dates set:', {
          blockedDates: data.blockedDates?.length || 0,
          blockedRanges: data.blockedRanges?.length || 0
        })
      }
    } catch (error) {
      console.error('Error fetching availability:', error)
      toast.error('Failed to load availability calendar')
    } finally {
      setLoadingAvailability(false)
    }
  }

  const fetchScheduleProposals = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/schedule-proposals`
      )
      const data: ScheduleProposalsResponse = await response.json()

      if (data.success && data.proposals) {
        setProposals(data.proposals)
      }
    } catch (error) {
      console.error('Error fetching schedule proposals:', error)
    }
  }

  const fetchProfessionalWorkingHours = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/working-hours`
      )
      const data: WorkingHoursResponse = await response.json()

      if (data.success && data.availability) {
        setProfessionalAvailability(data.availability)
      }
    } catch (error) {
      console.error('Error fetching professional working hours:', error)
    }
  }

  const shouldCollectUsage = (pricingType: 'fixed' | 'unit' | 'rfq'): boolean => {
    if (pricingType === 'unit') {
      return true
    }

    const projectPriceModel = (project.priceModel || '').toLowerCase()
    if (!projectPriceModel) {
      return false
    }

    return !projectPriceModel.includes('total')
  }

  const formatCurrency = (value?: number) =>
    typeof value === 'number'
      ? new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value)
      : null

  // Check if a date is a weekend (Saturday or Sunday)
  const isWeekend = (date: Date): boolean => {
    const day = date.getDay()
    return day === 0 || day === 6 // Sunday = 0, Saturday = 6
  }

  // Check if professional works on this date (based on their availability)
  const isProfessionalWorkingDay = (date: Date): boolean => {
    if (!professionalAvailability) {
      // Default: work Monday-Friday, not weekends
      return !isWeekend(date)
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = dayNames[date.getDay()] as keyof ProfessionalAvailability
    const dayAvailability = professionalAvailability[dayName]

    return dayAvailability?.available || false
  }

  // Get working hours for the selected date
  const getWorkingHoursForDate = (date: Date): { startTime: string; endTime: string } => {
    const defaultHours = { startTime: '09:00', endTime: '17:00' }

    if (!professionalAvailability) return defaultHours

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = dayNames[date.getDay()] as keyof ProfessionalAvailability
    const dayAvailability = professionalAvailability[dayName]

    if (!dayAvailability || !dayAvailability.available) return defaultHours

    return {
      startTime: dayAvailability.startTime || '09:00',
      endTime: dayAvailability.endTime || '17:00'
    }
  }

  const generateTimeSlots = (): string[] => {
    const slots: string[] = []

    // Get execution duration in hours
    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration

    let executionHours = 0
    if (executionSource) {
      if (executionSource.unit === 'hours') {
        executionHours = executionSource.value || 0
      } else {
        executionHours = (executionSource.value || 0) * 24
      }
    }

    // Get working hours for selected date
    let startTime = '09:00'
    let endTime = '17:00'

    if (selectedDate) {
      const dateObj = parseISO(selectedDate)
      const workingHours = getWorkingHoursForDate(dateObj)
      startTime = workingHours.startTime
      endTime = workingHours.endTime
    }

    // Parse start and end times
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)

    // Calculate working hours per day
    const workingHoursPerDay = (endHour * 60 + endMin - (startHour * 60 + startMin)) / 60

    // If execution time exceeds one working day, return empty array
    // This indicates the project should be in days mode instead
    if (executionHours > workingHoursPerDay) {
      console.warn(`Execution time (${executionHours}h) exceeds working hours per day (${workingHoursPerDay}h). This project should use days mode.`)
      return []
    }

    // Calculate last available slot: closing time - execution time
    const closingTimeMinutes = endHour * 60 + endMin
    const executionMinutes = executionHours * 60
    const lastSlotMinutes = closingTimeMinutes - executionMinutes

    // Generate slots from start to last available slot
    let currentMinutes = startHour * 60 + startMin

    while (currentMinutes <= lastSlotMinutes) {
      const hours = Math.floor(currentMinutes / 60)
      const minutes = currentMinutes % 60
      slots.push(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`)
      currentMinutes += 30 // 30-minute intervals
    }

    return slots
  }

  // Calculate end time for a given start time (hours mode)
  const calculateEndTime = (startTime: string): string => {
    if (!startTime) return ''

    // Get execution duration in hours
    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration

    let executionHours = 0
    if (executionSource) {
      if (executionSource.unit === 'hours') {
        executionHours = executionSource.value || 0
      } else {
        executionHours = (executionSource.value || 0) * 24
      }
    }

    const [hours, minutes] = startTime.split(':').map(Number)
    const startMinutes = hours * 60 + minutes
    const endMinutes = startMinutes + (executionHours * 60)

    const endHours = Math.floor(endMinutes / 60)
    const endMins = endMinutes % 60

    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`
  }

  /**
   * Format time range for display (e.g., "9:00 AM - 11:00 AM (2 hours)")
   *
   * FIX: Shows end time at completion, not just start time
   * This helps customers understand the full booking window
   */
  const formatTimeRange = (startTime: string): string => {
    if (!startTime) return ''

    const endTime = calculateEndTime(startTime)

    // Get execution duration
    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration

    let durationLabel = ''
    if (executionSource) {
      durationLabel = `${executionSource.value} ${executionSource.unit}`
    }

    // Format times to AM/PM
    const formatTime = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number)
      const period = hours >= 12 ? 'PM' : 'AM'
      const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
    }

    return `${formatTime(startTime)} - ${formatTime(endTime)} (${durationLabel})`
  }

  // Check if a time slot is in the past for today's date
  const isTimeSlotPast = (timeSlot: string): boolean => {
    if (!selectedDate) return false

    const selectedDateObj = parseISO(selectedDate)
    const today = startOfDay(new Date())

    // Only check if selected date is today
    if (selectedDateObj.getTime() !== today.getTime()) return false

    const [hours, minutes] = timeSlot.split(':').map(Number)
    const now = new Date()
    const slotTime = new Date()
    slotTime.setHours(hours, minutes, 0, 0)

    return slotTime < now
  }

  // Check if date is blocked (unavailable - includes company closures)
  const isDateBlocked = (dateString: string): boolean => {
    // Check if date is in blocked dates list
    if (blockedDates.blockedDates.includes(dateString)) {
      return true
    }

    // Check if date is in any blocked range
    const checkDate = parseISO(dateString)
    for (const range of blockedDates.blockedRanges) {
      const start = parseISO(range.startDate)
      const end = parseISO(range.endDate)
      if (
        (isAfter(checkDate, start) || checkDate.getTime() === start.getTime()) &&
        (isBefore(checkDate, end) || checkDate.getTime() === end.getTime())
      ) {
        return true
      }
    }

    return false
  }

  const getDisabledDays = () => {
    const disabled: Date[] = []

    // Add individual blocked dates
    blockedDates.blockedDates.forEach(dateStr => {
      disabled.push(parseISO(dateStr))
    })

    // Add date ranges
    const disabledRanges = blockedDates.blockedRanges.map(range => ({
      from: parseISO(range.startDate),
      to: parseISO(range.endDate)
    }))

    // Add a custom matcher for non-working days
    const nonWorkingDayMatcher = (date: Date) => {
      return !isProfessionalWorkingDay(date)
    }

    return [...disabled, ...disabledRanges, nonWorkingDayMatcher]
  }

  const getMinDate = (): string => {
    // If we have an earliestBookableDate from proposals, use that as the lower bound.
    const earliest = proposals?.earliestBookableDate
      ? parseISO(proposals.earliestBookableDate)
      : addDays(new Date(), 1)

    let checkDate = earliest

    // Find the first available date that is:
    // 1. A working day for the professional
    // 2. Not blocked
    for (let i = 0; i < 90; i++) {
      const dateStr = format(checkDate, 'yyyy-MM-dd')

      // Check if professional works this day and it's not blocked
      if (isProfessionalWorkingDay(checkDate) && !isDateBlocked(dateStr)) {
        return dateStr
      }
      checkDate = addDays(checkDate, 1)
    }

    // Default to tomorrow if no available date found
    return format(addDays(new Date(), 1), 'yyyy-MM-dd')
  }

  const convertDurationToDays = (
    duration?: AnyExecutionDuration,
    preferRange?: 'min' | 'max'
  ) => {
    if (!duration) return 0
    let value = duration.value

    if ((!value || value <= 0) && hasDurationRange(duration)) {
      const { range } = duration
      if (preferRange === 'max' && range.max) {
        value = range.max
      } else if (preferRange === 'min' && range.min) {
        value = range.min
      } else {
        value = range.max || range.min
      }
    }

    if (!value || value <= 0) return 0
    return duration.unit === 'days' ? value : value / 24
  }

  const calculateCompletionDate = (): Date | null => {
    if (!selectedDate) return null

    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration
    const bufferSource = selectedPackage?.buffer || project.bufferDuration
    const preferRange = selectedPackage?.pricing.type === 'rfq' ? 'max' : undefined
    const executionDays = convertDurationToDays(executionSource, preferRange)
    const bufferDays = convertDurationToDays(bufferSource)

    // IMPORTANT: Include buffer time in completion date shown to customer
    const totalWorkingDays = Math.ceil(executionDays + bufferDays)

    if (totalWorkingDays <= 0) {
      return parseISO(selectedDate)
    }

    let addedDays = 0
    let cursor = parseISO(selectedDate)

    // Count working days based on professional's availability
    while (addedDays < totalWorkingDays) {
      cursor = addDays(cursor, 1)
      const cursorStr = format(cursor, 'yyyy-MM-dd')

      // Only count days when professional is working and not blocked
      if (isProfessionalWorkingDay(cursor) && !isDateBlocked(cursorStr)) {
        addedDays++
      }
    }

    return cursor
  }

  const handleRFQAnswerChange = (index: number, answer: string) => {
    setRFQAnswers(prev => {
      const newAnswers = [...prev]
      newAnswers[index] = {
        question: project.rfqQuestions[index].question,
        answer,
        type: project.rfqQuestions[index].type
      }
      return newAnswers
    })
  }

  const handleExtraOptionToggle = (index: number) => {
    setSelectedExtraOptions(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  const validateStep = (): boolean => {
    console.log('[VALIDATION] Validating step:', currentStep)

    if (currentStep === 1) {
      if (selectedPackageIndex === null || !selectedPackage) {
        toast.error('Please select a package from the project page')
        return false
      }

      if (shouldCollectUsage(selectedPackage.pricing.type) && (!estimatedUsage || estimatedUsage < 1)) {
        toast.error('Please provide an estimated usage amount')
        return false
      }
    }

    if (currentStep === 2) {
      console.log('[VALIDATION] Step 2 - Checking date:', selectedDate)
      if (!selectedDate) {
        console.error('[VALIDATION] No date selected')
        toast.error('Please select a preferred start date')
        return false
      }

      if (isDateBlocked(selectedDate)) {
        console.error('[VALIDATION] Date is blocked:', selectedDate)
        toast.error('Selected date is not available. Please choose another date.')
        return false
      }

      // Check time selection for hourly projects
      if (project.timeMode === 'hours' && !selectedTime) {
        console.error('[VALIDATION] No time selected for hourly project')
        toast.error('Please select a time slot for your booking')
        return false
      }

      console.log('[VALIDATION] Step 2 valid')
    }

    if (currentStep === 3) {
      console.log('[VALIDATION] Step 3 - Checking RFQ answers')
      console.log('[VALIDATION] Total RFQ questions:', project.rfqQuestions.length)
      console.log('[VALIDATION] Current answers:', rfqAnswers)

      // Validate required RFQ questions
      for (let i = 0; i < project.rfqQuestions.length; i++) {
        const question = project.rfqQuestions[i]
        if (question.isRequired && (!rfqAnswers[i] || !rfqAnswers[i].answer.trim())) {
          console.error('[VALIDATION] Missing required answer for:', question.question)
          toast.error(`Please answer: ${question.question}`)
          return false
        }
      }
      console.log('[VALIDATION] Step 3 valid')
    }

    if (currentStep === 4) {
      console.log('[VALIDATION] Step 4 - Final review, no validation needed')
    }

    console.log('[VALIDATION] All validations passed')
    return true
  }

  const handleNext = () => {
    if (!validateStep()) return

    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    } else {
      onBack()
    }
  }

  const handleSubmit = async () => {
    console.log('[BOOKING] Submit initiated')
    console.log('[BOOKING] Current step:', currentStep)
    console.log('[BOOKING] Selected package index:', selectedPackageIndex)
    console.log('[BOOKING] Selected date:', selectedDate)

    if (!validateStep()) {
      console.error('[BOOKING] Validation failed')
      return
    }

    if (!selectedPackage || selectedPackageIndex === null) {
      toast.error('Please select a package before submitting')
      return
    }

    console.log('[BOOKING] Validation passed')
    setLoading(true)

    try {
      const usageRequired = shouldCollectUsage(selectedPackage.pricing.type)
      const usageDetails = usageRequired ? ` Estimated usage: ${estimatedUsage}.` : ''
      const additionalNotesText = additionalNotes ? ` Additional notes: ${additionalNotes}` : ''
      const serviceDescription = `Booking for ${project.title}. Selected package: ${selectedPackage.name}.${usageDetails}${additionalNotesText}`
      const totalPrice = calculateTotal()
      const addOnsPrice = selectedExtraOptions.reduce((sum, idx) => sum + (project.extraOptions[idx]?.price || 0), 0)

      const bookingData = {
        bookingType: 'project',
        projectId: project._id,
        preferredStartDate: selectedDate,
        preferredStartTime: project.timeMode === 'hours' && selectedTime ? selectedTime : undefined,
        selectedSubprojectIndex: selectedPackageIndex,
        estimatedUsage: usageRequired ? estimatedUsage : undefined,
        selectedExtraOptions: selectedExtraOptions.length > 0 ? selectedExtraOptions : undefined,
        rfqData: {
          serviceType: project.title,
          description: serviceDescription,
          answers: rfqAnswers,
          budget: totalPrice > 0 ? totalPrice : undefined
        },
        urgency: 'medium'
      }

      console.log('[BOOKING] Prepared booking data:', bookingData)
      console.log('[BOOKING] Backend URL:', process.env.NEXT_PUBLIC_BACKEND_URL)
      console.log('[BOOKING] Sending request...')

      const startTime = Date.now()

      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        console.error('[BOOKING] Request timeout after 30 seconds')
        controller.abort()
      }, 30000) // 30 second timeout

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/create`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(bookingData),
            signal: controller.signal
          }
        )

        clearTimeout(timeoutId) // Clear timeout if request completes

        const requestTime = Date.now() - startTime
        console.log(`[BOOKING] Response received in ${requestTime}ms`)
        console.log('[BOOKING] Response status:', response.status)
        console.log('[BOOKING] Response ok:', response.ok)

        const data = await response.json()
        console.log('[BOOKING] Response data:', data)

        if (response.ok && data.success) {
          console.log('[BOOKING] Success! Booking created:', data.booking?._id)
          toast.success('Booking request submitted successfully!')

          setTimeout(() => {
            console.log('[BOOKING] Redirecting to dashboard...')
            router.push('/dashboard')
          }, 2000)
        } else {
          console.error('[BOOKING] Request failed')
          console.error('[BOOKING] Status:', response.status)
          console.error('[BOOKING] Error message:', data.msg || data.message)
          console.error('[BOOKING] Full response:', data)

          // Handle specific error cases
          if (response.status === 401) {
            console.error('[BOOKING] Not authenticated')
            toast.error('Please log in to submit a booking request')
            setTimeout(() => {
              router.push('/login?redirect=/projects/' + project._id)
            }, 1500)
          } else if (response.status === 403) {
            console.error('[BOOKING] Permission denied')
            toast.error(data.msg || 'You do not have permission to create bookings')
          } else if (response.status === 400) {
            console.error('[BOOKING] Bad request - validation error')
            toast.error(data.msg || 'Please check your booking details and try again')
          } else if (response.status === 404) {
            console.error('[BOOKING] Resource not found')
            toast.error(data.msg || 'Project not found')
          } else {
            console.error('[BOOKING] Unknown error status:', response.status)
            toast.error(data.msg || data.message || 'Failed to create booking. Please try again.')
          }
        }
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId)

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('[BOOKING] Request was aborted (timeout)')
          toast.error('Request timed out. The server is taking too long to respond. Please try again.')
        } else {
          throw fetchError // Re-throw to be caught by outer catch
        }
      }
    } catch (error: unknown) {
      console.error('[BOOKING] Exception thrown')
      const err = error instanceof Error ? error : new Error('Unknown error')
      console.error('[BOOKING] Error name:', err.name)
      console.error('[BOOKING] Error message:', err.message)
      console.error('[BOOKING] Error stack:', err.stack)

      // Network or other errors
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        console.error('[BOOKING] Network/fetch error')
        toast.error('Network error. Please check your connection and try again.')
      } else if (err.name === 'AbortError') {
        console.error('[BOOKING] Request timeout')
        toast.error('Request timed out. Please try again.')
      } else {
        console.error('[BOOKING] Unexpected error type')
        toast.error('An unexpected error occurred. Please try again.')
      }
    } finally {
      console.log('[BOOKING] Request completed, resetting loading state')
      setLoading(false)
    }
  }

  const calculateTotal = (): number => {
    let total = 0

    if (selectedPackage) {
      if (selectedPackage.pricing.type === 'fixed' && selectedPackage.pricing.amount) {
        total += selectedPackage.pricing.amount
      }

      if (selectedPackage.pricing.type === 'unit' && selectedPackage.pricing.amount) {
        total += estimatedUsage * selectedPackage.pricing.amount
      }
    }

    selectedExtraOptions.forEach(idx => {
      const option = project.extraOptions[idx]
      if (option) {
        total += option.price
      }
    })

    return total
  }

  const projectedCompletionDate = calculateCompletionDate()

  const getPreparationDurationLabel = () => {
    if (typeof selectedPackage?.deliveryPreparation === 'number' && selectedPackage.deliveryPreparation > 0) {
      return `${selectedPackage.deliveryPreparation} days`
    }

    if (project.preparationDuration?.value && project.preparationDuration.value > 0) {
      return `${project.preparationDuration.value} ${project.preparationDuration.unit}`
    }

    return null
  }

  const getExecutionDurationLabel = () => {
    const duration = selectedPackage?.executionDuration || project.executionDuration
    if (!duration) return null

    if (selectedPackage?.pricing.type === 'rfq' && hasDurationRange(duration)) {
      const min = duration.range.min
      const max = duration.range.max
      if (min && max) return `${min} - ${max} ${duration.unit}`
      if (max) return `${max} ${duration.unit}`
      if (min) return `${min} ${duration.unit}`
    }

    if (!duration.value || duration.value <= 0) return null
    return `${duration.value} ${duration.unit}`
  }

  const getBufferDurationLabel = () => {
    const buffer = selectedPackage?.buffer || project.bufferDuration
    if (!buffer || !buffer.value || buffer.value <= 0) return null
    return `${buffer.value} ${buffer.unit}`
  }

  const preparationLabel = getPreparationDurationLabel()
  const executionLabel = getExecutionDurationLabel()
  const bufferLabel = getBufferDurationLabel()

  useEffect(() => {
    if (!selectedPackage) {
      setEstimatedUsage(1)
      return
    }

    if (!shouldCollectUsage(selectedPackage.pricing.type)) {
      setEstimatedUsage(1)
    }
  }, [selectedPackage])

  useEffect(() => {
    if (project.timeMode === 'hours') {
      setSelectedTime('')
    }
  }, [project.timeMode, selectedDate])

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={handleBack} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Book: {project.title}</h1>
          <p className="text-gray-600 mt-2">Complete the booking process in 4 simple steps</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {['Confirm Package', 'Choose Date', 'Answer Questions', 'Review & Pay'].map((step, idx) => (
              <div key={idx} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    currentStep > idx + 1
                      ? 'bg-green-600 border-green-600'
                      : currentStep === idx + 1
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {currentStep > idx + 1 ? (
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  ) : (
                    <span
                      className={`text-sm font-semibold ${
                        currentStep === idx + 1 ? 'text-white' : 'text-gray-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                  )}
                </div>
                {idx < 3 && (
                  <div
                    className={`h-1 w-20 mx-2 ${
                      currentStep > idx + 1 ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {['Confirm Package', 'Choose Date', 'Answer Questions', 'Review & Pay'].map((step, idx) => (
              <span
                key={idx}
                className={`text-xs ${currentStep === idx + 1 ? 'font-semibold text-blue-600' : 'text-gray-500'}`}
              >
                {step}
              </span>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="p-6">
            {/* Step 1: Confirm Package */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Confirm Your Package</h2>
                  <p className="text-gray-600 text-sm">
                    Each booking can include one package. Select your preferred option on the project page, then confirm it here.
                  </p>
                </div>

                {!selectedPackage && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm text-yellow-900">
                      No package selected yet. Please choose a package from the project page to continue.
                    </p>
                    <Button variant="outline" className="w-full" onClick={onBack}>
                      Back to Packages
                    </Button>
                  </div>
                )}

                {selectedPackage && (
                  <>
                    <Card>
                      <CardContent className="p-6 space-y-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">{selectedPackage.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{selectedPackage.description}</p>
                          </div>
                          <div className="text-right">
                            {selectedPackage.pricing.type === 'fixed' && selectedPackage.pricing.amount && (
                              <p className="text-2xl font-bold text-blue-600">
                                {formatCurrency(selectedPackage.pricing.amount)}
                              </p>
                            )}
                            {selectedPackage.pricing.type === 'unit' && selectedPackage.pricing.amount && (
                              <div>
                                <p className="text-2xl font-bold text-blue-600">
                                  {formatCurrency(selectedPackage.pricing.amount)}
                                  <span className="text-sm font-normal text-gray-500 ml-1">/unit</span>
                                </p>
                                {selectedPackage.pricing.minProjectValue && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Min. order {formatCurrency(selectedPackage.pricing.minProjectValue)}
                                  </p>
                                )}
                              </div>
                            )}
                            {selectedPackage.pricing.type === 'rfq' && (
                              <Badge variant="outline">Quote Required</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {shouldCollectUsage(selectedPackage.pricing.type) && (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="estimated-usage">Estimated Usage *</Label>
                          <Input
                            id="estimated-usage"
                            type="number"
                            min="1"
                            step="1"
                            value={estimatedUsage}
                            onChange={(e) => {
                              const value = Number(e.target.value)
                              setEstimatedUsage(Number.isNaN(value) ? 1 : Math.max(1, value))
                            }}
                            className="text-lg mt-2"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Provide your best estimate so we can calculate an indicative price.
                          </p>
                        </div>

                        {selectedPackage.pricing.amount && (
                          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-2">
                            <p className="text-sm text-gray-600">Estimated Price:</p>
                            <p className="text-4xl font-bold text-blue-600">
                              {formatCurrency(estimatedUsage * (selectedPackage.pricing.amount || 0))}
                            </p>
                            <p className="text-sm text-gray-500">
                              {estimatedUsage} units x {formatCurrency(selectedPackage.pricing.amount)}/unit
                            </p>
                            {selectedPackage.pricing.minProjectValue &&
                              estimatedUsage * (selectedPackage.pricing.amount || 0) <
                                selectedPackage.pricing.minProjectValue && (
                                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                                  <strong>Note:</strong> Minimum order value is {formatCurrency(selectedPackage.pricing.minProjectValue)}
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    )}

                    {!shouldCollectUsage(selectedPackage.pricing.type) && (
                      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                        Great choice! Click <strong>Next</strong> to select your preferred start date.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Step 2: Choose Date */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Choose Preferred Start Date</h2>
                  <p className="text-gray-600 text-sm mb-6">
                    Select when you&apos;d like the work to begin. Dates when team members are unavailable are disabled.
                  </p>
                </div>

                {loadingAvailability ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label>Preferred Start Date *</Label>
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-start text-left font-normal h-10"
                          onClick={() => setShowCalendar(!showCalendar)}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {selectedDate ? format(parseISO(selectedDate), 'MMMM d, yyyy') : 'Select a date'}
                        </Button>

                        {showCalendar && (
                          <div className="mt-3 p-6 border rounded-lg bg-white shadow-xl">
                            <DayPicker
                              mode="single"
                              selected={selectedDate ? parseISO(selectedDate) : undefined}
                              onSelect={(date) => {
                                if (date) {
                                  setSelectedDate(format(date, 'yyyy-MM-dd'))
                                  setShowCalendar(false)
                                }
                              }}
                              disabled={[
                                { before: proposals?.earliestBookableDate ? parseISO(proposals.earliestBookableDate) : addDays(new Date(), 1) },
                                { after: addDays(new Date(), 180) },
                                ...getDisabledDays()
                              ]}
                              modifiers={{
                                weekend: isWeekend,
                                blocked: (date) => isDateBlocked(format(date, 'yyyy-MM-dd'))
                              }}
                              styles={{
                                months: { width: '100%' },
                                month: { width: '100%' },
                                table: { width: '100%', maxWidth: '100%' },
                                head_cell: { width: '14.28%', textAlign: 'center' },
                                cell: { width: '14.28%', textAlign: 'center' },
                                day: {
                                  width: '40px',
                                  height: '40px',
                                  margin: '2px auto',
                                  fontSize: '14px'
                                },
                              }}
                              modifiersStyles={{
                                selected: {
                                  backgroundColor: '#3b82f6',
                                  color: 'white',
                                  fontWeight: 'bold'
                                },
                                disabled: {
                                  textDecoration: 'line-through',
                                  opacity: 0.3,
                                  cursor: 'not-allowed',
                                  backgroundColor: '#fee2e2',
                                  color: '#991b1b'
                                },
                                weekend: {
                                  backgroundColor: '#f3f4f6',
                                  color: '#6b7280'
                                },
                                blocked: {
                                  backgroundColor: '#fee2e2',
                                  textDecoration: 'line-through',
                                  opacity: 0.5
                                },
                                today: {
                                  fontWeight: 'bold',
                                  border: '2px solid #3b82f6'
                                }
                              }}
                            />

                            {/* Legend */}
                            <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-gray-100 border rounded"></div>
                                <span>Weekend</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-red-100 border rounded line-through text-center text-red-900">X</div>
                                <span>Blocked/Unavailable</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-blue-500 border rounded"></div>
                                <span>Selected</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 border-2 border-blue-500 rounded"></div>
                                <span>Today</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {proposals && (
                          <div className="mt-4 space-y-2 text-xs text-gray-600">
                            <p className="font-semibold text-gray-700">Suggested dates</p>
                            <div className="flex flex-wrap gap-2">
                              {proposals.mode === 'days' && proposals.shortestThroughputProposal && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const start = proposals.shortestThroughputProposal?.start
                                      ? format(parseISO(proposals.shortestThroughputProposal.start), 'yyyy-MM-dd')
                                      : ''
                                    if (start && !isDateBlocked(start)) {
                                      setSelectedDate(start)
                                    }
                                  }}
                                >
                                  Shortest throughput:{' '}
                                  {proposals.shortestThroughputProposal.start &&
                                    format(parseISO(proposals.shortestThroughputProposal.start), 'MMM d, yyyy')}
                                </Button>
                              )}

                              {proposals.earliestProposal && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const start = proposals.earliestProposal?.start
                                      ? format(parseISO(proposals.earliestProposal.start), 'yyyy-MM-dd')
                                      : ''
                                    if (start && !isDateBlocked(start)) {
                                      setSelectedDate(start)
                                    }
                                  }}
                                >
                                  Earliest possible:{' '}
                                  {proposals.earliestProposal.start &&
                                    format(parseISO(proposals.earliestProposal.start), 'MMM d, yyyy')}
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Time Slot Picker for Hourly Projects */}
                    {selectedDate && project.timeMode === 'hours' && (
                      <div className="space-y-4">
                        <div>
                          <Label className="text-base font-semibold">Select Time Slot *</Label>
                          <p className="text-sm text-gray-600 mt-1 mb-4">
                            Choose your preferred start time. Times shown are based on company working hours.
                          </p>
                        </div>

                        {generateTimeSlots().length === 0 ? (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-sm text-red-900 font-semibold mb-2">
                              ⚠️ No Time Slots Available
                            </p>
                            <p className="text-sm text-red-800">
                              This project&apos;s execution time ({selectedPackage?.executionDuration?.value || project.executionDuration?.value}{' '}
                              {selectedPackage?.executionDuration?.unit || project.executionDuration?.unit}) exceeds a single working day.
                              This project should be configured in <strong>days mode</strong> instead of hours mode.
                            </p>
                            <p className="text-sm text-red-800 mt-2">
                              Please contact the professional to update the project configuration.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-2">
                            {generateTimeSlots().map((timeSlot) => {
                              const isPast = isTimeSlotPast(timeSlot)
                              const isSelected = selectedTime === timeSlot

                              return (
                                <button
                                  key={timeSlot}
                                  type="button"
                                  onClick={() => !isPast && setSelectedTime(timeSlot)}
                                  disabled={isPast}
                                  className={`
                                    px-3 py-2 rounded-lg border text-sm font-medium transition-all
                                    ${isSelected
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                      : isPast
                                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through'
                                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                                    }
                                  `}
                                >
                                  {timeSlot}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {selectedTime && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-sm text-green-900">
                              <strong>Selected Time:</strong> {formatTimeRange(selectedTime)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedDate && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                        <p className="text-sm text-blue-900">
                          <strong>Selected Start Date:</strong> {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
                          {project.timeMode === 'hours' && selectedTime && (
                            <span className="ml-2 font-bold">{formatTimeRange(selectedTime)}</span>
                          )}
                        </p>
                        {(preparationLabel || executionLabel || bufferLabel) && (
                          <div className="border-t border-blue-300 pt-3 space-y-2">
                            {preparationLabel && (
                              <p className="text-sm text-blue-900">
                                <strong>Preparation Time:</strong> {preparationLabel}
                              </p>
                            )}
                            {executionLabel && (
                              <p className="text-sm text-blue-900">
                                <strong>Execution Duration:</strong> {executionLabel}
                              </p>
                            )}
                            {bufferLabel && (
                              <p className="text-sm text-blue-900">
                                <strong>Buffer Time:</strong> {bufferLabel}
                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                                  Reserved in contractor&apos;s calendar
                                </span>
                              </p>
                            )}
                          </div>
                        )}
                        {projectedCompletionDate && (
                          <>
                            <p className="text-sm text-blue-900 font-semibold pt-2 border-t border-blue-300">
                              <strong>Projected Completion:</strong> {format(projectedCompletionDate, 'EEEE, MMMM d, yyyy')}
                            </p>
                            <p className="text-xs text-blue-700 italic">
                              Weekends and blocked dates are skipped automatically when calculating this estimate.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: RFQ Questions & Add-ons */}
            {currentStep === 3 && (
              <div className="space-y-6">
                {/* Add-ons Section */}
                {project.extraOptions && project.extraOptions.length > 0 && (
                  <div className="space-y-4 pb-6 border-b">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">Add-On Options</h2>
                      <p className="text-gray-600 text-sm mb-4">
                        Select any additional options you would like to include with your booking
                      </p>
                    </div>

                    <div className="space-y-3">
                      {project.extraOptions.map((option, idx) => (
                        <div
                          key={idx}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            selectedExtraOptions.includes(idx)
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => handleExtraOptionToggle(idx)}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedExtraOptions.includes(idx)}
                              onCheckedChange={() => handleExtraOptionToggle(idx)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <h3 className="font-semibold text-gray-900">{option.name}</h3>
                                  {option.description && (
                                    <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                                  )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="font-bold text-blue-600">+{formatCurrency(option.price)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Price Breakdown */}
                    {selectedPackage && (
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-3">
                        <h3 className="font-semibold text-gray-900 mb-3">Price Summary</h3>

                        {/* Base Package Price */}
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">Package Price:</span>
                          <span className="font-semibold">
                            {selectedPackage.pricing.type === 'fixed' && selectedPackage.pricing.amount
                              ? formatCurrency(selectedPackage.pricing.amount)
                              : selectedPackage.pricing.type === 'unit' && selectedPackage.pricing.amount
                              ? formatCurrency(estimatedUsage * selectedPackage.pricing.amount)
                              : 'Quote Required'}
                          </span>
                        </div>

                        {/* Selected Add-ons */}
                        {selectedExtraOptions.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-blue-300">
                            <p className="text-sm font-semibold text-gray-700">Selected Add-ons:</p>
                            {selectedExtraOptions.map(idx => {
                              const option = project.extraOptions[idx]
                              if (!option) return null
                              return (
                                <div key={idx} className="flex justify-between items-center text-sm pl-4">
                                  <span className="text-gray-700">
                                    <CheckCircle2 className="h-4 w-4 inline mr-2 text-green-600" />
                                    {option.name}
                                  </span>
                                  <span className="font-semibold text-green-600">+{formatCurrency(option.price)}</span>
                                </div>
                              )
                            })}
                            {/* Add-ons Subtotal */}
                            <div className="flex justify-between items-center text-sm pt-2 border-t border-blue-200">
                              <span className="text-gray-700 font-semibold">Add-ons Total:</span>
                              <span className="font-semibold">
                                {formatCurrency(selectedExtraOptions.reduce((sum, idx) => sum + (project.extraOptions[idx]?.price || 0), 0))}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Grand Total */}
                        {calculateTotal() > 0 && (
                          <div className="flex justify-between items-center pt-3 border-t-2 border-blue-400">
                            <span className="text-lg font-bold text-gray-900">Grand Total:</span>
                            <span className="text-2xl font-bold text-blue-600">{formatCurrency(calculateTotal())}</span>
                          </div>
                        )}

                        {selectedPackage.pricing.type === 'unit' && (
                          <p className="text-xs text-gray-600 pt-2">
                            Based on {estimatedUsage} units at {formatCurrency(selectedPackage.pricing.amount)}/unit
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* RFQ Questions Section */}
                <div>
                  <h2 className="text-xl font-semibold mb-2">Project Details</h2>
                  <p className="text-gray-600 text-sm mb-6">
                    Please answer the following questions to help us understand your needs
                  </p>
                </div>

                {project.rfqQuestions.map((question, idx) => (
                  <div key={idx} className="space-y-2">
                    <Label htmlFor={`question-${idx}`}>
                      {question.question}
                      {question.isRequired && <span className="text-red-500 ml-1">*</span>}
                    </Label>

                    {question.type === 'text' && (
                      <Textarea
                        id={`question-${idx}`}
                        placeholder="Your answer..."
                        value={rfqAnswers[idx]?.answer || ''}
                        onChange={(e) => handleRFQAnswerChange(idx, e.target.value)}
                        rows={4}
                        required={question.isRequired}
                      />
                    )}

                    {question.type === 'multiple_choice' && question.options && (
                      <RadioGroup
                        value={rfqAnswers[idx]?.answer || ''}
                        onValueChange={(value) => handleRFQAnswerChange(idx, value)}
                      >
                        {question.options.map((option, optIdx) => (
                          <div key={optIdx} className="flex items-center space-x-2">
                            <RadioGroupItem value={option} id={`q${idx}-opt${optIdx}`} />
                            <Label htmlFor={`q${idx}-opt${optIdx}`} className="font-normal">
                              {option}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}

                    {question.type === 'attachment' && (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">File upload coming soon</p>
                        <Input
                          type="text"
                          placeholder="For now, please describe or provide a link"
                          value={rfqAnswers[idx]?.answer || ''}
                          onChange={(e) => handleRFQAnswerChange(idx, e.target.value)}
                          className="mt-3"
                        />
                      </div>
                    )}
                  </div>
                ))}

                {/* Additional Notes */}
                <div className="space-y-2 pt-4 border-t">
                  <Label htmlFor="additional-notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="additional-notes"
                    placeholder="Any other information you&apos;d like to share..."
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Step 4: Review & Payment */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Review Your Booking</h2>
                  <p className="text-gray-600 text-sm mb-6">Please review your selections before proceeding</p>
                </div>

                {/* Selected Package */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Selected Package</h3>
                  {selectedPackage ? (
                    <div className="bg-gray-50 p-4 rounded space-y-1">
                      <p className="font-medium text-gray-900">{selectedPackage.name}</p>
                      <p className="text-sm text-gray-600">{selectedPackage.description}</p>
                      <div className="text-sm text-gray-700 mt-2">
                        {selectedPackage.pricing.type === 'fixed' && selectedPackage.pricing.amount && (
                          <span className="font-semibold text-blue-600">{formatCurrency(selectedPackage.pricing.amount)}</span>
                        )}
                        {selectedPackage.pricing.type === 'unit' && selectedPackage.pricing.amount && (
                          <span className="font-semibold text-blue-600">
                            {formatCurrency(selectedPackage.pricing.amount)}
                            <span className="text-xs font-normal text-gray-500 ml-1">/unit</span>
                          </span>
                        )}
                        {selectedPackage.pricing.type === 'rfq' && (
                          <Badge variant="outline">Quote Required</Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No package selected.</p>
                  )}
                </div>

                {/* Selected Date */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Project Timeline</h3>
                  <div className="bg-gray-50 p-4 rounded space-y-3">
                    <p className="text-sm">
                      <strong>Start Date:</strong> {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
                      {project.timeMode === 'hours' && selectedTime && (
                        <span className="ml-2 font-semibold">{formatTimeRange(selectedTime)}</span>
                      )}
                    </p>
                    {(preparationLabel || executionLabel || bufferLabel) && (
                      <div className="border-t border-gray-300 pt-3 space-y-2">
                        {preparationLabel && (
                          <p className="text-sm">
                            <strong>Preparation Time:</strong> {preparationLabel}
                          </p>
                        )}
                        {executionLabel && (
                          <p className="text-sm">
                            <strong>Execution Duration:</strong> {executionLabel}
                          </p>
                        )}
                        {bufferLabel && (
                          <p className="text-sm">
                            <strong>Buffer Time:</strong> {bufferLabel}
                            <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                              Reserved in contractor&apos;s calendar
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                    {projectedCompletionDate && (
                      <>
                        <p className="text-sm font-semibold pt-2 border-t border-gray-300">
                          <strong>Expected Completion:</strong> {format(projectedCompletionDate, 'EEEE, MMMM d, yyyy')}
                        </p>
                        <p className="text-xs text-gray-600 italic">
                          Weekends and blocked dates are automatically excluded from this estimate.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Price Breakdown */}
                {selectedPackage && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Price Summary</h3>
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-3">
                      {/* Base Package Price */}
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-700">Package Price:</span>
                        <span className="font-semibold">
                          {selectedPackage.pricing.type === 'fixed' && selectedPackage.pricing.amount
                            ? formatCurrency(selectedPackage.pricing.amount)
                            : selectedPackage.pricing.type === 'unit' && selectedPackage.pricing.amount
                            ? formatCurrency(estimatedUsage * selectedPackage.pricing.amount)
                            : 'Quote Required'}
                        </span>
                      </div>

                      {selectedPackage.pricing.type === 'unit' && estimatedUsage && selectedPackage.pricing.amount && (
                        <p className="text-xs text-gray-600">
                          ({estimatedUsage} units × {formatCurrency(selectedPackage.pricing.amount)}/unit)
                        </p>
                      )}

                      {/* Selected Add-ons */}
                      {selectedExtraOptions.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-blue-300">
                          <p className="text-sm font-semibold text-gray-700">Selected Add-ons:</p>
                          {selectedExtraOptions.map(idx => {
                            const option = project.extraOptions[idx]
                            if (!option) return null
                            return (
                              <div key={idx} className="flex justify-between items-start text-sm pl-4">
                                <div className="flex-1">
                                  <div className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                      <p className="text-gray-700 font-medium">{option.name}</p>
                                      {option.description && (
                                        <p className="text-xs text-gray-600 mt-0.5">{option.description}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className="font-semibold text-green-600 ml-4 flex-shrink-0">
                                  +{formatCurrency(option.price)}
                                </span>
                              </div>
                            )
                          })}

                          {/* Add-ons Subtotal */}
                          <div className="flex justify-between items-center text-sm pt-2 border-t border-blue-200">
                            <span className="text-gray-700 font-semibold">Add-ons Total:</span>
                            <span className="font-semibold">
                              {formatCurrency(selectedExtraOptions.reduce((sum, idx) => sum + (project.extraOptions[idx]?.price || 0), 0))}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Separator */}
                      {calculateTotal() > 0 && (
                        <div className="border-t-2 border-blue-400 my-2"></div>
                      )}

                      {/* Grand Total */}
                      {calculateTotal() > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-bold text-gray-900">Grand Total:</span>
                          <span className="text-2xl font-bold text-blue-600">{formatCurrency(calculateTotal())}</span>
                        </div>
                      )}

                      {selectedPackage.pricing.type !== 'rfq' && (
                        <p className="text-xs text-gray-600 pt-2 border-t border-blue-200">
                          *Final price may vary based on professional&apos;s assessment
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Section (Dummy) */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
                  <h3 className="font-semibold text-yellow-900 mb-2">Payment Coming Soon</h3>
                  <p className="text-sm text-yellow-800">
                    Payment integration will be added in the next phase. For now, clicking &quot;Submit Booking&quot; will create your booking request.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={handleBack}>
            {currentStep === 1 ? 'Cancel' : 'Previous'}
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext}>Next Step</Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Booking Request'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
