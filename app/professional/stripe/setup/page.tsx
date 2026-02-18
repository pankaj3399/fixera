'use client';

/**
 * Professional Stripe Setup Page
 * Initial page for professionals to connect their Stripe account
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface AccountStatus {
  hasAccount?: boolean;
  isFullyOnboarded?: boolean;
  onboardingCompleted?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  accountStatus?: string;
}

export default function StripeSetupPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const checkAccountStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/stripe/connect/account-status`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.data) {
          setAccountStatus({
            ...data.data,
            hasAccount: true,
            isFullyOnboarded: data.data.onboardingCompleted && data.data.chargesEnabled,
          });
        }
      }
    } catch (err) {
      console.error('Error checking account status:', err);
    } finally {
      setCheckingStatus(false);
    }
  }, [API_URL]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.replace('/login?redirect=/professional/stripe/setup');
      setCheckingStatus(false);
      return;
    }

    if (user?.role !== 'professional') {
      router.replace('/dashboard');
      setCheckingStatus(false);
      return;
    }

    checkAccountStatus();
  }, [authLoading, checkAccountStatus, isAuthenticated, router, user?.role]);

  const handleConnectStripe = async () => {
    setLoading(true);
    setError('');

    try {
      // Create account if doesn't exist
      if (!accountStatus?.hasAccount) {
        const createResponse = await fetch(`${API_URL}/api/stripe/connect/create-account`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        const createData = await createResponse.json();

        if (!createData.success) {
          setError(createData.error?.message || 'Failed to create Stripe account');
          setLoading(false);
          return;
        }
        setAccountStatus((prev) => ({
          ...(prev || {}),
          hasAccount: true,
        }));
      }

      // Get onboarding link
      const onboardingResponse = await fetch(`${API_URL}/api/stripe/connect/create-onboarding-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/professional/stripe/complete`,
          refreshUrl: `${window.location.origin}/professional/stripe/refresh`,
        }),
      });

      const onboardingData = await onboardingResponse.json();

      if (!onboardingData.success) {
        setError(onboardingData.error?.message || 'Failed to create onboarding link');
        setLoading(false);
        return;
      }

      // Redirect to Stripe onboarding
      window.location.href = onboardingData.data.url;

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const handleGoToDashboard = async () => {
    try {
      const response = await fetch(`${API_URL}/api/stripe/connect/dashboard-link`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        window.open(data.data.url, '_blank');
      }
    } catch (err) {
      console.error('Error opening dashboard:', err);
    }
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking account status...</p>
        </div>
      </div>
    );
  }

  if (!authLoading && (!isAuthenticated || user?.role !== 'professional')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Connect Your Stripe Account
          </h1>
          <p className="text-gray-600 mb-8">
            Start receiving payments from customers by connecting your Stripe account
          </p>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {accountStatus?.isFullyOnboarded ? (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-green-800 font-medium">Account Connected</h3>
                    <p className="text-green-700 text-sm mt-1">
                      Your Stripe account is fully set up and ready to receive payments
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-gray-500">Charges Enabled</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {accountStatus.chargesEnabled ? 'Yes' : 'No'}
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-gray-500">Payouts Enabled</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {accountStatus.payoutsEnabled ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoToDashboard}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700"
              >
                Open Stripe Dashboard
              </button>

              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50"
              >
                Back to Dashboard
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-blue-900 font-semibold mb-3">What you&apos;ll need:</h3>
                <ul className="space-y-2 text-blue-800">
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Business information (name, address, tax ID)
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Bank account details for payouts
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Personal identification (passport or ID card)
                  </li>
                </ul>
              </div>

              <div className="border-l-4 border-yellow-400 bg-yellow-50 p-4">
                <p className="text-sm text-yellow-800">
                  You&apos;ll be redirected to Stripe&apos;s secure platform to complete the setup process. This typically takes 5-10 minutes.
                </p>
              </div>

              <button
                type="button"
                onClick={handleConnectStripe}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Connecting...
                  </>
                ) : (
                  'Connect with Stripe'
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                By connecting, you agree to Stripe&apos;s Terms of Service and Privacy Policy
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
