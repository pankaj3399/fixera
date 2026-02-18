'use client';

/**
 * Payment Failed Page
 * Shown when payment fails
 */

import React, { Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';

function PaymentFailedContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const bookingId = params.id as string;

  const errorMessage = searchParams.get('error') || 'Payment failed. Please try again.';

  const handleTryAgain = () => {
    router.push(`/bookings/${bookingId}/payment`);
  };

  const handleContactSupport = () => {
    router.push('/support');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
            <svg
              className="h-10 w-10 text-red-600"
              role="img"
              aria-label="Payment failed"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <title>Payment failed</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Failed
          </h1>
          <p className="text-gray-600 mb-6">
            {errorMessage}
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-yellow-900 mb-2">Common reasons for payment failure:</h3>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>- Insufficient funds in your account</li>
              <li>- Card declined by your bank</li>
              <li>- Incorrect card details</li>
              <li>- Card expired or reached its limit</li>
              <li>- 3D Secure authentication failed</li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-blue-900 mb-2">What you can do:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>- Try a different payment method</li>
              <li>- Contact your bank to authorize the payment</li>
              <li>- Verify your card details are correct</li>
              <li>- Check your card has sufficient funds</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleTryAgain}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 mb-3"
          >
            Try Again
          </button>

          <button
            type="button"
            onClick={() => router.push(`/bookings/${bookingId}`)}
            className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 mb-3"
          >
            Back to Booking
          </button>

          <button
            type="button"
            onClick={handleContactSupport}
            className="w-full text-blue-600 py-2 px-4 rounded-lg font-medium hover:bg-blue-50"
          >
            Contact Support
          </button>

          <p className="text-xs text-gray-500 mt-4">
            No charges were made to your account. Your payment information is secure.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <PaymentFailedContent />
    </Suspense>
  );
}
