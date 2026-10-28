'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import AddressAutocomplete, { type PlaceData } from '@/components/professional/project-wizard/AddressAutocomplete';
import { countryFromPlace, locationFieldsFromPlace } from '@/lib/serviceAddress';
import StartChatButton from '@/components/chat/StartChatButton';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Loader2,
  Upload,
  X,
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
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';
import { getViewerTimezone, normalizeTimezone } from '@/lib/timezoneDisplay';
import { computeCustomerPriceWithRepeatBuyerDiscount } from '@/lib/projectPricing';
import { getAuthToken } from '@/lib/utils';
import { useCustomerPricing } from '@/hooks/useCustomerPricing';
import type { PublicProjectDto } from '@/types/project';
import { trackBeginCheckout, trackCompleteRfq, trackEvent } from '@/lib/analytics';

// Get unit label from priceModel (e.g., "m² of floor surface" ? "m²")
const getUnitLabel = (priceModel?: string): string => {
  if (!priceModel) return 'unit';
  const normalized = priceModel.toLowerCase().trim();
  if (normalized.includes('m²') || normalized.includes('m2')) return 'm²';
  if (normalized.includes('hour')) return 'hour';
  if (normalized.includes('day')) return 'day';
  if (normalized.includes('meter')) return 'meter';
  if (normalized.includes('room')) return 'room';
  // For "Total price" model, return 'unit' as fallback
  if (normalized.includes('total')) return 'unit';
  return priceModel; // Return original if no match
};

// Check if priceModel is a "total price" type (fixed pricing - no usage collection needed)
const isTotalPriceModel = (priceModel?: string): boolean => {
  if (!priceModel) return false;
  const normalized = priceModel.toLowerCase().trim();
  return (
    normalized === 'total price' ||
    normalized === 'total' ||
    normalized === 'fixed price' ||
    normalized === 'fixed'
  );
};

// Check if priceModel is unit-based (requires usage collection)
const isUnitBasedPriceModel = (priceModel?: string): boolean => {
  if (!priceModel) return false;
  const normalized = priceModel.toLowerCase().trim();
  // Check for unit-based models
  if (normalized.includes('m²') || normalized.includes('m2')) return true;
  if (normalized.includes('hour') && !normalized.includes('total')) return true;
  if (normalized.includes('day') && !normalized.includes('total')) return true;
  if (normalized.includes('meter')) return true;
  if (normalized.includes('room')) return true;
  if (normalized.includes('per ')) return true; // "per hour", "per m²", etc.
  // If it's not total price and not rfq, assume unit-based for old projects
  if (!isTotalPriceModel(priceModel) && !normalized.includes('rfq')) {
    // Check if it looks like a unit description
    return (
      normalized.includes('surface') ||
      normalized.includes('area') ||
      normalized.includes('floor') ||
      normalized.includes('roof') ||
      normalized.includes('façade') ||
      normalized.includes('window')
    );
  }
  return false;
};

// Multiplier for calculating throughput suggestion limit from execution days.
// The limit is 2x execution days to allow reasonable scheduling flexibility
// while still warning users about unusually long throughput windows.
const THROUGHPUT_SUGGESTION_MULTIPLIER = 2;

interface ProjectBookingFormProps {
  project: PublicProjectDto;
  onBack: () => void;
  selectedSubprojectIndex?: number | null;
}

interface RFQAnswer {
  question: string;
  answer: string;
  type: string;
  fieldType?: string;
}

interface VatAnswer {
  fieldName: string;
  value: string | number | boolean | string[];
}

interface VatPreviewDecision {
  action: 'standard_rate' | 'reduced_rate' | 'rfq';
  country: string;
  standardRate: number;
  appliedRate: number;
  reducedRate?: number;
  reverseCharge: boolean;
  explanation?: string;
}

interface BlockedRange {
  startDate: string;
  endDate: string;
  reason?: string;
}

interface ResourcePolicy {
  minResources: number;
  minOverlapPercentage: number;
  totalResources: number;
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

type ScheduleProposalsDebugInfo = NonNullable<
  NonNullable<ScheduleProposalsResponse['proposals']>['_debug']
>;

interface AvailabilityDebugInfo extends Partial<ScheduleProposalsDebugInfo> {
  executionDays?: number;
  minResources?: number;
  totalResources?: number;
  requiredOverlap?: number;
  useWindowBasedCheck?: boolean;
  teamMembers?: unknown[];
  bookings?: unknown[];
  dateBlockedMembers?: Record<string, unknown> | null;
}

interface AvailabilityResponse {
  success: boolean;
  blockedDates?: string[];
  blockedRanges?: BlockedRange[];
  resourcePolicy?: ResourcePolicy;
  timezone?: string;
  _debug?: AvailabilityDebugInfo;
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

type ProjectExecutionDuration = NonNullable<PublicProjectDto['executionDuration']>;
type SubprojectExecutionDuration = NonNullable<
  PublicProjectDto['subprojects'][number]['executionDuration']
>;
type AnyExecutionDuration =
  | ProjectExecutionDuration
  | SubprojectExecutionDuration;

const hasDurationRange = (
  duration?: AnyExecutionDuration
): duration is SubprojectExecutionDuration & {
  range: { min?: number; max?: number };
} => Boolean(duration && 'range' in duration && duration.range);

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

const isDev = process.env.NODE_ENV === 'development';

export default function ProjectBookingForm({
  project,
  onBack,
  selectedSubprojectIndex,
}: ProjectBookingFormProps) {
  const { customerPrice, commissionPercent, loyaltyLoaded } = useCustomerPricing();
  const customerPricingReady = commissionPercent != null && loyaltyLoaded;
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('projectBooking');
  const { formatMoney, currency } = useCurrency();
  const { intl, dateFns } = useFormatLocale();

  // All amounts in this form are EUR: it is the step right before payment, so
  // nothing is converted — only formatted in the active locale.
  const formatAmount = useCallback(
    (amount?: number | null) =>
      typeof amount === 'number' ? formatMoney(amount) : null,
    [formatMoney]
  );

  // Unit labels for the price model: known models get a translated label, an
  // unknown (professional-defined) price model is shown as-is.
  const getUnitLabelText = useCallback(
    (priceModel?: string): string => {
      const unit = getUnitLabel(priceModel);
      switch (unit) {
        case 'unit':
          return t('units.unit');
        case 'hour':
          return t('units.hour');
        case 'day':
          return t('units.day');
        case 'meter':
          return t('units.meter');
        case 'room':
          return t('units.room');
        case 'm²':
          return t('units.squareMeter');
        default:
          return unit;
      }
    },
    [t]
  );

  const getPricingTypeLabel = useCallback(
    (pricingType?: string): string => {
      switch (pricingType) {
        case 'fixed':
          return t('pricingType.fixed');
        case 'unit':
          return t('pricingType.unit');
        case 'rfq':
          return t('pricingType.rfq');
        default:
          return pricingType || '';
      }
    },
    [t]
  );

  // Locale-aware clock time ("09:00" from the API → "9:00 AM" / "09:00").
  const formatClockTime = useCallback(
    (time: string): string => {
      const [hours, minutes] = time.split(':').map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
      return new Intl.DateTimeFormat(intl, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(2000, 0, 1, hours, minutes));
    },
    [intl]
  );

  // Locale-aware date/time formatting in the professional's timezone.
  const formatZonedDate = useCallback(
    (date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(intl, {
        ...options,
        timeZone: normalizeTimezone(timeZone),
      }).format(date),
    [intl]
  );

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
  const [serverSlotsForSelectedDate, setServerSlotsForSelectedDate] = useState<string[] | null>(null);
  const [serverSlotsError, setServerSlotsError] = useState(false);
  const [loadingServerSlots, setLoadingServerSlots] = useState(false);
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
  const [vatAnswers, setVatAnswers] = useState<Record<string, VatAnswer>>({});
  const [vatPreview, setVatPreview] = useState<VatPreviewDecision | null>(null);
  const [proceedAtStandardVat, setProceedAtStandardVat] = useState(false);
  const [uploadingQuestionIndexes, setUploadingQuestionIndexes] = useState<Set<number>>(new Set());
  const [selectedExtraOptions, setSelectedExtraOptions] = useState<number[]>(
    []
  );
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [rfqAttachments, setRfqAttachments] = useState<{ url: string; name: string }[]>([]);
  const [uploadingRfqAttachment, setUploadingRfqAttachment] = useState(false);
  const [useProfileAddress, setUseProfileAddress] = useState(true);
  const [manualAddress, setManualAddress] = useState('');
  const [isServiceAddressValid, setIsServiceAddressValid] = useState(false);
  const [servicePlace, setServicePlace] = useState<PlaceData | undefined>();
  const selectedPackage =
    selectedPackageIndex !== null
      ? project.subprojects[selectedPackageIndex]
      : null;
  const isRfqPackage = selectedPackage?.pricing?.type === 'rfq';

  const rfqChatPrefill = useMemo(() => {
    const lines: string[] = [t('chat.greeting')];
    lines.push(t('chat.project', { value: project.title }));
    if (selectedPackage?.name) {
      lines.push(t('chat.package', { value: selectedPackage.name }));
    }
    if (selectedPackage?.pricing?.type) {
      lines.push(
        t('chat.pricingType', {
          value: getPricingTypeLabel(selectedPackage.pricing.type),
        })
      );
    }
    const bookingCollectsUsage = selectedPackage?.pricing?.type === 'unit'
      || (!selectedPackage?.pricing?.type && isUnitBasedPriceModel(project.priceModel));
    if (bookingCollectsUsage && estimatedUsage) {
      lines.push(
        t('chat.estimatedUsage', {
          count: estimatedUsage,
          unit: getUnitLabelText(project.priceModel),
        })
      );
    }
    const selectedOptions = selectedExtraOptions
      .map((index) => project.extraOptions?.[index]?.name)
      .filter(Boolean);
    if (selectedOptions.length > 0) {
      lines.push(t('chat.selectedOptions', { value: selectedOptions.join(', ') }));
    }
    const address = servicePlace?.formatted_address || (useProfileAddress ? user?.location?.address : manualAddress);
    const country = countryFromPlace(servicePlace) || (useProfileAddress ? user?.location?.country : undefined);
    if (address) lines.push(t('chat.serviceAddress', { value: address }));
    if (country) lines.push(t('chat.serviceCountry', { value: country }));
    if (selectedDate) {
      const parsedSelectedDate = parseISO(selectedDate);
      lines.push(
        t('chat.preferredDate', {
          value:
            Number.isNaN(parsedSelectedDate.getTime())
              ? selectedDate
              : format(parsedSelectedDate, 'PPP', { locale: dateFns }),
        })
      );
    }
    if (selectedTime) {
      lines.push(t('chat.preferredTime', { value: formatClockTime(selectedTime) }));
    }
    if (additionalNotes.trim()) {
      lines.push(t('chat.additionalNotes', { value: additionalNotes.trim() }));
    }
    if (rfqAttachments.length > 0) {
      lines.push(
        t('chat.attachments', {
          value: rfqAttachments.map((attachment) => attachment.name).join(', '),
        })
      );
    }
    if (vatPreview) {
      lines.push(
        vatPreview.reverseCharge
          ? t('chat.vatPreviewReverseCharge', { country: vatPreview.country })
          : t('chat.vatPreview', {
            rate: vatPreview.appliedRate,
            country: vatPreview.country,
          })
      );
    }
    for (const question of project.vatManagement?.reducedVatQuestions || []) {
      const answer = vatAnswers[question.fieldName]?.value;
      if (answer === undefined || answer === '') continue;
      const formatted = Array.isArray(answer)
        ? answer.join(', ')
        : answer === true
          ? t('common.yes')
          : answer === false
            ? t('common.no')
            : String(answer);
      lines.push(t('chat.answer', { question: question.question, answer: formatted }));
    }
    (project.rfqQuestions || []).forEach((question, index) => {
      const answer = rfqAnswers[index]?.answer?.trim();
      if (answer) {
        lines.push(t('chat.answer', { question: question.question, answer }));
      }
    });
    return lines.length > 1 ? lines.join('\n') : '';
  }, [project, selectedPackage, selectedExtraOptions, estimatedUsage, servicePlace, useProfileAddress, user?.location, manualAddress, selectedDate, selectedTime, additionalNotes, rfqAttachments, vatPreview, vatAnswers, rfqAnswers, t, dateFns, formatClockTime, getPricingTypeLabel, getUnitLabelText]);

  // Best-effort VAT preview for the review step. Checkout always uses the
  // backend-computed decision, so failures here are silently ignored.
  useEffect(() => {
    if (currentStep !== 4) {
      setVatPreview(null);
      return;
    }
    setVatPreview(null);
    setProceedAtStandardVat(false);
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/vat-preview`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: project._id,
              serviceConfigurationId: project.serviceConfigurationId,
              vatAnswers: Object.values(vatAnswers),
              serviceCountry:
                countryFromPlace(servicePlace) ||
                (useProfileAddress ? user?.location?.country : undefined),
            }),
          }
        );
        const payload = await response.json();
        if (!cancelled && response.ok && payload.success && payload.data) {
          setVatPreview(payload.data);
        }
      } catch {
        if (!cancelled) setVatPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStep, project._id, project.serviceConfigurationId, vatAnswers, servicePlace, useProfileAddress, user?.location?.country]);

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
  const latestSlotsRequestRef = useRef(0);
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
    const pkg = typeof selectedPackageIndex === 'number'
      ? project.subprojects[selectedPackageIndex]
      : null;
    setLoadingAvailability(true);
    setBlockedDates({
      blockedDates: [],
      blockedRanges: [],
    });
    setProposals(null);
    setScheduleWindow(null);
    setSelectedDate('');
    setSelectedTime('');
    if (pkg?.pricing?.type !== 'rfq') {
      fetchTeamAvailability(packageIndex);
      fetchScheduleProposals(packageIndex);
    } else {
      setLoadingAvailability(false);
      setSelectedExtraOptions([]);
    }
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

  useEffect(() => {
    if (projectMode !== 'hours' || !selectedDate) {
      latestSlotsRequestRef.current += 1;
      setServerSlotsForSelectedDate(null);
      setServerSlotsError(false);
      setLoadingServerSlots(false);
      return;
    }
    const requestId = ++latestSlotsRequestRef.current;
    const controller = new AbortController();
    const isCurrent = () =>
      requestId === latestSlotsRequestRef.current && !controller.signal.aborted;
    const run = async () => {
      try {
        setServerSlotsForSelectedDate(null);
        setServerSlotsError(false);
        setLoadingServerSlots(true);
        let url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/available-slots?date=${selectedDate}`;
        if (typeof selectedPackageIndex === 'number') {
          url += `&subprojectIndex=${selectedPackageIndex}`;
        }
        const res = await fetch(url, { signal: controller.signal });
        if (!isCurrent()) return;
        if (!res.ok) {
          setServerSlotsError(true);
          setSelectedTime('');
          return;
        }
        const data = await res.json();
        if (!isCurrent()) return;
        if (!Array.isArray(data?.slots)) {
          setServerSlotsError(true);
          setSelectedTime('');
          return;
        }
        setServerSlotsForSelectedDate(data.slots as string[]);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (isCurrent()) {
          setServerSlotsError(true);
          setSelectedTime('');
        }
      } finally {
        if (isCurrent()) {
          setLoadingServerSlots(false);
        }
      }
    };
    run();
    return () => controller.abort();
  }, [project._id, selectedDate, selectedPackageIndex, projectMode]);

