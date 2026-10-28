'use client';

/**
 * Payment Form Component
 * Stripe Elements payment form with 3DS/SCA handling
 */

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { PaymentStatus } from '../../types/stripe';
import { useCurrency } from '@/contexts/CurrencyContext';

interface PaymentFormProps {
  clientSecret: string;
  amount: number;
  currency: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
}

export function PaymentForm({
  clientSecret,
  amount,
  currency,
  onSuccess,
  onError
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const t = useTranslations('checkout');
  const { formatMoney } = useCurrency();

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage(t('paymentForm.stripeNotLoaded'));
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setErrorMessage(t('paymentForm.cardElementNotFound'));
      return;
    }

    setPaymentStatus('processing');
    setErrorMessage('');

    try {
      // Confirm card payment
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        // Payment failed
        setPaymentStatus('error');
        setErrorMessage(error.message || t('paymentForm.paymentFailed'));
        onError(error.message || t('paymentForm.paymentFailed'));
        return;
      }

      // Handle different payment statuses
      switch (paymentIntent.status) {
        case 'succeeded':
          // Success! Payment charged
          setPaymentStatus('success');
          onSuccess(paymentIntent.id);
          break;

        case 'requires_action':
          // 3DS authentication needed
          setPaymentStatus('authenticating');
          if (!paymentIntent.client_secret) {
            const message = t('paymentForm.authRequiredNoClientSecret');
            setPaymentStatus('error');
            setErrorMessage(message);
            onError(message);
            break;
          }

          const { paymentIntent: updatedIntent, error: actionError } = await stripe.handleCardAction(paymentIntent.client_secret);
          if (actionError) {
            setPaymentStatus('error');
            setErrorMessage(actionError.message || t('paymentForm.threeDsFailed'));
            onError(actionError.message || t('paymentForm.threeDsFailed'));
          } else if (updatedIntent && (updatedIntent.status === 'succeeded' || updatedIntent.status === 'requires_capture')) {
            setPaymentStatus('success');
            onSuccess(updatedIntent.id);
          } else if (updatedIntent && updatedIntent.status === 'requires_confirmation') {
            // Intent needs server-side confirmation after 3DS
            setPaymentStatus('error');
            setErrorMessage(t('paymentForm.requiresConfirmation'));
            onError(t('paymentForm.requiresConfirmationShort'));
          } else {
            const status = updatedIntent?.status || 'unknown';
            setPaymentStatus('error');
            setErrorMessage(t('paymentForm.incompleteWithStatus', { status }));
            onError(t('paymentForm.incompleteShort', { status }));
          }
          break;

        case 'processing':
          // Payment is processing
          setPaymentStatus('processing');
          // Wait for webhook to confirm
          break;

        case 'requires_payment_method':
          // Card declined
          setPaymentStatus('error');
          setErrorMessage(t('paymentForm.declined'));
          onError(t('paymentForm.declinedShort'));
          break;

        default:
          setPaymentStatus('error');
          setErrorMessage(t('paymentForm.unexpectedStatus', { status: paymentIntent.status }));
          onError(t('paymentForm.unexpectedStatusShort', { status: paymentIntent.status }));
      }

    } catch (err) {
      setPaymentStatus('error');
      setErrorMessage(err instanceof Error ? err.message : t('paymentForm.genericError'));
      onError(err instanceof Error ? err.message : t('paymentForm.genericError'));
    }
  };

  const cardElementOptions = useMemo(() => ({
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
  }), []);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border rounded-lg p-4 bg-white">
        <label htmlFor="card-element" className="block text-sm font-medium text-gray-700 mb-2">
          {t('paymentForm.cardDetails')}
        </label>
        <CardElement id="card-element" options={cardElementOptions} />
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600">{errorMessage}</p>
        </div>
      )}

      {paymentStatus === 'authenticating' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-600">
            {t('paymentForm.authenticating')}
          </p>
        </div>
      )}

      {paymentStatus === 'processing' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-600">
            {t('paymentForm.processingWait')}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || paymentStatus === 'processing' || paymentStatus === 'success' || paymentStatus === 'authenticating'}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {paymentStatus === 'processing' ? t('paymentForm.processing') :
         paymentStatus === 'success' ? t('paymentForm.success') :
         t('paymentForm.pay', { amount: formatMoney(amount, currency) })}
      </button>

      <p className="text-xs text-gray-500 text-center">
        {t('paymentForm.securedByStripe')}
      </p>
    </form>
  );
}

export default PaymentForm;
