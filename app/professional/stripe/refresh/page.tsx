'use client';

/**
 * Stripe Onboarding Refresh Page
 * When onboarding link expires, user is redirected here
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StripeRefreshPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const handleCreateNewLink = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/stripe/connect/create-onboarding-link`, {
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

      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to create new onboarding link');
        setLoading(false);
        return;
      }

      // Redirect to new onboarding link
      window.location.href = data.data.url;

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-4">
          <svg className="h-10 w-10 text-yellow-600" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Onboarding Link Expired
        </h1>
        <p className="text-gray-600 mb-6">
          Your Stripe onboarding link has expired. Don&apos;t worry - we can generate a new one for you to continue where you left off.
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleCreateNewLink}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center mb-3"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Creating new link...
            </>
          ) : (
            'Continue Setup'
          )}
        </button>

        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50"
        >
          Back to Dashboard
        </button>

        <p className="text-xs text-gray-500 mt-4">
          Your progress is saved. The new link will take you back to where you left off.
        </p>
      </div>
    </div>
  );
}
