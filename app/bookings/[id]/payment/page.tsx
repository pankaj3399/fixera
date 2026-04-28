'use client';

/**
 * Booking Payment Page
 * Customer payment page for a specific booking
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { StripeProvider } from '@/components/stripe/StripeProvider';
import { PaymentForm } from '@/components/stripe/PaymentForm';
import { FileText, Loader2, Calendar } from 'lucide-react';
import type { ProjectAttachmentRef, ProjectDto } from '@/types/project';
import { useCustomerPricing } from '@/hooks/useCustomerPricing';
import { format, addDays, parseISO, startOfDay, isWeekend as dateFnsIsWeekend, eachDayOfInterval } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

interface BookingPayment {
  stripeClientSecret?: string;
  currency?: string;
  netAmount?: number;
  vatAmount?: number;
  vatRate?: number;
  totalWithVat?: number;
  status?: string;
  discount?: {
    loyaltyTier?: string;
    loyaltyPercentage?: number;
    loyaltyAmount?: number;
    repeatBuyerPercentage?: number;
    repeatBuyerAmount?: number;
    pointsRedeemed?: number;
    pointsDiscountAmount?: number;
    totalDiscount?: number;
    originalAmount?: number;
  };
}

interface BookingQuote {
  amount?: number;
  currency?: string;
  description?: string;
}

interface BookingProfessional {
  name?: string;
  username?: string;
  businessInfo?: {
    companyName?: string;
  };
}

type BookingProject = Partial<
  Pick<ProjectDto, '_id' | 'title' | 'extraOptions' | 'postBookingQuestions'>
>;

interface BookingRfqDetails {
  description?: string;
}

interface BookingMilestone {
  title?: string;
  amount?: number;
  description?: string;
  status?: string;
}

interface QuoteVersionDuration {
  value: number;
  unit: 'hours' | 'days';
}

interface QuoteVersion {
  version?: number;
  preparationDuration?: QuoteVersionDuration;
  executionDuration?: QuoteVersionDuration;
  bufferDuration?: QuoteVersionDuration;
  [key: string]: unknown;
}

interface Booking {
  bookingNumber?: string;
  payment?: BookingPayment;
  quote?: BookingQuote;
  rfqDetails?: BookingRfqDetails;
  professional?: BookingProfessional;
  project?: BookingProject;
  scheduledStartDate?: string;
  scheduledStartTime?: string;
  status?: string;
  milestonePayments?: BookingMilestone[];
  quotationNumber?: string;
  selectedSubprojectIndex?: number;
  quoteVersions?: QuoteVersion[];
  currentQuoteVersion?: number;
  selectedExtraOptions?: Array<{ extraOptionId: string; bookedPrice: number } | number>;
  postBookingData?: Array<{
    questionId: string;
    question: string;
    answer: string;
  }>;
}

interface ProposalWindow {
  start: string;
  end: string;
  executionEnd: string;
}

interface ScheduleProposals {
  mode: 'hours' | 'days';
  earliestBookableDate: string;
  earliestProposal?: ProposalWindow;
  shortestThroughputProposal?: ProposalWindow;
}

interface ResourcePolicy {
  minResources: number;
  totalResources: number;
  minOverlapPercentage: number;
}

interface BlockedRange {
  startDate: string;
  endDate: string;
  reason?: string;
}

interface AvailabilityData {
  blockedDates: string[];
  blockedRanges: BlockedRange[];
  resourcePolicy?: ResourcePolicy;
  timezone?: string;
}

interface DayAvailability {
  available?: boolean;
  startTime?: string;
  endTime?: string;
}

interface ProfessionalAvailability {
  [day: string]: DayAvailability;
}

interface ScheduleWindowPreview {
  scheduledStartDate: string;
  scheduledExecutionEndDate: string;
  scheduledBufferStartDate?: string;
  scheduledBufferEndDate?: string;
  scheduledBufferUnit?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
}

const MAX_PAYMENT_RETRY_ATTEMPTS = 3;
const PAYMENT_RETRY_DELAY_MS = 2000;
const formatMoney = (amount: number, currencyCode = 'EUR'): string =>
  `${currencyCode.toUpperCase()} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const getAttachmentUrl = (attachment: ProjectAttachmentRef): string =>
  typeof attachment === 'string' ? attachment : attachment.url;
const getAttachmentLabel = (
  attachment: ProjectAttachmentRef,
  index: number
): string =>
  typeof attachment === 'string'
    ? `Download attachment ${index + 1}`
    : attachment.name?.trim() || `Download attachment ${index + 1}`;
const getScheduleSelectionKey = (
  startDate: string,
  startTime: string,
  mode: ScheduleProposals['mode'] | null
): string => `${startDate}|${mode === 'hours' ? startTime : ''}`;

export default function BookingPaymentPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;
  const { commissionPercent, customerPrice, loyaltyLoaded } = useCustomerPricing();
  const customerPricingReady = commissionPercent != null && loyaltyLoaded;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [paymentRetryAttempt, setPaymentRetryAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [scheduleStep, setScheduleStep] = useState(false);
  const [selectedStartDate, setSelectedStartDate] = useState('');
  const [selectedStartTime, setSelectedStartTime] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleProposals, setScheduleProposals] = useState<ScheduleProposals | null>(null);
  const [loadingScheduleProposals, setLoadingScheduleProposals] = useState(false);
  const [scheduleProposalsFailed, setScheduleProposalsFailed] = useState(false);
  const [scheduleWindow, setScheduleWindow] = useState<ScheduleWindowPreview | null>(null);
  const [validatingScheduleSelection, setValidatingScheduleSelection] = useState(false);
  const [validatedScheduleSelectionKey, setValidatedScheduleSelectionKey] = useState('');
  const [scheduleValidationMessage, setScheduleValidationMessage] = useState('');
  const [selectedExtraOptions, setSelectedExtraOptions] = useState<number[]>([]);
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [professionalAvailability, setProfessionalAvailability] = useState<ProfessionalAvailability | null>(null);
  const [loadingWorkingHours, setLoadingWorkingHours] = useState(false);
  const [professionalTimezone, setProfessionalTimezone] = useState('UTC');
  const [showCalendar, setShowCalendar] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const getQuotedDurations = (b: Booking | null) => {
    if (!b?.quoteVersions?.length) return { execution: null, preparation: null, buffer: null };
    const version = b.currentQuoteVersion != null
      ? b.quoteVersions.find(v => v.version === b.currentQuoteVersion)
      : b.quoteVersions[b.quoteVersions.length - 1];
    if (!version) return { execution: null, preparation: null, buffer: null };
    return {
      execution: version.executionDuration ?? null,
      preparation: version.preparationDuration ?? null,
      buffer: version.bufferDuration ?? null,
    };
  };

  const isProfessionalWorkingDay = useCallback((date: Date): boolean => {
    if (!professionalAvailability) return true;
    const weekday = formatInTimeZone(date, professionalTimezone, 'EEEE').toLowerCase();
    const dayConfig = professionalAvailability[weekday];
    if (!dayConfig) return true;
    if (typeof dayConfig.available === 'boolean') return dayConfig.available;
    return true;
  }, [professionalAvailability, professionalTimezone]);

  const toLocalDateKey = useCallback((date: Date) => formatInTimeZone(date, professionalTimezone, 'yyyy-MM-dd'), [professionalTimezone]);

  const isDateBlocked = useCallback((dateStr: string): boolean => {
    if (!availabilityData) return false;
    if (availabilityData.blockedDates.includes(dateStr)) return true;
    return availabilityData.blockedRanges.some(r => dateStr >= r.startDate && dateStr <= r.endDate);
  }, [availabilityData]);

  const shortestThroughputDetails = useMemo(() => {
    if (!scheduleProposals?.shortestThroughputProposal?.start ||
        !scheduleProposals.shortestThroughputProposal?.executionEnd) return null;
    try {
      const startUtc = parseISO(scheduleProposals.shortestThroughputProposal.start);
      const endUtc = parseISO(scheduleProposals.shortestThroughputProposal.executionEnd);
      if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtc.getTime())) return null;
      const diffMs = endUtc.getTime() - startUtc.getTime();
      const totalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      return { startDate: startUtc, endDate: endUtc, totalDays };
    } catch { return null; }
  }, [scheduleProposals]);

  const shortestWindowDates = useMemo(() => {
    if (!shortestThroughputDetails) return [];
    try {
      return eachDayOfInterval({
        start: shortestThroughputDetails.startDate,
        end: shortestThroughputDetails.endDate,
      }).filter(d => isProfessionalWorkingDay(d) && !dateFnsIsWeekend(d));
    } catch { return []; }
  }, [shortestThroughputDetails, isProfessionalWorkingDay]);

  const storedExtrasToIndexes = (
    stored: Booking['selectedExtraOptions'],
    projectOptions: BookingProject['extraOptions']
  ): number[] => {
    if (!Array.isArray(stored) || stored.length === 0) return [];
    if (typeof stored[0] === 'number') return stored as number[];
    return (stored as Array<{ extraOptionId: string }>)
      .map((e) => (projectOptions || []).findIndex((o) => o._id === e.extraOptionId))
      .filter((i) => i >= 0);
  };

  const toggleExtraOption = (index: number) => {
    setSelectedExtraOptions((prev) =>
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]
    );
  };

  const loadScheduleProposals = useCallback(async (currentBooking: Booking | null) => {
    const projectId = currentBooking?.project?._id;
    if (!projectId) {
      setScheduleProposals(null);
      setScheduleWindow(null);
      setValidatedScheduleSelectionKey('');
      setScheduleValidationMessage('');
      return;
    }

    setLoadingScheduleProposals(true);
    setScheduleProposalsFailed(false);
    try {
      const params = new URLSearchParams();
      if (typeof currentBooking?.selectedSubprojectIndex === 'number') {
        params.set('subprojectIndex', String(currentBooking.selectedSubprojectIndex));
      }
      const quoted = getQuotedDurations(currentBooking);
      if (quoted.execution?.value != null) {
        params.set('executionValue', String(quoted.execution.value));
        if (quoted.execution.unit) params.set('executionUnit', quoted.execution.unit);
      }
      if (quoted.preparation?.value != null) {
        params.set('preparationValue', String(quoted.preparation.value));
        if (quoted.preparation.unit) params.set('preparationUnit', quoted.preparation.unit);
      }
      if (quoted.buffer?.value != null) {
        params.set('bufferValue', String(quoted.buffer.value));
        if (quoted.buffer.unit) params.set('bufferUnit', quoted.buffer.unit);
      }

      const response = await fetch(
        `${API_URL}/api/public/projects/${encodeURIComponent(projectId)}/schedule-proposals${params.toString() ? `?${params}` : ''}`
      );
      const data = await response.json();
      if (response.ok && data?.success && data?.proposals) {
        setScheduleProposals(data.proposals);
      } else {
        setScheduleProposals(null);
        setScheduleProposalsFailed(true);
        setScheduleWindow(null);
        setValidatedScheduleSelectionKey('');
      }
    } catch (err) {
      console.error('Failed to load schedule proposals:', err);
      setScheduleProposals(null);
      setScheduleProposalsFailed(true);
      setScheduleWindow(null);
      setValidatedScheduleSelectionKey('');
    } finally {
      setLoadingScheduleProposals(false);
    }
  }, [API_URL]);

  const loadAvailability = useCallback(async (currentBooking: Booking | null) => {
    const projectId = currentBooking?.project?._id;
    if (!projectId) return;

    setLoadingAvailability(true);
    try {
      let url = `${API_URL}/api/public/projects/${encodeURIComponent(projectId)}/availability`;
      if (typeof currentBooking?.selectedSubprojectIndex === 'number') {
        url += `?subprojectIndex=${currentBooking.selectedSubprojectIndex}`;
      }
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        const tz = data.timezone || 'UTC';
        setProfessionalTimezone(tz);
        const normalizedDates = (data.blockedDates || []).map((d: string) => {
          try { return formatInTimeZone(parseISO(d), tz, 'yyyy-MM-dd'); } catch { return d; }
        });
        const normalizedRanges = (data.blockedRanges || []).map((r: BlockedRange) => ({
          ...r,
          startDate: (() => { try { return formatInTimeZone(parseISO(r.startDate), tz, 'yyyy-MM-dd'); } catch { return r.startDate; } })(),
          endDate: (() => { try { return formatInTimeZone(parseISO(r.endDate), tz, 'yyyy-MM-dd'); } catch { return r.endDate; } })(),
        }));
        setAvailabilityData({
          blockedDates: normalizedDates,
          blockedRanges: normalizedRanges,
          resourcePolicy: data.resourcePolicy,
          timezone: tz,
        });
      }
    } catch (err) {
      console.error('Failed to load availability:', err);
    } finally {
      setLoadingAvailability(false);
    }
  }, [API_URL]);

  const loadWorkingHours = useCallback(async (currentBooking: Booking | null) => {
    const projectId = currentBooking?.project?._id;
    if (!projectId) return;

    setLoadingWorkingHours(true);
    try {
      const response = await fetch(
        `${API_URL}/api/public/projects/${encodeURIComponent(projectId)}/working-hours`
      );
      const data = await response.json();
      if (data.success && data.availability) {
        setProfessionalAvailability(data.availability);
      }
    } catch (err) {
      console.error('Failed to load working hours:', err);
    } finally {
      setLoadingWorkingHours(false);
    }
  }, [API_URL]);

  useEffect(() => {
    if (!scheduleStep || !booking?.project?._id || !scheduleProposals) {
      return;
    }

    const fallbackDate = scheduleProposals.earliestBookableDate.slice(0, 10);
    const proposalDate = scheduleProposals.earliestProposal?.start?.slice(0, 10) || fallbackDate;
    const proposalTime = scheduleProposals.earliestProposal?.start?.slice(11, 16) || '';

    if (scheduleProposals.mode === 'hours') {
      setSelectedStartDate((prev) => prev || proposalDate);
      setSelectedStartTime((prev) => prev || proposalTime);
    } else {
      setSelectedStartTime('');
    }
  }, [booking?.project?._id, scheduleProposals, scheduleStep]);

  useEffect(() => {
    const projectId = booking?.project?._id;
    const scheduleMode = scheduleProposals?.mode ?? null;

    if (!scheduleStep || !projectId || !scheduleProposals) {
      setScheduleWindow(null);
      setValidatedScheduleSelectionKey('');
      setScheduleValidationMessage('');
      setValidatingScheduleSelection(false);
      return;
    }

    if (!selectedStartDate) {
      setScheduleWindow(null);
      setValidatedScheduleSelectionKey('');
      setScheduleValidationMessage('');
      setValidatingScheduleSelection(false);
      return;
    }

    if (scheduleMode === 'hours' && !selectedStartTime) {
      setScheduleWindow(null);
      setValidatedScheduleSelectionKey('');
      setScheduleValidationMessage('Select a valid start time to continue.');
      setValidatingScheduleSelection(false);
      return;
    }

    const earliestDate = scheduleProposals.earliestBookableDate.slice(0, 10);
    if (selectedStartDate < earliestDate) {
      setScheduleWindow(null);
      setValidatedScheduleSelectionKey('');
      setScheduleValidationMessage(`Please choose ${earliestDate} or later.`);
      setValidatingScheduleSelection(false);
      return;
    }

    const controller = new AbortController();
    const validateSelection = async () => {
      setValidatingScheduleSelection(true);
      setScheduleWindow(null);
      setValidatedScheduleSelectionKey('');
      setScheduleValidationMessage('');

      try {
        const params = new URLSearchParams({
          startDate: selectedStartDate,
        });
        if (typeof booking?.selectedSubprojectIndex === 'number') {
          params.set('subprojectIndex', String(booking.selectedSubprojectIndex));
        }
        if (scheduleMode === 'hours' && selectedStartTime) {
          params.set('startTime', selectedStartTime);
        }
        const quoted = getQuotedDurations(booking);
        if (quoted.execution?.value != null) {
          params.set('executionValue', String(quoted.execution.value));
          if (quoted.execution.unit) params.set('executionUnit', quoted.execution.unit);
        }
        if (quoted.preparation?.value != null) {
          params.set('preparationValue', String(quoted.preparation.value));
          if (quoted.preparation.unit) params.set('preparationUnit', quoted.preparation.unit);
        }
        if (quoted.buffer?.value != null) {
          params.set('bufferValue', String(quoted.buffer.value));
          if (quoted.buffer.unit) params.set('bufferUnit', quoted.buffer.unit);
        }

        const response = await fetch(
          `${API_URL}/api/public/projects/${encodeURIComponent(projectId)}/schedule-window?${params.toString()}`,
          { signal: controller.signal }
        );
        const data = await response.json();

        if (response.ok && data?.success && data?.window) {
          setScheduleWindow(data.window);
          setValidatedScheduleSelectionKey(
            getScheduleSelectionKey(selectedStartDate, selectedStartTime, scheduleMode)
          );
        } else {
          setScheduleValidationMessage(
            data?.error || 'The selected schedule is not available. Please choose a different option.'
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to validate project schedule:', err);
        setScheduleValidationMessage('Unable to verify the selected schedule right now.');
      } finally {
        if (!controller.signal.aborted) {
          setValidatingScheduleSelection(false);
        }
      }
    };

    void validateSelection();

    return () => controller.abort();
  }, [
    API_URL,
    booking?.project?._id,
    booking?.selectedSubprojectIndex,
    scheduleProposals,
    scheduleStep,
    selectedStartDate,
    selectedStartTime,
  ]);

  const handleConfirmSchedule = async () => {
    if (!selectedStartDate) return;
    setSavingSchedule(true);
    try {
      setError('');
      const requiresProjectSchedule = Boolean(booking?.project?._id);
      const scheduleMode = requiresProjectSchedule ? scheduleProposals?.mode ?? null : 'days';
      const currentSelectionKey = getScheduleSelectionKey(
        selectedStartDate,
        selectedStartTime,
        scheduleMode
      );

      if (requiresProjectSchedule) {
        if (loadingScheduleProposals || validatingScheduleSelection) {
          setError('Please wait for project availability to finish loading.');
          return;
        }

        if (!scheduleProposals || scheduleProposalsFailed || !scheduleMode) {
          setError('Project availability must load successfully before you can continue.');
          return;
        }

        if (
          validatedScheduleSelectionKey !== currentSelectionKey ||
          !scheduleWindow
        ) {
          setError('Please choose a valid available schedule before continuing.');
          return;
        }
      }

      const sanitizedId = encodeURIComponent(bookingId);
      const response = await fetch(`${API_URL}/api/bookings/${sanitizedId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scheduledStartDate: selectedStartDate,
          scheduledStartTime:
            scheduleMode === 'hours' ? selectedStartTime || undefined : undefined,
          additionalNotes: additionalNotes || undefined,
          selectedExtraOptions,
        }),
      });
      const data = await response.json();
      if (response.ok && data?.success) {
        const updatedBooking = data.data?.booking || booking;
        setBooking(updatedBooking);
        setSelectedExtraOptions(storedExtrasToIndexes(updatedBooking?.selectedExtraOptions, updatedBooking?.project?.extraOptions));
        setScheduleStep(false);
        await ensurePaymentIntent(bookingId, updatedBooking);
      } else {
        setError(data?.error?.message || 'Failed to save schedule');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  const ensurePaymentIntent = useCallback(async (currentBookingId: string, currentBooking: Booking | null) => {
    setInitializingPayment(true);
    try {
      const sanitizedId = encodeURIComponent(currentBookingId);
      const response = await fetch(`${API_URL}/api/bookings/${sanitizedId}/payment-intent`, {
        method: 'POST',
        credentials: 'include',
      });
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await response.json() : null;
      console.log('[PAYMENT PAGE] ensurePaymentIntent status:', response.status);

      if (response.ok && data?.success) {
        const nextBooking = data.data?.booking || currentBooking;
        if (nextBooking) {
          setBooking(nextBooking);
        }

        // Check if backend wants us to redirect (payment already processed)
        if (data.data?.shouldRedirect && data.data?.redirectTo) {
          router.push(data.data.redirectTo);
          return true;
        }

        if (data.data?.clientSecret) {
          setClientSecret(data.data.clientSecret);
          return true;
        }

        console.warn('[PAYMENT PAGE] ensurePaymentIntent succeeded but no client secret returned.');
        return false;
      }

      const message =
        (data?.error?.message || data?.msg) ??
        (response.status === 404
          ? 'Payment initialization endpoint is unavailable. Please contact support.'
          : 'Failed to initialize payment intent.');
      console.error('[PAYMENT PAGE] ensurePaymentIntent failed:', message);
      setError(message);
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize payment intent.';
      console.error('[PAYMENT PAGE] ensurePaymentIntent error:', err);
      setError(message);
      return false;
    } finally {
      setInitializingPayment(false);
    }
  }, [API_URL, router]);

  const loadBookingPaymentDetails = useCallback(async (currentBookingId: string, attempt = 1) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setPaymentRetryAttempt(attempt);
    setError('');
    try {
      const sanitizedId = encodeURIComponent(currentBookingId);
      // Fetch booking details
      const bookingResponse = await fetch(`${API_URL}/api/bookings/${sanitizedId}`, {
        credentials: 'include', // Include cookies for authentication
      });

      const bookingData = await bookingResponse.json();

      if (!bookingData.success) {
        setError('Failed to load booking details');
        setLoading(false);
        return;
      }

      const bookingInfo = bookingData.booking as Booking; // Backend returns { success, booking }
      setBooking(bookingInfo);
      setSelectedExtraOptions(storedExtrasToIndexes(bookingInfo?.selectedExtraOptions, bookingInfo?.project?.extraOptions));
      setLoading(false);

      const hasUnpaidMilestones = Array.isArray(bookingInfo?.milestonePayments)
        && bookingInfo.milestonePayments.some((milestone) => milestone.status !== 'paid');

      if ((bookingInfo?.payment?.status === 'authorized' || bookingInfo?.payment?.status === 'completed') && !hasUnpaidMilestones) {
        router.push(`/bookings/${currentBookingId}/payment/success`);
        return;
      }

      if ((bookingInfo?.status === 'quote_accepted' || bookingInfo?.status === 'payment_pending') && !bookingInfo?.scheduledStartDate) {
        setScheduleStep(true);
        void loadScheduleProposals(bookingInfo);
        void loadAvailability(bookingInfo);
        void loadWorkingHours(bookingInfo);
        return;
      }

      if (bookingInfo?.payment?.stripeClientSecret) {
        const paymentStatus = bookingInfo.payment.status || 'pending';
        if (paymentStatus === 'pending') {
          setClientSecret(bookingInfo.payment.stripeClientSecret);
          setInitializingPayment(false);
          return;
        }
      }

      // Try to initialize payment intent on demand
      const intentCreated = await ensurePaymentIntent(currentBookingId, bookingInfo);
      if (intentCreated) {
        return;
      }

      if (attempt < MAX_PAYMENT_RETRY_ATTEMPTS) {
        setInitializingPayment(true);
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        retryTimeoutRef.current = setTimeout(() => {
          void loadBookingPaymentDetails(currentBookingId, attempt + 1);
        }, PAYMENT_RETRY_DELAY_MS);
        return;
      }

      setInitializingPayment(false);
      setError((prev) => prev || 'Payment information could not be initialized automatically. Please contact support or retry later.');

    } catch (err) {
      console.error('Error loading payment details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load payment details');
      setLoading(false);
    }
  }, [API_URL, ensurePaymentIntent, loadScheduleProposals, loadAvailability, loadWorkingHours, router]);

  useEffect(() => {
    if (!bookingId) return;
    void loadBookingPaymentDetails(bookingId);
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [bookingId, loadBookingPaymentDetails]);

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    // Prevent double submission
    if (confirming) {
      return;
    }

    try {
      setConfirming(true);
      setLoading(true);

      // Confirm payment on backend
      const response = await fetch(`${API_URL}/api/stripe/payment/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          bookingId,
          paymentIntentId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to success page
        router.push(`/bookings/${bookingId}/payment/success`);
      } else {
        // Check if error is about payment already being captured
        if (data.error?.code === 'payment_intent_unexpected_state') {
          router.push(`/bookings/${bookingId}/payment/success`);
        } else {
          setError(data.error?.message || 'Payment confirmation failed');
          setLoading(false);
        }
      }

    } catch (err) {
      console.error('Error confirming payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to confirm payment');
      setLoading(false);
    } finally {
      setConfirming(false);
    }
  };

  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage);
    // Optionally redirect to error page
    // router.push(`/bookings/${bookingId}/payment/failed?error=${encodeURIComponent(errorMessage)}`);
  };

  const paymentCurrency = booking?.payment?.currency?.toUpperCase() || 'EUR';
  const discountInfo = booking?.payment?.discount;
  const hasDiscountBreakdown = (discountInfo?.totalDiscount ?? 0) > 0;
  const originalServiceAmount =
    discountInfo?.originalAmount ??
    booking?.quote?.amount ??
    booking?.payment?.netAmount ??
    0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-6 text-lg font-medium text-gray-700">Processing payment...</p>
          <p className="mt-2 text-sm text-gray-500">Please wait, do not close this page</p>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
              <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              type="button"
              onClick={() => router.push('/bookings')}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700"
            >
              Back to Bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (scheduleStep) {
    const requiresProjectSchedule = Boolean(booking?.project?._id);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = scheduleProposals?.earliestBookableDate
      ? scheduleProposals.earliestBookableDate.slice(0, 10)
      : `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const scheduleMode = requiresProjectSchedule ? scheduleProposals?.mode ?? null : 'days';
    const currentSelectionKey = getScheduleSelectionKey(
      selectedStartDate,
      selectedStartTime,
      scheduleMode
    );
    const hasValidatedProjectSelection =
      !requiresProjectSchedule ||
      (Boolean(scheduleProposals) &&
        validatedScheduleSelectionKey === currentSelectionKey &&
        Boolean(scheduleWindow));
    const projectExtraOptions = booking?.project?.extraOptions || [];
    const selectedOptionTotal = selectedExtraOptions.reduce(
      (sum, optionIndex) => sum + (projectExtraOptions[optionIndex]?.price || 0),
      0
    );

    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white shadow-lg rounded-lg overflow-hidden">
            <div className="bg-blue-600 px-6 py-4">
              <h1 className="text-2xl font-bold text-white">Complete Your Booking</h1>
              <p className="text-blue-100 text-sm mt-1">
                {booking?.quotationNumber ? `Quotation #${booking.quotationNumber}` : `Booking #${booking?.bookingNumber || bookingId.slice(-6)}`}
              </p>
            </div>

            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Booking Summary</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Service:</span>
                  <span className="font-medium text-gray-900">
                    {booking?.project?.title || booking?.quote?.description || booking?.rfqDetails?.description || 'Property Service'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Professional:</span>
                  <span className="font-medium text-gray-900">
                    {booking?.professional?.username || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Quote Amount:</span>
                  <span className="font-medium text-gray-900">
                    {customerPricingReady
                      ? formatMoney(customerPrice(booking?.quote?.amount ?? 0), booking?.quote?.currency?.toUpperCase() || 'EUR')
                      : '...'}
                  </span>
                </div>
                {booking?.milestonePayments && booking.milestonePayments.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">Milestones:</p>
                    <div className="space-y-1">
                      {booking.milestonePayments.map((m, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-600">{m.title || `Milestone ${i + 1}`}</span>
                          <span className="text-gray-900">{customerPricingReady ? formatMoney(customerPrice(m.amount ?? 0), booking?.quote?.currency?.toUpperCase() || 'EUR') : '...'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">Member Savings:</span> Your loyalty tier discount and any returning-customer savings are applied automatically before payment.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Choose Preferred Start Date</h2>
              <p className="text-sm text-gray-600 mb-4">
                {requiresProjectSchedule
                  ? 'Select when you\'d like the work to begin. Dates when team members are unavailable are disabled.'
                  : 'Choose when you would like the work to begin.'}
              </p>

              {availabilityData?.resourcePolicy && availabilityData.resourcePolicy.minResources > 1 && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Team requirement:</span>{' '}
                    {availabilityData.resourcePolicy.minResources} of{' '}
                    {availabilityData.resourcePolicy.totalResources} team members must be available
                    for at least {availabilityData.resourcePolicy.minOverlapPercentage}% of the scheduled time.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {(loadingScheduleProposals || loadingAvailability || loadingWorkingHours) && (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading availability and working hours...
                  </div>
                )}
                {scheduleProposalsFailed && !loadingScheduleProposals && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    Failed to load project availability. Please try refreshing the page.
                  </div>
                )}
                {requiresProjectSchedule && !loadingScheduleProposals && !scheduleProposals && !scheduleProposalsFailed && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    Waiting for project availability before enabling scheduling.
                  </div>
                )}

                {!loadingScheduleProposals && !loadingAvailability && !loadingWorkingHours && (scheduleProposals || !requiresProjectSchedule) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {requiresProjectSchedule ? 'Available Start Date *' : 'Preferred Start Date *'}
                    </label>
                    <div className="mt-2">
                      <button
                        type="button"
                        className="w-full flex items-center justify-start text-left font-normal h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => setShowCalendar(!showCalendar)}
                      >
                        <Calendar className="mr-2 h-4 w-4 text-gray-500" />
                        {selectedStartDate
                          ? format(parseISO(selectedStartDate), 'MMMM d, yyyy')
                          : 'Select a date'}
                      </button>

                      {showCalendar && (
                        <div className="mt-3 p-6 border rounded-lg bg-white shadow-xl">
                          <DayPicker
                            mode="single"
                            selected={selectedStartDate ? parseISO(selectedStartDate) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                if (!isProfessionalWorkingDay(date)) return;
                                const dateStr = toLocalDateKey(date);
                                if (isDateBlocked(dateStr)) return;
                                setSelectedStartDate(dateStr);
                                setShowCalendar(false);
                              }
                            }}
                            disabled={[
                              {
                                before: scheduleProposals?.earliestBookableDate
                                  ? startOfDay(parseISO(scheduleProposals.earliestBookableDate))
                                  : addDays(startOfDay(new Date()), 1),
                              },
                              { after: addDays(startOfDay(new Date()), 180) },
                              (date: Date) => !isProfessionalWorkingDay(date),
                              (date: Date) => isDateBlocked(toLocalDateKey(date)),
                            ]}
                            modifiers={{
                              weekend: (date) => dateFnsIsWeekend(date) && !isProfessionalWorkingDay(date),
                              blocked: (date) => isDateBlocked(toLocalDateKey(date)),
                              nonWorking: (date) => !isProfessionalWorkingDay(date) && !dateFnsIsWeekend(date),
                            }}
                            styles={{
                              months: { width: '100%' },
                              month: { width: '100%' },
                              table: { width: '100%', maxWidth: '100%' },
                              head_cell: { width: '14.28%', textAlign: 'center' },
                              cell: { width: '14.28%', textAlign: 'center' },
                              day: { width: '40px', height: '40px', margin: '2px auto', fontSize: '14px' },
                            }}
                            modifiersStyles={{
                              selected: { backgroundColor: '#3b82f6', color: 'white', fontWeight: 'bold' },
                              disabled: { textDecoration: 'line-through', opacity: 0.3, cursor: 'not-allowed', backgroundColor: '#fee2e2', color: '#991b1b' },
                              weekend: { backgroundColor: '#e5e7eb', color: '#6b7280', cursor: 'not-allowed', opacity: 0.7 },
                              nonWorking: { backgroundColor: '#fef3c7', color: '#92400e', cursor: 'not-allowed', opacity: 0.5 },
                              blocked: { backgroundColor: '#fee2e2', textDecoration: 'line-through', opacity: 0.5 },
                              today: { fontWeight: 'bold', border: '2px solid #3b82f6' },
                            }}
                          />

                          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-gray-200 border rounded opacity-70"></div>
                              <span>Weekend (non-working)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-red-100 border rounded line-through text-center text-red-900 opacity-50">X</div>
                              <span>Blocked/Booked</span>
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
                    </div>
                  </div>
                )}

                {scheduleMode === 'hours' && selectedStartDate && (
                  <div>
                    <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
                      Start Time *
                    </label>
                    <input
                      id="startTime"
                      type="time"
                      value={selectedStartTime}
                      onChange={(e) => setSelectedStartTime(e.target.value)}
                      disabled={requiresProjectSchedule && (!scheduleProposals || loadingScheduleProposals)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      This project is scheduled in hours mode, so the scheduler also needs a start time.
                    </p>
                  </div>
                )}

                {scheduleProposals?.mode === 'days' && !selectedStartDate && shortestThroughputDetails && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-blue-900 font-semibold">
                        Shortest Consecutive Window{' '}
                        <span className="text-xs font-normal">
                          ({shortestThroughputDetails.totalDays}{' '}
                          {shortestThroughputDetails.totalDays === 1 ? 'day' : 'days'})
                        </span>
                      </p>
                      <p className="text-xs text-blue-700">
                        {format(shortestThroughputDetails.startDate, 'EEEE, MMMM d, yyyy')} -{' '}
                        {format(shortestThroughputDetails.endDate, 'EEEE, MMMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {shortestWindowDates.map((day) => (
                        <span
                          key={day.toISOString()}
                          className="px-3 py-1 text-xs rounded-full bg-white border border-blue-200 text-blue-800"
                        >
                          {format(day, 'MMM d')}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-100"
                      onClick={() => {
                        const startStr = toLocalDateKey(shortestThroughputDetails.startDate);
                        setSelectedStartDate(startStr);
                        setShowCalendar(false);
                      }}
                    >
                      Use this window
                    </button>
                  </div>
                )}

                {validatingScheduleSelection && requiresProjectSchedule && (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating the selected schedule...
                  </div>
                )}

                {scheduleValidationMessage && requiresProjectSchedule && !validatingScheduleSelection && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {scheduleValidationMessage}
                  </div>
                )}

                {hasValidatedProjectSelection && scheduleWindow && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 space-y-2">
                    <p className="font-medium">Selected slot is available and ready to book.</p>
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="font-medium">Start:</span>{' '}
                        {formatInTimeZone(parseISO(scheduleWindow.scheduledStartDate), professionalTimezone, 'yyyy-MM-dd')}
                        {scheduleWindow.scheduledStartTime ? ` at ${scheduleWindow.scheduledStartTime}` : ''}
                      </p>
                      {(() => {
                        const quoted = getQuotedDurations(booking);
                        const parts: string[] = [];
                        if (quoted.preparation?.value) parts.push(`Preparation: ${quoted.preparation.value} ${quoted.preparation.unit}`);
                        if (quoted.execution?.value) parts.push(`Execution: ${quoted.execution.value} ${quoted.execution.unit}`);
                        if (quoted.buffer?.value) parts.push(`Buffer: ${quoted.buffer.value} ${quoted.buffer.unit}`);
                        if (parts.length === 0) return null;
                        return <p><span className="font-medium">Duration breakdown:</span> {parts.join(' → ')}</p>;
                      })()}
                      <p>
                        <span className="font-medium">Execution ends:</span>{' '}
                        {formatInTimeZone(parseISO(scheduleWindow.scheduledExecutionEndDate), professionalTimezone, 'yyyy-MM-dd')}
                      </p>
                      {scheduleWindow.scheduledBufferEndDate && (
                        <p>
                          <span className="font-medium">Project completion (incl. buffer):</span>{' '}
                          {formatInTimeZone(parseISO(scheduleWindow.scheduledBufferEndDate), professionalTimezone, 'yyyy-MM-dd')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {projectExtraOptions.length > 0 && (
                  <div className="rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Extra Options</h3>
                    <div className="space-y-2">
                      {projectExtraOptions.map((option, index) => {
                        const selected = selectedExtraOptions.includes(index);
                        return (
                          <label
                            key={`${option.name}-${index}`}
                            className={`flex cursor-pointer items-start justify-between rounded-lg border p-3 text-sm ${
                              selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="pr-3">
                              <div className="font-medium text-gray-900">{option.name}</div>
                              {option.description && (
                                <p className="mt-1 text-xs text-gray-500">{option.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-gray-900">
                                {customerPricingReady
                                  ? formatMoney(customerPrice(option.price || 0), booking?.quote?.currency?.toUpperCase() || 'EUR')
                                  : '...'}
                              </span>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleExtraOption(index)}
                              />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {selectedOptionTotal > 0 && (
                      <p className="mt-3 text-xs font-medium text-gray-700">
                        Selected options total: {customerPricingReady
                          ? formatMoney(customerPrice(selectedOptionTotal), booking?.quote?.currency?.toUpperCase() || 'EUR')
                          : '...'}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Notes <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    placeholder="Any additional details for the professional..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleConfirmSchedule}
                  disabled={
                    !selectedStartDate ||
                    savingSchedule ||
                    loadingScheduleProposals ||
                    validatingScheduleSelection ||
                    (scheduleMode === 'hours' && !selectedStartTime) ||
                    (requiresProjectSchedule && !hasValidatedProjectSelection)
                  }
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingSchedule ? 'Saving...' : 'Continue to Payment'}
                </button>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-gray-400 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-500">
                  After selecting your start date, you will proceed to the secure payment page.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 px-6 py-4">
            <h1 className="text-2xl font-bold text-white">Complete Payment</h1>
            <p className="text-blue-100 text-sm mt-1">Booking #{booking?.bookingNumber || bookingId.slice(-6)}</p>
          </div>

          {/* Booking Summary */}
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Booking Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Service:</span>
                <span className="font-medium text-gray-900">
                  {booking?.quote?.description || booking?.rfqDetails?.description || 'Property Service'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Professional:</span>
                <span className="font-medium text-gray-900">
                  {booking?.professional?.username || 'N/A'}
                </span>
              </div>
              {booking?.scheduledStartDate && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Start Date:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(booking.scheduledStartDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Payment Details</h2>
            {discountInfo?.loyaltyTier && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm font-medium text-amber-900">
                  {discountInfo.loyaltyTier} member benefits applied
                </p>
              </div>
            )}
            <div className="space-y-2">
              {hasDiscountBreakdown && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Original Service Amount:</span>
                  <span className="text-gray-900">
                    {formatMoney(originalServiceAmount, paymentCurrency)}
                  </span>
                </div>
              )}

              {(discountInfo?.loyaltyAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Loyalty Discount ({discountInfo?.loyaltyPercentage ?? 0}%):
                  </span>
                  <span className="text-green-700">
                    -{formatMoney(discountInfo?.loyaltyAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}

              {(discountInfo?.repeatBuyerAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Returning Customer Discount ({discountInfo?.repeatBuyerPercentage ?? 0}%):
                  </span>
                  <span className="text-green-700">
                    -{formatMoney(discountInfo?.repeatBuyerAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}

              {(discountInfo?.pointsRedeemed ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Points Redeemed ({discountInfo?.pointsRedeemed} pts):
                  </span>
                  <span className="text-green-700">
                    -{formatMoney(discountInfo?.pointsDiscountAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-gray-600">Service Amount:</span>
                <span className="text-gray-900">
                  {formatMoney(booking?.payment?.netAmount ?? 0, paymentCurrency)}
                </span>
              </div>
              {(booking?.payment?.vatAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">VAT ({booking?.payment?.vatRate}%):</span>
                  <span className="text-gray-900">
                    {formatMoney(booking?.payment?.vatAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                <span className="text-lg font-semibold text-gray-900">Total:</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatMoney(booking?.payment?.totalWithVat ?? 0, paymentCurrency)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="px-6 py-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Enter Payment Details</h2>

            {/* Check if payment is already completed - don't show form */}
            {booking?.payment?.status === 'authorized' || booking?.payment?.status === 'completed' ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-green-700 text-sm font-medium">Payment already completed</p>
                </div>
                <p className="text-xs text-green-600 mt-2">Redirecting to confirmation page...</p>
              </div>
            ) : clientSecret ? (
              <StripeProvider>
                <PaymentForm
                  clientSecret={clientSecret}
                  amount={booking?.payment?.totalWithVat || 0}
                  currency={booking?.payment?.currency || 'EUR'}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </StripeProvider>
            ) : initializingPayment ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-700 text-sm font-medium">Preparing payment details…</p>
                <p className="text-xs text-blue-600 mt-1">
                  Attempt {paymentRetryAttempt} of {MAX_PAYMENT_RETRY_ATTEMPTS}. This page will refresh automatically once your payment intent is ready.
                </p>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600">{error || 'Unable to initialize payment. Please try again or contact support.'}</p>
                <button
                  type="button"
                  onClick={() => void loadBookingPaymentDetails(bookingId, 1)}
                  className="mt-3 inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Retry initialization
                </button>
              </div>
            )}
          </div>

          {/* Security Note */}
          <div className="px-6 py-4 bg-gray-50 border-t">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-gray-400 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-700">Secure Payment</p>
                <p className="text-xs text-gray-500 mt-1">
                  Your payment is charged securely. The professional will only receive payment after you confirm the work is done.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
