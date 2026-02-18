'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw } from 'lucide-react';

// ─── Shared types ───────────────────────────────────────────────────────────

type PaymentStatus = 'pending' | 'authorized' | 'completed' | 'failed' | 'refunded' | 'partially_refunded' | 'expired';

const STATUS_STYLES: Record<PaymentStatus, string> = {
  pending: 'bg-slate-50 text-slate-700 border border-slate-200',
  authorized: 'bg-amber-50 text-amber-700 border border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border border-rose-200',
  refunded: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  partially_refunded: 'bg-blue-50 text-blue-700 border border-blue-200',
  expired: 'bg-gray-100 text-gray-700 border border-gray-200',
};

const STATUS_OPTIONS: { label: string; value: 'all' | PaymentStatus }[] = [
  { label: 'All statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Authorized', value: 'authorized' },
  { label: 'Completed', value: 'completed' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Failed', value: 'failed' },
];

const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge variant="outline" className={`text-xs capitalize ${STATUS_STYLES[status] || 'bg-slate-100'}`}>
    {status.replace(/_/g, ' ')}
  </Badge>
);

// ─── Customer payment types ─────────────────────────────────────────────────

interface CustomerPayment {
  _id: string;
  bookingNumber?: string;
  booking?: {
    _id: string;
    bookingNumber?: string;
    bookingType?: string;
    status?: string;
  };
  professional?: {
    _id: string;
    name?: string;
    email?: string;
    businessInfo?: { companyName?: string };
  };
  status: PaymentStatus;
  currency: string;
  amount: number;
  totalWithVat?: number;
  createdAt?: string;
}

interface CustomerPaymentSummary {
  totalPaid: number;
  inEscrow: number;
  refunded: number;
}

// ─── Professional types (existing) ──────────────────────────────────────────

interface PaymentStats {
  totalEarnings: number;
  pendingEarnings: number;
  completedBookings: number;
  currency: string;
}

interface AccountStatus {
  hasAccount?: boolean;
  isFullyOnboarded?: boolean;
  accountStatus?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  onboardingCompleted?: boolean;
  detailsSubmitted?: boolean;
}

interface Transaction {
  _id: string;
  date: string;
  bookingNumber: string;
  status: string;
  currency: string;
  amount: number;
}

// ─── Main page component ────────────────────────────────────────────────────

export default function PaymentsDashboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/dashboard/payments');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (user?.role === 'customer') {
    return <CustomerPaymentsView />;
  }

  return <ProfessionalPaymentsView />;
}

// ═══════════════════════════════════════════════════════════════════════════
// Customer Payment History
// ═══════════════════════════════════════════════════════════════════════════

