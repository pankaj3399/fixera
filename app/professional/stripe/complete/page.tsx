'use client';

/**
 * Stripe Onboarding Complete Page
 * Return page after Stripe onboarding completion
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AccountStatus {
  onboardingCompleted?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  payouts_enabled?: boolean;
  detailsSubmitted?: boolean;
}

export default function StripeCompletePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'success' | 'incomplete' | 'error'>('checking');
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  useEffect(() => {
    checkOnboardingStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/stripe/connect/account-status`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setAccountStatus(data.data);
        const payoutsReady = Boolean(data.data.payoutsEnabled ?? data.data.payouts_enabled);

        if (data.data.onboardingCompleted && data.data.chargesEnabled && payoutsReady) {
          setStatus('success');
        } else if (data.data.onboardingCompleted && data.data.chargesEnabled && !payoutsReady) {
          setStatus('incomplete');
        } else {
          setStatus('incomplete');
        }
      } else {
        setStatus('error');
      }
    } catch (err) {
      console.error('Error checking status:', err);
      setStatus('error');
    }
  };

  const handleContinueOnboarding = () => {
    router.push('/professional/stripe/setup');
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying your Stripe account...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Stripe Account Connected!
          </h1>
          <p className="text-gray-600 mb-6">
            Your account is fully set up and ready to receive payments from customers
          </p>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Charges Enabled:</span>
                <span className="text-sm font-medium text-green-700">
                  {accountStatus?.chargesEnabled ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Payouts Enabled:</span>
                <span className="text-sm font-medium text-green-700">
                  {(accountStatus?.payoutsEnabled ?? accountStatus?.payouts_enabled) ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoToDashboard}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 mb-3"
          >
            Go to Dashboard
          </button>

          <p className="text-xs text-gray-500">
            You can now accept bookings and receive payments
          </p>
        </div>
      </div>
    );
  }

  if (status === 'incomplete') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-4">
            <svg className="h-10 w-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Setup Incomplete
          </h1>
          <p className="text-gray-600 mb-6">
            Your Stripe account setup is not fully complete. You need to finish the onboarding process to receive payments.
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-yellow-800 mb-2">Missing information:</p>
            <ul className="text-sm text-yellow-700 space-y-1">
              {!accountStatus?.detailsSubmitted && (
                <li>- Business details not submitted</li>
              )}
              {!accountStatus?.chargesEnabled && (
                <li>- Charges not enabled</li>
              )}
              {!(accountStatus?.payoutsEnabled ?? accountStatus?.payouts_enabled) && (
                <li>- Payouts not enabled</li>
              )}
            </ul>
          </div>

          <button
            type="button"
            onClick={handleContinueOnboarding}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 mb-3"
          >
            Continue Setup
          </button>

          <button
            type="button"
            onClick={handleGoToDashboard}
            className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50"
          >
            Skip for Now
          </button>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
          <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Something Went Wrong
        </h1>
        <p className="text-gray-600 mb-6">
          We couldn&apos;t verify your Stripe account status. Please try again.
        </p>

        <button
          type="button"
          onClick={handleContinueOnboarding}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 mb-3"
        >
          Try Again
        </button>

        <button
          type="button"
          onClick={handleGoToDashboard}
          className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