  useEffect(() => {
    if (!serverSlotsForSelectedDate) return;
    if (!selectedTime) return;
    if (serverSlotsForSelectedDate.includes(selectedTime)) return;
    setSelectedTime(serverSlotsForSelectedDate[0] || '');
  }, [serverSlotsForSelectedDate, selectedTime]);

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
  }, [project._id, selectedPackageIndex]);

  // Fetch schedule window from backend when date changes (for days mode)
  useEffect(() => {
    debugLog?.('[SCHEDULE WINDOW] useEffect triggered:', {
      selectedDate,
      projectMode,
      loadingAvailability,
      selectedPackageIndex,
      shouldFetch: selectedDate && projectMode === 'days' && !loadingAvailability
    });
    if (selectedDate && projectMode === 'days' && !loadingAvailability) {
      debugLog?.('[SCHEDULE WINDOW] Calling fetchScheduleWindow for date:', selectedDate);
      setScheduleWindow(null);
      fetchScheduleWindow(selectedDate);
    }
  }, [selectedDate, projectMode, loadingAvailability, fetchScheduleWindow]);

  const fetchTeamAvailability = async (packageIndex?: number) => {
    try {
      debugLog?.(
        '[BOOKING] Fetching team availability for project:',
        project._id,
        'packageIndex:',
        packageIndex
      );
      let url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/availability`;
      if (typeof packageIndex === 'number') {
        url += `?subprojectIndex=${packageIndex}`;
      }
      const response = await fetch(url);
      const data: AvailabilityResponse = await response.json();

      debugLog?.('%c[AVAILABILITY API]', 'color: #00aa00; font-weight: bold', {
        blockedDatesCount: data.blockedDates?.length || 0,
        blockedRangesCount: data.blockedRanges?.length || 0,
        resourcePolicy: data.resourcePolicy,
      });
      if (isDev && data._debug) {
        debugLog?.(
          '%c[AVAILABILITY DEBUG]',
          'color: #00aa00; font-weight: bold',
          {
            projectId: data._debug?.projectId,
            subprojectIndex: data._debug?.subprojectIndex,
            timeZone: data._debug?.timeZone,
            executionDays: data._debug?.executionDays,
            minResources: data._debug?.minResources,
            totalResources: data._debug?.totalResources,
            requiredOverlap: data._debug?.requiredOverlap,
            useWindowBasedCheck: data._debug?.useWindowBasedCheck,
          }
        );
        debugLog?.(
          '%c[TEAM MEMBERS]',
          'color: #ff6600; font-weight: bold',
          data._debug?.teamMembers
        );
        debugLog?.(
          '%c[BOOKINGS BLOCKING TEAM]',
          'color: #cc0000; font-weight: bold',
          data._debug?.bookings
        );
        debugLog?.(
          '%c[DATES WITH BLOCKED MEMBERS]',
          'color: #9900cc; font-weight: bold',
          data._debug?.dateBlockedMembers
        );
      }

      if (data.success) {
        const availabilityTz = normalizeTimezone(
          data.timezone || professionalTimezone || professionalTz
        );
        if (!professionalTimezone || professionalTimezone !== availabilityTz) {
          setProfessionalTimezone(availabilityTz);
        }
        // Normalize dates to yyyy-MM-dd format
        const normalizedData: BlockedDates = {
          blockedDates: (data.blockedDates || []).map((d: string) =>
            formatInTimeZone(parseISO(d), availabilityTz, 'yyyy-MM-dd')
          ),
          blockedRanges: (data.blockedRanges || []).map(
            (range: BlockedRange) => ({
              startDate: range.startDate,
              endDate: range.endDate,
              reason: range.reason,
            })
          ),
          resourcePolicy: data.resourcePolicy,
        };
        debugLog?.('[BOOKING] Normalized data:', normalizedData);
        debugLog?.('[BOOKING] Resource policy:', data.resourcePolicy);
        setBlockedDates(normalizedData);
      }
    } catch (error) {
      debugError?.('Error fetching availability:', error);
      toast.error(t('toasts.availabilityFailed'));
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

      if (isDev) {
        debugLog?.('%c[PROPOSALS API]', 'color: #0066cc; font-weight: bold', {
          earliestBookableDate: data.proposals?.earliestBookableDate,
          earliestProposal: data.proposals?.earliestProposal,
          mode: data.proposals?.mode,
          _debug: data.proposals?._debug,
        });
        if (data.proposals?._debug) {
          debugLog?.(
            '%c[PROPOSALS DEBUG]',
            'color: #0066cc',
            data.proposals._debug
          );
        }
      }
      if (data.success && data.proposals) {
        setProposals(data.proposals);
      }
    } catch (error) {
      debugError?.('Error fetching schedule proposals:', error);
    }
  };

  const fetchProfessionalWorkingHours = async () => {
    try {
      debugLog?.('[BOOKING] Fetching working hours for project:', project._id);
      setLoadingWorkingHours(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${project._id}/working-hours`
      );
      const data: WorkingHoursResponse = await response.json();

      debugLog?.('[BOOKING] Working hours response:', data);
      if (data.success && data.availability) {
        debugLog?.(
          '[BOOKING] Professional availability set:',
          data.availability
        );
        debugLog?.('[BOOKING] Professional timezone:', data.timezone);
        setProfessionalAvailability(data.availability);
        if (data.timezone) {
          setProfessionalTimezone(normalizeTimezone(data.timezone));
        }
      } else {
        debugWarn?.(
          '[BOOKING] No working hours data received or request failed'
        );
      }
    } catch (error) {
      debugError?.(
        '[BOOKING] Error fetching professional working hours:',
        error
      );
    } finally {
      setLoadingWorkingHours(false);
    }
  };

  // Determine if we should collect usage (estimated quantity) from customer
  // Handles both new projects (with pricing.type) and old projects (just priceModel)
  const shouldCollectUsage = (
    pricingType?: 'fixed' | 'unit' | 'rfq'
  ): boolean => {
    // If subproject has explicit pricing type, use it
    if (pricingType) {
      return pricingType === 'unit';
    }
    // For old projects without pricing.type, check project.priceModel
    // If priceModel is unit-based (m², meter, hour, etc.), collect usage
    return isUnitBasedPriceModel(project.priceModel);
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
    const startStr = toLocalDateKey(startDate);
    if (isProfessionalWorkingDay(startDate) && !isDateBlocked(startStr)) {
      countedDays = 1;
    }

    // Now find remaining working days
    while (countedDays < workingDays) {
      cursor = addDays(cursor, 1);
      const cursorStr = toLocalDateKey(cursor);

      if (isProfessionalWorkingDay(cursor) && !isDateBlocked(cursorStr)) {
        countedDays++;
      }
    }

    return cursor;
  };

  // Check if a date is a weekend (Saturday or Sunday)
  const isWeekend = useCallback((date: Date): boolean => {
    try {
      const dateStr = toLocalDateKey(date);
      const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, professionalTz);
      const weekday = formatInTimeZone(dayStartUtc, professionalTz, 'eeee').toLowerCase();
      return weekday === 'saturday' || weekday === 'sunday';
    } catch {
      const day = date.getDay();
      return day === 0 || day === 6;
    }
  }, [professionalTz, toLocalDateKey]);

  // Check if professional works on this date (based on their availability)
  const isProfessionalWorkingDay = useCallback((date: Date): boolean => {
    if (!professionalAvailability) {
      // This should only happen during initial load before working hours are fetched
      debugWarn?.(
        '[BOOKING] ?? isProfessionalWorkingDay called before working hours loaded! Date:',
        toLocalDateKey(date)
      );
      debugWarn?.(
        '[BOOKING] Loading states - availability:',
        loadingAvailability,
        'workingHours:',
        loadingWorkingHours
      );
      return true; // Default to available while loading
    }

    try {
      const dateStr = toLocalDateKey(date);
      const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, professionalTz);
      const weekday = formatInTimeZone(dayStartUtc, professionalTz, 'eeee').toLowerCase() as keyof ProfessionalAvailability;
      const dayAvailability = professionalAvailability[weekday];

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
    } catch (error) {
      debugWarn?.('[BOOKING] Failed to evaluate working day with timezone:', {
        error,
        timezone: professionalTz,
        date: toLocalDateKey(date),
      });
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
      const fallbackAvailability = professionalAvailability[dayName];
      return fallbackAvailability?.available !== false;
    }
  }, [
    debugWarn,
    loadingAvailability,
    loadingWorkingHours,
    professionalAvailability,
    professionalTz,
    toLocalDateKey,
  ]);

  // Get working hours for the selected date
  const getWorkingHoursForDate = useCallback((
    date: Date
  ): { startTime: string; endTime: string } => {
    const defaultHours = { startTime: '09:00', endTime: '17:00' };

    if (!professionalAvailability) return defaultHours;

    let dayAvailability: ProfessionalAvailability[keyof ProfessionalAvailability] | undefined;
    try {
      const dateStr = toLocalDateKey(date);
      const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, professionalTz);
      const weekday = formatInTimeZone(dayStartUtc, professionalTz, 'eeee').toLowerCase() as keyof ProfessionalAvailability;
      dayAvailability = professionalAvailability[weekday];
    } catch {
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
      dayAvailability = professionalAvailability[dayName];
    }

    if (!dayAvailability || !dayAvailability.available) return defaultHours;

    return {
      startTime: dayAvailability.startTime || '09:00',
      endTime: dayAvailability.endTime || '17:00',
    };
  }, [professionalAvailability, professionalTz, toLocalDateKey]);

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

  const adjustRangeEndForMidnightUtc = useCallback((
    rangeEnd: Date,
    targetDate: Date,
    tz: string,
    dayEndOverride?: Date
  ): Date => {
    const isExactMidnightUTC =
      rangeEnd.getUTCHours() === 0 &&
      rangeEnd.getUTCMinutes() === 0 &&
      rangeEnd.getUTCSeconds() === 0;

    if (!isExactMidnightUTC) {
      return rangeEnd;
    }

    const rangeEndDateInTz = formatInTimeZone(rangeEnd, tz, 'yyyy-MM-dd');
    const targetDateInTz = formatInTimeZone(targetDate, tz, 'yyyy-MM-dd');

    if (rangeEndDateInTz !== targetDateInTz) {
      return rangeEnd;
    }

    if (dayEndOverride) {
      return dayEndOverride;
    }
    const targetDateKey = toLocalDateKey(targetDate);
    return addDays(fromProfessionalDateKey(targetDateKey), 1);
  }, [fromProfessionalDateKey, toLocalDateKey]);

  const getBlockedIntervalsForDate = useCallback((date: Date) => {
    const intervals: Array<{ start: Date; end: Date }> = [];
    const dateKey = toLocalDateKey(date);
    const dayStart = fromProfessionalDateKey(dateKey);
    const dayEnd = addDays(dayStart, 1);
    const tz = professionalTz;

    if (blockedDates.blockedDates.includes(dateKey)) {
      intervals.push({ start: dayStart, end: dayEnd });
    }

    blockedDates.blockedRanges.forEach((range) => {
      try {
        const rangeStart = parseISO(range.startDate);
        let rangeEnd = parseISO(range.endDate);

        if (
          Number.isNaN(rangeStart.getTime()) ||
          Number.isNaN(rangeEnd.getTime())
        ) {
          return;
        }

        rangeEnd = adjustRangeEndForMidnightUtc(rangeEnd, date, tz, dayEnd);

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
  }, [
    adjustRangeEndForMidnightUtc,
    blockedDates.blockedDates,
    blockedDates.blockedRanges,
    fromProfessionalDateKey,
    professionalTz,
    toLocalDateKey,
  ]);

  const computeBlockedHoursForIntervals = useCallback((
    date: Date,
    intervals: Array<{ start: Date; end: Date }>
  ) => {
    const { startTime, endTime } = getWorkingHoursForDate(date);
    const dateStr = toLocalDateKey(date);
    const dayEnd = addDays(fromProfessionalDateKey(dateStr), 1);
    const tz = professionalTz;
    const workingStart = fromZonedTime(`${dateStr}T${startTime}:00`, tz);
    const workingEnd = fromZonedTime(`${dateStr}T${endTime}:00`, tz);

    const workingHours =
      (workingEnd.getTime() - workingStart.getTime()) / (1000 * 60 * 60);

    if (workingEnd <= workingStart || !Number.isFinite(workingHours)) {
      return { blockedHours: Number.POSITIVE_INFINITY, workingHours: 0 };
    }

    const clamped = intervals
      .map((interval) => {
        const intervalEnd = adjustRangeEndForMidnightUtc(
          interval.end,
          date,
          tz,
          dayEnd
        ).getTime();
        const start = Math.max(interval.start.getTime(), workingStart.getTime());
        const end = Math.min(intervalEnd, workingEnd.getTime());
        return { start, end };
      })
      .filter((interval) => interval.end > interval.start)
      .sort((a, b) => a.start - b.start);

    if (clamped.length === 0) {
      return { blockedHours: 0, workingHours };
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

    return { blockedHours: totalMinutes / 60, workingHours };
  }, [
    adjustRangeEndForMidnightUtc,
    fromProfessionalDateKey,
    getWorkingHoursForDate,
    professionalTz,
    toLocalDateKey,
  ]);

  const shouldBlockDayForIntervals = (
    date: Date,
    intervals: Array<{ start: Date; end: Date }>
  ) => {
    if (intervals.length === 0) {
      return false;
    }

    const { blockedHours } = computeBlockedHoursForIntervals(date, intervals);
    // Block the day if 4 or more hours are blocked (matches backend logic)
    return blockedHours >= PARTIAL_BLOCK_THRESHOLD_HOURS;
  };

  const windowOverlapsBlockedRanges = (
    windowStart: Date,
    windowEnd: Date
  ): boolean => {
    if (windowEnd <= windowStart) {
      return false;
    }
    const tz = professionalTz;
    const startKey = toLocalDateKey(windowStart);
    const dayEnd = addDays(fromProfessionalDateKey(startKey), 1);

    return blockedDates.blockedRanges.some((range) => {
      const rangeStart = parseISO(range.startDate);
      let rangeEnd = parseISO(range.endDate);
      if (
        Number.isNaN(rangeStart.getTime()) ||
        Number.isNaN(rangeEnd.getTime())
      ) {
        return false;
      }
      rangeEnd = adjustRangeEndForMidnightUtc(
        rangeEnd,
        windowStart,
        tz,
        dayEnd
      );
      return windowStart < rangeEnd && windowEnd > rangeStart;
    });
  };

  const isBufferDayBlocked = (date: Date): boolean => {
    if (!isProfessionalWorkingDay(date)) {
      return true;
    }

    const dateKey = toLocalDateKey(date);
    if (blockedDates.blockedDates.includes(dateKey)) {
      return true;
    }

    return false;
  };

  const addWorkingHoursForBuffer = (startDate: Date, hoursToAdd: number) => {
    let remainingMinutes = hoursToAdd * 60;
    let cursor = new Date(startDate);
    const maxIterations = 366 * 3;
    let iterations = 0;

    while (remainingMinutes > 0 && iterations < maxIterations) {
      iterations += 1;
      const dayStart = fromProfessionalDateKey(toLocalDateKey(cursor));
      if (isBufferDayBlocked(dayStart)) {
        cursor = addDays(dayStart, 1);
        continue;
      }

      const { startTime, endTime } = getWorkingHoursForDate(dayStart);
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
        cursor = addDays(dayStart, 1);
        continue;
      }
      if (endMinutes <= startMinutes) {
        cursor = addDays(dayStart, 1);
        continue;
      }

      let currentMinutes = cursor.getHours() * 60 + cursor.getMinutes();
      if (currentMinutes < startMinutes) {
        currentMinutes = startMinutes;
      }
      if (currentMinutes >= endMinutes) {
        cursor = addDays(dayStart, 1);
        continue;
      }

      const availableMinutes = endMinutes - currentMinutes;
      if (remainingMinutes <= availableMinutes) {
        const result = new Date(dayStart);
        const endTotalMinutes = currentMinutes + remainingMinutes;
        result.setHours(
          Math.floor(endTotalMinutes / 60),
          endTotalMinutes % 60,
          0,
          0
        );
        return result;
      }

      remainingMinutes -= availableMinutes;
      cursor = addDays(dayStart, 1);
    }

    debugWarn?.(
      '[addWorkingHoursForBuffer] Max iterations reached; buffer end may be inaccurate'
    );
    return cursor;
  };

  const advanceWorkingDaysForBuffer = (
    startDate: Date,
    workingDays: number
  ) => {
    if (workingDays <= 0) {
      return startDate;
    }

    let cursor = startDate;
    let counted = 0;
    const maxIterations = 366 * 3;
    let iterations = 0;

    while (counted < workingDays && iterations < maxIterations) {
      iterations += 1;
      if (!isBufferDayBlocked(cursor)) {
        counted += 1;
        if (counted >= workingDays) {
          return cursor;
        }
      }
      cursor = addDays(cursor, 1);
    }

    if (iterations >= maxIterations) {
      debugWarn?.(
        '[advanceWorkingDaysForBuffer] Max iterations reached; buffer end may be inaccurate'
      );
    }
    return cursor;
  };

  const getBufferWindowForSlot = (
    executionEndZoned: Date,
    buffer: { value: number; unit: 'hours' | 'days' }
  ): { start: Date; end: Date } | null => {
    if (!buffer.value || buffer.value <= 0) {
      return null;
    }

    if (buffer.unit === 'hours') {
      const end = addWorkingHoursForBuffer(executionEndZoned, buffer.value);
      return { start: executionEndZoned, end };
    }

    const bufferDays = Math.ceil(convertDurationToDays(buffer));
    if (bufferDays <= 0) {
      return null;
    }

    const bufferStart = addDays(startOfDay(executionEndZoned), 1);
    const bufferEndDay = advanceWorkingDaysForBuffer(bufferStart, bufferDays);
    const { endTime } = getWorkingHoursForDate(bufferEndDay);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const bufferEnd = new Date(bufferEndDay);
    bufferEnd.setHours(endHour, endMin, 0, 0);

    return { start: bufferStart, end: bufferEnd };
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
      debugWarn?.(
        `Execution time (${executionHours}h) exceeds working hours per day (${workingHoursPerDay}h). This project should use days mode.`
      );
      return [];
    }

    // Calculate last available slot: closing time - execution time
    const closingTimeMinutes = endHour * 60 + endMin;
    const executionMinutes = executionHours * 60;
    const lastSlotMinutes = closingTimeMinutes - executionMinutes;
    const blockedIntervals = getBlockedIntervalsForDate(date);
    const buffer = getBufferDuration();

    // NOTE: For hours mode, we do NOT use shouldBlockDayForIntervals (4-hour threshold)
    // because we want customers to be able to book any remaining available slots
    // The per-slot overlap check below handles blocking individual time slots

    // Check if date is today - if so, we need to filter out past slots
    const now = new Date();
    const isToday = toLocalDateKey(date) === toLocalDateKey(now);

    // Generate slots from start to last available slot
    let currentMinutes = startHour * 60 + startMin;

    // Get date string for constructing timezone-aware times
    const dateStr = toLocalDateKey(date);
    const tz = professionalTz;

    while (currentMinutes <= lastSlotMinutes) {
      const hours = Math.floor(currentMinutes / 60);
      const minutes = currentMinutes % 60;
      const slotLabel = `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}`;

      // Create slot times in professional's timezone, then convert to UTC for comparison
      const slotTimeStr = `${dateStr}T${slotLabel}:00`;
      const slotStart = fromZonedTime(slotTimeStr, tz);
      const slotEnd = new Date(
        slotStart.getTime() + executionMinutes * 60 * 1000
      );

      // Skip past slots for today
      if (isToday && slotStart <= now) {
        currentMinutes += 30;
        continue;
      }

      const overlapsBlocked = blockedIntervals.some(
        (interval) => slotStart < interval.end && slotEnd > interval.start
      );

      if (overlapsBlocked) {
        currentMinutes += 30;
        continue;
      }
      if (buffer && buffer.value && buffer.value > 0) {
        const bufferUnit = buffer.unit || 'days';
        // Convert slot times to professional's timezone for buffer calculations,
        // then convert the resulting buffer window back to UTC for range comparison
        const slotStartZoned = toZonedTime(slotStart, tz);
        const slotEndZoned = new Date(
          slotStartZoned.getTime() + executionMinutes * 60 * 1000
        );
        const bufferWindow = getBufferWindowForSlot(slotEndZoned, {
          value: buffer.value,
          unit: bufferUnit,
        });
        if (bufferWindow && bufferWindow.end > bufferWindow.start) {
          const bufferStartUtc = fromZonedTime(bufferWindow.start, tz);
          const bufferEndUtc = fromZonedTime(bufferWindow.end, tz);
          if (windowOverlapsBlockedRanges(bufferStartUtc, bufferEndUtc)) {
            currentMinutes += 30;
            continue;
          }
        }
      }
      slots.push(slotLabel);

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

    const durationLabel =
      executionSource && typeof executionSource.value === 'number'
        ? executionSource.unit === 'hours'
          ? t('units.durationHours', { count: executionSource.value })
          : t('units.durationDays', { count: executionSource.value })
        : '';

    const start = formatClockTime(startTime);
    const end = formatClockTime(endTime);

    return durationLabel
      ? t('schedule.timeRange', { start, end, duration: durationLabel })
      : `${start} - ${end}`;
  };

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

  // Strict multi-resource projects (all resources required for 100% of the window)
  // can only start on a date whose entire execution window is free. Disabling such
  // colliding start dates up-front avoids the "does not meet team availability"
  // error the customer would otherwise hit only after selecting the date.
  const strictWindowBlocking = useMemo(() => {
    const rp = blockedDates.resourcePolicy;
    if (!rp) return false;
    return (
      (rp.totalResources ?? 0) > 1 &&
      (rp.minResources ?? 0) >= (rp.totalResources ?? 0) &&
      (rp.minOverlapPercentage ?? 100) >= 100
    );
  }, [blockedDates.resourcePolicy]);

  const executionDaysForBlocking = useMemo(() => {
    if (projectMode !== 'days') return 0;
    const executionSource = selectedPackage?.executionDuration || project.executionDuration;
    const preferRange = selectedPackage?.pricing.type === 'rfq' ? 'max' : undefined;
    const days = Math.ceil(convertDurationToDays(executionSource, preferRange));
    return Number.isFinite(days) && days > 0 ? days : 0;
  }, [projectMode, selectedPackage, project.executionDuration]);

  const isExecutionWindowBlockedForStart = (startDate: Date): boolean => {
    if (executionDaysForBlocking <= 1) return false;
    let counted = 0;
    let cursor = startDate;
    let iterations = 0;
    while (counted < executionDaysForBlocking && iterations < 366) {
      iterations++;
      if (isProfessionalWorkingDay(cursor)) {
        const dayKey = toLocalDateKey(cursor);
        const intervals = getBlockedIntervalsForDate(cursor);
        if (blockedDates.blockedDates.includes(dayKey) || shouldBlockDayForIntervals(cursor, intervals)) {
          return true;
        }
        counted++;
      }
      cursor = addDays(cursor, 1);
    }
    return false;
  };

  const isDateBlocked = (dateString: string): boolean => {
    let dateObj: Date;
    try {
      dateObj = fromProfessionalDateKey(dateString);
    } catch {
      return true;
    }
    if (Number.isNaN(dateObj.getTime())) return true;

    if (projectMode === 'hours') {
      if (dateString === selectedDate) {
        if (loadingServerSlots) return false;
        if (Array.isArray(serverSlotsForSelectedDate)) {
          return serverSlotsForSelectedDate.length === 0;
        }
      }
      return generateTimeSlotsForDate(dateObj).length === 0;
    }

    // For days mode, check if explicitly blocked
    if (blockedDates.blockedDates.includes(dateString)) {
      return true;
    }

    // Strict projects: also block start dates whose execution window collides
    // with an existing booking / unavailable day.
    if (strictWindowBlocking && isExecutionWindowBlockedForStart(dateObj)) {
      return true;
    }

    const intervals = getBlockedIntervalsForDate(dateObj);
    return shouldBlockDayForIntervals(dateObj, intervals);
  };

  useEffect(() => {
    if (!isDebugProject) {
      return;
    }
    if (loadingAvailability || loadingWorkingHours || !professionalAvailability) {
      return;
    }

    const signature = JSON.stringify({
      tz: professionalTz,
      blockedDates: blockedDates.blockedDates,
      blockedRangesCount: blockedDates.blockedRanges.length,
      hasAvailability: Boolean(professionalAvailability),
    });
    if (debugSignatureRef.current === signature) {
      return;
    }
    debugSignatureRef.current = signature;

    const debugSummary = debugDateKeys.map((dateKey) => {
      const dateObj = fromProfessionalDateKey(dateKey);
      const isWorking = isProfessionalWorkingDay(dateObj);
      const explicitBlocked = blockedDates.blockedDates.includes(dateKey);
      const intervals = getBlockedIntervalsForDate(dateObj);
      const { blockedHours, workingHours } = computeBlockedHoursForIntervals(
        dateObj,
        intervals
      );
      const blockedByRanges = blockedHours >= PARTIAL_BLOCK_THRESHOLD_HOURS;
      const finalBlocked = explicitBlocked || blockedByRanges;

      return {
        dateKey,
        isWorking,
        explicitBlocked,
        intervalsCount: intervals.length,
        blockedHours: Number.isFinite(blockedHours)
          ? blockedHours.toFixed(2)
          : String(blockedHours),
        workingHours: Number.isFinite(workingHours)
          ? workingHours.toFixed(2)
          : String(workingHours),
        blockedByRanges,
        finalBlocked,
      };
    });

    debugLog?.('[BOOKING DEBUG] Professional TZ:', professionalTz);
    debugLog?.(
      '[BOOKING DEBUG] Explicit blockedDates:',
      blockedDates.blockedDates
    );
    debugTable?.(debugSummary);
  }, [
    computeBlockedHoursForIntervals,
    debugDateKeys,
    debugLog,
    debugTable,
    fromProfessionalDateKey,
    getBlockedIntervalsForDate,
    isDebugProject,
    isProfessionalWorkingDay,
    isWeekend,
    loadingAvailability,
    loadingWorkingHours,
    professionalAvailability,
    professionalTz,
    blockedDates,
    PARTIAL_BLOCK_THRESHOLD_HOURS,
    project._id,
  ]);

  const getDisabledDays = () => {
    const disabledMatchers: Array<
      Date | { from: Date; to: Date } | ((date: Date) => boolean)
    > = [];

    // For days mode, use a function matcher that applies the 4-hour threshold
    // instead of disabling entire ranges
    if (projectMode !== 'hours') {
      // Create a function matcher that checks each day using the 4-hour threshold
      const rangeBlockMatcher = (date: Date) => {
        const dateKey = toLocalDateKey(date);
        if (blockedDates.blockedDates.includes(dateKey)) {
          return true;
        }

        const intervals = getBlockedIntervalsForDate(date);
        return shouldBlockDayForIntervals(date, intervals);
      };
      disabledMatchers.push(rangeBlockMatcher);
    }

    // Include any non-working day based on professional availability
    const nonWorkingDayMatcher = (date: Date) => {
      return !isProfessionalWorkingDay(date);
    };

    return [...disabledMatchers, nonWorkingDayMatcher];
  };

  const getMinDate = (): string | null => {
    debugLog?.('[getMinDate] Starting calculation...');
    debugLog?.('[getMinDate] Project timeMode:', projectMode);
    debugLog?.(
      '[getMinDate] Proposals earliestBookableDate:',
      proposals?.earliestBookableDate
    );

    const earliest = proposals?.earliestBookableDate
      ? parseISO(proposals.earliestBookableDate)
      : addDays(new Date(), 1);

    const earliestKey = proposals?.earliestBookableDate
      ? toLocalDateKeyFromInstant(earliest)
      : toLocalDateKey(earliest);
    debugLog?.('[getMinDate] Starting from:', earliestKey);

    let checkDate = fromProfessionalDateKey(earliestKey);

    for (let i = 0; i < 120; i++) {
      const isWorkingDay = isProfessionalWorkingDay(checkDate);
      const dateStr = toLocalDateKey(checkDate);
      debugLog?.(
        `[getMinDate] Checking ${dateStr} - Working day: ${isWorkingDay}`
      );

      if (!isWorkingDay) {
        checkDate = addDays(checkDate, 1);
        continue;
      }

      if (projectMode === 'hours') {
        if (
          dateStr === selectedDate &&
          (loadingServerSlots ||
            (Array.isArray(serverSlotsForSelectedDate) && serverSlotsForSelectedDate.length > 0))
        ) {
          debugLog?.(`[getMinDate] ${dateStr} - using server slots → available`);
          return dateStr;
        }
        const slots = generateTimeSlotsForDate(checkDate);
        debugLog?.(`[getMinDate] ${dateStr} - Available slots:`, slots.length);
        if (slots.length > 0) {
          debugLog?.(`[getMinDate] ? Found first available date: ${dateStr}`);
          return dateStr;
        }
      } else {
        const blocked = isDateBlocked(dateStr);
        debugLog?.(`[getMinDate] ${dateStr} - Blocked: ${blocked}`);
        if (!blocked) {
          debugLog?.(`[getMinDate] ? Found first available date: ${dateStr}`);
          return dateStr;
        }
      }

      checkDate = addDays(checkDate, 1);
    }

    debugWarn?.('[getMinDate] ?? No available date found in 120 days!');
    return null;
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

  const handleRFQAnswerChange = (index: number, answer: string) => {
    setRFQAnswers((prev) => {
      const newAnswers = [...prev];
      const questionType = project.rfqQuestions[index].type;
      newAnswers[index] = {
        question: project.rfqQuestions[index].question,
        answer,
        type: questionType,
        ...(questionType === 'attachment' ? { fieldType: 'file' } : {}),
      };
      return newAnswers;
    });
  };

  const handleVatAnswerChange = (fieldName: string, value: VatAnswer['value']) => {
    setVatAnswers(prev => ({ ...prev, [fieldName]: { fieldName, value } }));
  };

  const handleRFQAttachmentUpload = async (index: number, file: File | null) => {
    if (!file) return;

    setUploadingQuestionIndexes(prev => new Set(prev).add(index));
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const formData = new FormData();
      formData.append('attachment', file);
      formData.append('projectId', project._id);
      formData.append('questionId', project.rfqQuestions[index]?.question || `rfq-${index}`);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/projects/upload/attachment`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: formData,
        }
      );

      const data = await response.json();
      if (!response.ok || !data?.success || !data?.data?.url) {
        toast.error(data?.message || t('toasts.uploadFailed'));
        return;
      }

      handleRFQAnswerChange(index, data.data.url);
      toast.success(t('common.attachmentUploaded'));
    } catch (error) {
      console.error('Failed to upload RFQ attachment:', error);
      toast.error(t('toasts.uploadFailed'));
    } finally {
      setUploadingQuestionIndexes(prev => { const next = new Set(prev); next.delete(index); return next });
    }
  };

  const handleRfqGeneralAttachmentUpload = async (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('toasts.fileTooLarge'));
      return;
    }
    setUploadingRfqAttachment(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/rfq-upload`,
        { method: 'POST', credentials: 'include', headers, body: formData }
      );
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.data?.url) {
        toast.error(data?.msg || t('toasts.uploadFailed'));
        return;
      }
      setRfqAttachments(prev => [...prev, { url: data.data.url, name: data.data.fileName || file.name }]);
      toast.success(t('common.attachmentUploaded'));
    } catch (error) {
      console.error('Failed to upload RFQ attachment:', error);
      toast.error(t('toasts.uploadFailed'));
    } finally {
      setUploadingRfqAttachment(false);
    }
  };

  const removeRfqAttachment = (index: number) => {
    setRfqAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleExtraOptionToggle = (index: number) => {
    setSelectedExtraOptions((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const validateStep = (): boolean => {
    if (currentStep === 1) {
      if (selectedPackageIndex === null || !selectedPackage) {
        toast.error(t('toasts.selectPackageFromPage'));
        return false;
      }

      if (
        shouldCollectUsage(selectedPackage.pricing.type) &&
        (!estimatedUsage || estimatedUsage < 1)
      ) {
        toast.error(t('toasts.estimatedUsageRequired'));
        return false;
      }

      // Unit pricing: must meet minimum order quantity
      if (minOrderQuantity && estimatedUsage < minOrderQuantity) {
        toast.error(t('toasts.minOrderQuantity', { min: minOrderQuantity }));
        return false;
      }
    }

    if (currentStep === 2) {
      if (isRfqPackage) {
        return true;
      }
      if (!selectedDate) {
        toast.error(t('toasts.selectStartDate'));
        return false;
      }

      if (isDateBlocked(selectedDate)) {
        toast.error(t('toasts.dateUnavailable'));
        return false;
      }

      if (
        projectMode === 'days' &&
        (loadingScheduleWindow || !scheduleWindowCompletionDate)
      ) {
        toast.error(t('toasts.dateNotMeetingAvailability'));
        return false;
      }

      if (projectMode === 'hours' && loadingServerSlots) {
        toast.error(t('toasts.loadingSlots'));
        return false;
      }

      if (projectMode === 'hours' && serverSlotsError) {
        toast.error(t('toasts.slotsLoadFailed'));
        return false;
      }

      // Check time selection for hourly projects
      if (projectMode === 'hours' && !selectedTime) {
        toast.error(t('toasts.selectTimeSlot'));
        return false;
      }
    }

    if (currentStep === 3 && selectedPackage?.pricing?.type === 'rfq') {
      for (let i = 0; i < project.rfqQuestions.length; i++) {
        const question = project.rfqQuestions[i];
        if (
          question.isRequired &&
          (!rfqAnswers[i] || !rfqAnswers[i].answer.trim())
        ) {
          toast.error(t('toasts.answerRequired', { question: question.question }));
          return false;
        }
      }
    }

    if (currentStep === 3 && project.vatManagement?.enabled) {
      for (const question of project.vatManagement.reducedVatQuestions || []) {
        const answer = vatAnswers[question.fieldName]?.value;
        const isMissing =
          answer === undefined ||
          answer === '' ||
          (Array.isArray(answer) && answer.length === 0);
        if (question.isRequired && isMissing) {
          toast.error(t('toasts.answerRequired', { question: question.question }));
          return false;
        }
      }
    }

    if (currentStep === 4) {
      if (useProfileAddress) {
        if (!hasProfileAddress) {
          toast.error(t('toasts.profileAddressRequired'));
          return false;
        }
        if (!isServiceAddressValid) {
          toast.error(t('toasts.confirmProfileAddress'));
          return false;
        }
      } else if (!manualAddress.trim()) {
        toast.error(t('toasts.enterServiceAddress'));
        return false;
      } else if (!isServiceAddressValid) {
        toast.error(t('toasts.selectValidAddress'));
        return false;
      }
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
    if (uploadingQuestionIndexes.size > 0 || uploadingRfqAttachment) {
      toast.error(t('toasts.waitForUploads'));
      return;
    }
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
    if (uploadingQuestionIndexes.size > 0 || uploadingRfqAttachment) {
      toast.error(t('toasts.waitForUploadsSubmit'));
      return;
    }

    if (shouldPayAtCheckoutFlow && !customerPricingReady) {
      toast.error(t('toasts.finalizingPricing'));
      return;
    }

    debugLog?.('[BOOKING] Submit initiated');
    debugLog?.('[BOOKING] Current step:', currentStep);
    debugLog?.('[BOOKING] Selected package index:', selectedPackageIndex);
    debugLog?.('[BOOKING] Selected date:', selectedDate);

    if (!guardOutsideServiceArea()) {
      debugError?.(
        '[BOOKING] Submission blocked due to service radius limits'
      );
      return;
    }

    if (!validateStep()) {
      debugError?.('[BOOKING] Validation failed');
      return;
    }

    if (!selectedPackage || selectedPackageIndex === null) {
      toast.error(t('toasts.selectPackageBeforeSubmit'));
      return;
    }

    debugLog?.('[BOOKING] Validation passed');
    setLoading(true);

    try {
      const usageRequired = shouldCollectUsage(selectedPackage.pricing.type);
      const descriptionParts: string[] = [];
      descriptionParts.push(
        t('bookingDescription.package', { value: selectedPackage.name })
      );
      if (usageRequired && estimatedUsage) {
        descriptionParts.push(
          t('bookingDescription.estimatedUsage', { value: estimatedUsage })
        );
      }
      if (additionalNotes) {
        descriptionParts.push(
          t('bookingDescription.notes', { value: additionalNotes })
        );
      }
      if (confirmedAddress) {
        descriptionParts.push(
          t('bookingDescription.serviceAddress', { value: confirmedAddress })
        );
      }
      const serviceDescription = descriptionParts.join('\n');
      const totalPrice = finalDisplayTotal;
      const isRfqPackage = selectedPackage.pricing.type === 'rfq';
      const hasValidPackageAmount =
        typeof selectedPackage.pricing.amount === 'number' &&
        selectedPackage.pricing.amount >= 0;
      const shouldPayAtCheckout =
        !isRfqPackage &&
        hasValidPackageAmount &&
        totalPrice > 0 &&
        !vatNeedsRfqReview;

      const serviceLocationFields = locationFieldsFromPlace(servicePlace);
      const resolvedServiceCountry =
        serviceLocationFields.country ||
        countryFromPlace(servicePlace) ||
        (useProfileAddress ? user?.location?.country : undefined);
      const profileCoordinates = useProfileAddress &&
        user?.location?.coordinates?.length === 2 &&
        Number.isFinite(user.location.coordinates[0]) &&
        Number.isFinite(user.location.coordinates[1]) &&
        user.location.coordinates[0] >= -180 &&
        user.location.coordinates[0] <= 180 &&
        user.location.coordinates[1] >= -90 &&
        user.location.coordinates[1] <= 90
        ? user.location.coordinates
        : undefined;

      const bookingData = {
        bookingType: 'project',
        projectId: project._id,
        serviceConfigurationId: project.serviceConfigurationId,
        vatAnswers: Object.values(vatAnswers),
        serviceCountry: resolvedServiceCountry || undefined,
        serviceLocation: {
          address: serviceLocationFields.address || confirmedAddress,
          city: serviceLocationFields.city || (useProfileAddress ? user?.location?.city : undefined),
          postalCode:
            serviceLocationFields.postalCode ||
            (useProfileAddress ? user?.location?.postalCode : undefined),
          country: resolvedServiceCountry || undefined,
          coordinates: serviceLocationFields.coordinates || profileCoordinates,
        },
        proceedAtStandardVat:
          proceedAtStandardVat &&
          vatPreview?.action === 'rfq' &&
          !vatPreview?.reverseCharge,
        preferredStartDate: isRfqPackage ? undefined : selectedDate,
        preferredStartTime:
          !isRfqPackage && projectMode === 'hours' && selectedTime
            ? selectedTime
            : undefined,
        selectedSubprojectIndex: selectedPackageIndex,
        estimatedUsage: usageRequired ? estimatedUsage : undefined,
        selectedExtraOptions:
          !isRfqPackage && selectedExtraOptions.length > 0 ? selectedExtraOptions : undefined,
        paymentAtCheckout: shouldPayAtCheckout,
        rfqData: {
          serviceType: project.title,
          description: serviceDescription,
          answers: rfqAnswers,
          preferredStartDate: isRfqPackage ? undefined : selectedDate,
          preferredStartTime:
            !isRfqPackage && projectMode === 'hours' && selectedTime
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
          attachments: rfqAttachments.map(a => a.url),
        },
        urgency: 'medium',
      };

      debugLog?.('[BOOKING] Prepared booking data:', bookingData);
      debugLog?.(
        '[BOOKING] Backend URL:',
        process.env.NEXT_PUBLIC_BACKEND_URL
      );
      debugLog?.('[BOOKING] Sending request...');

      const startTime = Date.now();

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        debugError?.('[BOOKING] Request timeout after 30 seconds');
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
        debugLog?.(`[BOOKING] Response received in ${requestTime}ms`);
        debugLog?.('[BOOKING] Response status:', response.status);
        debugLog?.('[BOOKING] Response ok:', response.ok);

        const data = await response.json();
        debugLog?.('[BOOKING] Response data:', data);

        if (response.ok && data.success) {
          const returnedVatDecision = data.booking?.vatDecision;
          const returnedStatus = data.booking?.status;

          if (returnedVatDecision?.action === 'reduced_rate' && returnedVatDecision?.explanation) {
            toast.success(returnedVatDecision.explanation);
          }

          if (returnedVatDecision?.action === 'rfq' && !returnedVatDecision?.reverseCharge) {
            toast.info(returnedVatDecision.explanation || t('toasts.vatReviewRequired'));
            // Only count as an RFQ completion when the package itself is RFQ;
            // fixed-price bookings routed here are just pending VAT review.
            if (selectedPackage?.pricing?.type === 'rfq') {
              trackCompleteRfq(project, data.booking?._id, selectedPackageIndex);
            }
            if (data.booking?._id) {
              router.replace(`/bookings/${data.booking._id}`);
            } else {
              router.replace('/dashboard');
            }
            return;
          }

          if (shouldPayAtCheckout && returnedStatus === 'quote_accepted' && data.booking?._id) {
            trackBeginCheckout(data.booking._id, {
              bookingNumber: data.booking.bookingNumber,
              payment: {
                currency: 'EUR',
                totalWithVat: totalPrice,
              },
              quote: {
                amount: totalPrice,
                currency: 'EUR',
                description: serviceDescription,
              },
              project,
              selectedSubprojectIndex: selectedPackageIndex,
            });
            router.replace(`/bookings/${data.booking._id}/payment`);
            return;
          }

          const isRfq = selectedPackage?.pricing?.type === 'rfq';

          if (isRfq) {
            trackCompleteRfq(project, data.booking?._id, selectedPackageIndex);
            toast.success(t('toasts.rfqSubmitted'));
            router.replace('/dashboard');
            return;
          }

          trackEvent('booking_request_submitted', {
            project_id: project._id,
            project_category: project.category,
            project_service: project.service,
            booking_id: data.booking?._id,
            value: totalPrice,
            currency: 'EUR',
          });

          if (
            project.postBookingQuestions &&
            project.postBookingQuestions.length > 0 &&
            data.booking?._id
          ) {
            router.replace(
              `/bookings/${data.booking._id}?postBookingQuestions=true`
            );
          } else {
            router.replace('/dashboard');
          }
          return;
        } else {
          debugError?.('[BOOKING] Request failed');
          debugError?.('[BOOKING] Status:', response.status);
          debugError?.('[BOOKING] Error message:', data.msg || data.message);
          debugError?.('[BOOKING] Full response:', data);

          // Handle specific error cases
          if (response.status === 401) {
            debugError?.('[BOOKING] Not authenticated');
            toast.error(t('toasts.loginRequired'));
            setTimeout(() => {
              router.push('/login?redirect=/projects/' + project._id);
            }, 1500);
          } else if (response.status === 403) {
            debugError?.('[BOOKING] Permission denied');
            toast.error(data.msg || t('toasts.forbidden'));
          } else if (response.status === 400) {
            debugError?.('[BOOKING] Bad request - validation error');
            toast.error(data.msg || t('toasts.checkDetails'));
          } else if (response.status === 404) {
            debugError?.('[BOOKING] Resource not found');
            toast.error(data.msg || t('toasts.projectNotFound'));
          } else {
            debugError?.('[BOOKING] Unknown error status:', response.status);
            toast.error(
              data.msg || data.message || t('toasts.createFailed')
            );
          }
        }
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          debugError?.('[BOOKING] Request was aborted (timeout)');
          toast.error(t('toasts.timeoutServer'));
        } else {
          throw fetchError; // Re-throw to be caught by outer catch
        }
      }
    } catch (error: unknown) {
      debugError?.('[BOOKING] Exception thrown');
      const err = error instanceof Error ? error : new Error('Unknown error');
      debugError?.('[BOOKING] Error name:', err.name);
      debugError?.('[BOOKING] Error message:', err.message);
      debugError?.('[BOOKING] Error stack:', err.stack);

      // Network or other errors
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        debugError?.('[BOOKING] Network/fetch error');
        toast.error(t('toasts.networkError'));
      } else if (err.name === 'AbortError') {
        debugError?.('[BOOKING] Request timeout');
        toast.error(t('toasts.timeout'));
      } else {
        debugError?.('[BOOKING] Unexpected error type');
        toast.error(t('toasts.unexpected'));
      }
    } finally {
      debugLog?.('[BOOKING] Request completed, resetting loading state');
      setLoading(false);
    }
  };

  const getClampedPackageUnitCount = (): number => {
    if (!selectedPackage || !shouldCollectUsage(selectedPackage.pricing.type)) {
      return 1;
    }

    return Math.max(estimatedUsage, minOrderQuantity ?? 1);
  };

  const getEffectivePackagePrice = (
    packageUnitCount = getClampedPackageUnitCount()
  ): number | null => {
    const currentPackage = selectedPackage;
    const amount = currentPackage?.pricing.amount;
    if (
      !currentPackage ||
      amount == null ||
      currentPackage?.pricing.type === 'rfq'
    ) {
      return null;
    }

    const multiplier = shouldCollectUsage(currentPackage.pricing.type)
      ? packageUnitCount
      : 1;
    return multiplier * amount;
  };

  const calculateTotal = (
    packageUnitCount = getClampedPackageUnitCount()
  ): number => {
    let total = 0;

    if (selectedPackage) {
      const packagePrice = getEffectivePackagePrice(packageUnitCount);
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

  const repeatBuyerEligible = project.repeatBuyerEligibility?.eligible === true;
  const packageUnitCount = getClampedPackageUnitCount();
  const getCustomerDisplayAmount = (amount?: number | null) =>
    computeCustomerPriceWithRepeatBuyerDiscount({
      amount,
      customerPrice,
    }).customerAmount;
  const selectedPackageUnitPricing = computeCustomerPriceWithRepeatBuyerDiscount({
    amount: selectedPackage?.pricing.amount,
    customerPrice,
    eligible: repeatBuyerEligible,
    repeatBuyerDiscount: project.repeatBuyerDiscount,
  });
  // Unit packages are charged as units x the unit price shown, in cents.
  const packageUnitPricing =
    selectedPackage && shouldCollectUsage(selectedPackage.pricing.type)
      ? { pricingType: 'unit', unitAmount: selectedPackage.pricing.amount, quantity: packageUnitCount }
      : undefined;
  const customerPackagePrice = (amount: number) => customerPrice(amount, packageUnitPricing);
  const packagePricing = computeCustomerPriceWithRepeatBuyerDiscount({
    amount: getEffectivePackagePrice(packageUnitCount),
    customerPrice: customerPackagePrice,
    eligible: repeatBuyerEligible,
    repeatBuyerDiscount: project.repeatBuyerDiscount,
  });
  const totalPricing = computeCustomerPriceWithRepeatBuyerDiscount({
    amount: calculateTotal(packageUnitCount),
    customerPrice: customerPackagePrice,
    eligible: repeatBuyerEligible,
    repeatBuyerDiscount: project.repeatBuyerDiscount,
  });
  const displaySelectedPackageUnitPrice = selectedPackageUnitPricing.customerAmount;
  const displayPackagePrice = packagePricing.customerAmount;
  const displayTotalPrice = totalPricing.customerAmount;
  const discountedDisplayTotalPrice = totalPricing.discountedAmount;
  const discountedDisplayPackagePrice = packagePricing.discountedAmount;
  const discountedSelectedPackageUnitPrice =
    packageUnitCount > 0 &&
    discountedDisplayPackagePrice != null &&
    Number.isFinite(discountedDisplayPackagePrice)
      ? +(discountedDisplayPackagePrice / packageUnitCount).toFixed(2)
      : null;
  const hasSelectedPackageUnitDiscount =
    displaySelectedPackageUnitPrice != null &&
    discountedSelectedPackageUnitPrice != null &&
    discountedSelectedPackageUnitPrice < displaySelectedPackageUnitPrice;
  const hasDisplayPackageDiscount =
    displayPackagePrice != null &&
    discountedDisplayPackagePrice != null &&
    discountedDisplayPackagePrice < displayPackagePrice;
  const displayPackageBreakdownUnitPrice =
    hasDisplayPackageDiscount
      ? discountedSelectedPackageUnitPrice ?? displaySelectedPackageUnitPrice
      : displaySelectedPackageUnitPrice;
  const baseDisplayTotal =
    typeof displayTotalPrice === 'number'
      ? displayTotalPrice
      : calculateTotal(packageUnitCount);
  const repeatBuyerDiscountAmount =
    discountedDisplayTotalPrice != null && discountedDisplayTotalPrice < baseDisplayTotal
      ? +(baseDisplayTotal - discountedDisplayTotalPrice).toFixed(2)
      : 0;
  const finalDisplayTotal =
    repeatBuyerDiscountAmount > 0
      ? discountedDisplayTotalPrice ?? baseDisplayTotal
      : baseDisplayTotal;
  const vatNeedsRfqReview =
    vatPreview?.action === 'rfq' && !vatPreview?.reverseCharge && !proceedAtStandardVat;
  const shouldPayAtCheckoutFlow =
    Boolean(selectedPackage) &&
    selectedPackage?.pricing.type !== 'rfq' &&
    typeof selectedPackage?.pricing.amount === 'number' &&
    selectedPackage.pricing.amount >= 0 &&
    finalDisplayTotal > 0 &&
    !vatNeedsRfqReview;
  const finalStepLabel = shouldPayAtCheckoutFlow
    ? t('steps.reviewAndPay')
    : t('steps.reviewAndSubmitRfq');
  const finalStepDescription = shouldPayAtCheckoutFlow
    ? t('steps.reviewAndPayDescription')
    : t('steps.reviewAndSubmitRfqDescription');
  const finalActionLabel = shouldPayAtCheckoutFlow
    ? t('steps.payNow')
    : t('steps.submitRfq');
  const finalActionLoadingLabel = shouldPayAtCheckoutFlow
    ? t('steps.preparingPayment')
    : t('steps.submittingRfq');
  const stepLabels = [
    t('steps.confirmPackage'),
    isRfqPackage ? t('steps.beforeBooking') : t('steps.chooseDate'),
    t('steps.answerQuestions'),
    finalStepLabel,
  ];

  const projectedCompletionDate = calculateCompletionDate();
  const projectedCompletionDateTime = calculateCompletionDateTime();
  const scheduleWindowCompletionDate = (() => {
    if (!scheduleWindow?.scheduledExecutionEndDate) {
      return null;
    }
    const parsed = parseISO(scheduleWindow.scheduledExecutionEndDate);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  })();

  const countWorkingDaysBetweenDates = useCallback(
    (startDateStr: string, endDateStr: string): number => {
      const start = parseISO(startDateStr);
      const end = parseISO(endDateStr);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return 0;
      }
      if (start.getTime() > end.getTime()) {
        return 0;
      }
      if (!professionalAvailability) {
        return Math.max(1, differenceInCalendarDays(end, start) + 1);
      }

      const dayNames: Array<keyof ProfessionalAvailability> = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];

      const getWeekdayKey = (dateStr: string): keyof ProfessionalAvailability => {
        const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, professionalTz);
        const weekdayName = formatInTimeZone(dayStartUtc, professionalTz, 'eeee').toLowerCase();
        const index = dayNames.indexOf(
          weekdayName as keyof ProfessionalAvailability
        );
        return index >= 0 ? dayNames[index] : 'monday';
      };

      const addDaysToDateStr = (dateStr: string, days: number): string => {
        const dayStartUtc = fromZonedTime(
          `${dateStr}T00:00:00`,
          professionalTz
        );
        const dayStartZoned = toZonedTime(dayStartUtc, professionalTz);
        const nextDayZoned = addDays(dayStartZoned, days);
        const nextDayUtc = fromZonedTime(nextDayZoned, professionalTz);
        return formatInTimeZone(nextDayUtc, professionalTz, 'yyyy-MM-dd');
      };

      let count = 0;
      let cursorStr = startDateStr;
      const maxIterations = 366 * 5;
      let iterations = 0;

      while (iterations < maxIterations && parseISO(cursorStr) <= end) {
        const weekdayKey = getWeekdayKey(cursorStr);
        const dayAvailability = professionalAvailability[weekdayKey];
        if (dayAvailability?.available !== false) {
          count += 1;
        }
        cursorStr = addDaysToDateStr(cursorStr, 1);
        iterations += 1;
      }

      return count;
    },
    [professionalAvailability, professionalTz]
  );

  const throughputSuggestion = useMemo(() => {
    if (projectMode !== 'days' || !selectedDate || !professionalAvailability) {
      return null;
    }

    const executionSource: AnyExecutionDuration | undefined =
      selectedPackage?.executionDuration || project.executionDuration;
    const preferRange =
      selectedPackage?.pricing.type === 'rfq' ? 'max' : undefined;
    const executionDays = Math.ceil(
      convertDurationToDays(executionSource, preferRange)
    );
    if (!executionDays || executionDays <= 0) {
      return null;
    }

    if (!scheduleWindowCompletionDate) {
      return null;
    }
    const executionEndUtc = scheduleWindowCompletionDate;

    const endDateStrInProfessionalTz = formatInTimeZone(
      executionEndUtc,
      professionalTz,
      'yyyy-MM-dd'
    );

    const throughputDays =
      typeof scheduleWindow?.throughputDays === 'number'
        ? scheduleWindow.throughputDays
        : countWorkingDaysBetweenDates(selectedDate, endDateStrInProfessionalTz);
    const suggestionLimit = executionDays * THROUGHPUT_SUGGESTION_MULTIPLIER;

    return {
      throughputDays,
      suggestionLimit,
      executionDays,
      exceedsSuggestion: throughputDays > suggestionLimit,
    };
  }, [
    projectMode,
    selectedDate,
    professionalAvailability,
    selectedPackage?.executionDuration,
    project.executionDuration,
    selectedPackage?.pricing.type,
    scheduleWindowCompletionDate,
    professionalTz,
    scheduleWindow?.throughputDays,
    countWorkingDaysBetweenDates,
  ]);

  // Debug log for completion date display
  debugLog?.('[SCHEDULE WINDOW] Render state:', {
    scheduleWindow,
    loadingScheduleWindow,
    projectedCompletionDate: projectedCompletionDate?.toISOString(),
    projectMode,
    selectedDate
  });

  const shortestThroughputDetails = (() => {
    if (
      !proposals?.shortestThroughputProposal?.start ||
      !proposals.shortestThroughputProposal?.executionEnd
    ) {
      return null;
    }

    try {
      // Parse ISO dates - keep as UTC, formatInTimeZone will handle display conversion
      const tz = normalizeTimezone(professionalTimezone);
      const startUtc = parseISO(proposals.shortestThroughputProposal.start);
      const endUtc = parseISO(proposals.shortestThroughputProposal.executionEnd);

      // Validate parsed dates to avoid NaN in calculations
      if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtc.getTime())) {
        debugWarn?.('[shortestThroughputDetails] Invalid date parsed:', {
          start: proposals.shortestThroughputProposal.start,
          end: proposals.shortestThroughputProposal.executionEnd,
          startValid: !Number.isNaN(startUtc.getTime()),
          endValid: !Number.isNaN(endUtc.getTime()),
        });
        return { startDate: startUtc, endDate: endUtc, totalDays: 1 };
      }

      const startKey = formatInTimeZone(startUtc, tz, 'yyyy-MM-dd');
      const endKey = formatInTimeZone(endUtc, tz, 'yyyy-MM-dd');
      const totalDays = Math.max(1, countWorkingDaysBetweenDates(startKey, endKey));
      // Return UTC dates - formatInTimeZone will convert them correctly for display
      return { startDate: startUtc, endDate: endUtc, totalDays };
    } catch (error) {
      debugError?.('[shortestThroughputDetails] Error processing dates:', error);
      return null;
    }
  })();

  const shouldShowUsageBreakdown = Boolean(
    selectedPackage?.pricing.amount &&
    shouldCollectUsage(selectedPackage.pricing.type)
  );

  const userCoordinates = user?.location?.coordinates;
  const customerLat =
    typeof userCoordinates?.[1] === 'number' ? userCoordinates[1] : null;
  const customerLon =
    typeof userCoordinates?.[0] === 'number' ? userCoordinates[0] : null;
  const profileAddress = useMemo(() => {
    if (!user?.location) return '';
    const parts = [
      user.location.address,
      user.location.city,
      user.location.postalCode,
      user.location.country,
    ].filter(Boolean);
    return parts.join(', ');
  }, [user]);
  const hasProfileAddress = Boolean(profileAddress);
  const confirmedAddress = useMemo(
    () => (useProfileAddress ? profileAddress : manualAddress.trim()),
    [useProfileAddress, profileAddress, manualAddress]
  );
  const serviceLocation = project.distance?.location?.coordinates;
  const serviceLat =
    typeof serviceLocation?.[1] === 'number' ? serviceLocation[1] : null;
  const serviceLon =
    typeof serviceLocation?.[0] === 'number' ? serviceLocation[0] : null;
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
      return t('outsideServiceArea.noRadius');
    }

    if (roundedDistanceAway !== null) {
      return t('outsideServiceArea.radiusDistance', {
        radius: roundedMaxRadius,
        distance: roundedDistanceAway,
      });
    }

    return t('outsideServiceArea.radius', { radius: roundedMaxRadius });
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
    // Format in professional's timezone to get correct date string
    const tz = normalizeTimezone(professionalTimezone);
    const start = formatInTimeZone(shortestThroughputDetails.startDate, tz, 'yyyy-MM-dd');
    if (isDateBlocked(start)) {
      toast.error(t('schedule.shortestWindowUnavailable'));
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
      return;
    }

    // Always set to at least minOrderQuantity (or 1 if not set)
    const minQty = minOrderQuantity ?? 1;
    setEstimatedUsage((prev) => Math.max(minQty, prev || minQty));
  }, [selectedPackage, minOrderQuantity]);

  useEffect(() => {
    if (!hasProfileAddress && useProfileAddress) {
      setUseProfileAddress(false);
    }
  }, [hasProfileAddress, useProfileAddress]);

  useEffect(() => {
    if (projectMode === 'hours') {
      setSelectedTime('');
    }
  }, [projectMode, selectedDate]);

  return (
    <div className='min-h-screen bg-gray-50 py-8'>
      <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8'>
        {/* Header */}
        <div className='mb-8'>
          <Button variant='ghost' onClick={handleBack} className='mb-4'>
            <ArrowLeft className='h-4 w-4 mr-2' />
            {t('header.back')}
          </Button>
          <h1 className='text-3xl font-bold text-gray-900'>
            {t('header.title', { title: project.title })}
          </h1>
          <p className='text-gray-600 mt-2'>
            {t('header.subtitle')}
          </p>
        </div>

        {isOutsideServiceArea && (
          <div className='mb-6 rounded-lg border border-red-200 bg-red-50 p-4'>
            <p className='font-semibold text-red-800'>
              {t('outsideServiceArea.title')}
            </p>
            <p className='text-sm text-red-700 mt-1'>
              {getOutsideServiceMessage()}
            </p>
            <p className='text-xs text-red-600 mt-2'>
              {t('outsideServiceArea.hint')}
            </p>
          </div>
        )}

        {/* Progress Steps */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            {stepLabels.map((step, idx) => (
              <div key={idx} className='flex items-center'>
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${currentStep > idx + 1
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
                      className={`text-sm font-semibold ${currentStep === idx + 1 ? 'text-white' : 'text-gray-400'
                        }`}
                    >
                      {idx + 1}
                    </span>
                  )}
                </div>
                {idx < 3 && (
                  <div
                    className={`h-1 w-20 mx-2 ${currentStep > idx + 1 ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className='flex justify-between mt-2'>
            {stepLabels.map((step, idx) => (
              <span
                key={idx}
                className={`text-xs ${currentStep === idx + 1
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
                    {t('package.title')}
                  </h2>
                  <p className='text-gray-600 text-sm'>
                    {t('package.description')}
                  </p>
                </div>

                {!selectedPackage && (
                  <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3'>
                    <p className='text-sm text-yellow-900'>
                      {t('package.noneSelected')}
                    </p>
                    <Button
                      variant='outline'
                      className='w-full'
                      onClick={onBack}
                    >
                      {t('package.backToPackages')}
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
                                <div className='text-2xl font-bold text-blue-600'>
                                  {!customerPricingReady ? (
                                    <span className='inline-block h-7 w-24 animate-pulse rounded bg-gray-200' aria-label={t('common.loadingPrice')} />
                                  ) : hasDisplayPackageDiscount ? (
                                    <div className='flex flex-col items-end'>
                                      <span className='text-base font-semibold text-gray-400 line-through'>
                                        {formatAmount(displayPackagePrice)}
                                      </span>
                                      <span>{formatAmount(discountedDisplayPackagePrice)}</span>
                                    </div>
                                  ) : (
                                    formatAmount(displayPackagePrice ?? selectedPackage.pricing.amount)
                                  )}
                                </div>
                              )}
                            {selectedPackage.pricing.type === 'unit' &&
                              selectedPackage.pricing.amount && (
                                <div>
                                  <p className='text-2xl font-bold text-blue-600'>
                                    {hasSelectedPackageUnitDiscount
                                      ? formatAmount(discountedSelectedPackageUnitPrice)
                                      : formatAmount(
                                        displaySelectedPackageUnitPrice ?? selectedPackage.pricing.amount
                                      )}
                                    <span className='text-sm font-normal text-gray-500 ml-1'>
                                      /{getUnitLabelText(project.priceModel)}
                                    </span>
                                  </p>
                                  {hasSelectedPackageUnitDiscount && (
                                    <p className='text-sm font-semibold text-gray-400 line-through'>
                                      {formatAmount(displaySelectedPackageUnitPrice)}
                                    </p>
                                  )}
                                </div>
                              )}
                            {selectedPackage.pricing.type === 'rfq' && (
                              <Badge variant='outline'>{t('common.rfqBadge')}</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {shouldCollectUsage(selectedPackage.pricing.type) && (
                      <div className='space-y-4'>
                        <div>
                          <Label htmlFor='estimated-usage'>
                            {t('package.estimatedUsage')}{' '}
                            {project.priceModel
                              ? `(${project.priceModel})`
                              : ''}{' '}
                            *
                          </Label>
                          <div className='mt-2 flex items-center gap-2'>
                            <Input
                              id='estimated-usage'
                              type='number'
                              min={minOrderQuantity ?? 1}
                              step='1'
                              value={estimatedUsage}
                              onChange={(e) => {
                                let value = Number(e.target.value);

                                if (Number.isNaN(value)) {
                                  value = minOrderQuantity ?? 1;
                                }

                                if (minOrderQuantity) {
                                  value = Math.max(minOrderQuantity, value);
                                }

                                setEstimatedUsage(value);
                              }}
                              className='text-lg'
                            />

                            {project.priceModel && (
                              <span className='text-sm text-gray-500 whitespace-nowrap'>
                                {project.priceModel}
                              </span>
                            )}
                          </div>
                          <p className='text-xs text-gray-500 mt-1'>
                            {project.priceModel
                              ? t('package.usageHintWithUnit', {
                                unit: project.priceModel,
                              })
                              : t('package.usageHint')}
                          </p>
                        </div>

                        {selectedPackage.pricing.type !== 'rfq' &&
                          selectedPackage.pricing.amount && (
                            <div className='bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-2'>
                              <p className='text-sm text-gray-600'>
                                {t('package.estimatedPrice')}
                              </p>
                              <div className='text-4xl font-bold text-blue-600'>
                                {!customerPricingReady ? (
                                  <span className='inline-block h-10 w-32 animate-pulse rounded bg-gray-200' aria-label={t('common.loadingPrice')} />
                                ) : hasDisplayPackageDiscount ? (
                                  <div className='flex flex-col'>
                                    <span className='text-base font-semibold text-gray-400 line-through'>
                                      {formatAmount(displayPackagePrice)}
                                    </span>
                                    <span>{formatAmount(discountedDisplayPackagePrice)}</span>
                                  </div>
                                ) : (
                                  formatAmount(displayPackagePrice ?? getEffectivePackagePrice() ?? 0)
                                )}
                              </div>
                              <p className='text-sm text-gray-500'>
                                {packageUnitCount}{' '}
                                {getUnitLabelText(project.priceModel)} x{' '}
                                {formatAmount(
                                  displayPackageBreakdownUnitPrice ??
                                    selectedPackage.pricing.amount
                                )}
                                /{getUnitLabelText(project.priceModel)}
                              </p>
                            </div>
                          )}
                      </div>
                    )}

                    {!shouldCollectUsage(selectedPackage.pricing.type) && (
                      <div className='rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900'>
                        {t.rich('package.continueHint', {
                          strong: (chunks) => <strong>{chunks}</strong>,
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Step 2: Choose Date */}
            {currentStep === 2 && isRfqPackage && (
              <div className='space-y-4'>
                <div>
                  <h2 className='text-xl font-semibold mb-2'>
                    {t('schedule.rfqTitle')}
                  </h2>
                  <p className='text-gray-600 text-sm mb-4'>
                    {t('schedule.rfqBody')}
                  </p>
                </div>
              </div>
            )}

            {currentStep === 2 && !isRfqPackage && (
              <div className='space-y-4'>
                <div>
                  <h2 className='text-xl font-semibold mb-2'>
                    {t('schedule.title')}
                  </h2>
                  <p className='text-gray-600 text-sm mb-4'>
                    {t('schedule.description')}
                  </p>
                  {blockedDates.resourcePolicy &&
                    blockedDates.resourcePolicy.minResources > 1 && (
                      <div className='bg-blue-50 border border-blue-200 rounded-md p-3 mb-4'>
                        <p className='text-sm text-blue-800'>
                          {t.rich('schedule.teamRequirement', {
                            strong: (chunks) => (
                              <span className='font-medium'>{chunks}</span>
                            ),
                            min: blockedDates.resourcePolicy.minResources,
                            total: blockedDates.resourcePolicy.totalResources,
                            percentage:
                              blockedDates.resourcePolicy.minOverlapPercentage,
                          })}
                        </p>
                      </div>
                    )}
                </div>

                {loadingAvailability || loadingWorkingHours ? (
                  <div className='flex items-center justify-center py-12'>
                    <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
                    <p className='ml-3 text-gray-600'>
                      {t('schedule.loading')}
                    </p>
                  </div>
                ) : (
                  <div className='space-y-4'>
                    <div>
                      <Label>{t('schedule.preferredStartDate')}</Label>
                      <div className='mt-2'>
                        <Button
                          type='button'
                          variant='outline'
                          className='w-full justify-start text-left font-normal h-10'
                          onClick={() => setShowCalendar(!showCalendar)}
                        >
                          <Calendar className='mr-2 h-4 w-4' />
                          {selectedDate
                            ? format(parseISO(selectedDate), 'PPP', {
                              locale: dateFns,
                            })
                            : t('schedule.selectDate')}
                        </Button>

                        {showCalendar && (
                          <div className='mt-3 p-6 border rounded-lg bg-white shadow-xl'>
                            <DayPicker
                              mode='single'
                              locale={dateFns}
                              selected={
                                selectedDate
                                  ? parseISO(selectedDate)
                                  : undefined
                              }
                              onSelect={(date) => {
                                if (date) {
                                  // Prevent selection of other non-working days
                                  if (!isProfessionalWorkingDay(date)) {
                                    toast.error(t('schedule.notWorkingDay'));
                                    return;
                                  }
                                  // For hours mode, check if there are available time slots
                                  if (projectMode === 'hours') {
                                    const dateStr = toLocalDateKey(date);
                                    if (isDateBlocked(dateStr)) {
                                      toast.error(t('schedule.noSlotsOnDay'));
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
                                weekend: (date) =>
                                  isWeekend(date) && !isProfessionalWorkingDay(date),
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
                                <span>{t('schedule.legend.weekend')}</span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <div className='w-6 h-6 bg-red-100 border rounded line-through text-center text-red-900 opacity-50'>
                                  X
                                </div>
                                <span>{t('schedule.legend.blocked')}</span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <div className='w-6 h-6 bg-blue-500 border rounded'></div>
                                <span>{t('schedule.legend.selected')}</span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <div className='w-6 h-6 border-2 border-blue-500 rounded'></div>
                                <span>{t('schedule.legend.today')}</span>
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
                            {t('schedule.selectTimeSlot')}
                          </Label>
                          <p className='text-sm text-gray-600 mt-1 mb-2'>
                            {t('schedule.timeSlotHint')}
                          </p>
                        </div>

                        {loadingServerSlots ? (
                          <div className='flex items-center justify-center py-6 text-sm text-gray-500'>
                            <Loader2 className='animate-spin mr-2' size={16} />{' '}
                            {t('schedule.loadingTimes')}
                          </div>
                        ) : serverSlotsError ? (
                          <div className='bg-amber-50 border border-amber-200 rounded-lg p-4'>
                            <p className='text-sm text-amber-900 font-semibold mb-2'>
                              {t('schedule.couldNotLoadTitle')}
                            </p>
                            <p className='text-sm text-amber-800'>
                              {t('schedule.couldNotLoadBody')}
                            </p>
                          </div>
                        ) : (serverSlotsForSelectedDate ?? generateTimeSlots()).length === 0 ? (
                          <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
                            <p className='text-sm text-red-900 font-semibold mb-2'>
                              {t('schedule.noSlotsTitle')}
                            </p>
                            <p className='text-sm text-red-800'>
                              {t('schedule.noSlotsBody')}
                            </p>
                          </div>
                        ) : (
                          <div className='grid grid-cols-3 sm:grid-cols-4 gap-2'>
                            {(serverSlotsForSelectedDate ?? generateTimeSlots()).map((timeSlot) => {
                              const isPast = isTimeSlotPast(timeSlot);
                              const isSelected = selectedTime === timeSlot;

                              return (
                                <button
                                  key={timeSlot}
                                  type='button'
                                  onClick={() =>
                                    !isPast && setSelectedTime(timeSlot)
                                  }
                                  disabled={isPast}
                                  className={`
                                    px-2 py-2 rounded-lg border text-sm font-medium transition-all flex flex-col items-center
                                    ${isSelected
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                      : isPast
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                                    }
                                  `}
                                >
                                  <span>{timeSlot}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {proposals && (
                          <div className='mt-4 space-y-2 text-xs text-gray-600'>
                            <p className='font-semibold text-gray-700'>
                              {t('schedule.suggestedDates')}
                            </p>
                            <div className='flex flex-wrap gap-2'>
                              {proposals.earliestProposal?.start && (
                                <Button
                                  type='button'
                                  variant='outline'
                                  size='sm'
                                  onClick={() => {
                                    const tz = normalizeTimezone(professionalTimezone);
                                    const startInstant = proposals.earliestProposal?.start
                                      ? formatInTimeZone(
                                        parseISO(proposals.earliestProposal.start),
                                        tz,
                                        'yyyy-MM-dd'
                                      )
                                      : '';
                                    const startTime = proposals.earliestProposal?.start
                                      ? formatInTimeZone(
                                        parseISO(proposals.earliestProposal.start),
                                        tz,
                                        'HH:mm'
                                      )
                                      : '';
                                    if (startInstant && !isDateBlocked(startInstant)) {
                                      setHasUserSelectedDate(true);
                                      setSelectedDate(startInstant);
                                      if (startTime) {
                                        setSelectedTime(startTime);
                                      }
                                    }
                                  }}
                                >
                                  {t('schedule.firstAvailableTime', {
                                    date: formatZonedDate(
                                      parseISO(proposals.earliestProposal.start),
                                      professionalTimezone,
                                      {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      }
                                    ),
                                  })}
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                        {selectedTime && (
                          <div className='bg-green-50 border border-green-200 rounded-lg p-3 space-y-1'>
                            <p className='text-sm text-green-900'>
                              <strong>{t('schedule.selectedTime')}</strong>{' '}
                              {formatTimeRange(selectedTime)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedDate && (
                      <div className='bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3'>
                        <p className='text-sm text-blue-900'>
                          <strong>{t('schedule.selectedStartDate')}</strong>{' '}
                          {format(parseISO(selectedDate), 'PPPP', {
                            locale: dateFns,
                          })}
                          {projectMode === 'hours' && selectedTime && (
                            <span className='ml-2 font-bold'>
                              {formatTimeRange(selectedTime)}
                            </span>
                          )}
                        </p>

                        {(projectMode === 'hours'
                          ? projectedCompletionDateTime
                          : scheduleWindowCompletionDate) && (
                            <>
                              <p className='text-sm text-blue-900 font-semibold pt-2 border-t border-blue-300'>
                                <strong>{t('schedule.projectedCompletion')}</strong>{' '}
                                {loadingScheduleWindow ? (
                                  <span className='text-blue-600'>
                                    {t('common.calculating')}
                                  </span>
                                ) : projectMode === 'hours' &&
                                  projectedCompletionDateTime
                                  ? t('schedule.completionAt', {
                                    date: format(
                                      projectedCompletionDateTime,
                                      'PPPP',
                                      { locale: dateFns }
                                    ),
                                    time: new Intl.DateTimeFormat(intl, {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    }).format(projectedCompletionDateTime),
                                  })
                                  : scheduleWindowCompletionDate
                                    ? format(
                                      scheduleWindowCompletionDate,
                                      'PPPP',
                                      { locale: dateFns }
                                    )
                                    : null}
                              </p>
                              <p className='text-xs text-blue-700 italic'>
                                {t('schedule.skippedHint')}
                              </p>
                            </>
                          )}
                        {projectMode === 'days' &&
                          !loadingScheduleWindow &&
                          selectedDate &&
                          !scheduleWindowCompletionDate && (
                            <p className='text-sm font-semibold pt-2 border-t border-blue-300 text-red-600'>
                              {t('schedule.doesNotMeetAvailability')}
                            </p>
                          )}
                        {projectMode === 'days' &&
                          throughputSuggestion?.exceedsSuggestion && (
                            <p className='text-sm font-semibold pt-2 border-t border-blue-300 text-amber-700'>
                              {t('schedule.throughputWarning', {
                                days: throughputSuggestion.throughputDays,
                                limit: throughputSuggestion.suggestionLimit,
                              })}
                            </p>
                          )}
                        {projectMode === 'days' &&
                          !hasUserSelectedDate &&
                          shortestThroughputDetails && (
                            <div className='border-t border-blue-300 pt-3 space-y-3'>
                              <div className='flex flex-col gap-1'>
                                <p className='text-sm text-blue-900 font-semibold'>
                                  <strong>{t('schedule.shortestWindow')}</strong>{' '}
                                  <span className='text-xs font-normal'>
                                    ({t('units.durationDays', {
                                      count: shortestThroughputDetails.totalDays,
                                    })})
                                  </span>
                                </p>
                                <p className='text-xs text-blue-700'>
                                  {`${formatZonedDate(
                                    shortestThroughputDetails.startDate,
                                    professionalTimezone,
                                    {
                                      weekday: 'long',
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric',
                                    }
                                  )} - ${formatZonedDate(
                                    shortestThroughputDetails.endDate,
                                    professionalTimezone,
                                    {
                                      weekday: 'long',
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric',
                                    }
                                  )}`}
                                </p>
                              </div>
                              <div className='flex flex-wrap gap-2'>
                                {shortestWindowDates.map((day) => (
                                  <span
                                    key={day.toISOString()}
                                    className='px-3 py-1 text-xs rounded-full bg-white border border-blue-200 text-blue-800'
                                  >
                                    {formatZonedDate(day, professionalTimezone, {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
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
                                {t('schedule.useThisWindow')}
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
                {/* Add-ons Section — hidden for RFQ packages */}
                {selectedPackage?.pricing?.type !== 'rfq' && project.extraOptions && project.extraOptions.length > 0 && (
                  <div className='space-y-4 pb-6 border-b'>
                    <div>
                      <h2 className='text-xl font-semibold mb-2'>
                        {t('addOns.title')}
                      </h2>
                      <p className='text-gray-600 text-sm mb-4'>
                        {t('addOns.description')}
                      </p>
                    </div>

                    <div className='space-y-3'>
                      {project.extraOptions.map((option, idx) => (
                        <div
                          key={idx}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${selectedExtraOptions.includes(idx)
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
                                    +{formatAmount(
                                      getCustomerDisplayAmount(option.price) ?? option.price
                                    )}
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
                          {t('summary.title')}
                        </h3>

                        {/* Base Package Price */}
                        <div className='flex justify-between items-center text-sm'>
                          <span className='text-gray-700'>
                            {t('summary.packagePrice')}
                          </span>
                          <span className='font-semibold'>
                            {!customerPricingReady ? (
                              <span className='inline-block h-4 w-20 animate-pulse rounded bg-gray-200' aria-label={t('common.loadingPrice')} />
                            ) : typeof displayPackagePrice === 'number'
                              ? formatAmount(displayPackagePrice)
                              : t('common.quoteRequired')}
                          </span>
                        </div>

                        {/* Selected Add-ons */}
                        {selectedExtraOptions.length > 0 && (
                          <div className='space-y-2 pt-2 border-t border-blue-300'>
                            <p className='text-sm font-semibold text-gray-700'>
                              {t('summary.selectedAddOns')}
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
                                    +{formatAmount(
                                      getCustomerDisplayAmount(option.price) ?? option.price
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                            {/* Add-ons Subtotal */}
                            <div className='flex justify-between items-center text-sm pt-2 border-t border-blue-200'>
                              <span className='text-gray-700 font-semibold'>
                                {t('summary.addOnsTotal')}
                              </span>
                              <span className='font-semibold'>
                                {formatAmount(
                                  getCustomerDisplayAmount(
                                    selectedExtraOptions.reduce(
                                      (sum, idx) =>
                                        sum +
                                        (project.extraOptions[idx]?.price || 0),
                                      0
                                    )
                                  ) ??
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

                        {repeatBuyerDiscountAmount > 0 && (
                          <div className='flex justify-between items-center text-sm pt-2 border-t border-blue-200'>
                            <span className='text-gray-700 font-semibold'>
                              {t('summary.repeatBuyerDiscount')}
                            </span>
                            <span className='font-semibold text-green-600'>
                              -{formatAmount(repeatBuyerDiscountAmount)}
                            </span>
                          </div>
                        )}

                        {/* Grand Total */}
                        {finalDisplayTotal > 0 && (
                          <div className='flex justify-between items-center pt-3 border-t-2 border-blue-400'>
                            <span className='text-lg font-bold text-gray-900'>
                              {t('summary.grandTotal')}
                            </span>
                            <span className='text-2xl font-bold text-blue-600'>
                              {customerPricingReady ? (
                                formatAmount(finalDisplayTotal)
                              ) : (
                                <span className='inline-block h-7 w-28 animate-pulse rounded bg-gray-200' aria-label={t('common.loadingTotal')} />
                              )}
                            </span>
                          </div>
                        )}

                        {shouldShowUsageBreakdown && (
                          <p className='text-xs text-gray-600 pt-2'>
                            {t('summary.usageBreakdown', {
                              count: packageUnitCount,
                              unit: getUnitLabelText(project.priceModel),
                              price:
                                formatAmount(
                                  displayPackageBreakdownUnitPrice ??
                                    selectedPackage.pricing.amount
                                ) ?? '',
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* RFQ Questions Section — only for RFQ packages */}
                {selectedPackage?.pricing?.type === 'rfq' && project.rfqQuestions.length > 0 && (<>
                <div>
                  <h2 className='text-xl font-semibold mb-2'>
                    {t('questions.title')}
                  </h2>
                  <p className='text-gray-600 text-sm mb-6'>
                    {t('questions.description')}
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

                    {(question.professionalAttachments?.length ?? 0) > 0 && (
                        <div className='rounded-lg border border-blue-100 bg-blue-50 p-3'>
                          <p className='text-xs font-semibold text-blue-900 mb-2'>
                            {t('questions.professionalFiles')}
                          </p>
                          <div className='space-y-1'>
                            {question.professionalAttachments?.map((attachment, attachmentIndex) => {
                              const attachmentUrl =
                                typeof attachment === 'string' ? attachment : attachment.url;
                              const attachmentLabel =
                                typeof attachment === 'string'
                                  ? t('questions.downloadAttachment', {
                                    index: attachmentIndex + 1,
                                  })
                                  : attachment.name?.trim() ||
                                    t('questions.downloadAttachment', {
                                      index: attachmentIndex + 1,
                                    });
                              return (
                              <a
                                key={`${idx}-${attachmentIndex}`}
                                href={attachmentUrl}
                                target='_blank'
                                rel='noreferrer noopener'
                                className='inline-flex items-center text-sm text-blue-700 hover:underline'
                              >
                                <FileText className='mr-2 h-4 w-4' />
                                {attachmentLabel}
                              </a>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {question.type === 'text' && (
                      <Textarea
                        id={`question-${idx}`}
                        placeholder={t('questions.answerPlaceholder')}
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
                          {t('questions.uploadForQuestion')}
                        </p>
                        <Input
                          type='file'
                          accept='.pdf,image/*'
                          className='mt-3'
                          disabled={uploadingQuestionIndexes.has(idx)}
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            void handleRFQAttachmentUpload(idx, file);
                            e.currentTarget.value = '';
                          }}
                        />
                        {uploadingQuestionIndexes.has(idx) && (
                          <div className='mt-3 inline-flex items-center text-xs text-indigo-600'>
                            <Loader2 className='h-3.5 w-3.5 mr-1 animate-spin' />
                            {t('common.uploading')}
                          </div>
                        )}
                        {rfqAnswers[idx]?.answer && /^https?:\/\//i.test(rfqAnswers[idx].answer) && (
                          <a
                            href={rfqAnswers[idx].answer}
                            target='_blank'
                            rel='noreferrer noopener'
                            className='mt-3 inline-flex text-sm text-indigo-600 hover:underline'
                          >
                            {t('questions.openAttachment')}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                </>)}

                {project.vatManagement?.enabled && (project.vatManagement.reducedVatQuestions?.length ?? 0) > 0 && (
                  <div className='space-y-4 pt-4 border-t'>
                    <div>
                      <h2 className='text-xl font-semibold mb-2'>
                        {t('vat.questionsTitle')}
                      </h2>
                      <p className='text-gray-600 text-sm'>
                        {t('vat.questionsDescription')}
                      </p>
                    </div>

                    {(project.vatManagement.reducedVatQuestions || []).map((question) => {
                      const value = vatAnswers[question.fieldName]?.value;
                      return (
                        <div key={question.fieldName} className='space-y-2'>
                          <Label htmlFor={`vat-${question.fieldName}`}>
                            {question.question}
                            {question.isRequired && <span className='text-red-500 ml-1'>*</span>}
                          </Label>

                          {question.answerType === 'number' && (
                            <div className='flex gap-2'>
                              <Input
                                id={`vat-${question.fieldName}`}
                                type='text'
                                inputMode='decimal'
                                value={typeof value === 'number' || typeof value === 'string' ? value : ''}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  handleVatAnswerChange(question.fieldName, raw)
                                }}
                              />
                              {question.unit && (
                                <span className='flex items-center rounded-md border bg-gray-50 px-3 text-sm text-gray-600'>
                                  {question.unit}
                                </span>
                              )}
                            </div>
                          )}

                          {question.answerType === 'yes_no' && (
                            <RadioGroup
                              value={value === true ? 'yes' : value === false ? 'no' : ''}
                              onValueChange={(next) => handleVatAnswerChange(question.fieldName, next === 'yes')}
                              className='flex gap-4'
                            >
                              <div className='flex items-center space-x-2'>
                                <RadioGroupItem value='yes' id={`vat-${question.fieldName}-yes`} />
                                <Label htmlFor={`vat-${question.fieldName}-yes`} className='font-normal'>{t('common.yes')}</Label>
                              </div>
                              <div className='flex items-center space-x-2'>
                                <RadioGroupItem value='no' id={`vat-${question.fieldName}-no`} />
                                <Label htmlFor={`vat-${question.fieldName}-no`} className='font-normal'>{t('common.no')}</Label>
                              </div>
                            </RadioGroup>
                          )}

                          {question.answerType === 'checkboxes' && (
                            <div className='space-y-2'>
                              {(question.options || []).map((option) => {
                                const selected = Array.isArray(value) && value.includes(option);
                                return (
                                  <label key={option} className='flex items-center gap-2 text-sm'>
                                    <Checkbox
                                      checked={selected}
                                      onCheckedChange={(checked) => {
                                        const current = Array.isArray(value) ? value : [];
                                        handleVatAnswerChange(
                                          question.fieldName,
                                          checked
                                            ? [...current, option]
                                            : current.filter(item => item !== option)
                                        );
                                      }}
                                    />
                                    {option}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Additional Notes */}
                <div className='space-y-2 pt-4 border-t'>
                  <Label htmlFor='additional-notes'>
                    {t('notes.label')}
                  </Label>
                  <Textarea
                    id='additional-notes'
                    placeholder={t('notes.placeholder')}
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Attachments */}
                <div className='space-y-2 pt-4 border-t'>
                  <Label>{t('attachments.title')}</Label>
                  <p className='text-gray-500 text-xs mb-2'>
                    {t('attachments.hint')}
                  </p>
                  {rfqAttachments.map((att, idx) => (
                    <div key={idx} className='flex items-center gap-2 text-sm bg-gray-50 p-2 rounded'>
                      <FileText className='h-4 w-4 text-blue-600 flex-shrink-0' />
                      <span className='truncate flex-1'>{att.name}</span>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='h-6 w-6 p-0'
                        aria-label={t('attachments.remove', { name: att.name })}
                        onClick={() => removeRfqAttachment(idx)}
                      >
                        <X className='h-3 w-3' />
                      </Button>
                    </div>
                  ))}
                  <div className='border-2 border-dashed border-gray-300 rounded-lg p-4 text-center'>
                    <Upload className='h-6 w-6 text-gray-400 mx-auto mb-1' />
                    <Input
                      type='file'
                      accept='.pdf,.doc,.docx,.xls,.xlsx,image/*'
                      className='mt-2'
                      disabled={uploadingRfqAttachment}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        void handleRfqGeneralAttachmentUpload(file);
                        e.currentTarget.value = '';
                      }}
                    />
                    {uploadingRfqAttachment && (
                      <div className='mt-2 inline-flex items-center text-xs text-indigo-600'>
                        <Loader2 className='h-3.5 w-3.5 mr-1 animate-spin' />
                        {t('common.uploading')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Review & Payment */}
            {currentStep === 4 && (
              <div className='space-y-6'>
                <div>
                  <h2 className='text-xl font-semibold mb-2'>
                    {selectedPackage?.pricing?.type === 'rfq'
                      ? t('review.rfqTitle')
                      : t('review.title')}
                  </h2>
                  <p className='text-gray-600 text-sm mb-6'>
                    {finalStepDescription}
                  </p>
                </div>

                {/* Selected Package */}
                <div className='space-y-3'>
                  <h3 className='font-semibold'>{t('review.selectedPackage')}</h3>
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
                              {hasDisplayPackageDiscount
                                ? formatAmount(discountedDisplayPackagePrice)
                                : formatAmount(displayPackagePrice ?? selectedPackage.pricing.amount)}
                            </span>
                          )}
                        {selectedPackage.pricing.type === 'unit' &&
                          selectedPackage.pricing.amount && (
                            <span className='font-semibold text-blue-600'>
                              {hasSelectedPackageUnitDiscount
                                ? formatAmount(discountedSelectedPackageUnitPrice)
                                : formatAmount(
                                  displaySelectedPackageUnitPrice ?? selectedPackage.pricing.amount
                                )}
                              <span className='text-xs font-normal text-gray-500 ml-1'>
                                /{getUnitLabelText(project.priceModel)}
                              </span>
                            </span>
                          )}
                        {selectedPackage.pricing.type === 'rfq' && (
                          <Badge variant='outline'>{t('common.rfqBadge')}</Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className='text-sm text-gray-500'>
                      {t('review.noPackage')}
                    </p>
                  )}
                </div>

                {/* Selected Date */}
                {!isRfqPackage && (
                <div className='space-y-3'>
                  <h3 className='font-semibold'>{t('review.timeline')}</h3>
                  <div className='bg-gray-50 p-4 rounded space-y-3'>
                    <p className='text-sm'>
                      <strong>{t('review.startDate')}</strong>{' '}
                      {format(parseISO(selectedDate), 'PPPP', { locale: dateFns })}
                      {projectMode === 'hours' && selectedTime && (
                        <span className='ml-2 font-semibold'>
                          {formatTimeRange(selectedTime)}
                        </span>
                      )}
                    </p>
                    {(projectMode === 'hours'
                      ? projectedCompletionDateTime
                      : scheduleWindowCompletionDate) && (
                        <>
                          <p className='text-sm font-semibold pt-2 border-t border-gray-300'>
                            <strong>{t('schedule.expectedCompletion')}</strong>{' '}
                            {loadingScheduleWindow ? (
                              <span className='text-gray-500'>
                                {t('common.calculating')}
                              </span>
                            ) : projectMode === 'hours' &&
                              projectedCompletionDateTime
                              ? t('schedule.completionAt', {
                                date: format(
                                  projectedCompletionDateTime,
                                  'PPPP',
                                  { locale: dateFns }
                                ),
                                time: new Intl.DateTimeFormat(intl, {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                }).format(projectedCompletionDateTime),
                              })
                              : scheduleWindowCompletionDate
                                ? format(
                                  scheduleWindowCompletionDate,
                                  'PPPP',
                                  { locale: dateFns }
                                )
                                : null}
                          </p>
                          <p className='text-xs text-gray-600 italic'>
                            {t('schedule.skippedHintReview')}
                          </p>
                        </>
                      )}
                    {projectMode === 'days' &&
                      !loadingScheduleWindow &&
                      selectedDate &&
                      !scheduleWindowCompletionDate && (
                        <p className='text-sm font-semibold pt-2 border-t border-gray-300 text-red-600'>
                          {t('schedule.doesNotMeetAvailability')}
                        </p>
                      )}
                    {projectMode === 'days' &&
                      throughputSuggestion?.exceedsSuggestion && (
                        <p className='text-sm font-semibold pt-2 border-t border-gray-300 text-amber-700'>
                          {t('schedule.throughputWarning', {
                            days: throughputSuggestion.throughputDays,
                            limit: throughputSuggestion.suggestionLimit,
                          })}
                        </p>
                      )}
                    {projectMode === 'days' &&
                      !hasUserSelectedDate &&
                      shortestThroughputDetails && (
                        <div className='border-t border-gray-300 pt-3 space-y-3'>
                          <div className='flex flex-col gap-1'>
                            <p className='text-sm font-semibold'>
                              <strong>{t('schedule.shortestWindow')}</strong>{' '}
                              <span className='text-xs font-normal'>
                                ({t('units.durationDays', {
                                  count: shortestThroughputDetails.totalDays,
                                })})
                              </span>
                            </p>
                            <p className='text-xs text-gray-600'>
                              {`${formatZonedDate(
                                shortestThroughputDetails.startDate,
                                professionalTimezone,
                                {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric',
                                }
                              )} - ${formatZonedDate(
                                shortestThroughputDetails.endDate,
                                professionalTimezone,
                                {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric',
                                }
                              )}`}
                            </p>
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            {shortestWindowDates.map((day) => (
                              <span
                                key={day.toISOString()}
                                className='px-3 py-1 text-xs rounded-full bg-white border border-gray-300 text-gray-800'
                              >
                                {formatZonedDate(day, professionalTimezone, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
                )}

                {/* Service Address Confirmation */}
                <div className='space-y-3'>
                  <h3 className='font-semibold'>{t('review.serviceAddress')}</h3>
                  <div className='bg-gray-50 p-4 rounded space-y-3'>
                    <div className='flex items-center space-x-2'>
                      <Checkbox
                        id='use-profile-address'
                        checked={useProfileAddress}
                        onCheckedChange={(checked) => {
                          const nextValue = Boolean(checked);
                          setUseProfileAddress(nextValue);
                          setServicePlace(undefined);
                          if (!nextValue && !manualAddress.trim() && profileAddress) {
                            setManualAddress(profileAddress);
                          }
                        }}
                        disabled={!hasProfileAddress}
                      />
                      <Label htmlFor='use-profile-address'>
                        {t('review.sameAsProfile')}
                      </Label>
                    </div>
                    <AddressAutocomplete
                      value={manualAddress}
                      onChange={(address, placeData) => {
                        setManualAddress(address);
                        setServicePlace(placeData);
                        if (!placeData) setIsServiceAddressValid(false);
                      }}
                      onValidation={setIsServiceAddressValid}
                      useCompanyAddress={useProfileAddress}
                      companyAddress={profileAddress}
                      label={t('review.serviceAddress')}
                      required
                    />
                  </div>
                </div>

                {/* Attachments review */}
                {rfqAttachments.length > 0 && (
                  <div className='space-y-3'>
                    <h3 className='font-semibold'>{t('attachments.reviewTitle')}</h3>
                    <div className='bg-gray-50 p-4 rounded space-y-2'>
                      {rfqAttachments.map((att, idx) => (
                        <div key={idx} className='flex items-center gap-2 text-sm'>
                          <FileText className='h-4 w-4 text-blue-600 flex-shrink-0' />
                          <span className='truncate'>{att.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loyalty visibility before checkout */}
                {user?.role === 'customer' &&
                  selectedPackage &&
                  shouldPayAtCheckoutFlow && (
                    <div className='space-y-3'>
                      <h3 className='font-semibold'>{t('loyalty.title')}</h3>
                      <div className='bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4'>
                        <div className='flex items-center justify-between gap-3'>
                          <div>
                            <p className='text-sm font-semibold text-amber-900'>
                              {user.loyaltyLevel
                                ? t('loyalty.level', { level: user.loyaltyLevel })
                                : t('loyalty.member')}
                            </p>
                            <p className='text-xs text-amber-800 mt-1'>
                              {t('loyalty.description')}
                            </p>
                          </div>
                          <Badge
                            variant='outline'
                            className='border-amber-300 bg-white text-amber-800'
                          >
                            {user.loyaltyLevel || t('loyalty.customer')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Price Breakdown */}
                {selectedPackage && (
                  <div className='space-y-3'>
                    <h3 className='font-semibold'>{t('summary.title')}</h3>
                    <div className='bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 space-y-3'>
                      {/* Base Package Price */}
                      <div className='flex justify-between items-center text-sm'>
                        <span className='text-gray-700'>
                          {t('summary.packagePrice')}
                        </span>
                        <span className='font-semibold'>
                          {selectedPackage.pricing.type === 'rfq'
                            ? t('common.quoteRequired')
                            : typeof displayPackagePrice === 'number'
                              ? formatAmount(displayPackagePrice)
                              : t('common.quoteRequired')}
                        </span>
                      </div>

                      {shouldShowUsageBreakdown && (
                        <p className='text-xs text-gray-600'>
                          {t('summary.usageBreakdown', {
                            count: packageUnitCount,
                            unit: getUnitLabelText(project.priceModel),
                            price:
                              formatAmount(
                                displayPackageBreakdownUnitPrice ??
                                  selectedPackage.pricing.amount
                              ) ?? '',
                          })}
                        </p>
                      )}

                      {/* Selected Add-ons — hidden for RFQ */}
                      {selectedPackage?.pricing?.type !== 'rfq' && selectedExtraOptions.length > 0 && (
                        <div className='space-y-2 pt-2 border-t border-blue-300'>
                          <p className='text-sm font-semibold text-gray-700'>
                            {t('summary.selectedAddOns')}
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
                                  +{formatAmount(
                                    getCustomerDisplayAmount(option.price) ?? option.price
                                  )}
                                </span>
                              </div>
                            );
                          })}

                          {/* Add-ons Subtotal */}
                          <div className='flex justify-between items-center text-sm pt-2 border-t border-blue-200'>
                            <span className='text-gray-700 font-semibold'>
                              {t('summary.addOnsTotal')}
                            </span>
                            <span className='font-semibold'>
                              {formatAmount(
                                getCustomerDisplayAmount(
                                  selectedExtraOptions.reduce(
                                    (sum, idx) =>
                                      sum +
                                      (project.extraOptions[idx]?.price || 0),
                                    0
                                  )
                                ) ??
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

                      {repeatBuyerDiscountAmount > 0 && (
                        <div className='flex justify-between items-center text-sm pt-2 border-t border-blue-200'>
                          <span className='text-gray-700 font-semibold'>
                            {t('summary.repeatBuyerDiscount')}
                          </span>
                          <span className='font-semibold text-green-600'>
                            -{formatAmount(repeatBuyerDiscountAmount)}
                          </span>
                        </div>
                      )}

                      {/* Separator */}
                      {finalDisplayTotal > 0 && (
                        <div className='border-t-2 border-blue-400 my-2'></div>
                      )}

                      {/* Grand Total */}
                      {finalDisplayTotal > 0 && (
                        <>
                          <div className='flex justify-between items-center'>
                            <span className='text-lg font-bold text-gray-900'>
                              {vatPreview && !vatPreview.reverseCharge && vatPreview.action !== 'rfq'
                                ? t('vat.grandTotalExclVat')
                                : t('summary.grandTotal')}
                            </span>
                            <span className='text-2xl font-bold text-blue-600'>
                              {customerPricingReady ? (
                                formatAmount(finalDisplayTotal)
                              ) : (
                                <span className='inline-block h-7 w-28 animate-pulse rounded bg-gray-200' aria-label={t('common.loadingTotal')} />
                              )}
                            </span>
                          </div>
                          {currency !== 'EUR' && (
                            <p className='text-xs text-gray-600'>
                              {t('chargeNote')}
                            </p>
                          )}
                        </>
                      )}

                      {/* Estimated VAT */}
                      {finalDisplayTotal > 0 && vatPreview && !isRfqPackage && (
                        <div className='space-y-1 pt-2 border-t border-blue-200 text-sm'>
                          {vatPreview.action === 'rfq' && !vatPreview.reverseCharge ? (
                            <div className='space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3'>
                              <p className='text-amber-800'>
                                {vatPreview.explanation ||
                                  t('vat.reviewRequiredFallback')}
                              </p>
                              {proceedAtStandardVat ? (
                                <p className='text-xs text-green-700'>
                                  {t('vat.proceededAtStandard', {
                                    rate: vatPreview.standardRate,
                                  })}
                                </p>
                              ) : (
                                <p className='text-xs text-amber-700'>
                                  {t('vat.chatOrProceed', {
                                    rate: vatPreview.standardRate,
                                  })}
                                </p>
                              )}
                              <div className='flex flex-wrap gap-2'>
                                {project.professionalId?._id && (
                                  <StartChatButton
                                    professionalId={project.professionalId._id}
                                    label={t('vat.chatForQuotation')}
                                    size='sm'
                                    initialMessage={rfqChatPrefill}
                                  />
                                )}
                                {!proceedAtStandardVat && (
                                  <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    onClick={() => setProceedAtStandardVat(true)}
                                  >
                                    {t('vat.proceedAtStandard')}
                                  </Button>
                                )}
                                {proceedAtStandardVat && (
                                  <Button
                                    type='button'
                                    size='sm'
                                    variant='ghost'
                                    onClick={() => setProceedAtStandardVat(false)}
                                  >
                                    {t('vat.undoStandard')}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ) : vatPreview.reverseCharge ? (
                            <>
                              <div className='flex justify-between text-gray-700'>
                                <span>{t('vat.reverseCharge')}</span>
                                <span>{formatAmount(0)}</span>
                              </div>
                              <p className='text-xs text-gray-600'>
                                {vatPreview.explanation ||
                                  t('vat.reverseChargeFallback')}
                              </p>
                            </>
                          ) : (
                            <>
                              <div className='flex justify-between text-gray-700'>
                                <span>
                                  {vatPreview.action === 'reduced_rate'
                                    ? t('vat.estimatedReduced', {
                                      rate: vatPreview.appliedRate,
                                    })
                                    : t('vat.estimated', {
                                      rate: vatPreview.appliedRate,
                                    })}
                                </span>
                                <span>
                                  {formatAmount(Math.round(finalDisplayTotal * vatPreview.appliedRate) / 100)}
                                </span>
                              </div>
                              <div className='flex justify-between font-semibold text-gray-900'>
                                <span>{t('vat.totalInclVat')}</span>
                                <span>
                                  {formatAmount(
                                    Math.round(finalDisplayTotal * (100 + vatPreview.appliedRate)) / 100
                                  )}
                                </span>
                              </div>
                              {vatPreview.action === 'reduced_rate' && vatPreview.explanation && (
                                <p className='text-xs text-green-700'>{vatPreview.explanation}</p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {selectedPackage.pricing.type !== 'rfq' && (
                        <p className='text-xs text-gray-600 pt-2 border-t border-blue-200'>
                          {t('summary.finalPriceNote')}
                        </p>
                      )}
                      {selectedPackage.pricing.type === 'rfq' && project.professionalId?._id && (
                        <div className='pt-3 border-t border-blue-200'>
                          <p className='text-sm text-gray-700 mb-2'>
                            {t('review.rfqClarify')}
                          </p>
                          <StartChatButton
                            professionalId={project.professionalId._id}
                            label={t('vat.chatForQuotation')}
                            size='sm'
                            initialMessage={rfqChatPrefill}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className='flex justify-between mt-6'>
          <Button variant='outline' onClick={handleBack}>
            {currentStep === 1 ? t('common.cancel') : t('common.previous')}
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext} disabled={isOutsideServiceArea || uploadingQuestionIndexes.size > 0 || uploadingRfqAttachment}>
              {t('common.nextStep')}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading || isOutsideServiceArea || uploadingQuestionIndexes.size > 0 || uploadingRfqAttachment || (shouldPayAtCheckoutFlow && !customerPricingReady)}
              className='bg-blue-600 hover:bg-blue-700'
            >
              {loading ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  {finalActionLoadingLabel}
                </>
              ) : (
                finalActionLabel
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
