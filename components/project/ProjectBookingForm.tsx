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
import { format, addDays, isAfter, isBefore, parseISO } from 'date-fns'

interface Project {
  _id: string;
  title: string;
  priceModel?: string;
  timeMode?: 'hours' | 'days';
  preparationDuration?: {
    value: number;
    unit: 'hours' | 'days';
  };
  executionDuration?: {
    value: number;
    unit: 'hours' | 'days';
  };
  firstAvailableDate?: string | null;
  bufferDuration?: {
    value: number;
    unit: 'hours' | 'days';
  };
  subprojects: Array<{
    name: string;
    description: string;
    pricing: {
      type: 'fixed' | 'unit' | 'rfq';
      amount?: number;
      priceRange?: { min: number; max: number };
      minOrderQuantity?: number; // Unit pricing: minimum order quantity
    };
    preparationDuration?: {
      value: number;
      unit: 'hours' | 'days';
    };
    executionDuration?: {
      value?: number;
      unit: 'hours' | 'days';
      range?: { min?: number; max?: number };
    };
    buffer?: {
      value?: number;
      unit: 'hours' | 'days';
    };
  }>;
  rfqQuestions: Array<{
    question: string;
    type: 'text' | 'multiple_choice' | 'attachment';
    options?: string[];
    isRequired: boolean;
  }>;
  extraOptions: Array<{
    name: string;
    description?: string;
    price: number;
  }>;
  postBookingQuestions?: Array<{
    id?: string;
    question: string;
    type: 'text' | 'multiple_choice' | 'attachment';
    options?: string[];
    isRequired: boolean;
  }>;
  distance?: {
    address?: string;
    maxKmRange?: number;
    useCompanyAddress?: boolean;
    noBorders?: boolean;
    borderLevel?: 'none' | 'country' | 'province';
    location?: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
}

interface ProjectBookingFormProps {
  project: Project
  onBack: () => void
}

interface RFQAnswer {
  question: string
  answer: string
  type: string
}

interface BlockedDates {
  blockedDates: string[];
  blockedRanges: BlockedRange[];
  resourcePolicy?: ResourcePolicy;
}

interface ScheduleProposalsResponse {
  success: boolean;
  proposals?: {
    mode: 'hours' | 'days';
    earliestBookableDate: string;
    earliestProposal?: {
      start: string;
      end: string;
      executionEnd: string;
    };
    shortestThroughputProposal?: {
      start: string;
      end: string;
      executionEnd: string;
    };
    _debug?: {
      subprojectIndex?: number;
      projectId?: string;
      prepEnd: string;
      searchStart: string;
      preparationDuration: string;
      executionDuration: string;
      timeZone: string;
      useMultiResource: boolean;
      resourcePolicy: {
        minResources: number;
        totalResources: number;
        minOverlapPercentage: number;
      } | null;
      earliestBookableDateRaw: string;
      usedFallback: boolean;
    };
  };
}

export default function ProjectBookingForm({ project, onBack }: ProjectBookingFormProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [blockedDates, setBlockedDates] = useState<BlockedDates>({ blockedDates: [], blockedRanges: [] })
  const [loadingAvailability, setLoadingAvailability] = useState(true)
  const [proposals, setProposals] = useState<ScheduleProposalsResponse['proposals'] | null>(null)


  // Form state
  const [selectedSubprojects, setSelectedSubprojects] = useState<number[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [rfqAnswers, setRFQAnswers] = useState<RFQAnswer[]>([])
  const [selectedExtraOptions, setSelectedExtraOptions] = useState<number[]>([])
  const [additionalNotes, setAdditionalNotes] = useState('')

  useEffect(() => {
    fetchTeamAvailability()
    fetchScheduleProposals()
  }, [])

  const fetchTeamAvailability = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/availability`
      )
      const data = await response.json()

      if (data.success) {
        setBlockedDates(data)
      }
    } catch (error) {
      console.error('Error fetching availability:', error)
      toast.error('Failed to load availability calendar')
    } finally {
      setLoadingAvailability(false)
    }
  }

  if (!value || value <= 0) return 0;
  return duration.unit === 'days' ? value : value / 24;
};

const isDev = process.env.NODE_ENV === 'development';

export default function ProjectBookingForm({
  project,
  onBack,
  selectedSubprojectIndex,
}: ProjectBookingFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [blockedDates, setBlockedDates] = useState<BlockedDates>({
    blockedDates: [],
    blockedRanges: [],
  });
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [loadingWorkingHours, setLoadingWorkingHours] = useState(true);
  const [proposals, setProposals] = useState<
    ScheduleProposalsResponse['proposals'] | null
  >(null);
  const [professionalAvailability, setProfessionalAvailability] =
    useState<ProfessionalAvailability | null>(null);
  const [professionalTimezone, setProfessionalTimezone] =
    useState<string>('UTC');
  const [viewerTimeZone, setViewerTimeZone] = useState<string>('UTC');
  const PARTIAL_BLOCK_THRESHOLD_HOURS = 4;

  // Form state
  const [selectedPackageIndex, setSelectedPackageIndex] = useState<
    number | null
  >(
    typeof selectedSubprojectIndex === 'number' ? selectedSubprojectIndex : null
  );
  const [estimatedUsage, setEstimatedUsage] = useState<number>(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [hasUserSelectedDate, setHasUserSelectedDate] = useState(false);
  const [scheduleWindow, setScheduleWindow] = useState<{
    scheduledStartDate: string;
    scheduledExecutionEndDate: string;
    scheduledBufferStartDate?: string;
    scheduledBufferEndDate?: string;
    scheduledBufferUnit?: string;
    throughputDays?: number;
  } | null>(null);
  const [loadingScheduleWindow, setLoadingScheduleWindow] = useState(false);
  const [rfqAnswers, setRFQAnswers] = useState<RFQAnswer[]>([]);
  const [selectedExtraOptions, setSelectedExtraOptions] = useState<number[]>(
    []
  );
  const [additionalNotes, setAdditionalNotes] = useState('');
  const selectedPackage =
    selectedPackageIndex !== null
      ? project.subprojects[selectedPackageIndex]
      : null;

  // Check if unit pricing - either explicit type or inferred from priceModel for old projects
  const isUnitPricing =
    selectedPackage?.pricing?.type === 'unit' ||
    (!selectedPackage?.pricing?.type &&
      isUnitBasedPriceModel(project.priceModel));

  // Unit pricing: minimum order quantity (customer must order at least this)
  // For old projects without minOrderQuantity, default to 1
  const minOrderQuantity =
    isUnitPricing &&
    typeof selectedPackage?.pricing?.minOrderQuantity === 'number' &&
    selectedPackage.pricing.minOrderQuantity > 0
      ? selectedPackage.pricing.minOrderQuantity
      : isUnitPricing
      ? 1
      : undefined;

  // Derive mode from execution duration unit (replaces root-level timeMode)
  const projectMode: 'hours' | 'days' =
    selectedPackage?.executionDuration?.unit ||
    project.executionDuration?.unit ||
    'days';
  const professionalTz = normalizeTimezone(professionalTimezone);
  // Formats DayPicker/local Date objects in local timezone (date-only value from the picker).
  // Contrast with toLocalDateKeyFromInstant which uses professionalTz for real UTC instants.
  const toLocalDateKey = useCallback(
    (date: Date) => format(date, 'yyyy-MM-dd'),
    []
  );
  // Instant key (treat Date as a real UTC instant from the backend)
  const toLocalDateKeyFromInstant = (date: Date) =>
    formatInTimeZone(date, professionalTz, 'yyyy-MM-dd');
  const fromProfessionalDateKey = useCallback(
    (dateKey: string) =>
      fromZonedTime(`${dateKey}T00:00:00`, professionalTz),
    [professionalTz]
  );
  const debugProjectId = isDev
    ? process.env.NEXT_PUBLIC_DEBUG_PROJECT_ID?.trim()
    : undefined;
  const debugDateKeys = isDev
    ? (process.env.NEXT_PUBLIC_DEBUG_DATE_KEYS ?? '')
        .split(',')
        .map((dateKey) => dateKey.trim())
        .filter(Boolean)
    : [];
  const debugSignatureRef = useRef('');
  const isDebugProject =
    Boolean(debugProjectId) && String(project._id) === debugProjectId;
  const debugLog = useMemo(
    () => (isDebugProject ? console.log.bind(console) : undefined),
    [isDebugProject]
  );
  const debugWarn = useMemo(
    () => (isDebugProject ? console.warn.bind(console) : undefined),
    [isDebugProject]
  );
  const debugError = useMemo(
    () => (isDebugProject ? console.error.bind(console) : undefined),
    [isDebugProject]
  );
  const debugTable = useMemo(
    () => (isDebugProject ? console.table.bind(console) : undefined),
    [isDebugProject]
  );

  useEffect(() => {
    if (typeof selectedSubprojectIndex === 'number') {
      setSelectedPackageIndex(selectedSubprojectIndex);
      setHasUserSelectedDate(false);
    }
  }, [selectedSubprojectIndex]);

  useEffect(() => {
    // Set viewer's timezone on mount
    setViewerTimeZone(getViewerTimezone());

    // Note: fetchTeamAvailability is called in the selectedPackageIndex useEffect
    // to ensure it always uses the correct package index
    fetchProfessionalWorkingHours();

    // Log for debugging available date consistency
    debugLog?.(
      '[BOOKING FORM] Initializing booking form for project:',
      project._id
    );
    debugLog?.(
      '[BOOKING FORM] First available date from search/project page:',
      project.firstAvailableDate
    );
  }, []);

  useEffect(() => {
    const packageIndex = typeof selectedPackageIndex === 'number'
      ? selectedPackageIndex
      : undefined;
    fetchTeamAvailability(packageIndex);
    fetchScheduleProposals(packageIndex);
    setHasUserSelectedDate(false);
  }, [selectedPackageIndex]);

  const getFormattedDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const parsed = parseISO(dateStr);
    if (Number.isNaN(parsed.getTime())) return null;
    return toLocalDateKeyFromInstant(parsed);
  };

  useEffect(() => {
    if (!proposals) {
      return;
    }

    const proposalDate = getFormattedDate(proposals.earliestProposal?.start);
    const fallbackDate = getFormattedDate(proposals.earliestBookableDate);
    const initialDate = proposalDate || fallbackDate;

    if (
      initialDate &&
      (!selectedDate ||
        (!hasUserSelectedDate && selectedDate !== initialDate)) &&
      !isDateBlocked(initialDate)
    ) {
      setSelectedDate(initialDate);
    }
  }, [proposals, selectedDate, hasUserSelectedDate]);

  useEffect(() => {
    if (selectedDate || hasUserSelectedDate) {
      return;
    }

    if (!loadingAvailability && !loadingWorkingHours) {
      debugLog?.(
        '[BOOKING FORM] All data loaded, selecting default preferred start date...'
      );
      debugLog?.(
        '[BOOKING FORM] Professional availability:',
        professionalAvailability
      );

      let defaultDate: string | null = null;
      const earliestProposal = getFormattedDate(
        proposals?.earliestProposal?.start
      );
      const earliestBookable = getFormattedDate(
        proposals?.earliestBookableDate
      );

      if (earliestProposal && !isDateBlocked(earliestProposal)) {
        defaultDate = earliestProposal;
        debugLog?.(
          '[BOOKING FORM] Using earliest proposal date:',
          defaultDate
        );
      } else if (earliestBookable && !isDateBlocked(earliestBookable)) {
        defaultDate = earliestBookable;
        debugLog?.(
          '[BOOKING FORM] Using earliest bookable date:',
          defaultDate
        );
      } else {
        defaultDate = getMinDate();
      }

      if (defaultDate) {
        setSelectedDate(defaultDate);

        if (project.firstAvailableDate) {
          const projectAvailableDate = format(
            parseISO(project.firstAvailableDate),
            'yyyy-MM-dd'
          );
          if (projectAvailableDate !== defaultDate) {
            debugWarn?.('[BOOKING FORM] Date discrepancy detected!');
            debugWarn?.(
              '[BOOKING FORM] Search/Project page showed:',
              projectAvailableDate
            );
            debugWarn?.(
              '[BOOKING FORM] Actual first available date:',
              defaultDate
            );
            debugWarn?.(
              '[BOOKING FORM] This may be due to bookings made after viewing the search results'
            );
          } else {
            debugLog?.('[BOOKING FORM] Available dates match:', defaultDate);
          }
        }
      }
    }
  }, [
    loadingAvailability,
    loadingWorkingHours,
    blockedDates,
    professionalAvailability,
    proposals,
    selectedDate,
    hasUserSelectedDate,
  ]);

  useEffect(() => {
    if (projectMode !== 'hours') {
      return;
    }
    if (!selectedDate) {
      setSelectedTime('');
      return;
    }
    const dateObj = parseISO(selectedDate);
    if (Number.isNaN(dateObj.getTime())) {
      return;
    }
    const slots = generateTimeSlotsForDate(dateObj);
    if (slots.length === 0) {
      setSelectedTime('');
      return;
    }
    if (!selectedTime || !slots.includes(selectedTime)) {
      setSelectedTime(slots[0]);
    }
  }, [
    selectedDate,
    projectMode,
    blockedDates,
    professionalAvailability,
    selectedPackage,
    selectedTime,
  ]);

  const fetchScheduleWindow = useCallback(async (startDate: string, startTime?: string) => {
    try {
      setLoadingScheduleWindow(true);
      let url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/schedule-window?startDate=${startDate}`;
      if (typeof selectedPackageIndex === 'number') {
        url += `&subprojectIndex=${selectedPackageIndex}`;
      }
      if (startTime) {
        url += `&startTime=${startTime}`;
      }
      debugLog?.('%c[SCHEDULE WINDOW] Fetching...', 'color: #ff6600; font-weight: bold', {
        url,
        startDate,
        startTime,
        selectedPackageIndex
      });
      const response = await fetch(url);
      const data = await response.json();
      debugLog?.('%c[SCHEDULE WINDOW] Response:', 'color: #ff6600; font-weight: bold', data);
      if (data.success && data.window) {
        debugLog?.('%c[SCHEDULE WINDOW] Setting scheduleWindow state:', 'color: #00cc00; font-weight: bold', data.window);
        setScheduleWindow(data.window);
      } else {
        debugWarn?.('%c[SCHEDULE WINDOW] Not available:', 'color: #cc0000', data.error);
        setScheduleWindow(null);
      }
    } catch (error) {
      debugError?.('%c[SCHEDULE WINDOW] Error:', 'color: #cc0000', error);
      setScheduleWindow(null);
    } finally {
      setLoadingScheduleWindow(false);
      debugLog?.('[SCHEDULE WINDOW] Loading complete');
    }
  }

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

