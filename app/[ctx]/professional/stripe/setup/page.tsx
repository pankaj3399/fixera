'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
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
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" /></div>}>
      <StripeSetupContent />
    </Suspense>
  );
}

function StripeSetupContent() {
  const t = useTranslations('proArea');
  const getErrorText = useErrorMessage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get('source');
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
          setError(getErrorText(createData, t('stripePages.setup.createAccountFailed')));
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
          returnUrl: `${window.location.origin}/professional/stripe/complete${source ? `?source=${source}` : ''}`,
          refreshUrl: `${window.location.origin}/professional/stripe/refresh${source ? `?source=${source}` : ''}`,
        }),
      });

      const onboardingData = await onboardingResponse.json();

      if (!onboardingData.success) {
        setError(getErrorText(onboardingData, t('stripePages.setup.createLinkFailed')));
        setLoading(false);
        return;
      }

      // Redirect to Stripe onboarding
      window.location.href = onboardingData.data.url;

    } catch (err) {
      setError(getErrorText(err, t('stripePages.shared.anErrorOccurred')));
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
          <p className="mt-4 text-gray-600">{t('stripePages.setup.checking')}</p>
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
            {t('stripePages.setup.title')}
          </h1>
          <p className="text-gray-600 mb-8">
            {t('stripePages.setup.subtitle')}
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
                    <h3 className="text-green-800 font-medium">{t('stripePages.setup.connectedTitle')}</h3>
                    <p className="text-green-700 text-sm mt-1">
                      {t('stripePages.setup.connectedBody')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-gray-500">{t('stripePages.setup.chargesEnabled')}</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {accountStatus.chargesEnabled ? t('common.yes') : t('common.no')}
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-gray-500">{t('stripePages.setup.payoutsEnabled')}</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {accountStatus.payoutsEnabled ? t('common.yes') : t('common.no')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoToDashboard}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700"
              >
                {t('stripePages.setup.openDashboard')}
              </button>

              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50"
              >
                {t('stripePages.shared.backToDashboard')}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-blue-900 font-semibold mb-3">{t('stripePages.setup.whatYouNeed')}</h3>
                <ul className="space-y-2 text-blue-800">
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {t('stripePages.setup.needBusiness')}
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {t('stripePages.setup.needBank')}
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {t('stripePages.setup.needId')}
                  </li>
                </ul>
              </div>

              <div className="border-l-4 border-yellow-400 bg-yellow-50 p-4">
                <p className="text-sm text-yellow-800">
                  {t('stripePages.setup.redirectNotice')}
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
                    {t('stripePages.setup.connecting')}
                  </>
                ) : (
                  t('stripePages.setup.connect')
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                {t('stripePages.setup.terms')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
