'use client';

/**
 * Payment Success Page
 * Shown after successful payment authorization
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ProjectDto } from '@/types/project';
import { useCurrency } from '@/contexts/CurrencyContext';
import { trackCompleteBooking } from '@/lib/analytics';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
if (!API_URL && process.env.NODE_ENV !== 'production') {
  throw new Error('NEXT_PUBLIC_BACKEND_URL must be set for the payment success page.');
}

const PAYMENT_STATUS_LABELS = {
  idle: 'paymentStatus.idle',
  authenticating: 'paymentStatus.authenticating',
  processing: 'paymentStatus.processing',
  success: 'paymentStatus.success',
  error: 'paymentStatus.error',
  pending: 'paymentStatus.pending',
  authorized: 'paymentStatus.authorized',
  completed: 'paymentStatus.completed',
  failed: 'paymentStatus.failed',
  refunded: 'paymentStatus.refunded',
  partially_refunded: 'paymentStatus.partiallyRefunded',
  expired: 'paymentStatus.expired',
} as const;

interface BookingPayment {
  currency?: string;
  totalWithVat?: number;
  status?: string;
}

interface Booking {
  bookingNumber?: string;
  payment?: BookingPayment;
  quote?: {
    amount?: number;
    currency?: string;
    description?: string;
  };
  project?: {
    _id?: string;
    title?: string;
    category?: string;
    service?: string;
    postBookingQuestions?: ProjectDto['postBookingQuestions'];
  };
  selectedSubprojectIndex?: number;
}

export default function PaymentSuccessPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;
  const t = useTranslations('checkout');
  const { formatMoney } = useCurrency();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBookingDetails = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL || ''}/api/bookings/${encodeURIComponent(bookingId)}`, {
        credentials: 'include',
      });

      let data: { success?: boolean; booking?: Booking; msg?: string } | null = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      }

      if (!response.ok) {
        const message = data?.msg || `${response.status} ${response.statusText}`;
        throw new Error(`Failed to load booking details: ${message}`);
      }

      if (data?.success && data.booking) {
        trackCompleteBooking(bookingId, data.booking);
        const hasQuestions =
          Array.isArray(data.booking.project?.postBookingQuestions) &&
          data.booking.project.postBookingQuestions.length > 0;
        if (hasQuestions) {
          router.replace(`/bookings/${bookingId}?postBookingQuestions=true`);
          return;
        }
        setBooking(data.booking);
      }
    } catch (err) {
      console.error('Error loading booking:', err);
    } finally {
      setLoading(false);
    }
  }, [bookingId, router]);

  useEffect(() => {
    void loadBookingDetails();
  }, [loadBookingDetails]);

  const paymentStatus = booking?.payment?.status;
  const paymentStatusLabel = paymentStatus
    ? PAYMENT_STATUS_LABELS[paymentStatus as keyof typeof PAYMENT_STATUS_LABELS]
    : PAYMENT_STATUS_LABELS.authorized;
  const paymentAmount = typeof booking?.payment?.totalWithVat === 'number'
    ? formatMoney(booking.payment.totalWithVat, booking.payment?.currency)
    : t('paymentSuccess.notAvailable');

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 pt-24 pb-6">
      <div className="max-w-md w-full max-h-[calc(100vh-7rem)] overflow-y-auto bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <svg
              className="h-10 w-10 text-green-600"
              role="img"
              aria-label={t('paymentSuccess.paymentSuccessful')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t('paymentSuccess.title')}
          </h1>
          <p className="text-gray-600 mb-6">
            {t('paymentSuccess.body')}
          </p>

          {!loading && booking && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">{t('paymentSuccess.bookingDetails')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('paymentSuccess.bookingNumberLabel')}</span>
                  <span className="font-medium text-gray-900">
                    {booking.bookingNumber || bookingId.slice(-6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('paymentSuccess.amountAuthorized')}</span>
                  <span className="font-medium text-gray-900">
                    {paymentAmount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('paymentSuccess.statusLabel')}</span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {paymentStatusLabel ? t(paymentStatusLabel) : paymentStatus}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center">
              <svg className="h-5 w-5 mr-2" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('paymentSuccess.whatNextTitle')}
            </h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li className="flex items-start">
                <span className="font-bold mr-2">1.</span>
                <span>{t('paymentSuccess.nextStep1')}</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">2.</span>
                <span>{t('paymentSuccess.nextStep2')}</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">3.</span>
                <span>{t('paymentSuccess.nextStep3')}</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">4.</span>
                <span>{t('paymentSuccess.nextStep4')}</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/bookings/${bookingId}`)}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 mb-3"
          >
            {t('paymentSuccess.viewBooking')}
          </button>

          <button
            type="button"
            onClick={() => router.push('/bookings')}
            className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50"
          >
            {t('paymentSuccess.backToAllBookings')}
          </button>

          <p className="text-xs text-gray-500 mt-4">
            {t('paymentSuccess.footnote')}
          </p>
        </div>
      </div>
    </div>
  );
}
