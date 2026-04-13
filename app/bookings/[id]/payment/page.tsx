'use client';

/**
 * Booking Payment Page
 * Customer payment page for a specific booking
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { StripeProvider } from '@/components/stripe/StripeProvider';
import { PaymentForm } from '@/components/stripe/PaymentForm';
import { FileText, Loader2 } from 'lucide-react';
import type { ProjectAttachmentRef, ProjectDto } from '@/types/project';
import { useCommissionRate } from '@/hooks/useCommissionRate';

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
  executionDuration?: { value: number; unit: 'hours' | 'days' };
  preparationDuration?: { value: number; unit: 'hours' | 'days' };
  selectedExtraOptions?: Array<{ extraOptionId: string; bookedPrice: number } | number>;
  postBookingData?: Array<{
    questionId: string;
    question: string;
    answer: string;
  }>;
}

interface ScheduleProposals {
  mode: 'hours' | 'days';
  earliestBookableDate: string;
  earliestProposal?: {
    start: string;
    end: string;
    executionEnd: string;
  };
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
  const { customerPrice } = useCommissionRate();

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
  const [postBookingAnswers, setPostBookingAnswers] = useState<Record<number, string>>({});
  const [uploadingPostBookingQuestionIndexes, setUploadingPostBookingQuestionIndexes] = useState<Set<number>>(new Set());
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

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

  const handleAnswerChange = (index: number, answer: string) => {
    setPostBookingAnswers((prev) => ({ ...prev, [index]: answer }));
  };

  const handlePostBookingAttachmentUpload = async (index: number, file: File | null) => {
    if (!file || !booking?.project?._id) return;

    setUploadingPostBookingQuestionIndexes((prev) => new Set(prev).add(index));
    try {
      const formData = new FormData();
      formData.append('attachment', file);
      formData.append('projectId', booking.project._id);
      formData.append(
        'questionId',
        booking.project.postBookingQuestions?.[index]?._id ||
          booking.project.postBookingQuestions?.[index]?.id ||
          `post-booking-${index}`
      );

      const response = await fetch(`${API_URL}/api/user/projects/upload/attachment`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json();
      if (response.ok && data?.success && data?.data?.url) {
        handleAnswerChange(index, data.data.url);
      } else {
        setError(data?.message || 'Failed to upload attachment');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload attachment');
    } finally {
      setUploadingPostBookingQuestionIndexes((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
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
      if (currentBooking?.executionDuration?.value != null) {
        params.set('executionValue', String(currentBooking.executionDuration.value));
        if (currentBooking.executionDuration.unit) {
          params.set('executionUnit', currentBooking.executionDuration.unit);
        }
      }
      if (currentBooking?.preparationDuration?.value != null) {
        params.set('preparationValue', String(currentBooking.preparationDuration.value));
        if (currentBooking.preparationDuration.unit) {
          params.set('preparationUnit', currentBooking.preparationDuration.unit);
        }
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

  useEffect(() => {
    if (!scheduleStep || !booking?.project?._id || !scheduleProposals) {
      return;
    }

    const fallbackDate = scheduleProposals.earliestBookableDate.slice(0, 10);
    const proposalDate = scheduleProposals.earliestProposal?.start?.slice(0, 10) || fallbackDate;
    const proposalTime = scheduleProposals.earliestProposal?.start?.slice(11, 16) || '';

    setSelectedStartDate((prev) => prev || proposalDate);

    if (scheduleProposals.mode === 'hours') {
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
        if (booking?.executionDuration?.value != null) {
          params.set('executionValue', String(booking.executionDuration.value));
          if (booking.executionDuration.unit) {
            params.set('executionUnit', booking.executionDuration.unit);
          }
        }
        if (booking?.preparationDuration?.value != null) {
          params.set('preparationValue', String(booking.preparationDuration.value));
          if (booking.preparationDuration.unit) {
            params.set('preparationUnit', booking.preparationDuration.unit);
          }
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

      if (uploadingPostBookingQuestionIndexes.size > 0) {
        setError('Please wait for all uploads to finish before continuing.');
        return;
      }
      const postBookingQuestions = booking?.project?.postBookingQuestions || [];
      if (postBookingQuestions.length > 0) {
        const missingRequired = postBookingQuestions.some((question, index) => {
          if (!question.isRequired) return false;
          return !postBookingAnswers[index]?.trim();
        });

        if (missingRequired) {
          setError('Please answer all required post-booking questions before continuing.');
          return;
        }

        const answers = postBookingQuestions
          .map((question, index) => ({
            questionId: question._id || question.id || `post-booking-${index}`,
            question: question.question,
            answer: postBookingAnswers[index] || '',
          }))
          .filter((answer) => answer.answer.trim());

        if (answers.length > 0) {
          const answersResponse = await fetch(`${API_URL}/api/bookings/${encodeURIComponent(bookingId)}/post-booking-answers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ answers }),
          });
          const answersData = await answersResponse.json();
          if (!answersResponse.ok || !answersData?.success) {
            setError(answersData?.msg || 'Failed to save post-booking answers');
            return;
          }
          setBooking((prev) => prev ? { ...prev, postBookingData: answersData.postBookingData || answers } : prev);
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
      if (Array.isArray(bookingInfo?.postBookingData) && bookingInfo.postBookingData.length > 0) {
        const savedLookup = new Map(
          bookingInfo.postBookingData.map((a: { questionId: string; answer: string }) => [a.questionId, a.answer])
        );
        const questions = bookingInfo?.project?.postBookingQuestions || [];
        const hydratedAnswers = questions.reduce<Record<number, string>>((acc, q, index) => {
          const qid = q._id || q.id || `post-booking-${index}`;
          const saved = savedLookup.get(qid);
          if (saved) acc[index] = saved;
          return acc;
        }, {});
        setPostBookingAnswers(hydratedAnswers);
      } else {
        setPostBookingAnswers({});
      }
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
  }, [API_URL, ensurePaymentIntent, loadScheduleProposals, router]);

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
    const postBookingQuestions = booking?.project?.postBookingQuestions || [];
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
                    {booking?.professional?.businessInfo?.companyName
                      || booking?.professional?.name
                      || booking?.professional?.username
                      || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Quote Amount:</span>
                  <span className="font-medium text-gray-900">
                    {formatMoney(customerPrice(booking?.quote?.amount ?? 0), booking?.quote?.currency?.toUpperCase() || 'EUR')}
                  </span>
                </div>
                {booking?.milestonePayments && booking.milestonePayments.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">Milestones:</p>
                    <div className="space-y-1">
                      {booking.milestonePayments.map((m, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-600">{m.title || `Milestone ${i + 1}`}</span>
                          <span className="text-gray-900">{formatMoney(customerPrice(m.amount ?? 0), booking?.quote?.currency?.toUpperCase() || 'EUR')}</span>
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Start Date</h2>
              <p className="text-sm text-gray-600 mb-4">
                {requiresProjectSchedule
                  ? 'Choose an available slot based on the linked project schedule.'
                  : 'Choose when you would like the work to begin.'}
              </p>

              <div className="space-y-4">
                {loadingScheduleProposals && (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking project availability...
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
                {scheduleProposals?.earliestBookableDate && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                    <p>
                      Earliest schedulable date: <span className="font-semibold">{scheduleProposals.earliestBookableDate.slice(0, 10)}</span>
                    </p>
                  </div>
                )}
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                    {requiresProjectSchedule ? 'Available Start Date' : 'Preferred Start Date'}
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    min={minDate}
                    value={selectedStartDate}
                    onChange={(e) => setSelectedStartDate(e.target.value)}
                    disabled={requiresProjectSchedule && (!scheduleProposals || loadingScheduleProposals)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {scheduleMode === 'hours' && (
                  <div>
                    <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
                      Start Time
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
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                    Selected slot is available and ready to book.
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
                                {formatMoney(option.price || 0, booking?.quote?.currency?.toUpperCase() || 'EUR')}
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
                        Selected options total: {formatMoney(selectedOptionTotal, booking?.quote?.currency?.toUpperCase() || 'EUR')}
                      </p>
                    )}
                  </div>
                )}

                {postBookingQuestions.length > 0 && (
                  <div className="rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Post-Booking Questions</h3>
                    <div className="space-y-4">
                      {postBookingQuestions.map((question, index) => (
                        <div key={question._id || question.id || index}>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            {question.question}
                            {question.isRequired && <span className="ml-1 text-red-500">*</span>}
                          </label>

                          {(question.professionalAttachments?.length ?? 0) > 0 && (
                            <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                              <p className="mb-2 text-xs font-semibold text-blue-900">
                                Files from the professional
                              </p>
                              <div className="space-y-1">
                                {question.professionalAttachments?.map((attachment, attachmentIndex) => {
                                  const attachmentUrl = getAttachmentUrl(attachment);
                                  return (
                                    <a
                                      key={
                                        typeof attachment === 'string'
                                          ? `${question._id || question.id || index}-${attachmentIndex}`
                                          : attachment._id || `${question._id || question.id || index}-${attachmentIndex}`
                                      }
                                      href={attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="inline-flex items-center text-sm text-blue-700 hover:underline"
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      {getAttachmentLabel(attachment, attachmentIndex)}
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {question.type === 'text' && (
                            <textarea
                              rows={3}
                              value={postBookingAnswers[index] || ''}
                              onChange={(e) => handleAnswerChange(index, e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          )}

                          {question.type === 'multiple_choice' && (
                            <div className="space-y-2">
                              {(question.options || []).map((option) => (
                                <label key={option} className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="radio"
                                    name={`post-booking-${index}`}
                                    checked={postBookingAnswers[index] === option}
                                    onChange={() => handleAnswerChange(index, option)}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          {question.type === 'attachment' && (
                            <div className="rounded-lg border border-dashed border-gray-300 p-3">
                              <input
                                type="file"
                                accept=".pdf,image/*"
                                disabled={uploadingPostBookingQuestionIndexes.has(index)}
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  void handlePostBookingAttachmentUpload(index, file);
                                  e.currentTarget.value = '';
                                }}
                                className="w-full text-sm"
                              />
                              {uploadingPostBookingQuestionIndexes.has(index) && (
                                <div className="mt-2 inline-flex items-center text-xs text-blue-600">
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  Uploading...
                                </div>
                              )}
                              {postBookingAnswers[index] && (
                                <a
                                  href={postBookingAnswers[index]}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="mt-2 inline-flex text-sm text-blue-600 hover:underline"
                                >
                                  Open uploaded attachment
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
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
                  {booking?.professional?.businessInfo?.companyName
                    || booking?.professional?.name
                    || booking?.professional?.username
                    || 'N/A'}
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
