/**
 * Stripe Account Status Component
 * Shows professional's Stripe account connection status
 */

import React from 'react';

interface StripeAccountStatusProps {
  hasAccount: boolean;
  isFullyOnboarded: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  accountStatus: 'pending' | 'active' | 'restricted' | 'rejected';
}

export function StripeAccountStatus({
  hasAccount,
  isFullyOnboarded,
  chargesEnabled,
  payoutsEnabled,
  accountStatus,
}: StripeAccountStatusProps) {
  if (!hasAccount) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center">
          <svg className="h-5 w-5 text-yellow-600 mr-2" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium text-yellow-800">
            No Stripe account connected
          </span>
        </div>
      </div>
    );
  }

  if (!isFullyOnboarded) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center">
          <svg className="h-5 w-5 text-yellow-600 mr-2" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-yellow-800">
            Stripe setup incomplete
          </span>
        </div>
      </div>
    );
  }

  if (accountStatus === 'restricted') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <svg className="h-5 w-5 text-red-600 mr-2" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium text-red-800">
            Stripe account restricted
          </span>
        </div>
      </div>
    );
  }

  if (accountStatus === 'rejected') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <svg className="h-5 w-5 text-red-600 mr-2" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-sm font-medium text-red-800">
            Stripe account rejected
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <svg className="h-5 w-5 text-green-600 mr-2" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium text-green-800">
            Stripe account connected
          </span>
        </div>
        <div className="flex space-x-2">
          {chargesEnabled && (
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
              Charges
            </span>
          )}
          {payoutsEnabled && (
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
              Payouts
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default StripeAccountStatus;
