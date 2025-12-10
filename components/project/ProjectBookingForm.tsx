'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Calendar,
  Loader2,
  Upload,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  format,
  addDays,
  parseISO,
  startOfDay,
  differenceInCalendarDays,
} from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useAuth } from '@/contexts/AuthContext';
import { getViewerTimezone, normalizeTimezone } from '@/lib/timezoneDisplay';

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
      minProjectValue?: number;
    };
    deliveryPreparation?: number;
    deliveryPreparationUnit?: 'hours' | 'days';
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
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
}

interface ProjectBookingFormProps {
  project: Project;
  onBack: () => void;
  selectedSubprojectIndex?: number | null;
}

interface RFQAnswer {
  question: string;
  answer: string;
  type: string;
}

interface BlockedRange {
  startDate: string;
  endDate: string;
  reason?: string;
}

interface BlockedRange {
  startDate: string
  endDate: string
  reason?: string
}

interface BlockedDates {
  blockedDates: string[];
  blockedRanges: BlockedRange[];
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
  };
}

interface DayAvailability {
  available: boolean;
  startTime?: string;
  endTime?: string;
}

interface ProfessionalAvailability {
  monday?: DayAvailability;
  tuesday?: DayAvailability;
  wednesday?: DayAvailability;
  thursday?: DayAvailability;
  friday?: DayAvailability;
  saturday?: DayAvailability;
  sunday?: DayAvailability;
}

interface WorkingHoursResponse {
  success: boolean;
  availability?: ProfessionalAvailability;
  timezone?: string;
}

type ProjectExecutionDuration = NonNullable<Project['executionDuration']>;
type SubprojectExecutionDuration = NonNullable<
  Project['subprojects'][number]['executionDuration']
>;
type AnyExecutionDuration =
  | ProjectExecutionDuration
  | SubprojectExecutionDuration;