  const getMinDate = (): string => {
    // If we have an earliestBookableDate from proposals, use that as the lower bound.
    const earliest = proposals?.earliestBookableDate
      ? parseISO(proposals.earliestBookableDate)
      : addDays(new Date(), 1);

    let checkDate = earliest

    // Find the first available date
    for (let i = 0; i < 90; i++) {
      const dateStr = format(checkDate, 'yyyy-MM-dd')
      if (!isDateBlocked(dateStr)) {
        return dateStr
      }
      checkDate = addDays(checkDate, 1)
    }

    // Default to tomorrow if no available date found
    return format(addDays(new Date(), 1), 'yyyy-MM-dd')
  }

  const handleSubprojectToggle = (index: number) => {
    setSelectedSubprojects(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
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
      console.log('[VALIDATION] Step 1 - Checking subprojects:', selectedSubprojects.length)
      if (selectedSubprojects.length === 0) {
        console.error('[VALIDATION] ❌ No subprojects selected')
        toast.error('Please select at least one package')
        return false
      }
      console.log('[VALIDATION] ✅ Step 1 valid')
    }

    if (currentStep === 2) {
      console.log('[VALIDATION] Step 2 - Checking date:', selectedDate)
      if (!selectedDate) {
        console.error('[VALIDATION] ❌ No date selected')
        toast.error('Please select a preferred start date')
        return false
      }

      if (isDateBlocked(selectedDate)) {
        console.error('[VALIDATION] ❌ Date is blocked:', selectedDate)
        toast.error('Selected date is not available. Please choose another date.')
        return false
      }
      console.log('[VALIDATION] ✅ Step 2 valid')
    }

    if (currentStep === 3) {
      console.log('[VALIDATION] Step 3 - Checking RFQ answers')
      console.log('[VALIDATION] Total RFQ questions:', project.rfqQuestions.length)
      console.log('[VALIDATION] Current answers:', rfqAnswers)

      // Validate required RFQ questions
      for (let i = 0; i < project.rfqQuestions.length; i++) {
        const question = project.rfqQuestions[i]
        if (question.isRequired && (!rfqAnswers[i] || !rfqAnswers[i].answer.trim())) {
          console.error('[VALIDATION] ❌ Missing required answer for:', question.question)
          toast.error(`Please answer: ${question.question}`)
          return false
        }
      }
      console.log('[VALIDATION] ✅ Step 3 valid')
    }

    if (currentStep === 4) {
      console.log('[VALIDATION] Step 4 - Final review, no validation needed')
    }

    console.log('[VALIDATION] ✅ All validations passed')
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
    console.log('[BOOKING] Selected subprojects:', selectedSubprojects)
    console.log('[BOOKING] Selected date:', selectedDate)

    if (!validateStep()) {
      console.error('[BOOKING] Validation failed')
      return
    }

    console.log('[BOOKING] Validation passed')
    setLoading(true)

    try {
      // Prepare the service description from selected subprojects
      const selectedSubprojectNames = selectedSubprojects.map(idx => project.subprojects[idx].name)
      const serviceDescription = `Booking for ${project.title}. Selected packages: ${selectedSubprojectNames.join(', ')}.${additionalNotes ? ` Additional notes: ${additionalNotes}` : ''}`

      // Prepare booking data matching backend schema
      const bookingData = {
        bookingType: 'project',
        projectId: project._id,
        preferredStartDate: selectedDate,
        rfqData: {
          serviceType: project.title,
          description: serviceDescription,
          answers: rfqAnswers,
          budget: calculateTotal() > 0 ? calculateTotal() : undefined
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
        console.error('[BOOKING] ⏱️ Request timeout after 30 seconds')
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
          console.log('[BOOKING] ✅ Success! Booking created:', data.booking?._id)
          toast.success('Booking request submitted successfully!')

          setTimeout(() => {
            console.log('[BOOKING] Redirecting to dashboard...')
            router.push('/dashboard')
          }, 2000)
        } else {
          console.error('[BOOKING] ❌ Request failed')
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
          console.error('[BOOKING] ❌ Request was aborted (timeout)')
          toast.error('Request timed out. The server is taking too long to respond. Please try again.')
        } else {
          throw fetchError // Re-throw to be caught by outer catch
        }
      }
    } catch (error: unknown) {
      console.error('[BOOKING] ??O Exception thrown')
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

    // Add subproject prices
    selectedSubprojects.forEach(idx => {
      const subproject = project.subprojects[idx]
      if (subproject.pricing.type === 'fixed' && subproject.pricing.amount) {
        total += subproject.pricing.amount
      }
    })

    // Add extra options
    selectedExtraOptions.forEach(idx => {
      total += project.extraOptions[idx].price
    })

    return total
  }

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
            {['Select Packages', 'Choose Date', 'Answer Questions', 'Review & Pay'].map((step, idx) => (
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
            {['Select Packages', 'Choose Date', 'Answer Questions', 'Review & Pay'].map((step, idx) => (
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
            {/* Step 1: Select Packages */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Select Packages</h2>
                  <p className="text-gray-600 text-sm mb-6">Choose one or more service packages</p>
                </div>

                <div className="space-y-4">
                  {project.subprojects.map((subproject, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedSubprojects.includes(idx)
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                      onClick={() => handleSubprojectToggle(idx)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedSubprojects.includes(idx)}
                            onCheckedChange={() => handleSubprojectToggle(idx)}
                          />
                          <div>
                            <h3 className="font-semibold text-lg">{subproject.name}</h3>
                            <p className="text-gray-600 text-sm mt-1">{subproject.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {subproject.pricing.type === 'fixed' && subproject.pricing.amount && (
                            <p className="text-xl font-bold text-blue-600">€{subproject.pricing.amount}</p>
                          )}
                          {subproject.pricing.type === 'rfq' && (
                            <Badge variant="outline">Quote Required</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
                      <Label htmlFor="preferred-date">Preferred Start Date *</Label>
                        <div className="relative mt-2">
                          <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400 pointer-events-none" />
                          <Input
                            id="preferred-date"
                            type="date"
                            value={selectedDate}
                            min={getMinDate()}
                            max={format(addDays(new Date(), 180), 'yyyy-MM-dd')}
                            onChange={(e) => {
                              const date = e.target.value
                              if (isDateBlocked(date)) {
                                toast.error('This date is not available. Please choose another date.')
                                return
                              }
                              setSelectedDate(date)
                            }}
                            className="pl-10"
                            required
                          />
                        </div>

                        {selectedPackage.pricing.type !== 'rfq' &&
                          selectedPackage.pricing.amount && (
                            <div className='bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-2'>
                              <p className='text-sm text-gray-600'>
                                Estimated Price:
                              </p>
                              <p className='text-4xl font-bold text-blue-600'>
                                {formatCurrency(
                                  estimatedUsage *
                                    (selectedPackage.pricing.amount || 0)
                                )}
                              </p>
                              <p className='text-sm text-gray-500'>
                                {estimatedUsage}{' '}
                                {getUnitLabel(project.priceModel)} x{' '}
                                {formatCurrency(selectedPackage.pricing.amount)}
                                /{getUnitLabel(project.priceModel)}
                              </p>
                            </div>
                          )}
                      </div>
                    )}

                    {!shouldCollectUsage(selectedPackage.pricing.type) && (
                      <div className='rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900'>
                        Great choice! Click <strong>Next</strong> to select your
                        preferred start date.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Step 2: Choose Date */}
            {currentStep === 2 && (
              <div className='space-y-4'>
                <div>
                  <h2 className='text-xl font-semibold mb-2'>
                    Choose Preferred Start Date
                  </h2>
                  <p className='text-gray-600 text-sm mb-4'>
                    Select when you&apos;d like the work to begin. Dates when
                    team members are unavailable are disabled.
                  </p>
                  {blockedDates.resourcePolicy &&
                    blockedDates.resourcePolicy.minResources > 1 && (
                      <div className='bg-blue-50 border border-blue-200 rounded-md p-3 mb-4'>
                        <p className='text-sm text-blue-800'>
                          <span className='font-medium'>Team requirement:</span>{' '}
                          {blockedDates.resourcePolicy.minResources} of{' '}
                          {blockedDates.resourcePolicy.totalResources} team
                          members must be available for at least{' '}
                          {blockedDates.resourcePolicy.minOverlapPercentage}% of
                          the scheduled time.
                        </p>
                      </div>
                    )}
                </div>

                {loadingAvailability || loadingWorkingHours ? (
                  <div className='flex items-center justify-center py-12'>
                    <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
                    <p className='ml-3 text-gray-600'>
                      Loading availability and working hours...
                    </p>
                  </div>
                ) : (
                  <div className='space-y-4'>
                    <div>
                      <Label>Preferred Start Date *</Label>
                      <div className='mt-2'>
                        <Button
                          type='button'
                          variant='outline'
                          className='w-full justify-start text-left font-normal h-10'
                          onClick={() => setShowCalendar(!showCalendar)}
                        >
                          <Calendar className='mr-2 h-4 w-4' />
                          {selectedDate
                            ? format(parseISO(selectedDate), 'MMMM d, yyyy')
                            : 'Select a date'}
                        </Button>

                        {showCalendar && (
                          <div className='mt-3 p-6 border rounded-lg bg-white shadow-xl'>
                            <DayPicker
                              mode='single'
                              selected={
                                selectedDate
                                  ? parseISO(selectedDate)
                                  : undefined
                              }
                              onSelect={(date) => {
                                if (date) {
                                  // Prevent selection of weekends
                                  if (isWeekend(date)) {
                                    toast.error(
                                      'Weekends are not available for booking'
                                    );
                                    return;
                                  }
                                  // Prevent selection of other non-working days
                                  if (!isProfessionalWorkingDay(date)) {
                                    toast.error(
                                      'This day is not a working day'
                                    );
                                    return;
                                  }
                                  // For hours mode, check if there are available time slots
                                  if (projectMode === 'hours') {
                                    const dateStr = toLocalDateKey(date);
                                    if (isDateBlocked(dateStr)) {
                                      toast.error(
                                        'No available time slots on this day'
                                      );
                                      return;
                                    }
                                  }
                                  setHasUserSelectedDate(true);
                                  setSelectedDate(toLocalDateKey(date));
                                  setShowCalendar(false);
                                }
                              }}
                              disabled={[
                                {
                                  before: proposals?.earliestBookableDate
                                    ? startOfDay(
                                        parseISO(proposals.earliestBookableDate)
                                      )
                                    : addDays(startOfDay(new Date()), 1),
                                },
                                { after: addDays(startOfDay(new Date()), 180) },
                                ...getDisabledDays(),
                              ]}
                              modifiers={{
                                weekend: isWeekend, // Style weekends differently from blocked (gray, not red)
                                blocked: (date) =>
                                  isDateBlocked(toLocalDateKey(date)),
                                nonWorking: (date) =>
                                  !isProfessionalWorkingDay(date) &&
                                  !isWeekend(date),
                              }}
                              styles={{
                                months: { width: '100%' },
                                month: { width: '100%' },
                                table: { width: '100%', maxWidth: '100%' },
                                head_cell: {
                                  width: '14.28%',
                                  textAlign: 'center',
                                },
                                cell: { width: '14.28%', textAlign: 'center' },
                                day: {
                                  width: '40px',
                                  height: '40px',
                                  margin: '2px auto',
                                  fontSize: '14px',
                                },
                              }}
                              modifiersStyles={{
                                selected: {
                                  backgroundColor: '#3b82f6',
                                  color: 'white',
                                  fontWeight: 'bold',
                                },
                                disabled: {
                                  textDecoration: 'line-through',
                                  opacity: 0.3,
                                  cursor: 'not-allowed',
                                  backgroundColor: '#fee2e2',
                                  color: '#991b1b',
                                },
                                weekend: {
                                  backgroundColor: '#e5e7eb',
                                  color: '#6b7280',
                                  cursor: 'not-allowed',
                                  opacity: 0.7,
                                },
                                nonWorking: {
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  cursor: 'not-allowed',
                                  opacity: 0.5,
                                },
                                blocked: {
                                  backgroundColor: '#fee2e2',
                                  textDecoration: 'line-through',
                                  opacity: 0.5,
                                },
                                today: {
                                  fontWeight: 'bold',
                                  border: '2px solid #3b82f6',
                                },
                              }}
                            />

                            {/* Legend */}
                            <div className='mt-4 pt-4 border-t grid grid-cols-2 gap-2 text-xs'>
                              <div className='flex items-center gap-2'>
                                <div className='w-6 h-6 bg-gray-200 border rounded opacity-70'></div>
                                <span>Weekend (non-working)</span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <div className='w-6 h-6 bg-red-100 border rounded line-through text-center text-red-900 opacity-50'>
                                  X
                                </div>
                                <span>Blocked/Booked</span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <div className='w-6 h-6 bg-blue-500 border rounded'></div>
                                <span>Selected</span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <div className='w-6 h-6 border-2 border-blue-500 rounded'></div>
                                <span>Today</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Time Slot Picker for Hourly Projects */}
                    {selectedDate && projectMode === 'hours' && (
                      <div className='space-y-4'>
                        <div>
                          <Label className='text-base font-semibold'>
                            Select Time Slot *
                          </Label>
                          <p className='text-sm text-gray-600 mt-1 mb-2'>
                            Choose your preferred start time.
                          </p>
                          <div className='text-xs text-gray-500 space-y-1'>
                            <p>
                              Times shown in professional&apos;s timezone (
                              {professionalTimezone})
                              {viewerTimeZone !== professionalTimezone &&
                                ` / Your timezone: ${viewerTimeZone}`}
                            </p>
                          </div>
                        </div>

                        {generateTimeSlots().length === 0 ? (
                          <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
                            <p className='text-sm text-red-900 font-semibold mb-2'>
                              No Time Slots Available
                            </p>
                            <p className='text-sm text-red-800'>
                              This project&apos;s execution time (
                              {selectedPackage?.executionDuration?.value ||
                                project.executionDuration?.value}{' '}
                              {selectedPackage?.executionDuration?.unit ||
                                project.executionDuration?.unit}
                              ) exceeds a single working day. This project
                              should be configured in <strong>days mode</strong>{' '}
                              instead of hours mode.
                            </p>
                            <p className='text-sm text-red-800 mt-2'>
                              Please contact the professional to update the
                              project configuration.
                            </p>
                          </div>
                        ) : (
                          <div className='grid grid-cols-3 sm:grid-cols-4 gap-2'>
                            {generateTimeSlots().map((timeSlot) => {
                              const isPast = isTimeSlotPast(timeSlot);
                              const isSelected = selectedTime === timeSlot;
                              const times =
                                convertTimeSlotToTimezones(timeSlot);
                              const showLocalTime =
                                times.viewer !== times.professional;

                              return (
                                <button
                                  key={timeSlot}
                                  type='button'
                                  onClick={() =>
                                    !isPast && setSelectedTime(timeSlot)
                                  }
                                  disabled={isPast}
                                  title={
                                    showLocalTime
                                      ? `${times.viewer} in your timezone`
                                      : undefined
                                  }
                                  className={`
                                    px-2 py-2 rounded-lg border text-sm font-medium transition-all flex flex-col items-center
                                    ${
                                      isSelected
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                        : isPast
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                                    }
                                  `}
                                >
                                  <span>{timeSlot}</span>
                                  {showLocalTime && (
                                    <span
                                      className={`text-[10px] ${
                                        isSelected
                                          ? 'text-blue-100'
                                          : 'text-gray-400'
                                      }`}
                                    >
                                      ({times.viewer})
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {proposals && (
                          <div className='mt-4 space-y-2 text-xs text-gray-600'>
                            <p className='font-semibold text-gray-700'>
                              Suggested dates
                            </p>
                            <div className='flex flex-wrap gap-2'>
                              {shortestThroughputDetails && (
                                <Button
                                  type='button'
                                  variant='outline'
                                  size='sm'
                                  onClick={handleApplyShortestWindow}
                                >
                                  Shortest consecutive window:{' '}
                                  {`${formatInTimeZone(
                                    shortestThroughputDetails.startDate,
                                    normalizeTimezone(professionalTimezone),
                                    'MMM d, yyyy'
                                  )} - ${formatInTimeZone(
                                    shortestThroughputDetails.endDate,
                                    normalizeTimezone(professionalTimezone),
                                    'MMM d, yyyy'
                                  )}`}
                                </Button>
                              )}

                              {proposals.earliestProposal && (
                                <Button
                                  type='button'
                                  variant='outline'
                                  size='sm'
                                  onClick={() => {
                                    const tz = normalizeTimezone(professionalTimezone);
                                    const start = proposals.earliestProposal?.start
                                      ? formatInTimeZone(
                                          parseISO(proposals.earliestProposal.start),
                                          tz,
                                          'yyyy-MM-dd'
                                        )
                                      : '';
                                    if (start && !isDateBlocked(start)) {
                                      setHasUserSelectedDate(true);
                                      setSelectedDate(start);
                                    }
                                  }}
                                >
                                  First Available Date :{' '}
                                  {proposals.earliestProposal.start &&
                                    formatInTimeZone(
                                      parseISO(proposals.earliestProposal.start),
                                      normalizeTimezone(professionalTimezone),
                                      'MMM d, yyyy'
                                    )}
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      <p className="text-xs text-gray-500 mt-2">
                        Team has {blockedDates.blockedDates.length} blocked dates and {blockedDates.blockedRanges.length} blocked periods
                      </p>
                    </div>

                    {selectedDate && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-900">
                          <strong>Selected Start Date:</strong> {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
                        </p>
                        {project.executionDuration && project.bufferDuration && (
                          <p className="text-sm text-blue-900 mt-2">
                            <strong>Estimated Delivery Date:</strong>{' '}
                            {format(
                              addDays(
                                parseISO(selectedDate),
                                (project.executionDuration.unit === 'days'
                                  ? project.executionDuration.value
                                  : Math.ceil(project.executionDuration.value / 24)) +
                                (project.bufferDuration.unit === 'days'
                                  ? project.bufferDuration.value
                                  : Math.ceil(project.bufferDuration.value / 24))
                              ),
                              'EEEE, MMMM d, yyyy'
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: RFQ Questions */}
            {currentStep === 3 && (
              <div className="space-y-6">
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

                {/* Selected Packages */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Selected Packages</h3>
                  {selectedSubprojects.map(idx => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                      <span>{project.subprojects[idx].name}</span>
                      {project.subprojects[idx].pricing.type === 'fixed' && project.subprojects[idx].pricing.amount && (
                        <span className="font-semibold">€{project.subprojects[idx].pricing.amount}</span>
                      )}
                      {project.subprojects[idx].pricing.type === 'rfq' && (
                        <Badge variant="outline">Quote Required</Badge>
                      )}
                    </div>
                  ))}
                </div>

                {/* Selected Date */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Project Timeline</h3>
                  <div className="bg-gray-50 p-3 rounded space-y-2">
                    <p><strong>Start Date:</strong> {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}</p>
                    {project.executionDuration && project.bufferDuration && (
                      <p>
                        <strong>Estimated Delivery:</strong>{' '}
                        {format(
                          addDays(
                            parseISO(selectedDate),
                            (project.executionDuration.unit === 'days'
                              ? project.executionDuration.value
                              : Math.ceil(project.executionDuration.value / 24)) +
                            (project.bufferDuration.unit === 'days'
                              ? project.bufferDuration.value
                              : Math.ceil(project.bufferDuration.value / 24))
                          ),
                          'EEEE, MMMM d, yyyy'
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Extra Options */}
                {selectedExtraOptions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Add-On Options</h3>
                    {selectedExtraOptions.map(idx => (
                      <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                        <span>{project.extraOptions[idx].name}</span>
                        <span className="font-semibold">+€{project.extraOptions[idx].price}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total (if applicable) */}
                {calculateTotal() > 0 && (
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center text-lg font-bold">
                      <span>Estimated Total</span>
                      <span className="text-blue-600">€{calculateTotal()}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      *Final price may vary based on professional&apos;s quote
                    </p>
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
