'use client';

/**
 * Booking Payment Page
 * Customer payment page for a specific booking
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StripeProvider } from '@/components/stripe/StripeProvider';
import { PaymentForm } from '@/components/stripe/PaymentForm';
import { FileText, Loader2, Calendar } from 'lucide-react';
import type { ProjectDto } from '@/types/project';
import { useCustomerPricing } from '@/hooks/useCustomerPricing';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';
import { format, addDays, parseISO, startOfDay, isWeekend as dateFnsIsWeekend, eachDayOfInterval } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { trackBeginCheckout, trackEvent } from '@/lib/analytics';
import {
  calculateMilestoneGrossAmounts,
  calculateQuoteVersionVatTotals,
} from '@/lib/vatPricing';
import type { QuotationPricingLine } from '@/types/quotation';

interface BookingPayment {
  stripeClientSecret?: string;
  currency?: string;
  netAmount?: number;
  vatAmount?: number;
  vatRate?: number;
  totalWithVat?: number;
  vatBreakdown?: Array<{
    description: string;
    netAmount: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    vatLabel?: string;
  }>;
  reverseCharge?: boolean;
  invoiceNumber?: string;
  invoiceUrl?: string;
  invoiceUblUrl?: string;
  status?: string;
  discount?: {
    loyaltyTier?: string;
    loyaltyPercentage?: number;
    loyaltyAmount?: number;
    repeatBuyerPercentage?: number;
    repeatBuyerAmount?: number;
    pointsRedeemed?: number;
    pointsDiscountAmount?: number;
    codeDiscountAmount?: number;
    codeLabel?: string;
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
  Pick<ProjectDto, '_id' | 'title' | 'extraOptions' | 'postBookingQuestions' | 'minResources' | 'minOverlapPercentage'>
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
  scope?: string;
  description?: string;
  totalAmount?: number;
  pricingLines?: QuotationPricingLine[];
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
  checkoutSnapshot?: {
    pricingType?: string;
    unitAmount?: number;
    quantity?: number;
    baseSubtotal?: number;
    extraOptionsTotal?: number;
    totalAmount?: number;
  };
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
const getScheduleSelectionKey = (
  startDate: string,
  startTime: string,
  mode: ScheduleProposals['mode'] | null
): string => `${startDate}|${mode === 'hours' ? startTime : ''}`;

export default function BookingPaymentPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;
  const t = useTranslations('checkout');
  const { formatMoney, currency: displayCurrency } = useCurrency();
  const { intl, dateFns } = useFormatLocale();
  const { commissionPercent, customerPrice, loyalty, loyaltyLoaded, originalPrice } = useCustomerPricing();
  const customerPricingReady = commissionPercent != null && loyaltyLoaded;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);
  const [applyingCode, setApplyingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
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

  const getCurrentQuoteVersion = useCallback((b: Booking | null): QuoteVersion | null => {
    if (!b?.quoteVersions?.length) return null;
    return b.currentQuoteVersion != null
      ? b.quoteVersions.find(v => v.version === b.currentQuoteVersion) ?? b.quoteVersions[b.quoteVersions.length - 1] ?? null
      : b.quoteVersions[b.quoteVersions.length - 1] ?? null;
  }, []);

  const currentQuoteVersion = useMemo(() => getCurrentQuoteVersion(booking), [booking, getCurrentQuoteVersion]);
  const hasUsableQuoteTotal = useMemo(() => {
    const total = Number(currentQuoteVersion?.totalAmount);
    return Number.isFinite(total) && total > 0;
  }, [currentQuoteVersion?.totalAmount]);
  const currentQuoteTotals = useMemo(() => {
    if (!hasUsableQuoteTotal || !currentQuoteVersion) return null;
    return calculateQuoteVersionVatTotals(currentQuoteVersion, customerPricingReady ? customerPrice : undefined);
  }, [currentQuoteVersion, customerPricingReady, customerPrice, hasUsableQuoteTotal]);
  const milestoneGrossAmounts = useMemo(() => {
    if (!currentQuoteVersion || !booking?.milestonePayments?.length || !hasUsableQuoteTotal) return [];
    return calculateMilestoneGrossAmounts(
      {
        ...currentQuoteVersion,
        milestones: booking.milestonePayments.map((milestone, index) => ({
          title: milestone.title || t('paymentPage.milestoneFallback', { number: index + 1 }),
          amount: milestone.amount ?? 0,
          dueCondition: 'on_start',
          order: index,
          status: 'pending',
        })),
      },
      customerPricingReady ? customerPrice : undefined
    );
  }, [currentQuoteVersion, booking?.milestonePayments, customerPricingReady, customerPrice, hasUsableQuoteTotal, t]);

  const getMilestoneDisplayAmount = useCallback((index: number, netAmount: number) => {
    const grossAmount = milestoneGrossAmounts[index];
    if (grossAmount != null && grossAmount > 0) return grossAmount;
    return customerPrice(netAmount);
  }, [milestoneGrossAmounts, customerPrice]);

  const getQuotedDurations = (b: Booking | null) => {
    const version = getCurrentQuoteVersion(b);
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
      setScheduleValidationMessage(t('paymentPage.validation.selectValidStartTime'));
      setValidatingScheduleSelection(false);
      return;
    }

    const earliestDate = scheduleProposals.earliestBookableDate.slice(0, 10);
    if (selectedStartDate < earliestDate) {
      setScheduleWindow(null);
      setValidatedScheduleSelectionKey('');
      setScheduleValidationMessage(t('paymentPage.validation.chooseDateOrLater', { date: earliestDate }));
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
            data?.error || t('paymentPage.validation.scheduleUnavailable')
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to validate project schedule:', err);
        setScheduleValidationMessage(t('paymentPage.validation.unableToVerify'));
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
    t,
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
          setError(t('paymentPage.validation.waitAvailabilityLoading'));
          return;
        }

        if (!scheduleProposals || scheduleProposalsFailed || !scheduleMode) {
          setError(t('paymentPage.validation.availabilityMustLoad'));
          return;
        }

        if (
          validatedScheduleSelectionKey !== currentSelectionKey ||
          !scheduleWindow
        ) {
          setError(t('paymentPage.validation.chooseValidSchedule'));
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
        setError(data?.error?.message || t('paymentPage.validation.saveScheduleFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('paymentPage.validation.saveScheduleFailed'));
    } finally {
      setSavingSchedule(false);
    }
  };

  const ensurePaymentIntent = useCallback(async (currentBookingId: string, currentBooking: Booking | null, discountCode?: string): Promise<{ ok: boolean; errorMessage?: string; booking?: Booking | null }> => {
    setInitializingPayment(true);
    let previousClientSecret = '';
    setClientSecret((prev) => {
      previousClientSecret = prev;
      return '';
    });
    const suppressGlobalError = discountCode !== undefined;
    const restoreClientSecretOnError = () => {
      if (previousClientSecret) setClientSecret(previousClientSecret);
    };
    try {
      const sanitizedId = encodeURIComponent(currentBookingId);
      const response = await fetch(`${API_URL}/api/bookings/${sanitizedId}/payment-intent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discountCode !== undefined ? { discountCode } : {}),
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

        if (data.data?.shouldRedirect && data.data?.redirectTo) {
          router.push(data.data.redirectTo);
          return { ok: true, booking: nextBooking };
        }

        if (data.data?.clientSecret) {
          setClientSecret(data.data.clientSecret);
          if (nextBooking) {
            trackBeginCheckout(currentBookingId, nextBooking);
          }
          return { ok: true, booking: nextBooking };
        }

        console.warn('[PAYMENT PAGE] ensurePaymentIntent succeeded but no client secret returned.');
        restoreClientSecretOnError();
        return { ok: false, errorMessage: t('paymentPage.errors.noClientSecret'), booking: nextBooking };
      }

      const message =
        (data?.error?.message || data?.msg) ??
        (response.status === 404
          ? t('paymentPage.errors.endpointUnavailable')
          : t('paymentPage.errors.initPaymentFailed'));
      console.error('[PAYMENT PAGE] ensurePaymentIntent failed:', message);
      if (!suppressGlobalError) {
        setError(message);
      }
      restoreClientSecretOnError();
      return { ok: false, errorMessage: message };
    } catch (err) {
      const message = err instanceof Error ? err.message : t('paymentPage.errors.initPaymentFailed');
      console.error('[PAYMENT PAGE] ensurePaymentIntent error:', err);
      if (!suppressGlobalError) {
        setError(message);
      }
      restoreClientSecretOnError();
      return { ok: false, errorMessage: message };
    } finally {
      setInitializingPayment(false);
    }
  }, [API_URL, router, t]);

  const handleApplyDiscountCode = useCallback(async () => {
    const code = discountCodeInput.trim().toUpperCase();
    if (!code) {
      setCodeError(t('paymentPage.discount.enterCode'));
      return;
    }
    if (!bookingId) return;
    setApplyingCode(true);
    setCodeError(null);
    const result = await ensurePaymentIntent(bookingId, booking, code);
    if (!result.ok) {
      setCodeError(result.errorMessage || t('paymentPage.discount.unableToApply'));
      setApplyingCode(false);
      return;
    }
    const appliedDiscount = result.booking?.payment?.discount;
    const codeApplied =
      !!appliedDiscount?.codeLabel ||
      (appliedDiscount?.codeDiscountAmount ?? 0) > 0;
    if (codeApplied) {
      setAppliedDiscountCode(appliedDiscount?.codeLabel || code);
      setDiscountCodeInput('');
    } else {
      setCodeError(t('paymentPage.discount.notApplicable'));
    }
    setApplyingCode(false);
  }, [bookingId, booking, discountCodeInput, ensurePaymentIntent, t]);

  const handleRemoveDiscountCode = useCallback(async () => {
    if (!bookingId) return;
    setApplyingCode(true);
    setCodeError(null);
    const result = await ensurePaymentIntent(bookingId, booking, '');
    if (!result.ok) {
      setCodeError(result.errorMessage || t('paymentPage.discount.unableToRemove'));
    }
    setApplyingCode(false);
  }, [bookingId, booking, ensurePaymentIntent, t]);

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
        setError(t('paymentPage.errors.loadBookingFailed'));
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
          trackBeginCheckout(currentBookingId, bookingInfo);
          return;
        }
      }

      // Try to initialize payment intent on demand
      const intentResult = await ensurePaymentIntent(currentBookingId, bookingInfo);
      if (intentResult.ok) {
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
      setError((prev) => prev || t('paymentPage.errors.paymentInfoInitFailed'));

    } catch (err) {
      console.error('Error loading payment details:', err);
      setError(err instanceof Error ? err.message : t('paymentPage.errors.loadPaymentDetailsFailed'));
      setLoading(false);
    }
  }, [API_URL, ensurePaymentIntent, loadScheduleProposals, loadAvailability, loadWorkingHours, router, t]);

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
        if (booking) {
          trackEvent('payment_authorized', {
            booking_id: bookingId,
            transaction_id: booking.bookingNumber || bookingId,
            value: booking.payment?.totalWithVat ?? booking.payment?.netAmount ?? booking.quote?.amount ?? 0,
            currency: (booking.payment?.currency || booking.quote?.currency || 'EUR').toUpperCase(),
          });
        }
        // Redirect to success page
        router.push(`/bookings/${bookingId}/payment/success`);
      } else {
        // Check if error is about payment already being captured
        if (data.error?.code === 'payment_intent_unexpected_state') {
          router.push(`/bookings/${bookingId}/payment/success`);
        } else {
          setError(data.error?.message || t('paymentPage.errors.paymentConfirmFailed'));
          setLoading(false);
        }
      }

    } catch (err) {
      console.error('Error confirming payment:', err);
      setError(err instanceof Error ? err.message : t('paymentPage.errors.confirmPaymentFailed'));
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

  const discountInfo = booking?.payment?.discount;
  // Payments are charged in the payment's own currency; formatting never converts.
  const paymentCurrency = booking?.payment?.currency?.toUpperCase() || 'EUR';
  const appliedDiscountDisplay = appliedDiscountCode === 'APPLIED'
    ? t('paymentPage.discount.appliedFallback')
    : appliedDiscountCode;
  const hasDiscountBreakdown = (discountInfo?.totalDiscount ?? 0) > 0;
  const persistedCodeLabel = discountInfo?.codeLabel ?? null;
  const persistedCodeAmount = discountInfo?.codeDiscountAmount ?? 0;
  const hasPersistedCode = !!persistedCodeLabel || persistedCodeAmount > 0;

  useEffect(() => {
    setAppliedDiscountCode((prev) => {
      if (persistedCodeLabel && prev !== persistedCodeLabel) return persistedCodeLabel;
      if (!persistedCodeLabel && hasPersistedCode && !prev) return 'APPLIED';
      if (!hasPersistedCode && prev) return null;
      return prev;
    });
  }, [persistedCodeLabel, hasPersistedCode]);
  const originalServiceAmount =
    discountInfo?.originalAmount ??
    booking?.quote?.amount ??
    booking?.payment?.netAmount ??
    0;
  const breakdownOptionsBaseTotal = selectedExtraOptions.reduce((sum, optionIndex) => {
    const opt = booking?.project?.extraOptions?.[optionIndex];
    const optionId = (opt as { _id?: string } | undefined)?._id;
    const persisted = Array.isArray(booking?.selectedExtraOptions)
      ? (booking?.selectedExtraOptions as Array<{ extraOptionId?: string; bookedPrice?: number } | number>).find(
          (e): e is { extraOptionId?: string; bookedPrice?: number } =>
            typeof e === 'object' && e?.extraOptionId === optionId
        )
      : undefined;
    const price = typeof persisted?.bookedPrice === 'number' ? persisted.bookedPrice : (opt?.price || 0);
    return sum + price;
  }, 0);
  const quoteAmount = Number(booking?.quote?.amount || 0);
  const snapshot = booking?.checkoutSnapshot;
  const extrasIncludedInQuote = (() => {
    if (breakdownOptionsBaseTotal <= 0) return false;
    if (
      snapshot &&
      Number(snapshot.extraOptionsTotal) > 0 &&
      Number.isFinite(Number(snapshot.totalAmount)) &&
      Math.abs(quoteAmount - Number(snapshot.totalAmount)) < 0.02
    ) {
      return true;
    }
    const baseSubtotal = Number(snapshot?.baseSubtotal);
    if (Number.isFinite(baseSubtotal) && Math.abs(quoteAmount - baseSubtotal) < 0.02) {
      return false;
    }
    return Number.isFinite(baseSubtotal) && Math.abs(quoteAmount - (baseSubtotal + breakdownOptionsBaseTotal)) < 0.02;
  })();
  const breakdownBaseTotal = extrasIncludedInQuote
    ? quoteAmount
    : quoteAmount + breakdownOptionsBaseTotal;
  const commissionedOptionsAmount =
    breakdownBaseTotal > 0 && breakdownOptionsBaseTotal > 0
      ? +((originalServiceAmount * breakdownOptionsBaseTotal) / breakdownBaseTotal).toFixed(2)
      : 0;
  const serviceOnlyAmount = +(originalServiceAmount - commissionedOptionsAmount).toFixed(2);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-6 text-lg font-medium text-gray-700">{t('paymentPage.loading.processingPayment')}</p>
          <p className="mt-2 text-sm text-gray-500">{t('paymentPage.loading.pleaseWait')}</p>
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('paymentPage.errorTitle')}</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              type="button"
              onClick={() => router.push('/bookings')}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700"
            >
              {t('paymentPage.backToBookings')}
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
              <h1 className="text-2xl font-bold text-white">{t('paymentPage.completeBooking')}</h1>
              <p className="text-blue-100 text-sm mt-1">
                {booking?.quotationNumber
                  ? t('paymentPage.quotationNumber', { number: booking.quotationNumber })
                  : t('paymentPage.bookingNumber', { number: booking?.bookingNumber || bookingId.slice(-6) })}
              </p>
            </div>

            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('paymentPage.summaryTitle')}</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('paymentPage.serviceLabel')}</span>
                  <span className="font-medium text-gray-900">
                    {booking?.project?.title || booking?.quote?.description || booking?.rfqDetails?.description || t('paymentPage.serviceFallback')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('paymentPage.professionalLabel')}</span>
                  <span className="font-medium text-gray-900">
                    {booking?.professional?.username || t('paymentPage.notAvailable')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {currentQuoteTotals ? t('paymentPage.quoteTotalInclVat') : t('paymentPage.quoteAmount')}
                  </span>
                  <span className="font-medium text-gray-900">
                    {customerPricingReady
                      ? formatMoney(
                          currentQuoteTotals?.total ?? customerPrice(booking?.quote?.amount ?? 0, booking?.checkoutSnapshot),
                          booking?.quote?.currency?.toUpperCase() || 'EUR'
                        )
                      : '...'}
                  </span>
                </div>
                {currentQuoteTotals && customerPricingReady && currentQuoteTotals.vatAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('paymentPage.vatIncluded')}</span>
                    <span className="text-gray-700">
                      {formatMoney(currentQuoteTotals.vatAmount, booking?.quote?.currency?.toUpperCase() || 'EUR')}
                    </span>
                  </div>
                )}
                {booking?.milestonePayments && booking.milestonePayments.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      {milestoneGrossAmounts.length > 0
                        ? t('paymentPage.milestonesInclVat')
                        : t('paymentPage.milestones')}
                    </p>
                    <div className="space-y-1">
                      {booking.milestonePayments.map((m, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-600">{m.title || t('paymentPage.milestoneFallback', { number: i + 1 })}</span>
                          <span className="text-gray-900">
                            {customerPricingReady
                              ? formatMoney(
                                  getMilestoneDisplayAmount(i, m.amount ?? 0),
                                  booking?.quote?.currency?.toUpperCase() || 'EUR'
                                )
                              : '...'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(typeof booking?.project?.minResources === 'number' || typeof booking?.project?.minOverlapPercentage === 'number') && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-1">{t('paymentPage.teamRequirement')}</p>
                    <p className="text-xs text-gray-600">
                      {typeof booking?.project?.minResources === 'number'
                        ? t('paymentPage.teamMembersRequired', { count: booking.project.minResources })
                        : t('paymentPage.teamSizeAsConfigured')}
                      {typeof booking?.project?.minOverlapPercentage === 'number'
                        ? t('paymentPage.teamOverlapSuffix', { percentage: booking.project.minOverlapPercentage })
                        : '.'}
                    </p>
                  </div>
                )}
                {loyaltyLoaded && loyalty && loyalty.percentage > 0 && booking?.quote?.amount != null && customerPricingReady && (() => {
                  const baseWithCommission = originalPrice(booking.quote.amount, booking.checkoutSnapshot);
                  const afterLoyalty = customerPrice(booking.quote.amount, booking.checkoutSnapshot);
                  const saving = Math.max(0, +(baseWithCommission - afterLoyalty).toFixed(2));
                  const currency = booking?.quote?.currency?.toUpperCase() || 'EUR';
                  return (
                    <div className="mt-3 pt-3 border-t rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-xs text-amber-800">
                        {t.rich('paymentPage.loyaltySummary', {
                          level: loyalty.level,
                          percent: loyalty.percentage,
                          strong: (chunks) => <strong>{chunks}</strong>,
                        })}
                        {saving > 0 && (
                          <>
                            <span className="mx-1">·</span>
                            {t.rich('paymentPage.savingWithAmount', {
                              amount: formatMoney(saving, currency),
                              strong: (chunks) => <strong>{chunks}</strong>,
                            })}
                          </>
                        )}
                      </p>
                    </div>
                  );
                })()}
                {(!loyaltyLoaded || !loyalty || loyalty.percentage <= 0) && (
                  <div className="mt-3 pt-3 border-t rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                    <p className="text-xs text-amber-800">
                      {t.rich('paymentPage.memberSavings', {
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('paymentPage.chooseStartDate')}</h2>
              <p className="text-sm text-gray-600 mb-4">
                {requiresProjectSchedule
                  ? t('paymentPage.scheduleIntroProject')
                  : t('paymentPage.scheduleIntroSimple')}
              </p>

              {availabilityData?.resourcePolicy && availabilityData.resourcePolicy.minResources > 1 && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">{t('paymentPage.teamRequirement')}</span>{' '}
                    {t('paymentPage.teamAvailabilityPolicy', {
                      min: availabilityData.resourcePolicy.minResources,
                      total: availabilityData.resourcePolicy.totalResources,
                      percentage: availabilityData.resourcePolicy.minOverlapPercentage,
                    })}
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {(loadingScheduleProposals || loadingAvailability || loadingWorkingHours) && (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('paymentPage.loadingAvailability')}
                  </div>
                )}
                {scheduleProposalsFailed && !loadingScheduleProposals && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {t('paymentPage.availabilityLoadFailed')}
                  </div>
                )}
                {requiresProjectSchedule && !loadingScheduleProposals && !scheduleProposals && !scheduleProposalsFailed && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    {t('paymentPage.waitingAvailability')}
                  </div>
                )}

                {!loadingScheduleProposals && !loadingAvailability && !loadingWorkingHours && (scheduleProposals || !requiresProjectSchedule) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {requiresProjectSchedule ? t('paymentPage.availableStartDate') : t('paymentPage.preferredStartDate')}
                    </label>
                    <div className="mt-2">
                      <button
                        type="button"
                        className="w-full flex items-center justify-start text-left font-normal h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => setShowCalendar(!showCalendar)}
                      >
                        <Calendar className="mr-2 h-4 w-4 text-gray-500" />
                        {selectedStartDate
                          ? format(parseISO(selectedStartDate), 'PPP', { locale: dateFns })
                          : t('paymentPage.selectDate')}
                      </button>

                      {showCalendar && (
                        <div className="mt-3 p-6 border rounded-lg bg-white shadow-xl">
                          <DayPicker
                            mode="single"
                            locale={dateFns}
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
                              <span>{t('paymentPage.calendar.weekend')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-red-100 border rounded line-through text-center text-red-900 opacity-50">X</div>
                              <span>{t('paymentPage.calendar.blocked')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-blue-500 border rounded"></div>
                              <span>{t('paymentPage.calendar.selected')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 border-2 border-blue-500 rounded"></div>
                              <span>{t('paymentPage.calendar.today')}</span>
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
                      {t('paymentPage.startTime')}
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
                      {t('paymentPage.hoursModeHint')}
                    </p>
                  </div>
                )}

                {scheduleProposals?.mode === 'days' && !selectedStartDate && shortestThroughputDetails && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-blue-900 font-semibold">
                        {t('paymentPage.shortestWindow')}{' '}
                        <span className="text-xs font-normal">
                          ({t('paymentPage.units.days', { count: shortestThroughputDetails.totalDays })})
                        </span>
                      </p>
                      <p className="text-xs text-blue-700">
                        {format(shortestThroughputDetails.startDate, 'PPP', { locale: dateFns })} -{' '}
                        {format(shortestThroughputDetails.endDate, 'PPP', { locale: dateFns })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {shortestWindowDates.map((day) => (
                        <span
                          key={day.toISOString()}
                          className="px-3 py-1 text-xs rounded-full bg-white border border-blue-200 text-blue-800"
                        >
                          {format(day, 'MMM d', { locale: dateFns })}
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
                      {t('paymentPage.useThisWindow')}
                    </button>
                  </div>
                )}

                {validatingScheduleSelection && requiresProjectSchedule && (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('paymentPage.validatingSchedule')}
                  </div>
                )}

                {scheduleValidationMessage && requiresProjectSchedule && !validatingScheduleSelection && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {scheduleValidationMessage}
                  </div>
                )}

                {hasValidatedProjectSelection && scheduleWindow && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 space-y-2">
                    <p className="font-medium">{t('paymentPage.slotAvailable')}</p>
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="font-medium">{t('paymentPage.startLabel')}</span>{' '}
                        {scheduleWindow.scheduledStartTime
                          ? t('paymentPage.startWithTime', {
                              date: formatInTimeZone(parseISO(scheduleWindow.scheduledStartDate), professionalTimezone, 'PPP', { locale: dateFns }),
                              time: scheduleWindow.scheduledStartTime,
                            })
                          : formatInTimeZone(parseISO(scheduleWindow.scheduledStartDate), professionalTimezone, 'PPP', { locale: dateFns })}
                      </p>
                      {(() => {
                        const quoted = getQuotedDurations(booking);
                        const parts: string[] = [];
                        const durationLabel = (value: number, unit: string) =>
                          unit === 'hours'
                            ? t('paymentPage.units.hours', { count: value })
                            : t('paymentPage.units.days', { count: value });
                        if (quoted.preparation?.value) parts.push(t('paymentPage.preparationValue', { duration: durationLabel(quoted.preparation.value, quoted.preparation.unit) }));
                        if (quoted.execution?.value) parts.push(t('paymentPage.executionValue', { duration: durationLabel(quoted.execution.value, quoted.execution.unit) }));
                        if (quoted.buffer?.value) parts.push(t('paymentPage.bufferValue', { duration: durationLabel(quoted.buffer.value, quoted.buffer.unit) }));
                        if (parts.length === 0) return null;
                        return <p><span className="font-medium">{t('paymentPage.durationBreakdown')}</span> {parts.join(' → ')}</p>;
                      })()}
                      <p>
                        <span className="font-medium">{t('paymentPage.executionEnds')}</span>{' '}
                        {formatInTimeZone(parseISO(scheduleWindow.scheduledExecutionEndDate), professionalTimezone, 'PPP', { locale: dateFns })}
                      </p>
                      {scheduleWindow.scheduledBufferEndDate && (
                        <p>
                          <span className="font-medium">{t('paymentPage.projectCompletion')}</span>{' '}
                          {formatInTimeZone(parseISO(scheduleWindow.scheduledBufferEndDate), professionalTimezone, 'PPP', { locale: dateFns })}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {projectExtraOptions.length > 0 && (
                  <div className="rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('paymentPage.extraOptions')}</h3>
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
                    {selectedOptionTotal > 0 && !extrasIncludedInQuote && (
                      <p className="mt-3 text-xs font-medium text-gray-700">
                        {t('paymentPage.selectedOptionsTotal')} {customerPricingReady
                          ? formatMoney(customerPrice(selectedOptionTotal), booking?.quote?.currency?.toUpperCase() || 'EUR')
                          : '...'}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('paymentPage.additionalNotes')} <span className="text-gray-400">{t('paymentPage.optional')}</span>
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    placeholder={t('paymentPage.notesPlaceholder')}
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
                  {savingSchedule ? t('paymentPage.saving') : t('paymentPage.continueToPayment')}
                </button>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-gray-400 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-500">
                  {t('paymentPage.scheduleFooterNote')}
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
            <h1 className="text-2xl font-bold text-white">{t('paymentPage.completePayment')}</h1>
            <p className="text-blue-100 text-sm mt-1">{t('paymentPage.bookingNumber', { number: booking?.bookingNumber || bookingId.slice(-6) })}</p>
          </div>

          {/* Booking Summary */}
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('paymentPage.summaryTitle')}</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('paymentPage.serviceLabel')}</span>
                <span className="font-medium text-gray-900">
                  {booking?.quote?.description || booking?.rfqDetails?.description || t('paymentPage.serviceFallback')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t('paymentPage.professionalLabel')}</span>
                <span className="font-medium text-gray-900">
                  {booking?.professional?.username || t('paymentPage.notAvailable')}
                </span>
              </div>
              {booking?.scheduledStartDate && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('paymentPage.startDateLabel')}</span>
                  <span className="font-medium text-gray-900">
                    {new Date(booking.scheduledStartDate).toLocaleDateString(intl)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('paymentPage.paymentDetails')}</h2>

            {booking?.payment?.status !== 'authorized' && booking?.payment?.status !== 'completed' && (
              <div className="mb-4 rounded-md border border-gray-200 bg-white px-3 py-3">
                {appliedDiscountCode ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {t('paymentPage.codeApplied')} <span className="font-mono text-green-700">{appliedDiscountDisplay}</span>
                        </p>
                        {(discountInfo?.codeDiscountAmount ?? 0) > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t('paymentPage.savingAmount', { amount: formatMoney(discountInfo?.codeDiscountAmount ?? 0, paymentCurrency) })}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveDiscountCode}
                        disabled={applyingCode || initializingPayment}
                        className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        {t('paymentPage.remove')}
                      </button>
                    </div>
                    {codeError && (
                      <p className="mt-2 text-sm text-red-600">{codeError}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="discount-code-input" className="block text-sm font-medium text-gray-700 mb-1">
                      {t('paymentPage.discount.haveCode')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="discount-code-input"
                        type="text"
                        value={discountCodeInput}
                        onChange={(e) => {
                          setDiscountCodeInput(e.target.value.toUpperCase());
                          if (codeError) setCodeError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleApplyDiscountCode();
                          }
                        }}
                        placeholder={t('paymentPage.discount.codePlaceholder')}
                        disabled={applyingCode || initializingPayment}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
                      />
                      <button
                        type="button"
                        onClick={handleApplyDiscountCode}
                        disabled={applyingCode || initializingPayment || !discountCodeInput.trim()}
                        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {applyingCode ? t('paymentPage.discount.applying') : t('paymentPage.discount.apply')}
                      </button>
                    </div>
                    {codeError && (
                      <p className="mt-2 text-sm text-red-600">{codeError}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {discountInfo?.loyaltyTier && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm font-medium text-amber-900">
                  {t('paymentPage.memberBenefitsApplied', { tier: discountInfo.loyaltyTier })}
                </p>
              </div>
            )}
            <div className="space-y-2">
              {(hasDiscountBreakdown || commissionedOptionsAmount > 0) && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('paymentPage.originalServiceAmount')}</span>
                  <span className="text-gray-900">
                    {formatMoney(serviceOnlyAmount, paymentCurrency)}
                  </span>
                </div>
              )}

              {commissionedOptionsAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('paymentPage.selectedOptions')}</span>
                  <span className="text-gray-900">
                    {formatMoney(commissionedOptionsAmount, paymentCurrency)}
                  </span>
                </div>
              )}

              {(discountInfo?.loyaltyAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {t('paymentPage.loyaltyDiscountLine', { percent: discountInfo?.loyaltyPercentage ?? 0 })}
                  </span>
                  <span className="text-green-700">
                    -{formatMoney(discountInfo?.loyaltyAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}

              {(discountInfo?.repeatBuyerAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {t('paymentPage.returningCustomerLine', { percent: discountInfo?.repeatBuyerPercentage ?? 0 })}
                  </span>
                  <span className="text-green-700">
                    -{formatMoney(discountInfo?.repeatBuyerAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}

              {(discountInfo?.pointsRedeemed ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {t('paymentPage.pointsRedeemedLine', { points: discountInfo?.pointsRedeemed ?? 0 })}
                  </span>
                  <span className="text-green-700">
                    -{formatMoney(discountInfo?.pointsDiscountAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}

              {(discountInfo?.codeDiscountAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {discountInfo?.codeLabel
                      ? t('paymentPage.discountCodeLineWithCode', { code: discountInfo.codeLabel })
                      : t('paymentPage.discountCodeLine')}
                  </span>
                  <span className="text-green-700">
                    -{formatMoney(discountInfo?.codeDiscountAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-gray-600">{t('paymentPage.serviceAmount')}</span>
                <span className="text-gray-900">
                  {formatMoney(booking?.payment?.netAmount ?? 0, paymentCurrency)}
                </span>
              </div>
              {booking?.payment?.vatBreakdown && booking.payment.vatBreakdown.length > 1 && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-1">
                  <p className="text-xs font-medium text-gray-700">{t('paymentPage.vatBreakdown')}</p>
                  {booking.payment.vatBreakdown.map((line, index) => (
                    <div key={`${line.description}-${index}`} className="flex justify-between text-xs">
                      <span className="text-gray-600">
                        {line.description} ({line.vatLabel || t('paymentPage.vatRateLabel', { rate: line.vatRate })})
                      </span>
                      <span className="text-gray-900">
                        {formatMoney(line.vatAmount, paymentCurrency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {(booking?.payment?.vatAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {booking?.payment?.vatBreakdown && booking.payment.vatBreakdown.length > 1
                      ? t('paymentPage.vatTotalLine')
                      : t('paymentPage.vatLine', { rate: booking?.payment?.vatRate ?? 0 })}
                  </span>
                  <span className="text-gray-900">
                    {formatMoney(booking?.payment?.vatAmount ?? 0, paymentCurrency)}
                  </span>
                </div>
              )}
              {booking?.payment?.reverseCharge && (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  {t('paymentPage.reverseCharge')}
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                <span className="text-lg font-semibold text-gray-900">{t('paymentPage.total')}</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatMoney(booking?.payment?.totalWithVat ?? 0, paymentCurrency)}
                </span>
              </div>
              {displayCurrency !== paymentCurrency && (
                <p className="text-right text-xs text-gray-500">
                  {t('paymentPage.chargeCurrencyNote', { currency: paymentCurrency })}
                </p>
              )}
            </div>
          </div>

          {/* Payment Form */}
          <div className="px-6 py-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('paymentPage.enterPaymentDetails')}</h2>

            {/* Check if payment is already completed - don't show form */}
            {booking?.payment?.status === 'authorized' || booking?.payment?.status === 'completed' ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-green-700 text-sm font-medium">{t('paymentPage.paymentAlreadyCompleted')}</p>
                </div>
                <p className="text-xs text-green-600 mt-2">{t('paymentPage.redirectingToConfirmation')}</p>
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
                <p className="text-blue-700 text-sm font-medium">{t('paymentPage.preparingPayment')}</p>
                <p className="text-xs text-blue-600 mt-1">
                  {t('paymentPage.attemptInfo', { attempt: paymentRetryAttempt, max: MAX_PAYMENT_RETRY_ATTEMPTS })}
                </p>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600">{error || t('paymentPage.unableToInitialize')}</p>
                <button
                  type="button"
                  onClick={() => void loadBookingPaymentDetails(bookingId, 1)}
                  className="mt-3 inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  {t('paymentPage.retryInitialization')}
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
                <p className="text-sm font-medium text-gray-700">{t('paymentPage.securePayment')}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {t('paymentPage.securePaymentBody')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