const hasDurationRange = (
  duration?: AnyExecutionDuration
): duration is SubprojectExecutionDuration & {
  range: { min?: number; max?: number };
} => Boolean(duration && 'range' in duration && duration.range);

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
  const [rfqAnswers, setRFQAnswers] = useState<RFQAnswer[]>([]);
  const [selectedExtraOptions, setSelectedExtraOptions] = useState<number[]>(
    []
  );
  const [additionalNotes, setAdditionalNotes] = useState('');
  const selectedPackage =
    selectedPackageIndex !== null
      ? project.subprojects[selectedPackageIndex]
      : null;

  // Derive mode from execution duration unit (replaces root-level timeMode)
  const projectMode: 'hours' | 'days' =
    selectedPackage?.executionDuration?.unit ||
    project.executionDuration?.unit ||
    'days';

  useEffect(() => {
    if (typeof selectedSubprojectIndex === 'number') {
      setSelectedPackageIndex(selectedSubprojectIndex);
      setHasUserSelectedDate(false);
    }
  }, [selectedSubprojectIndex]);

  useEffect(() => {
    // Set viewer's timezone on mount
    setViewerTimeZone(getViewerTimezone());

    fetchTeamAvailability();
    fetchProfessionalWorkingHours();

    // Log for debugging available date consistency
    console.log(
      '[BOOKING FORM] Initializing booking form for project:',
      project._id
    );
    console.log(
      '[BOOKING FORM] First available date from search/project page:',
      project.firstAvailableDate
    );
  }, []);

  useEffect(() => {
    fetchScheduleProposals(
      typeof selectedPackageIndex === 'number'
        ? selectedPackageIndex
        : undefined
    );
    setHasUserSelectedDate(false);
  }, [selectedPackageIndex]);

  const getFormattedDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const parsed = parseISO(dateStr);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, 'yyyy-MM-dd');
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
      console.log(
        '[BOOKING FORM] All data loaded, selecting default preferred start date...'
      );
      console.log(
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
        console.log(
          '[BOOKING FORM] Using earliest proposal date:',
          defaultDate
        );
      } else if (earliestBookable && !isDateBlocked(earliestBookable)) {
        defaultDate = earliestBookable;
        console.log(
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
            console.warn('[BOOKING FORM] Date discrepancy detected!');
            console.warn(
              '[BOOKING FORM] Search/Project page showed:',
              projectAvailableDate
            );
            console.warn(
              '[BOOKING FORM] Actual first available date:',
              defaultDate
            );
            console.warn(
              '[BOOKING FORM] This may be due to bookings made after viewing the search results'
            );
          } else {
            console.log('[BOOKING FORM] Available dates match:', defaultDate);
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

  useEffect(() => {
    fetchScheduleProposals(typeof selectedPackageIndex === 'number' ? selectedPackageIndex : undefined)
    setHasUserSelectedDate(false)
  }, [selectedPackageIndex])

  const getFormattedDate = (dateStr?: string | null) => {
    if (!dateStr) return null
    const parsed = parseISO(dateStr)
    if (Number.isNaN(parsed.getTime())) return null
    return format(parsed, 'yyyy-MM-dd')
  }

  useEffect(() => {
    if (!proposals) {
      return
    }

    const proposalDate = getFormattedDate(proposals.earliestProposal?.start)
    const fallbackDate = getFormattedDate(proposals.earliestBookableDate)
    const initialDate = proposalDate || fallbackDate

    if (
      initialDate &&
      (!selectedDate || (!hasUserSelectedDate && selectedDate !== initialDate)) &&
      !isDateBlocked(initialDate)
    ) {
      setSelectedDate(initialDate)
    }
  }, [proposals, selectedDate, hasUserSelectedDate])

  useEffect(() => {
    if (selectedDate || hasUserSelectedDate) {
      return
    }

    if (!loadingAvailability && !loadingWorkingHours) {
      console.log('[BOOKING FORM] All data loaded, selecting default preferred start date...')
      console.log('[BOOKING FORM] Professional availability:', professionalAvailability)

      let defaultDate: string | null = null
      const earliestProposal = getFormattedDate(proposals?.earliestProposal?.start)
      const earliestBookable = getFormattedDate(proposals?.earliestBookableDate)

      if (earliestProposal && !isDateBlocked(earliestProposal)) {
        defaultDate = earliestProposal
        console.log('[BOOKING FORM] Using earliest proposal date:', defaultDate)
      } else if (earliestBookable && !isDateBlocked(earliestBookable)) {
        defaultDate = earliestBookable
        console.log('[BOOKING FORM] Using earliest bookable date:', defaultDate)
      } else {
        defaultDate = getMinDate()
      }

      if (defaultDate) {
        setSelectedDate(defaultDate)

        if (project.firstAvailableDate) {
          const projectAvailableDate = format(parseISO(project.firstAvailableDate), 'yyyy-MM-dd')
          if (projectAvailableDate !== defaultDate) {
            console.warn('[BOOKING FORM] Date discrepancy detected!')
            console.warn('[BOOKING FORM] Search/Project page showed:', projectAvailableDate)
            console.warn('[BOOKING FORM] Actual first available date:', defaultDate)
            console.warn('[BOOKING FORM] This may be due to bookings made after viewing the search results')
          } else {
            console.log('[BOOKING FORM] Available dates match:', defaultDate)
          }
        }
      }
    }
  }, [loadingAvailability, loadingWorkingHours, blockedDates, professionalAvailability, proposals, selectedDate, hasUserSelectedDate])

  useEffect(() => {
    if (project.timeMode !== 'hours') {
      return
    }
    if (!selectedDate) {
      setSelectedTime('')
      return
    }
    const dateObj = parseISO(selectedDate)
    if (Number.isNaN(dateObj.getTime())) {
      return
    }
    const slots = generateTimeSlotsForDate(dateObj)
    if (slots.length === 0) {
      setSelectedTime('')
      return
    }
    if (!selectedTime || !slots.includes(selectedTime)) {
      setSelectedTime(slots[0])
    }
  }, [selectedDate, project.timeMode, blockedDates, professionalAvailability, selectedPackage, selectedTime])

  const fetchTeamAvailability = async () => {
    try {
      console.log(
        '[BOOKING] Fetching team availability for project:',
        project._id
      );
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/availability`
      );
      const data = await response.json();

      console.log('[BOOKING] Availability data received:', data);
      console.log('[BOOKING] Blocked dates:', data.blockedDates);
      console.log('[BOOKING] Blocked ranges:', data.blockedRanges);

      console.log('[BOOKING] Availability data received:', data)
      console.log('[BOOKING] Blocked dates:', data.blockedDates)
      console.log('[BOOKING] Blocked ranges:', data.blockedRanges)

      if (data.success) {
        // Normalize dates to yyyy-MM-dd format
        const normalizedData: BlockedDates = {
          blockedDates: (data.blockedDates || []).map((d: string) =>
            format(parseISO(d), 'yyyy-MM-dd')
          ),
          blockedRanges: (data.blockedRanges || []).map(
            (range: BlockedRange) => ({
              startDate: range.startDate,
              endDate: range.endDate,
              reason: range.reason,
            })
          ),
        };
        console.log('[BOOKING] Normalized data:', normalizedData);
        setBlockedDates(normalizedData);
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
      toast.error('Failed to load availability calendar');
    } finally {
      setLoadingAvailability(false);
    }
  };

  const fetchScheduleProposals = async (packageIndex?: number) => {
    try {
      let endpoint = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/schedule-proposals`;
      if (typeof packageIndex === 'number') {
        endpoint += `?subprojectIndex=${packageIndex}`;
      }

      const response = await fetch(endpoint);
      const data: ScheduleProposalsResponse = await response.json();

      if (data.success && data.proposals) {
        setProposals(data.proposals);
      }
    } catch (error) {
      console.error('Error fetching schedule proposals:', error);
    }
  };

  const fetchProfessionalWorkingHours = async () => {
    try {
      console.log('[BOOKING] Fetching working hours for project:', project._id);
      setLoadingWorkingHours(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/working-hours`
      );
      const data: WorkingHoursResponse = await response.json();

      console.log('[BOOKING] Working hours response:', data);
      if (data.success && data.availability) {
        console.log(
          '[BOOKING] Professional availability set:',
          data.availability
        );
        console.log('[BOOKING] Professional timezone:', data.timezone);
        setProfessionalAvailability(data.availability);
        setProfessionalTimezone(normalizeTimezone(data.timezone));
      } else {
        console.warn(
          '[BOOKING] No working hours data received or request failed'
        );
      }
    } catch (error) {
      console.error(
        '[BOOKING] Error fetching professional working hours:',
        error
      );
    } finally {
      setLoadingWorkingHours(false);
    }
  };

  const shouldCollectUsage = (
    pricingType: 'fixed' | 'unit' | 'rfq'
  ): boolean => {
    if (pricingType === 'unit') {
      return true;
    }

    const projectPriceModel = (project.priceModel || '').toLowerCase();
    if (!projectPriceModel) {
      return false;
    }

    return !projectPriceModel.includes('total');
  };

  const getBufferDuration = () => {
    if (selectedPackage?.buffer?.value && selectedPackage.buffer.value > 0) {
      return {
        value: selectedPackage.buffer.value,
        unit: selectedPackage.buffer.unit || 'days',
      };
    }

    if (project.bufferDuration?.value && project.bufferDuration.value > 0) {
      return project.bufferDuration;
    }

    return null;
  };

  const getBufferDurationDays = () => {
    const buffer = getBufferDuration();
    if (!buffer) return 0;
    return Math.ceil(convertDurationToDays(buffer));
  };

  const advanceWorkingDays = (startDate: Date, workingDays: number) => {
    if (workingDays <= 0) {
      return startDate;
    }
    if (workingDays === 1) {
      return startDate;
    }

    let cursor = startDate;
    let countedDays = 0;

    // First, check if startDate itself is a working day and count it
    const startStr = format(startDate, 'yyyy-MM-dd');
    if (isProfessionalWorkingDay(startDate) && !isDateBlocked(startStr)) {
      countedDays = 1;
    }

    // Now find remaining working days
    while (countedDays < workingDays) {
      cursor = addDays(cursor, 1);
      const cursorStr = format(cursor, 'yyyy-MM-dd');

      if (isProfessionalWorkingDay(cursor) && !isDateBlocked(cursorStr)) {
        countedDays++;
      }
    }

    return cursor;
  };

  const formatCurrency = (value?: number) =>
    typeof value === 'number'
      ? new Intl.NumberFormat('nl-NL', {
          style: 'currency',
          currency: 'EUR',
        }).format(value)
      : null;

  // Check if a date is a weekend (Saturday or Sunday)
  const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  };

  // Check if professional works on this date (based on their availability)
  const isProfessionalWorkingDay = (date: Date): boolean => {
    if (!professionalAvailability) {
      // This should only happen during initial load before working hours are fetched
      console.warn(
        '[BOOKING] ⚠️ isProfessionalWorkingDay called before working hours loaded! Date:',
        format(date, 'yyyy-MM-dd')
      );
      console.warn(
        '[BOOKING] Loading states - availability:',
        loadingAvailability,
        'workingHours:',
        loadingWorkingHours
      );
      return true; // Default to available while loading
    }

    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const dayName = dayNames[date.getDay()] as keyof ProfessionalAvailability;
    const dayAvailability = professionalAvailability[dayName];

    if (!dayAvailability) {
      return true;
    }

    if (typeof dayAvailability.available === 'boolean') {
      return dayAvailability.available;
    }

    if (dayAvailability.startTime || dayAvailability.endTime) {
      return true;
    }

    return true;
  };

  // Get working hours for the selected date
  const getWorkingHoursForDate = (
    date: Date
  ): { startTime: string; endTime: string } => {
    const defaultHours = { startTime: '09:00', endTime: '17:00' };

    if (!professionalAvailability) return defaultHours;

    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const dayName = dayNames[date.getDay()] as keyof ProfessionalAvailability;
    const dayAvailability = professionalAvailability[dayName];

    if (!dayAvailability || !dayAvailability.available) return defaultHours;

    return {
      startTime: dayAvailability.startTime || '09:00',
      endTime: dayAvailability.endTime || '17:00',
    };
  };

  const getExecutionDurationHours = (): number => {
    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration;

    if (!executionSource) {
      return 0;
    }

    if (executionSource.unit === 'hours') {
      return executionSource.value || 0;
    }

    return (executionSource.value || 0) * 24;
  };

  const getBlockedIntervalsForDate = (date: Date) => {
    const intervals: Array<{ start: Date; end: Date }> = [];
    const dayStart = startOfDay(date);
    const dayEnd = addDays(dayStart, 1);
    const dateKey = format(dayStart, 'yyyy-MM-dd');

    if (blockedDates.blockedDates.includes(dateKey)) {
      intervals.push({ start: dayStart, end: dayEnd });
    }

    blockedDates.blockedRanges.forEach((range) => {
      try {
        const rangeStart = parseISO(range.startDate);
        const rangeEnd = parseISO(range.endDate);

        if (
          Number.isNaN(rangeStart.getTime()) ||
          Number.isNaN(rangeEnd.getTime())
        ) {
          return;
        }

        if (rangeEnd <= dayStart || rangeStart >= dayEnd) {
          return;
        }

        const start = rangeStart > dayStart ? rangeStart : dayStart;
        const end = rangeEnd < dayEnd ? rangeEnd : dayEnd;
        intervals.push({ start, end });
      } catch {
        // Ignore malformed entries
      }
    });

    return intervals;
  };

  const shouldBlockDayForIntervals = (
    date: Date,
    intervals: Array<{ start: Date; end: Date }>
  ) => {
    if (intervals.length === 0) {
      return false;
    }

    const { startTime, endTime } = getWorkingHoursForDate(date);
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const workingStart = new Date(date);
    workingStart.setHours(startHour, startMin, 0, 0);
    const workingEnd = new Date(date);
    workingEnd.setHours(endHour, endMin, 0, 0);

    if (workingEnd <= workingStart) {
      return true;
    }

    const clamped = intervals
      .map((interval) => {
        const start = Math.max(
          interval.start.getTime(),
          workingStart.getTime()
        );
        const end = Math.min(interval.end.getTime(), workingEnd.getTime());
        return { start, end };
      })
      .filter((interval) => interval.end > interval.start)
      .sort((a, b) => a.start - b.start);

    if (clamped.length === 0) {
      return false;
    }

    let totalMinutes = 0;
    let currentStart = clamped[0].start;
    let currentEnd = clamped[0].end;

    for (let i = 1; i < clamped.length; i++) {
      const interval = clamped[i];
      if (interval.start <= currentEnd) {
        currentEnd = Math.max(currentEnd, interval.end);
      } else {
        totalMinutes += (currentEnd - currentStart) / (1000 * 60);
        currentStart = interval.start;
        currentEnd = interval.end;
      }
    }

    totalMinutes += (currentEnd - currentStart) / (1000 * 60);

    // Block the day if 4 or more hours are blocked (matches backend logic)
    return totalMinutes / 60 >= PARTIAL_BLOCK_THRESHOLD_HOURS;
  };

  const generateTimeSlotsForDate = (date: Date): string[] => {
    const slots: string[] = [];
    if (projectMode !== 'hours') {
      return slots;
    }

    const executionHours = getExecutionDurationHours();
    if (executionHours <= 0) {
      return slots;
    }

    let workingStart = '09:00';
    let workingEnd = '17:00';

    const workingHours = getWorkingHoursForDate(date);
    workingStart = workingHours.startTime;
    workingEnd = workingHours.endTime;

    // Parse start and end times
    const [startHour, startMin] = workingStart.split(':').map(Number);
    const [endHour, endMin] = workingEnd.split(':').map(Number);

    // Calculate working hours per day
    const workingHoursPerDay =
      (endHour * 60 + endMin - (startHour * 60 + startMin)) / 60;

    // If execution time exceeds one working day, return empty array
    // This indicates the project should be in days mode instead
    if (executionHours > workingHoursPerDay) {
      console.warn(
        `Execution time (${executionHours}h) exceeds working hours per day (${workingHoursPerDay}h). This project should use days mode.`
      );
      return [];
    }

    // Calculate last available slot: closing time - execution time
    const closingTimeMinutes = endHour * 60 + endMin;
    const executionMinutes = executionHours * 60;
    const lastSlotMinutes = closingTimeMinutes - executionMinutes;
    const blockedIntervals = getBlockedIntervalsForDate(date);

    // NOTE: For hours mode, we do NOT use shouldBlockDayForIntervals (4-hour threshold)
    // because we want customers to be able to book any remaining available slots
    // The per-slot overlap check below handles blocking individual time slots

    // Check if date is today - if so, we need to filter out past slots
    const now = new Date();
    const isToday = startOfDay(date).getTime() === startOfDay(now).getTime();

    // Generate slots from start to last available slot
    let currentMinutes = startHour * 60 + startMin;

    while (currentMinutes <= lastSlotMinutes) {
      const hours = Math.floor(currentMinutes / 60);
      const minutes = currentMinutes % 60;
      const slotLabel = `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}`;
      const slotStart = new Date(date);
      slotStart.setHours(hours, minutes, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + executionMinutes);

      // Skip past slots for today
      if (isToday && slotStart <= now) {
        currentMinutes += 30;
        continue;
      }

      const overlapsBlocked = blockedIntervals.some(
        (interval) => slotStart < interval.end && slotEnd > interval.start
      );

      if (!overlapsBlocked) {
        slots.push(slotLabel);
      }

      currentMinutes += 30;
    }

    return slots;
  };

  const generateTimeSlots = (): string[] => {
    if (!selectedDate) {
      return [];
    }

    const dateObj = parseISO(selectedDate);
    if (Number.isNaN(dateObj.getTime())) {
      return [];
    }

    return generateTimeSlotsForDate(dateObj);
  };

  // Calculate end time for a given start time (hours mode)
  const calculateEndTime = (startTime: string): string => {
    if (!startTime) return '';

    // Get execution duration in hours
    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration;

    let executionHours = 0;
    if (executionSource) {
      if (executionSource.unit === 'hours') {
        executionHours = executionSource.value || 0;
      } else {
        executionHours = (executionSource.value || 0) * 24;
      }
    }

    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + executionHours * 60;

    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;

    return `${endHours.toString().padStart(2, '0')}:${endMins
      .toString()
      .padStart(2, '0')}`;
  };

  /**
   * Format time range for display (e.g., "9:00 AM - 11:00 AM (2 hours)")
   *
   * FIX: Shows end time at completion, not just start time
   * This helps customers understand the full booking window
   */
  const formatTimeRange = (startTime: string): string => {
    if (!startTime) return '';

    const endTime = calculateEndTime(startTime);

    // Get execution duration
    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration;

    let durationLabel = '';
    if (executionSource) {
      durationLabel = `${executionSource.value} ${executionSource.unit}`;
    }

    // Format times to AM/PM
    const formatTime = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    };

    return `${formatTime(startTime)} - ${formatTime(
      endTime
    )} (${durationLabel})`;
  };

  /**
   * Convert a time slot from professional's timezone to UTC and viewer's timezone
   * Returns formatted strings for display
   */
  const convertTimeSlotToTimezones = (
    timeSlot: string
  ): { utc: string; viewer: string; professional: string } => {
    if (!selectedDate || !timeSlot) {
      return { utc: timeSlot, viewer: timeSlot, professional: timeSlot };
    }

    const baseTimezone = normalizeTimezone(professionalTimezone);

    try {
      const localDateTime = `${selectedDate}T${timeSlot}:00`;
      const utcDateTime =
        baseTimezone === 'UTC'
          ? new Date(`${localDateTime}Z`)
          : fromZonedTime(localDateTime, baseTimezone);

      const formatTimeOnly = (date: Date, tz: string) => {
        try {
          return formatInTimeZone(date, tz, 'h:mm a');
        } catch {
          return timeSlot;
        }
      };

      const utcTime = formatTimeOnly(utcDateTime, 'UTC');
      const viewerTime = formatTimeOnly(utcDateTime, viewerTimeZone);
      const professionalTime = formatTimeOnly(utcDateTime, baseTimezone);

      return {
        utc: utcTime,
        viewer: viewerTime,
        professional: professionalTime,
      };
    } catch (error) {
      console.error('Error converting timezone:', error);
      return { utc: timeSlot, viewer: timeSlot, professional: timeSlot };
    }
  };

  const selectedTimeConversion = useMemo(() => {
    if (!selectedTime) {
      return null;
    }

    return convertTimeSlotToTimezones(selectedTime);
  }, [selectedTime, selectedDate, professionalTimezone, viewerTimeZone]);

  // Check if a time slot is in the past for today's date
  const isTimeSlotPast = (timeSlot: string): boolean => {
    if (!selectedDate) return false;

    const selectedDateObj = parseISO(selectedDate);
    const today = startOfDay(new Date());

    // Only check if selected date is today
    if (selectedDateObj.getTime() !== today.getTime()) return false;

    const [hours, minutes] = timeSlot.split(':').map(Number);
    const now = new Date();
    const slotTime = new Date();
    slotTime.setHours(hours, minutes, 0, 0);

    return slotTime < now;
  };

  const fetchProfessionalWorkingHours = async () => {
    try {
      console.log('[BOOKING] Fetching working hours for project:', project._id)
      setLoadingWorkingHours(true)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/working-hours`
      )
      const data: WorkingHoursResponse = await response.json()

      console.log('[BOOKING] Working hours response:', data)
      if (data.success && data.availability) {
        console.log('[BOOKING] Professional availability set:', data.availability)
        setProfessionalAvailability(data.availability)
      } else {
        console.warn('[BOOKING] No working hours data received or request failed')
      }
    } catch (error) {
      console.error('[BOOKING] Error fetching professional working hours:', error)
    } finally {
      setLoadingWorkingHours(false)
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
      // This should only happen during initial load before working hours are fetched
      console.warn('[BOOKING] ⚠️ isProfessionalWorkingDay called before working hours loaded! Date:', format(date, 'yyyy-MM-dd'))
      console.warn('[BOOKING] Loading states - availability:', loadingAvailability, 'workingHours:', loadingWorkingHours)
      return true // Default to available while loading
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = dayNames[date.getDay()] as keyof ProfessionalAvailability
    const dayAvailability = professionalAvailability[dayName]

    if (!dayAvailability) {
      return true
    }

    if (typeof dayAvailability.available === 'boolean') {
      return dayAvailability.available
    }

    if (dayAvailability.startTime || dayAvailability.endTime) {
      return true
    }

    return true
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

  const getExecutionDurationHours = (): number => {
    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration

    if (!executionSource) {
      return 0
    }

    if (executionSource.unit === 'hours') {
      return executionSource.value || 0
    }

    return (executionSource.value || 0) * 24
  }

  const getBlockedIntervalsForDate = (date: Date) => {
    const intervals: Array<{ start: Date; end: Date }> = []
    const dayStart = startOfDay(date)
    const dayEnd = addDays(dayStart, 1)
    const dateKey = format(dayStart, 'yyyy-MM-dd')

    if (blockedDates.blockedDates.includes(dateKey)) {
      intervals.push({ start: dayStart, end: dayEnd })
    }

    blockedDates.blockedRanges.forEach((range) => {
      try {
        const rangeStart = parseISO(range.startDate)
        const rangeEnd = parseISO(range.endDate)

        if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
          return
        }

        if (rangeEnd <= dayStart || rangeStart >= dayEnd) {
          return
        }

        const start = rangeStart > dayStart ? rangeStart : dayStart
        const end = rangeEnd < dayEnd ? rangeEnd : dayEnd
        intervals.push({ start, end })
      } catch (error) {
        // Ignore malformed entries
      }
    })

    return intervals
  }

  const generateTimeSlotsForDate = (date: Date): string[] => {
    const slots: string[] = []
    if (project.timeMode !== 'hours') {
      return slots
    }

    const executionHours = getExecutionDurationHours()
    if (executionHours <= 0) {
      return slots
    }

    let workingStart = '09:00'
    let workingEnd = '17:00'

    const workingHours = getWorkingHoursForDate(date)
    workingStart = workingHours.startTime
    workingEnd = workingHours.endTime

    // Parse start and end times
    const [startHour, startMin] = workingStart.split(':').map(Number)
    const [endHour, endMin] = workingEnd.split(':').map(Number)

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
    const blockedIntervals = getBlockedIntervalsForDate(date)

    // Generate slots from start to last available slot
    let currentMinutes = startHour * 60 + startMin

    while (currentMinutes <= lastSlotMinutes) {
      const hours = Math.floor(currentMinutes / 60)
      const minutes = currentMinutes % 60
      const slotLabel = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      const slotStart = new Date(date)
      slotStart.setHours(hours, minutes, 0, 0)
      const slotEnd = new Date(slotStart)
      slotEnd.setMinutes(slotEnd.getMinutes() + executionMinutes)

      const overlapsBlocked = blockedIntervals.some(
        (interval) => slotStart < interval.end && slotEnd > interval.start
      )

      if (!overlapsBlocked) {
        slots.push(slotLabel)
      }

      currentMinutes += 30
    }

    return slots
  }

  const generateTimeSlots = (): string[] => {
    if (!selectedDate) {
      return []
    }

    const dateObj = parseISO(selectedDate)
    if (Number.isNaN(dateObj.getTime())) {
      return []
    }

    return generateTimeSlotsForDate(dateObj)
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

  const isDateBlocked = (dateString: string): boolean => {
    const dateObj = parseISO(dateString);
    if (Number.isNaN(dateObj.getTime())) {
      return true;
    }

    if (projectMode === 'hours') {
      return generateTimeSlotsForDate(dateObj).length === 0;
    }

    // For days mode, check if explicitly blocked
    if (blockedDates.blockedDates.includes(dateString)) {
      return true;
    }

    const dayStart = startOfDay(dateObj);
    const dayEnd = addDays(dayStart, 1);

    const intervals: Array<{ start: Date; end: Date }> = [];
    blockedDates.blockedRanges.forEach((range) => {
      const rangeStart = parseISO(range.startDate);
      const rangeEnd = parseISO(range.endDate);
      if (
        Number.isNaN(rangeStart.getTime()) ||
        Number.isNaN(rangeEnd.getTime())
      ) {
        return;
      }
      if (rangeStart < dayEnd && rangeEnd > dayStart) {
        intervals.push({ start: rangeStart, end: rangeEnd });
      }
    });

    return shouldBlockDayForIntervals(dateObj, intervals);
  };

  const getDisabledDays = () => {
    const disabledMatchers: Array<
      Date | { from: Date; to: Date } | ((date: Date) => boolean)
    > = [];

    blockedDates.blockedDates.forEach((dateStr) => {
      disabledMatchers.push(parseISO(dateStr));
    });

    // For days mode, use a function matcher that applies the 4-hour threshold
    // instead of disabling entire ranges
    if (projectMode !== 'hours') {
      // Create a function matcher that checks each day using the 4-hour threshold
      const rangeBlockMatcher = (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        // Already handled by explicit blocked dates
        if (blockedDates.blockedDates.includes(dateStr)) {
          return false; // Already disabled above
        }

        const dayStart = startOfDay(date);
        const dayEnd = addDays(dayStart, 1);

        // Build intervals from blocked ranges that overlap this day
        const intervals: Array<{ start: Date; end: Date }> = [];
        blockedDates.blockedRanges.forEach((range) => {
          const rangeStart = parseISO(range.startDate);
          const rangeEnd = parseISO(range.endDate);
          if (
            Number.isNaN(rangeStart.getTime()) ||
            Number.isNaN(rangeEnd.getTime())
          ) {
            return;
          }
          if (rangeStart < dayEnd && rangeEnd > dayStart) {
            intervals.push({ start: rangeStart, end: rangeEnd });
          }
        });

        // Use the 4-hour threshold check
        return shouldBlockDayForIntervals(date, intervals);
      };
      disabledMatchers.push(rangeBlockMatcher);
    }

    // Only include non-weekday working days (not weekends) in the blocked style
    // Weekends are handled separately with the "weekend" modifier for different styling
    const nonWorkingDayMatcher = (date: Date) => {
      // If it's a weekend, don't mark as disabled here (weekend modifier handles it)
      if (isWeekend(date)) {
        return false;
      }
      return !isProfessionalWorkingDay(date);
    };

    return [...disabledMatchers, nonWorkingDayMatcher];
  };

  const getMinDate = (): string | null => {
    console.log('[getMinDate] Starting calculation...');
    console.log('[getMinDate] Project timeMode:', projectMode);
    console.log(
      '[getMinDate] Proposals earliestBookableDate:',
      proposals?.earliestBookableDate
    );

    const earliest = proposals?.earliestBookableDate
      ? parseISO(proposals.earliestBookableDate)
      : addDays(new Date(), 1);

    console.log('[getMinDate] Starting from:', format(earliest, 'yyyy-MM-dd'));

    let checkDate = startOfDay(earliest);

    for (let i = 0; i < 120; i++) {
      const isWorkingDay = isProfessionalWorkingDay(checkDate);
      console.log(
        `[getMinDate] Checking ${format(
          checkDate,
          'yyyy-MM-dd'
        )} - Working day: ${isWorkingDay}`
      );

      if (!isWorkingDay) {
        checkDate = addDays(checkDate, 1);
        continue;
      }

      const dateStr = format(checkDate, 'yyyy-MM-dd');

      if (projectMode === 'hours') {
        const slots = generateTimeSlotsForDate(checkDate);
        console.log(`[getMinDate] ${dateStr} - Available slots:`, slots.length);
        if (slots.length > 0) {
          console.log(`[getMinDate] ✅ Found first available date: ${dateStr}`);
          return dateStr;
        }
      } else {
        const blocked = isDateBlocked(dateStr);
        console.log(`[getMinDate] ${dateStr} - Blocked: ${blocked}`);
        if (!blocked) {
          console.log(`[getMinDate] ✅ Found first available date: ${dateStr}`);
          return dateStr;
        }
      }

      checkDate = addDays(checkDate, 1);
    }

    console.warn('[getMinDate] ⚠️ No available date found in 120 days!');
    return null;
  };

  const convertDurationToDays = (
    duration?: AnyExecutionDuration,
    preferRange?: 'min' | 'max'
  ) => {
    if (!duration) return 0;
    let value = duration.value;

    if ((!value || value <= 0) && hasDurationRange(duration)) {
      const { range } = duration;
      if (preferRange === 'max' && range.max) {
        value = range.max;
      } else if (preferRange === 'min' && range.min) {
        value = range.min;
      } else {
        value = range.max || range.min;
      }
    }

    if (!value || value <= 0) return 0;
    return duration.unit === 'days' ? value : value / 24;
  };

  const calculateCompletionDate = (includeBuffer = false): Date | null => {
    if (!selectedDate) return null;

    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration;
    const preferRange =
      selectedPackage?.pricing.type === 'rfq' ? 'max' : undefined;
    const executionDays = Math.ceil(
      convertDurationToDays(executionSource, preferRange)
    );

    const startingPoint = parseISO(selectedDate);
    const completionWithoutBuffer =
      executionDays > 0
        ? advanceWorkingDays(startingPoint, executionDays)
        : startingPoint;

    if (!includeBuffer) {
      return completionWithoutBuffer;
    }

    const bufferDays = getBufferDurationDays();
    if (bufferDays > 0) {
      const bufferStart = addDays(completionWithoutBuffer, 1);
      return advanceWorkingDays(bufferStart, bufferDays);
    }

    return completionWithoutBuffer;
  };

  const calculateCompletionDateTime = (includeBuffer = false): Date | null => {
    if (projectMode !== 'hours' || !selectedDate || !selectedTime) {
      return null;
    }

    const executionHours = getExecutionDurationHours();
    if (executionHours <= 0) {
      return null;
    }

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const startDate = parseISO(selectedDate);
    startDate.setHours(hours, minutes, 0, 0);
    const executionEnd = new Date(startDate);
    executionEnd.setHours(executionEnd.getHours() + executionHours);

    if (!includeBuffer) {
      return executionEnd;
    }

    const buffer = getBufferDuration();
    if (!buffer || !buffer.value || buffer.value <= 0) {
      return executionEnd;
    }

    if (buffer.unit === 'hours') {
      const completion = new Date(executionEnd);
      completion.setHours(completion.getHours() + buffer.value);
      return completion;
    }

    const bufferDays = Math.ceil(convertDurationToDays(buffer));
    if (bufferDays <= 0) {
      return executionEnd;
    }

    const bufferStart = addDays(startOfDay(executionEnd), 1);
    const bufferEndDate = advanceWorkingDays(bufferStart, bufferDays);
    const { endTime } = getWorkingHoursForDate(bufferEndDate);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const completion = new Date(bufferEndDate);
    completion.setHours(endHour, endMin, 0, 0);
    return completion;
  };

  const calculateCompletionDateTime = (): Date | null => {
    if (project.timeMode !== 'hours' || !selectedDate || !selectedTime) {
      return null
    }

    const executionHours = getExecutionDurationHours()
    if (executionHours <= 0) {
      return null
    }

    const [hours, minutes] = selectedTime.split(':').map(Number)
    const startDate = parseISO(selectedDate)
    startDate.setHours(hours, minutes, 0, 0)
    const completion = new Date(startDate)
    completion.setHours(completion.getHours() + executionHours)
    return completion
  }

  const handleRFQAnswerChange = (index: number, answer: string) => {
    setRFQAnswers((prev) => {
      const newAnswers = [...prev];
      newAnswers[index] = {
        question: project.rfqQuestions[index].question,
        answer,
        type: project.rfqQuestions[index].type,
      };
      return newAnswers;
    });
  };

  const handleExtraOptionToggle = (index: number) => {
    setSelectedExtraOptions((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const validateStep = (): boolean => {
    if (currentStep === 1) {
      if (selectedPackageIndex === null || !selectedPackage) {
        toast.error('Please select a package from the project page');
        return false;
      }

      if (
        shouldCollectUsage(selectedPackage.pricing.type) &&
        (!estimatedUsage || estimatedUsage < 1)
      ) {
        toast.error('Please provide an estimated usage amount');
        return false;
      }
    }

    if (currentStep === 2) {
      if (!selectedDate) {
        toast.error('Please select a preferred start date');
        return false;
      }

      if (isDateBlocked(selectedDate)) {
        toast.error(
          'Selected date is not available. Please choose another date.'
        );
        return false;
      }

      // Check time selection for hourly projects
      if (projectMode === 'hours' && !selectedTime) {
        toast.error('Please select a time slot for your booking');
        return false;
      }
    }

    if (currentStep === 3) {
      // Validate required RFQ questions
      for (let i = 0; i < project.rfqQuestions.length; i++) {
        const question = project.rfqQuestions[i];
        if (
          question.isRequired &&
          (!rfqAnswers[i] || !rfqAnswers[i].answer.trim())
        ) {
          toast.error(`Please answer: ${question.question}`);
          return false;
        }
      }
    }

    if (currentStep === 4) {
    }

    return true;
  };

  const guardOutsideServiceArea = () => {
    if (!isOutsideServiceArea) {
      return true;
    }

    toast.error(getOutsideServiceMessage());
    return false;
  };

  const handleNext = () => {
    if (!guardOutsideServiceArea()) return;
    if (!validateStep()) return;

    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    } else {
      onBack();
    }
  };

  const handleSubmit = async () => {
    console.log('[BOOKING] Submit initiated');
    console.log('[BOOKING] Current step:', currentStep);
    console.log('[BOOKING] Selected package index:', selectedPackageIndex);
    console.log('[BOOKING] Selected date:', selectedDate);

    if (!guardOutsideServiceArea()) {
      console.error(
        '[BOOKING] Submission blocked due to service radius limits'
      );
      return;
    }

    if (!validateStep()) {
      console.error('[BOOKING] Validation failed');
      return;
    }

    if (!selectedPackage || selectedPackageIndex === null) {
      toast.error('Please select a package before submitting');
      return;
    }

    console.log('[BOOKING] Validation passed');
    setLoading(true);

    try {
      const usageRequired = shouldCollectUsage(selectedPackage.pricing.type);
      const usageDetails = usageRequired
        ? ` Estimated usage: ${estimatedUsage}.`
        : '';
      const additionalNotesText = additionalNotes
        ? ` Additional notes: ${additionalNotes}`
        : '';
      const serviceDescription = `Booking for ${project.title}. Selected package: ${selectedPackage.name}.${usageDetails}${additionalNotesText}`;
      const totalPrice = calculateTotal();

      const bookingData = {
        bookingType: 'project',
        projectId: project._id,
        preferredStartDate: selectedDate,
        preferredStartTime:
          projectMode === 'hours' && selectedTime
            ? selectedTime
            : undefined,
        selectedSubprojectIndex: selectedPackageIndex,
        estimatedUsage: usageRequired ? estimatedUsage : undefined,
        selectedExtraOptions:
          selectedExtraOptions.length > 0 ? selectedExtraOptions : undefined,
          rfqData: {
            serviceType: project.title,
            description: serviceDescription,
            answers: rfqAnswers,
            preferredStartDate: selectedDate,
            preferredStartTime:
              projectMode === 'hours' && selectedTime
                ? selectedTime
                : undefined,
            budget:
              totalPrice > 0
                ? {
                    min: totalPrice,
                    max: totalPrice,
                    currency: 'EUR',
                  }
                : undefined,
          },
        urgency: 'medium',
      };

      console.log('[BOOKING] Prepared booking data:', bookingData);
      console.log(
        '[BOOKING] Backend URL:',
        process.env.NEXT_PUBLIC_BACKEND_URL
      );
      console.log('[BOOKING] Sending request...');

      const startTime = Date.now();

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('[BOOKING] Request timeout after 30 seconds');
        controller.abort();
      }, 30000); // 30 second timeout

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
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId); // Clear timeout if request completes

        const requestTime = Date.now() - startTime;
        console.log(`[BOOKING] Response received in ${requestTime}ms`);
        console.log('[BOOKING] Response status:', response.status);
        console.log('[BOOKING] Response ok:', response.ok);

        const data = await response.json();
        console.log('[BOOKING] Response data:', data);

        if (response.ok && data.success) {
          // Check if project has post-booking questions
          if (
            project.postBookingQuestions &&
            project.postBookingQuestions.length > 0 &&
            data.booking?._id
          ) {
            // Redirect to booking detail page with post-booking questions flag
            router.replace(
              `/bookings/${data.booking._id}?postBookingQuestions=true`
            );
          } else {
            router.replace('/dashboard');
          }
          return;
        } else {
          console.error('[BOOKING] Request failed');
          console.error('[BOOKING] Status:', response.status);
          console.error('[BOOKING] Error message:', data.msg || data.message);
          console.error('[BOOKING] Full response:', data);

          // Handle specific error cases
          if (response.status === 401) {
            console.error('[BOOKING] Not authenticated');
            toast.error('Please log in to submit a booking request');
            setTimeout(() => {
              router.push('/login?redirect=/projects/' + project._id);
            }, 1500);
          } else if (response.status === 403) {
            console.error('[BOOKING] Permission denied');
            toast.error(
              data.msg || 'You do not have permission to create bookings'
            );
          } else if (response.status === 400) {
            console.error('[BOOKING] Bad request - validation error');
            toast.error(
              data.msg || 'Please check your booking details and try again'
            );
          } else if (response.status === 404) {
            console.error('[BOOKING] Resource not found');
            toast.error(data.msg || 'Project not found');
          } else {
            console.error('[BOOKING] Unknown error status:', response.status);
            toast.error(
              data.msg ||
                data.message ||
                'Failed to create booking. Please try again.'
            );
          }
        }
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('[BOOKING] Request was aborted (timeout)');
          toast.error(
            'Request timed out. The server is taking too long to respond. Please try again.'
          );
        } else {
          throw fetchError; // Re-throw to be caught by outer catch
        }
      }
    } catch (error: unknown) {
      console.error('[BOOKING] Exception thrown');
      const err = error instanceof Error ? error : new Error('Unknown error');
      console.error('[BOOKING] Error name:', err.name);
      console.error('[BOOKING] Error message:', err.message);
      console.error('[BOOKING] Error stack:', err.stack);

      // Network or other errors
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        console.error('[BOOKING] Network/fetch error');
        toast.error(
          'Network error. Please check your connection and try again.'
        );
      } else if (err.name === 'AbortError') {
        console.error('[BOOKING] Request timeout');
        toast.error('Request timed out. Please try again.');
      } else {
        console.error('[BOOKING] Unexpected error type');
        toast.error('An unexpected error occurred. Please try again.');
      }
    } finally {
      console.log('[BOOKING] Request completed, resetting loading state');
      setLoading(false);
    }
  };

  const getEffectivePackagePrice = (): number | null => {
    if (
      !selectedPackage?.pricing.amount ||
      selectedPackage.pricing.type === 'rfq'
    ) {
      return null;
    }

    const multiplier = shouldCollectUsage(selectedPackage.pricing.type)
      ? estimatedUsage
      : 1;
    return multiplier * selectedPackage.pricing.amount;
  };

  const calculateTotal = (): number => {
    let total = 0;

    if (selectedPackage) {
      const packagePrice = getEffectivePackagePrice();
      if (typeof packagePrice === 'number') {
        total += packagePrice;
      } else if (
        selectedPackage.pricing.type === 'fixed' &&
        selectedPackage.pricing.amount
      ) {
        total += selectedPackage.pricing.amount;
      }
    }

    selectedExtraOptions.forEach((idx) => {
      const option = project.extraOptions[idx];
      if (option) {
        total += option.price;
      }
    });

    return total;
  };

  const projectedCompletionDate = calculateCompletionDate();
  const projectedCompletionDateTime = calculateCompletionDateTime();

  const shortestThroughputDetails = (() => {
    if (
      !proposals?.shortestThroughputProposal?.start ||
      !proposals.shortestThroughputProposal?.executionEnd
    ) {
      return null;
    }

    try {
      const startDate = parseISO(proposals.shortestThroughputProposal.start);
      // Use executionEnd for customer display (excludes buffer time)
      const endDate = parseISO(proposals.shortestThroughputProposal.executionEnd);
      const totalDays = Math.max(
        1,
        differenceInCalendarDays(endDate, startDate) + 1
      );
      return { startDate, endDate, totalDays };
    } catch {
      return null;
    }
  })();

  const effectivePackagePrice = getEffectivePackagePrice();
  const shouldShowUsageBreakdown = Boolean(
    selectedPackage?.pricing.amount &&
      shouldCollectUsage(selectedPackage.pricing.type)
  );

  const userCoordinates = user?.location?.coordinates;
  const customerLat =
    typeof userCoordinates?.[1] === 'number' ? userCoordinates[1] : null;
  const customerLon =
    typeof userCoordinates?.[0] === 'number' ? userCoordinates[0] : null;
  const serviceLat = project.distance?.coordinates?.latitude ?? null;
  const serviceLon = project.distance?.coordinates?.longitude ?? null;
  const maxServiceRadius = project.distance?.maxKmRange ?? null;

  const calculateDistanceKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const distanceToServiceArea = useMemo(() => {
    if (
      customerLat === null ||
      customerLon === null ||
      serviceLat === null ||
      serviceLon === null
    ) {
      return null;
    }
    return calculateDistanceKm(
      customerLat,
      customerLon,
      serviceLat,
      serviceLon
    );
  }, [customerLat, customerLon, serviceLat, serviceLon]);

  const isOutsideServiceArea = Boolean(
    maxServiceRadius &&
      distanceToServiceArea !== null &&
      distanceToServiceArea > maxServiceRadius
  );
  const roundedMaxRadius =
    typeof maxServiceRadius === 'number' ? Math.round(maxServiceRadius) : null;
  const roundedDistanceAway =
    distanceToServiceArea !== null ? Math.round(distanceToServiceArea) : null;

  const getOutsideServiceMessage = () => {
    if (!roundedMaxRadius) {
      return 'This service is not available in your current location.';
    }

    if (roundedDistanceAway !== null) {
      return `This service is only available within ${roundedMaxRadius}km. You are approximately ${roundedDistanceAway}km away from the service area.`;
    }

    return `This service is only available within ${roundedMaxRadius}km.`;
  };

  const getConsecutiveDates = (start: Date, end: Date) => {
    const days: Date[] = [];
    let cursor = start;
    while (cursor <= end) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  };

  const shortestWindowDates = shortestThroughputDetails
    ? getConsecutiveDates(
        shortestThroughputDetails.startDate,
        shortestThroughputDetails.endDate
      )
    : [];

  const handleApplyShortestWindow = () => {
    if (!shortestThroughputDetails) return;
    const start = format(shortestThroughputDetails.startDate, 'yyyy-MM-dd');
    if (isDateBlocked(start)) {
      toast.error('The shortest window start date is currently unavailable.');
      return;
    }
    setHasUserSelectedDate(true);
    setSelectedDate(start);
    if (showCalendar) {
      setShowCalendar(false);
    }
  };

  useEffect(() => {
    if (!selectedPackage) {
      setEstimatedUsage(1);
      return;
    }

    if (!shouldCollectUsage(selectedPackage.pricing.type)) {
      setEstimatedUsage(1);
    }
  }, [selectedPackage]);

  useEffect(() => {
    if (projectMode === 'hours') {
      setSelectedTime('');
    }
  }, [projectMode, selectedDate]);

  const projectedCompletionDate = calculateCompletionDate()
  const projectedCompletionDateTime = calculateCompletionDateTime()

  const getPreparationDurationLabel = () => {
    if (typeof selectedPackage?.deliveryPreparation === 'number' && selectedPackage.deliveryPreparation > 0) {
      return `${selectedPackage.deliveryPreparation} ${selectedPackage.deliveryPreparationUnit || 'days'}`
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

  const preparationLabel = getPreparationDurationLabel()
  const executionLabel = getExecutionDurationLabel()

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
    <div className='min-h-screen bg-gray-50 py-8'>
      <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8'>
        {/* Header */}
        <div className='mb-8'>
          <Button variant='ghost' onClick={handleBack} className='mb-4'>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back
          </Button>
          <h1 className='text-3xl font-bold text-gray-900'>
            Book: {project.title}
          </h1>
          <p className='text-gray-600 mt-2'>
            Complete the booking process in 4 simple steps
          </p>
        </div>

        {isOutsideServiceArea && (
          <div className='mb-6 rounded-lg border border-red-200 bg-red-50 p-4'>
            <p className='font-semibold text-red-800'>Outside service area</p>
            <p className='text-sm text-red-700 mt-1'>
              {getOutsideServiceMessage()}
            </p>
            <p className='text-xs text-red-600 mt-2'>
              Please update your profile location or choose another project
              closer to you.
            </p>
          </div>
        )}

        {/* Progress Steps */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            {[
              'Confirm Package',
              'Choose Date',
              'Answer Questions',
              'Review & Pay',
            ].map((step, idx) => (
              <div key={idx} className='flex items-center'>
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
                    <CheckCircle2 className='h-5 w-5 text-white' />
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
          <div className='flex justify-between mt-2'>
            {[
              'Confirm Package',
              'Choose Date',
              'Answer Questions',
              'Review & Pay',
            ].map((step, idx) => (
              <span
                key={idx}
                className={`text-xs ${
                  currentStep === idx + 1
                    ? 'font-semibold text-blue-600'
                    : 'text-gray-500'
                }`}
              >
                {step}
              </span>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className='p-6'>
            {/* Step 1: Confirm Package */}
            {currentStep === 1 && (
              <div className='space-y-6'>
                <div>
                  <h2 className='text-xl font-semibold mb-2'>
                    Confirm Your Package
                  </h2>
                  <p className='text-gray-600 text-sm'>
                    Each booking can include one package. Select your preferred
                    option on the project page, then confirm it here.
                  </p>
                </div>

                {!selectedPackage && (
                  <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3'>
                    <p className='text-sm text-yellow-900'>
                      No package selected yet. Please choose a package from the
                      project page to continue.
                    </p>
                    <Button
                      variant='outline'
                      className='w-full'
                      onClick={onBack}
                    >
                      Back to Packages
                    </Button>
                  </div>
                )}

                {selectedPackage && (
                  <>
                    <Card>
                      <CardContent className='p-6 space-y-4'>
                        <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                          <div>
                            <h3 className='text-lg font-semibold'>
                              {selectedPackage.name}
                            </h3>
                            <p className='text-sm text-gray-600 mt-1'>
                              {selectedPackage.description}
                            </p>
                          </div>
                          <div className='text-right'>
                            {selectedPackage.pricing.type === 'fixed' &&
                              selectedPackage.pricing.amount && (
                                <p className='text-2xl font-bold text-blue-600'>
                                  {formatCurrency(
                                    selectedPackage.pricing.amount
                                  )}
                                </p>
                              )}
                            {selectedPackage.pricing.type === 'unit' &&
                              selectedPackage.pricing.amount && (
                                <div>
                                  <p className='text-2xl font-bold text-blue-600'>
                                    {formatCurrency(
                                      selectedPackage.pricing.amount
                                    )}
                                    <span className='text-sm font-normal text-gray-500 ml-1'>
                                      /{project.priceModel || 'unit'}
                                    </span>
                                  </p>
                                  {selectedPackage.pricing.minProjectValue && (
                                    <p className='text-xs text-gray-500 mt-1'>
                                      Min. order{' '}
                                      {formatCurrency(
                                        selectedPackage.pricing.minProjectValue
                                      )}
                                    </p>
                                  )}
                                </div>
                              )}
                            {selectedPackage.pricing.type === 'rfq' && (
                              <Badge variant='outline'>Quote Required</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {shouldCollectUsage(selectedPackage.pricing.type) && (
                      <div className='space-y-4'>
                        <div>
                          <Label htmlFor='estimated-usage'>
                            Estimated Usage{' '}
                            {project.priceModel
                              ? `(${project.priceModel})`
                              : ''}{' '}
                            *
                          </Label>
                          <div className='relative mt-2'>
                            <Input
                              id='estimated-usage'
                              type='number'
                              min='1'
                              step='1'
                              value={estimatedUsage}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setEstimatedUsage(
                                  Number.isNaN(value) ? 1 : Math.max(1, value)
                                );
                              }}
                              className='text-lg pr-16'
                            />
                            {project.priceModel && (
                              <span className='absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none'>
                                {project.priceModel}
                              </span>
                            )}
                          </div>
                          <p className='text-xs text-gray-500 mt-1'>
                            Provide your best estimate
                            {project.priceModel
                              ? ` in ${project.priceModel}`
                              : ''}{' '}
                            so we can calculate an indicative price.
                          </p>
                        </div>

                        {selectedPackage.pricing.amount && (
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
                              {estimatedUsage} {project.priceModel || 'units'} x{' '}
                              {formatCurrency(selectedPackage.pricing.amount)}/
                              {project.priceModel || 'unit'}
                            </p>
                            {selectedPackage.pricing.minProjectValue &&
                              estimatedUsage *
                                (selectedPackage.pricing.amount || 0) <
                                selectedPackage.pricing.minProjectValue && (
                                <div className='mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800'>
                                  <strong>Note:</strong> Minimum order value is{' '}
                                  {formatCurrency(
                                    selectedPackage.pricing.minProjectValue
                                  )}
                                </div>
                              )}
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
                  <p className='text-gray-600 text-sm mb-6'>
                    Select when you&apos;d like the work to begin. Dates when
                    team members are unavailable are disabled.
                  </p>
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
                                    const dateStr = format(date, 'yyyy-MM-dd');
                                    if (isDateBlocked(dateStr)) {
                                      toast.error(
                                        'No available time slots on this day'
                                      );
                                      return;
                                    }
                                  }
                                  setHasUserSelectedDate(true);
                                  setSelectedDate(format(date, 'yyyy-MM-dd'));
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
                                  isDateBlocked(format(date, 'yyyy-MM-dd')),
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
                                  onClick={() => {
                                    const start = proposals
                                      .shortestThroughputProposal?.start
                                      ? format(
                                          parseISO(
                                            proposals.shortestThroughputProposal
                                              .start
                                          ),
                                          'yyyy-MM-dd'
                                        )
                                      : '';
                                    if (start && !isDateBlocked(start)) {
                                      setHasUserSelectedDate(true);
                                      setSelectedDate(start);
                                    }
                                  }}
                                >
                                  Shortest consecutive window:{' '}
                                  {`${format(
                                    shortestThroughputDetails.startDate,
                                    'MMM d, yyyy'
                                  )} - ${format(
                                    shortestThroughputDetails.endDate,
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
                                    const start = proposals.earliestProposal
                                      ?.start
                                      ? format(
                                          parseISO(
                                            proposals.earliestProposal.start
                                          ),
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
                                    format(
                                      parseISO(
                                        proposals.earliestProposal.start
                                      ),
                                      'MMM d, yyyy'
                                    )}
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                        {selectedTime && (
                          <div className='bg-green-50 border border-green-200 rounded-lg p-3 space-y-1'>
                            <p className='text-sm text-green-900'>
                              <strong>
                                Professional&apos;s time ({professionalTimezone}
                                ):
                              </strong>{' '}
                              {formatTimeRange(selectedTime)}
                            </p>
                            {selectedTimeConversion &&
                              selectedTimeConversion.viewer !==
                                selectedTimeConversion.professional && (
                                <p className='text-xs text-green-700'>
                                  <strong>Your time ({viewerTimeZone}):</strong>{' '}
                                  {selectedTimeConversion.viewer}
                                </p>
                              )}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedDate && (
                      <div className='bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3'>
                        <p className='text-sm text-blue-900'>
                          <strong>Selected Start Date:</strong>{' '}
                          {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
                          {projectMode === 'hours' && selectedTime && (
                            <span className='ml-2 font-bold'>
                              {formatTimeRange(selectedTime)}
                            </span>
                          )}
                        </p>

                        {(projectMode === 'hours'
                          ? projectedCompletionDateTime
                          : projectedCompletionDate) && (
                          <>
                            <p className='text-sm text-blue-900 font-semibold pt-2 border-t border-blue-300'>
                              <strong>Projected Completion:</strong>{' '}
                              {projectMode === 'hours' &&
                              projectedCompletionDateTime
                                ? `${format(
                                    projectedCompletionDateTime,
                                    'EEEE, MMMM d, yyyy'
                                  )} at ${projectedCompletionDateTime.toLocaleTimeString(
                                    'en-US',
                                    {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    }
                                  )}`
                                : projectedCompletionDate
                                ? format(
                                    projectedCompletionDate,
                                    'EEEE, MMMM d, yyyy'
                                  )
                                : null}
                            </p>
                            <p className='text-xs text-blue-700 italic'>
                              Weekends and blocked dates are skipped
                              automatically when calculating this estimate.
                            </p>
                          </>
                        )}
                        {projectMode === 'days' &&
                          shortestThroughputDetails && (
                            <div className='border-t border-blue-300 pt-3 space-y-3'>
                              <div className='flex flex-col gap-1'>
                                <p className='text-sm text-blue-900 font-semibold'>
                                  <strong>Shortest Consecutive Window</strong>{' '}
                                  <span className='text-xs font-normal'>
                                    ({shortestThroughputDetails.totalDays}{' '}
                                    {shortestThroughputDetails.totalDays === 1
                                      ? 'day'
                                      : 'days'}
                                    )
                                  </span>
                                </p>
                                <p className='text-xs text-blue-700'>
                                  {`${format(
                                    shortestThroughputDetails.startDate,
                                    'EEEE, MMMM d, yyyy'
                                  )} - ${format(
                                    shortestThroughputDetails.endDate,
                                    'EEEE, MMMM d, yyyy'
                                  )}`}
                                </p>
                              </div>
                              <div className='flex flex-wrap gap-2'>
                                {shortestWindowDates.map((day) => (
                                  <span
                                    key={day.toISOString()}
                                    className='px-3 py-1 text-xs rounded-full bg-white border border-blue-200 text-blue-800'
                                  >
                                    {format(day, 'MMM d')}
                                  </span>
                                ))}
                              </div>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                className='self-start text-xs'
                                onClick={handleApplyShortestWindow}
                              >
                                Use this window
                              </Button>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: RFQ Questions & Add-ons */}
            {currentStep === 3 && (
              <div className='space-y-6'>
                {/* Add-ons Section */}
                {project.extraOptions && project.extraOptions.length > 0 && (
                  <div className='space-y-4 pb-6 border-b'>
                    <div>
                      <h2 className='text-xl font-semibold mb-2'>
                        Add-On Options
                      </h2>
                      <p className='text-gray-600 text-sm mb-4'>
                        Select any additional options you would like to include
                        with your booking
                      </p>
                    </div>

                    <div className='space-y-3'>
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
                          <div className='flex items-start gap-3'>
                            <Checkbox
                              checked={selectedExtraOptions.includes(idx)}
                              onCheckedChange={() =>
                                handleExtraOptionToggle(idx)
                              }
                              className='mt-1'
                            />
                            <div className='flex-1'>
                              <div className='flex items-start justify-between gap-4'>
                                <div>
                                  <h3 className='font-semibold text-gray-900'>
                                    {option.name}
                                  </h3>
                                  {option.description && (
                                    <p className='text-sm text-gray-600 mt-1'>
                                      {option.description}
                                    </p>
                                  )}
                                </div>
                                <div className='text-right flex-shrink-0'>
                                  <p className='font-bold text-blue-600'>
                                    +{formatCurrency(option.price)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Price Breakdown */}
                    {selectedPackage && (
                      <div className='bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-3'>
                        <h3 className='font-semibold text-gray-900 mb-3'>
                          Price Summary
                        </h3>

                        {/* Base Package Price */}
                        <div className='flex justify-between items-center text-sm'>
                          <span className='text-gray-700'>Package Price:</span>
                          <span className='font-semibold'>
                            {selectedPackage.pricing.type === 'rfq'
                              ? 'Quote Required'
                              : typeof effectivePackagePrice === 'number'
                              ? formatCurrency(effectivePackagePrice)
                              : 'Quote Required'}
                          </span>
                        </div>

                        {/* Selected Add-ons */}
                        {selectedExtraOptions.length > 0 && (
                          <div className='space-y-2 pt-2 border-t border-blue-300'>
                            <p className='text-sm font-semibold text-gray-700'>
                              Selected Add-ons:
                            </p>
                            {selectedExtraOptions.map((idx) => {
                              const option = project.extraOptions[idx];
                              if (!option) return null;
                              return (
                                <div
                                  key={idx}
                                  className='flex justify-between items-center text-sm pl-4'
                                >
                                  <span className='text-gray-700'>
                                    <CheckCircle2 className='h-4 w-4 inline mr-2 text-green-600' />
                                    {option.name}
                                  </span>
                                  <span className='font-semibold text-green-600'>
                                    +{formatCurrency(option.price)}
                                  </span>
                                </div>
                              );
                            })}
                            {/* Add-ons Subtotal */}
                            <div className='flex justify-between items-center text-sm pt-2 border-t border-blue-200'>
                              <span className='text-gray-700 font-semibold'>
                                Add-ons Total:
                              </span>
                              <span className='font-semibold'>
                                {formatCurrency(
                                  selectedExtraOptions.reduce(
                                    (sum, idx) =>
                                      sum +
                                      (project.extraOptions[idx]?.price || 0),
                                    0
                                  )
                                )}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Grand Total */}
                        {calculateTotal() > 0 && (
                          <div className='flex justify-between items-center pt-3 border-t-2 border-blue-400'>
                            <span className='text-lg font-bold text-gray-900'>
                              Grand Total:
                            </span>
                            <span className='text-2xl font-bold text-blue-600'>
                              {formatCurrency(calculateTotal())}
                            </span>
                          </div>
                        )}

                        {shouldShowUsageBreakdown && (
                          <p className='text-xs text-gray-600 pt-2'>
                            Based on {estimatedUsage}{' '}
                            {project.priceModel || 'units'} at{' '}
                            {formatCurrency(selectedPackage.pricing.amount)}/
                            {project.priceModel || 'unit'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* RFQ Questions Section */}
                <div>
                  <h2 className='text-xl font-semibold mb-2'>
                    Project Details
                  </h2>
                  <p className='text-gray-600 text-sm mb-6'>
                    Please answer the following questions to help us understand
                    your needs
                  </p>
                </div>

                {project.rfqQuestions.map((question, idx) => (
                  <div key={idx} className='space-y-2'>
                    <Label htmlFor={`question-${idx}`}>
                      {question.question}
                      {question.isRequired && (
                        <span className='text-red-500 ml-1'>*</span>
                      )}
                    </Label>

                    {question.type === 'text' && (
                      <Textarea
                        id={`question-${idx}`}
                        placeholder='Your answer...'
                        value={rfqAnswers[idx]?.answer || ''}
                        onChange={(e) =>
                          handleRFQAnswerChange(idx, e.target.value)
                        }
                        rows={4}
                        required={question.isRequired}
                      />
                    )}

                    {question.type === 'multiple_choice' &&
                      question.options && (
                        <RadioGroup
                          value={rfqAnswers[idx]?.answer || ''}
                          onValueChange={(value) =>
                            handleRFQAnswerChange(idx, value)
                          }
                        >
                          {question.options.map((option, optIdx) => (
                            <div
                              key={optIdx}
                              className='flex items-center space-x-2'
                            >
                              <RadioGroupItem
                                value={option}
                                id={`q${idx}-opt${optIdx}`}
                              />
                              <Label
                                htmlFor={`q${idx}-opt${optIdx}`}
                                className='font-normal'
                              >
                                {option}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      )}

                    {question.type === 'attachment' && (
                      <div className='border-2 border-dashed border-gray-300 rounded-lg p-6 text-center'>
                        <Upload className='h-8 w-8 text-gray-400 mx-auto mb-2' />
                        <p className='text-sm text-gray-600'>
                          File upload coming soon
                        </p>
                        <Input
                          type='text'
                          placeholder='For now, please describe or provide a link'
                          value={rfqAnswers[idx]?.answer || ''}
                          onChange={(e) =>
                            handleRFQAnswerChange(idx, e.target.value)
                          }
                          className='mt-3'
                        />
                      </div>
                    )}
                  </div>
                ))}

                {/* Additional Notes */}
                <div className='space-y-2 pt-4 border-t'>
                  <Label htmlFor='additional-notes'>
                    Additional Notes (Optional)
                  </Label>
                  <Textarea
                    id='additional-notes'
                    placeholder="Any other information you'd like to share..."
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Step 4: Review & Payment */}
            {currentStep === 4 && (
              <div className='space-y-6'>
                <div>
                  <h2 className='text-xl font-semibold mb-2'>
                    Review Your Booking
                  </h2>
                  <p className='text-gray-600 text-sm mb-6'>
                    Please review your selections before proceeding
                  </p>
                </div>

                {/* Selected Package */}
                <div className='space-y-3'>
                  <h3 className='font-semibold'>Selected Package</h3>
                  {selectedPackage ? (
                    <div className='bg-gray-50 p-4 rounded space-y-1'>
                      <p className='font-medium text-gray-900'>
                        {selectedPackage.name}
                      </p>
                      <p className='text-sm text-gray-600'>
                        {selectedPackage.description}
                      </p>
                      <div className='text-sm text-gray-700 mt-2'>
                        {selectedPackage.pricing.type === 'fixed' &&
                          selectedPackage.pricing.amount && (
                            <span className='font-semibold text-blue-600'>
                              {formatCurrency(selectedPackage.pricing.amount)}
                            </span>
                          )}
                        {selectedPackage.pricing.type === 'unit' &&
                          selectedPackage.pricing.amount && (
                            <span className='font-semibold text-blue-600'>
                              {formatCurrency(selectedPackage.pricing.amount)}
                              <span className='text-xs font-normal text-gray-500 ml-1'>
                                /{project.priceModel || 'unit'}
                              </span>
                            </span>
                          )}
                        {selectedPackage.pricing.type === 'rfq' && (
                          <Badge variant='outline'>Quote Required</Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className='text-sm text-gray-500'>
                      No package selected.
                    </p>
                  )}
                </div>

                {/* Selected Date */}
                <div className='space-y-3'>
                  <h3 className='font-semibold'>Project Timeline</h3>
                  <div className='bg-gray-50 p-4 rounded space-y-3'>
                    <p className='text-sm'>
                      <strong>Start Date:</strong>{' '}
                      {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
                      {projectMode === 'hours' && selectedTime && (
                        <span className='ml-2 font-semibold'>
                          {formatTimeRange(selectedTime)}
                        </span>
                      )}
                    </p>
                    {(projectMode === 'hours'
                      ? projectedCompletionDateTime
                      : projectedCompletionDate) && (
                      <>
                        <p className='text-sm font-semibold pt-2 border-t border-gray-300'>
                          <strong>Expected Completion:</strong>{' '}
                          {projectMode === 'hours' &&
                          projectedCompletionDateTime
                            ? `${format(
                                projectedCompletionDateTime,
                                'EEEE, MMMM d, yyyy'
                              )} at ${projectedCompletionDateTime.toLocaleTimeString(
                                'en-US',
                                {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                }
                              )}`
                            : projectedCompletionDate
                            ? format(
                                projectedCompletionDate,
                                'EEEE, MMMM d, yyyy'
                              )
                            : null}
                        </p>
                        <p className='text-xs text-gray-600 italic'>
                          Weekends and blocked dates are automatically excluded
                          from this estimate.
                        </p>
                      </>
                    )}
                    {projectMode === 'days' &&
                      shortestThroughputDetails && (
                        <div className='border-t border-gray-300 pt-3 space-y-3'>
                          <div className='flex flex-col gap-1'>
                            <p className='text-sm font-semibold'>
                              <strong>Shortest Consecutive Window</strong>{' '}
                              <span className='text-xs font-normal'>
                                ({shortestThroughputDetails.totalDays}{' '}
                                {shortestThroughputDetails.totalDays === 1
                                  ? 'day'
                                  : 'days'}
                                )
                              </span>
                            </p>
                            <p className='text-xs text-gray-600'>
                              {`${format(
                                shortestThroughputDetails.startDate,
                                'EEEE, MMMM d, yyyy'
                              )} - ${format(
                                shortestThroughputDetails.endDate,
                                'EEEE, MMMM d, yyyy'
                              )}`}
                            </p>
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            {shortestWindowDates.map((day) => (
                              <span
                                key={day.toISOString()}
                                className='px-3 py-1 text-xs rounded-full bg-white border border-gray-300 text-gray-800'
                              >
                                {format(day, 'MMM d')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>

                {/* Price Breakdown */}
                {selectedPackage && (
                  <div className='space-y-3'>
                    <h3 className='font-semibold'>Price Summary</h3>
                    <div className='bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-3'>
                      {/* Base Package Price */}
                      <div className='flex justify-between items-center text-sm'>
                        <span className='text-gray-700'>Package Price:</span>
                        <span className='font-semibold'>
                          {selectedPackage.pricing.type === 'rfq'
                            ? 'Quote Required'
                            : typeof effectivePackagePrice === 'number'
                            ? formatCurrency(effectivePackagePrice)
                            : 'Quote Required'}
                        </span>
                      </div>

                      {shouldShowUsageBreakdown && (
                        <p className='text-xs text-gray-600'>
                          ({estimatedUsage} {project.priceModel || 'units'} ×{' '}
                          {formatCurrency(selectedPackage.pricing.amount)}/
                          {project.priceModel || 'unit'})
                        </p>
                      )}

                      {/* Selected Add-ons */}
                      {selectedExtraOptions.length > 0 && (
                        <div className='space-y-2 pt-2 border-t border-blue-300'>
                          <p className='text-sm font-semibold text-gray-700'>
                            Selected Add-ons:
                          </p>
                          {selectedExtraOptions.map((idx) => {
                            const option = project.extraOptions[idx];
                            if (!option) return null;
                            return (
                              <div
                                key={idx}
                                className='flex justify-between items-start text-sm pl-4'
                              >
                                <div className='flex-1'>
                                  <div className='flex items-start gap-2'>
                                    <CheckCircle2 className='h-4 w-4 text-green-600 mt-0.5 flex-shrink-0' />
                                    <div>
                                      <p className='text-gray-700 font-medium'>
                                        {option.name}
                                      </p>
                                      {option.description && (
                                        <p className='text-xs text-gray-600 mt-0.5'>
                                          {option.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className='font-semibold text-green-600 ml-4 flex-shrink-0'>
                                  +{formatCurrency(option.price)}
                                </span>
                              </div>
                            );
                          })}

                          {/* Add-ons Subtotal */}
                          <div className='flex justify-between items-center text-sm pt-2 border-t border-blue-200'>
                            <span className='text-gray-700 font-semibold'>
                              Add-ons Total:
                            </span>
                            <span className='font-semibold'>
                              {formatCurrency(
                                selectedExtraOptions.reduce(
                                  (sum, idx) =>
                                    sum +
                                    (project.extraOptions[idx]?.price || 0),
                                  0
                                )
                              )}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Separator */}
                      {calculateTotal() > 0 && (
                        <div className='border-t-2 border-blue-400 my-2'></div>
                      )}

                      {/* Grand Total */}
                      {calculateTotal() > 0 && (
                        <div className='flex justify-between items-center'>
                          <span className='text-lg font-bold text-gray-900'>
                            Grand Total:
                          </span>
                          <span className='text-2xl font-bold text-blue-600'>
                            {formatCurrency(calculateTotal())}
                          </span>
                        </div>
                      )}

                      {selectedPackage.pricing.type !== 'rfq' && (
                        <p className='text-xs text-gray-600 pt-2 border-t border-blue-200'>
                          *Final price may vary based on professional&apos;s
                          assessment
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Section (Dummy) */}
                <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6'>
                  <h3 className='font-semibold text-yellow-900 mb-2'>
                    Payment Coming Soon
                  </h3>
                  <p className='text-sm text-yellow-800'>
                    Payment integration will be added in the next phase. For
                    now, clicking &quot;Submit Booking&quot; will create your
                    booking request.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className='flex justify-between mt-6'>
          <Button variant='outline' onClick={handleBack}>
            {currentStep === 1 ? 'Cancel' : 'Previous'}
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext} disabled={isOutsideServiceArea}>
              Next Step
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading || isOutsideServiceArea}
              className='bg-blue-600 hover:bg-blue-700'
            >
              {loading ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
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
  );
}
