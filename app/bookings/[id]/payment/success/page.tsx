'use client';

/**
 * Payment Success Page
 * Shown after successful payment authorization
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
if (!API_URL && process.env.NODE_ENV !== 'production') {
  throw new Error('NEXT_PUBLIC_BACKEND_URL must be set for the payment success page.');
}

interface BookingPayment {
  currency?: string;
  totalWithVat?: number;
  status?: string;
}

interface Booking {
  bookingNumber?: string;
  payment?: BookingPayment;
}

export default function PaymentSuccessPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;

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
        setBooking(data.booking);
      }
    } catch (err) {
      console.error('Error loading booking:', err);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void loadBookingDetails();
  }, [loadBookingDetails]);

  const paymentCurrency = booking?.payment?.currency
    ? booking.payment.currency.toUpperCase()
    : 'N/A';
  const paymentAmount = typeof booking?.payment?.totalWithVat === 'number'
    ? booking.payment.totalWithVat.toFixed(2)
    : 'N/A';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <svg
              className="h-10 w-10 text-green-600"
              role="img"
              aria-label="Payment successful"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Authorized!
          </h1>
          <p className="text-gray-600 mb-6">
            Your payment has been successfully authorized. The funds are securely held until the service is completed.
          </p>

          {!loading && booking && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">Booking Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Booking #:</span>
                  <span className="font-medium text-gray-900">
                    {booking.bookingNumber || bookingId.slice(-6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount Authorized:</span>
                  <span className="font-medium text-gray-900">
                    {paymentCurrency} {paymentAmount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {booking.payment?.status || 'Authorized'}
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
              What happens next?
            </h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li className="flex items-start">
                <span className="font-bold mr-2">1.</span>
                <span>The professional will be notified and will start working on your project</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">2.</span>
                <span>Your payment is held securely in escrow</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">3.</span>
                <span>Once the work is complete, you&apos;ll confirm completion</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">4.</span>
                <span>The professional will then receive their payment</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/bookings/${bookingId}`)}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 mb-3"
          >
            View Booking Details
          </button>

          <button
            type="button"
            onClick={() => router.push('/bookings')}
            className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50"
          >
            Back to All Bookings
          </button>

          <p className="text-xs text-gray-500 mt-4">
            Your payment is protected by Stripe. You will only be charged once the service is completed and confirmed.
          </p>
        </div>
      </div>
    </div>
  );
}
