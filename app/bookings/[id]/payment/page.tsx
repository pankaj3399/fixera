'use client';

/**
 * Booking Payment Page
 * Customer payment page for a specific booking
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { StripeProvider } from '@/components/stripe/StripeProvider';
import { PaymentForm } from '@/components/stripe/PaymentForm';

interface BookingPayment {
  stripeClientSecret?: string;
  currency?: string;
  netAmount?: number;
  vatAmount?: number;
  vatRate?: number;
  totalWithVat?: number;
  status?: string;
}

interface BookingQuote {
  description?: string;
}

interface BookingProfessional {
  name?: string;
}

interface BookingRfqDetails {
  description?: string;
}

interface Booking {
  bookingNumber?: string;
  payment?: BookingPayment;
  quote?: BookingQuote;
  rfqDetails?: BookingRfqDetails;
  professional?: BookingProfessional;
  scheduledStartDate?: string;
  status?: string;
}

const MAX_PAYMENT_RETRY_ATTEMPTS = 3;
const PAYMENT_RETRY_DELAY_MS = 2000;

export default function BookingPaymentPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [initializingPayment, setInitializingPayment] = useState(false);
  const [paymentRetryAttempt, setPaymentRetryAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

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
      setLoading(false);

      // Check if payment is already authorized or completed
      if (bookingInfo?.payment?.status === 'authorized' || bookingInfo?.payment?.status === 'completed') {
        router.push(`/bookings/${currentBookingId}/payment/success`);
        return;
      }

      // Check if payment intent already exists and is in a valid state
      if (bookingInfo?.payment?.stripeClientSecret) {
        const paymentStatus = bookingInfo.payment.status || 'pending';
        // Only use existing client secret if payment is pending or in a retriable state
        if (!['failed', 'refunded', 'expired'].includes(paymentStatus)) {
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
  }, [API_URL, ensurePaymentIntent, router]);

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
                  {booking?.professional?.name || 'N/A'}
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
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Service Amount:</span>
                <span className="text-gray-900">
                  {(booking?.payment?.currency?.toUpperCase() || 'EUR')}{" "}
                  {booking?.payment?.netAmount != null ? booking.payment.netAmount.toFixed(2) : '0.00'}
                </span>
              </div>
              {(booking?.payment?.vatAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">VAT ({booking?.payment?.vatRate}%):</span>
                  <span className="text-gray-900">
                  {(booking?.payment?.currency?.toUpperCase() || 'EUR')}{" "}
                  {booking?.payment?.vatAmount != null ? booking.payment.vatAmount.toFixed(2) : '0.00'}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                <span className="text-lg font-semibold text-gray-900">Total:</span>
                <span className="text-lg font-bold text-gray-900">
                  {(booking?.payment?.currency?.toUpperCase() || 'EUR')}{" "}
                  {booking?.payment?.totalWithVat != null ? booking.payment.totalWithVat.toFixed(2) : '0.00'}
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
