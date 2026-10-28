'use client';

/**
 * Stripe Provider Component
 * Wraps the app with Stripe Elements context
 */

import React from 'react';
import { useLocale } from 'next-intl';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Initialize Stripe only when a valid publishable key is available
const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : Promise.resolve(null);

interface StripeProviderProps {
  children: React.ReactNode;
}

export function StripeProvider({ children }: StripeProviderProps) {
  // Localize Stripe's own card fields and validation errors.
  const locale = useLocale();

  return (
    <Elements stripe={stripePromise} options={{ locale }}>
      {children}
    </Elements>
  );
}

export default StripeProvider;
