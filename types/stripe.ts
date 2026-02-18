/**
 * Frontend Stripe TypeScript types for Fixera Platform
 * Version: 2.1
 */

// ==================== Payment Form Types ====================

export interface PaymentFormData {
  bookingId: string;
  amount: number;
  currency: SupportedCurrency;
  clientSecret: string;
  vatAmount?: number;
  totalWithVat?: number;
}

export type PaymentStatus =
  | 'idle'
  | 'authenticating'  // 3DS authentication in progress
  | 'processing'      // Payment processing
  | 'success'         // Payment authorized (requires_capture)
  | 'error'           // Payment failed
  | 'pending'
  | 'authorized'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'expired';

export interface PaymentStatusState {
  status: PaymentStatus;
  message?: string;
  paymentIntentId?: string;
  error?: string;
}

// ==================== Stripe Account Types ====================

export interface StripeAccountStatus {
  accountId: string;
  onboardingCompleted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  accountStatus: 'pending' | 'active' | 'restricted' | 'rejected';
  requirements?: {
    currentlyDue: string[];
    pendingVerification: string[];
  };
}

// ==================== Booking Payment Display Types ====================

export interface PaymentInfo {
  amount: number;
  currency: SupportedCurrency;
  status: 'pending' | 'authorized' | 'completed' | 'failed' | 'refunded' | 'expired';
  method: 'card' | 'bank_transfer' | 'cash';

  // Amounts for display
  netAmount: number;
  vatAmount: number;
  vatRate: number;
  totalWithVat: number;
  platformCommission?: number;

  // Timestamps
  authorizedAt?: string;
  capturedAt?: string;
  paidAt?: string;
  refundedAt?: string;

  // Invoice
  invoiceNumber?: string;
  invoiceUrl?: string;
}

// ==================== Onboarding Types ====================

export interface OnboardingLinkData {
  url: string;
  expiresAt: number;
}

export interface DashboardLinkData {
  url: string;
}

// ==================== Earnings Types ====================

export interface ProfessionalEarnings {
  totalEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
  currency: SupportedCurrency;
  recentTransactions: Transaction[];
}

export interface Transaction {
  bookingId: string;
  bookingNumber: string;
  amount: number;
  currency: SupportedCurrency;
  status: 'pending' | 'paid' | 'failed';
  date: string;
  customer: {
    name: string;
    id: string;
  };
}

// ==================== Currency Display ====================

export type SupportedCurrency = 'EUR' | 'USD' | 'GBP' | 'CAD' | 'AUD';

export interface CurrencySymbol {
  EUR: '€';
  USD: '$';
  GBP: '£';
  CAD: 'CA$';
  AUD: 'AU$';
}

export const currencySymbols: Record<SupportedCurrency, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CAD: 'CA$',
  AUD: 'AU$',
};

// ==================== API Response Types ====================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// ==================== Payment Intent Response ====================

export interface PaymentIntentClientResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: SupportedCurrency;
  status: string;
}

// ==================== Refund Request ====================

export interface RefundRequest {
  bookingId: string;
  reason: string;
  amount?: number; // Optional for partial refunds
}
