/**
 * Payment Status Badge Component
 * Displays colored badge based on payment status
 */

import React from 'react';
import { PaymentStatus } from '@/types/stripe';

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

function getStatusConfig(status: PaymentStatus) {
  switch (status) {
    case 'completed':
      return {
        color: 'bg-green-100 text-green-800',
        label: 'Completed',
      };
    case 'authorized':
      return {
        color: 'bg-yellow-100 text-yellow-800',
        label: 'Authorized',
      };
    case 'pending':
      return {
        color: 'bg-gray-100 text-gray-800',
        label: 'Pending',
      };
    case 'processing':
      return {
        color: 'bg-blue-100 text-blue-800',
        label: 'Processing',
      };
    case 'authenticating':
      return {
        color: 'bg-purple-100 text-purple-800',
        label: 'Authenticating',
      };
    case 'failed':
      return {
        color: 'bg-red-100 text-red-800',
        label: 'Failed',
      };
    case 'refunded':
      return {
        color: 'bg-orange-100 text-orange-800',
        label: 'Refunded',
      };
    case 'partially_refunded':
      return {
        color: 'bg-orange-100 text-orange-800',
        label: 'Partially Refunded',
      };
    case 'expired':
      return {
        color: 'bg-gray-100 text-gray-800',
        label: 'Expired',
      };
    default:
      return {
        color: 'bg-gray-100 text-gray-800',
        label: status,
      };
  }
}

export function PaymentStatusBadge({ status, className = '' }: PaymentStatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color} ${className}`}
    >
      {config.label}
    </span>
  );
}

export default PaymentStatusBadge;