function CustomerPaymentsView() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [summary, setSummary] = useState<CustomerPaymentSummary>({ totalPaid: 0, inEscrow: 0, refunded: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const response = await fetch(`${API_URL}/api/bookings/my-payments?${params.toString()}`, {
        credentials: 'include',
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || 'Failed to load payments');
      }

      setPayments(payload.data.payments);
      setSummary(payload.data.summary);
      setTotalPages(payload.data.pagination.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setIsLoading(false);
    }
  }, [API_URL, page, statusFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Payment History</h1>
            <p className="text-sm text-gray-600">View all your payments and their statuses.</p>
          </div>
          <Button variant="outline" onClick={fetchPayments} disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Refreshing</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-2" /> Refresh</>
            )}
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Paid</CardDescription>
              <CardTitle className="text-2xl">
                EUR {summary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-500">Completed payments</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>In Escrow</CardDescription>
              <CardTitle className="text-2xl">
                EUR {summary.inEscrow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-500">Authorized, awaiting completion</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Refunded</CardDescription>
              <CardTitle className="text-2xl">
                EUR {summary.refunded.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-500">Total refunded amount</CardContent>
          </Card>
        </div>

        {/* Payments table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Payments</CardTitle>
              <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val as 'all' | PaymentStatus); setPage(1); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading payments...
              </div>
            ) : payments.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                No payments found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Booking</th>
                      <th className="px-4 py-3 text-left">Professional</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment) => (
                      <tr
                        key={payment._id}
                        className={`hover:bg-slate-50/60 ${payment.booking?._id ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (payment.booking?._id) {
                            router.push(`/bookings/${payment.booking._id}`);
                          }
                        }}
                      >
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900">
                            {payment.bookingNumber || payment.booking?.bookingNumber || '---'}
                          </div>
                          <div className="text-xs text-gray-500 capitalize">
                            {payment.booking?.bookingType || 'n/a'}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900">
                            {payment.professional?.businessInfo?.companyName || payment.professional?.name || '---'}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-gray-900">
                            {payment.currency} {(payment.totalWithVat ?? payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <PaymentStatusBadge status={payment.status} />
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : '---'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-gray-600">
                <span>Page {page} of {totalPages}</span>
                <div className="space-x-2">
                  <Button variant="outline" size="sm" disabled={page === 1 || isLoading} onClick={() => setPage(p => Math.max(p - 1, 1))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages || isLoading} onClick={() => setPage(p => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Professional Payments View (preserved from original)
// ═══════════════════════════════════════════════════════════════════════════

function ProfessionalPaymentsView() {
  const router = useRouter();
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [stats, setStats] = useState<PaymentStats>({
    totalEarnings: 0,
    pendingEarnings: 0,
    completedBookings: 0,
    currency: 'EUR',
  });
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  useEffect(() => {
    loadPaymentData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPaymentData = async () => {
    setCheckingAccount(true);
    try {
      try {
        const accountResponse = await fetch(`${API_URL}/api/stripe/connect/account-status`, {
          credentials: 'include',
        });

        if (accountResponse.ok) {
          const accountData = await accountResponse.json();
          if (accountData.success && accountData.data) {
            setAccountStatus({
              ...accountData.data,
              hasAccount: true,
              isFullyOnboarded: accountData.data.onboardingCompleted && accountData.data.chargesEnabled,
            });
          }
        }
      } catch (err) {
        console.error('Error loading account status:', err);
      }

      try {
        const statsResponse = await fetch(`${API_URL}/api/professional/payment-stats`, {
          credentials: 'include',
        });

        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          if (statsData.success) {
            setStats(statsData.data);
          }
        }
      } catch {
        console.log('Stats endpoint not available yet');
      }

      try {
        const transactionsResponse = await fetch(`${API_URL}/api/professional/transactions?limit=10`, {
          credentials: 'include',
        });

        if (transactionsResponse.ok) {
          const transactionsData = await transactionsResponse.json();
          if (transactionsData.success) {
            setRecentTransactions(transactionsData.data);
          }
        }
      } catch {
        console.log('Transactions endpoint not available yet');
      }
    } finally {
      setCheckingAccount(false);
    }
  };

  const handleSetupStripe = () => {
    router.push('/professional/stripe/setup');
  };

  const handleOpenDashboard = async () => {
    try {
      const response = await fetch(`${API_URL}/api/stripe/connect/dashboard-link`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        window.open(data.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Error opening dashboard:', err);
    }
  };

  if (checkingAccount) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const hasAccount = accountStatus?.hasAccount || false;
  const isFullyOnboarded = accountStatus?.isFullyOnboarded || false;
  const needsSetup = !hasAccount || !isFullyOnboarded;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
        <p className="text-gray-600 mt-1">Manage your Stripe account and view earnings</p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Stripe Account</h2>
          {isFullyOnboarded && (
            <button
              type="button"
              onClick={handleOpenDashboard}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              Open Dashboard &rarr;
            </button>
          )}
        </div>

        {needsSetup ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start">
              <svg className="h-6 w-6 text-blue-600 mr-3 mt-0.5" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-blue-900 font-semibold mb-1">
                  {!hasAccount ? 'Connect Your Stripe Account' : 'Complete Your Stripe Setup'}
                </h3>
                <p className="text-blue-800 text-sm mb-4">
                  {!hasAccount
                    ? 'You need to connect your Stripe account to receive payments from customers. This only takes a few minutes.'
                    : 'Your Stripe account setup is incomplete. Complete it to start receiving payments.'
                  }
                </p>
                <button
                  type="button"
                  onClick={handleSetupStripe}
                  className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-medium"
                >
                  {!hasAccount ? 'Connect Stripe Account' : 'Complete Setup'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="h-6 w-6 text-green-600" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Account Active</h3>
                <p className="text-gray-600 text-sm">Your account is ready to receive payments</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500">Status</p>
                <p className="text-lg font-semibold text-gray-900 mt-1 capitalize">
                  {accountStatus?.accountStatus || 'Active'}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500">Charges</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {accountStatus?.chargesEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-gray-500">Payouts</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {accountStatus?.payoutsEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {isFullyOnboarded && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-600 text-sm">Total Earnings</p>
                <svg className="h-5 w-5 text-green-500" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats.currency} {stats.totalEarnings.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                From {stats.completedBookings} completed bookings
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-600 text-sm">Pending Earnings</p>
                <svg className="h-5 w-5 text-yellow-500" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats.currency} {stats.pendingEarnings.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                From active bookings
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-600 text-sm">Completed Jobs</p>
                <svg className="h-5 w-5 text-blue-500" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats.completedBookings}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                All time
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Transactions</h2>

            {recentTransactions.length === 0 ? (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="mt-2 text-gray-600">No transactions yet</p>
                <p className="text-sm text-gray-500">Transactions will appear here once you complete bookings</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Booking
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentTransactions.map((transaction) => (
                      <tr key={transaction._id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(transaction.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          #{transaction.bookingNumber}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            transaction.status === 'completed' ? 'bg-green-100 text-green-800' :
                            transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {transaction.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                          {transaction.currency} {transaction.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
