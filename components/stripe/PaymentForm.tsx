'use client';

/**
 * Payment Form Component
 * Stripe Elements payment form with 3DS/SCA handling
 */

import React, { useState, useMemo } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { PaymentStatus } from '../../types/stripe';

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

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage('Stripe has not loaded yet');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setErrorMessage('Card element not found');
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
        setErrorMessage(error.message || 'Payment failed');
        onError(error.message || 'Payment failed');
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
            const message = 'Additional authentication is required, but no client secret was returned. Please try again.';
            setPaymentStatus('error');
            setErrorMessage(message);
            onError(message);
            break;
          }

          const { paymentIntent: updatedIntent, error: actionError } = await stripe.handleCardAction(paymentIntent.client_secret);
          if (actionError) {
            setPaymentStatus('error');
            setErrorMessage(actionError.message || '3DS authentication failed');
            onError(actionError.message || '3DS authentication failed');
          } else if (updatedIntent && (updatedIntent.status === 'succeeded' || updatedIntent.status === 'requires_capture')) {
            setPaymentStatus('success');
            onSuccess(updatedIntent.id);
          } else if (updatedIntent && updatedIntent.status === 'requires_confirmation') {
            // Intent needs server-side confirmation after 3DS
            setPaymentStatus('error');
            setErrorMessage('Payment requires additional confirmation. Please try again.');
            onError('Payment requires additional confirmation');
          } else {
            const status = updatedIntent?.status || 'unknown';
            setPaymentStatus('error');
            setErrorMessage(`Payment did not complete successfully (status: ${status}). Please try again.`);
            onError(`Payment incomplete: ${status}`);
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
          setErrorMessage('Payment method declined. Please try another card.');
          onError('Payment method declined');
          break;

        default:
          setPaymentStatus('error');
          setErrorMessage(`Unexpected payment status: ${paymentIntent.status}`);
          onError(`Unexpected status: ${paymentIntent.status}`);
      }

    } catch (err) {
      setPaymentStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
      onError(err instanceof Error ? err.message : 'An error occurred');
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
          Card Details
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
            Please complete authentication in the popup window...
          </p>
        </div>
      )}

      {paymentStatus === 'processing' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-600">
            Processing payment, please wait...
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || paymentStatus === 'processing' || paymentStatus === 'success' || paymentStatus === 'authenticating'}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {paymentStatus === 'processing' ? 'Processing...' :
         paymentStatus === 'success' ? 'Payment Successful' :
         `Pay ${currency.toUpperCase()} ${amount.toFixed(2)}`}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Your payment is secured by Stripe.
      </p>
    </form>
  );
}

export default PaymentForm;
