/**
 * Payment Status Badge Component
 * Displays colored badge based on payment status
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import { PaymentStatus } from '@/types/stripe';

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

type StatusLabelKey =
  | 'paymentStatus.idle'
  | 'paymentStatus.completed'
  | 'paymentStatus.authorized'
  | 'paymentStatus.pending'
  | 'paymentStatus.processing'
  | 'paymentStatus.authenticating'
  | 'paymentStatus.success'
  | 'paymentStatus.error'
  | 'paymentStatus.failed'
  | 'paymentStatus.refunded'
  | 'paymentStatus.partiallyRefunded'
  | 'paymentStatus.expired';

type StatusConfig = {
  color: string;
  labelKey?: StatusLabelKey;
};

function getStatusConfig(status: PaymentStatus): StatusConfig {
  switch (status) {
    case 'idle':
      return {
        color: 'bg-gray-100 text-gray-800',
        labelKey: 'paymentStatus.idle',
      };
    case 'success':
      return {
        color: 'bg-green-100 text-green-800',
        labelKey: 'paymentStatus.success',
      };
    case 'error':
      return {
        color: 'bg-red-100 text-red-800',
        labelKey: 'paymentStatus.error',
      };
    case 'completed':
      return {
        color: 'bg-green-100 text-green-800',
        labelKey: 'paymentStatus.completed',
      };
    case 'authorized':
      return {
        color: 'bg-yellow-100 text-yellow-800',
        labelKey: 'paymentStatus.authorized',
      };
    case 'pending':
      return {
        color: 'bg-gray-100 text-gray-800',
        labelKey: 'paymentStatus.pending',
      };
    case 'processing':
      return {
        color: 'bg-blue-100 text-blue-800',
        labelKey: 'paymentStatus.processing',
      };
    case 'authenticating':
      return {
        color: 'bg-purple-100 text-purple-800',
        labelKey: 'paymentStatus.authenticating',
      };
    case 'failed':
      return {
        color: 'bg-red-100 text-red-800',
        labelKey: 'paymentStatus.failed',
      };
    case 'refunded':
      return {
        color: 'bg-orange-100 text-orange-800',
        labelKey: 'paymentStatus.refunded',
      };
    case 'partially_refunded':
      return {
        color: 'bg-orange-100 text-orange-800',
        labelKey: 'paymentStatus.partiallyRefunded',
      };
    case 'expired':
      return {
        color: 'bg-gray-100 text-gray-800',
        labelKey: 'paymentStatus.expired',
      };
    default:
      return {
        color: 'bg-gray-100 text-gray-800',
      };
  }
}

export function PaymentStatusBadge({ status, className = '' }: PaymentStatusBadgeProps) {
  const t = useTranslations('checkout');
  const config = getStatusConfig(status);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color} ${className}`}
    >
      {config.labelKey ? t(config.labelKey) : status}
    </span>
  );
}

export default PaymentStatusBadge;
