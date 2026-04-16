'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Gift,
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  Loader2,
  Save,
  BarChart3,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAuthToken } from '@/lib/utils';

interface ReferralConfig {
  isEnabled: boolean;
  referrerRewardAmount: number | undefined;
  referrerCustomerRewardAmount: number | undefined;
  referrerProfessionalRewardAmount: number | undefined;
  referredCustomerDiscountType: 'percentage' | 'fixed';
  referredCustomerDiscountValue: number | undefined;
  referredCustomerDiscountMaxAmount: number | undefined;
  referredProfessionalCommissionReduction: number | undefined;
  referredProfessionalBenefitBookings: number | undefined;
  referralExpiryDays: number | undefined;
  creditExpiryMonths: number | undefined;
  maxReferralsPerUser: number | undefined;
  minBookingAmountForTrigger: number | undefined;
}

const numVal = (v: string): number | undefined => {
  const n = Number(v);
  if (v === '' || Number.isNaN(n) || !Number.isFinite(n)) return undefined;
  return n;
};

interface ReferralAnalytics {
  totalReferrals: number;
  thisMonthReferrals: number;
  pendingReferrals: number;
  completedReferrals: number;
  expiredReferrals: number;
  revokedReferrals: number;
  conversionRate: number;
  totalPointsIssued: number;
  totalReferralPointsEarned: number;
  topReferrers: Array<{
    _id: string;
    name: string;
    email: string;
    role: string;
    totalReferrals: number;
    completedReferrals: number;
  }>;
}

interface ReferralItem {
  _id: string;
  referrer: { _id: string; name: string; email: string; role: string };
  referredUser: { _id: string; name: string; email: string; role: string; createdAt: string };
  status: string;
  referrerRewardAmount: number;
  createdAt: string;
  expiresAt: string;
}

export default function AdminReferralPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'config' | 'analytics' | 'list'>('config');
  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [analytics, setAnalytics] = useState<ReferralAnalytics | null>(null);
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [referralTotal, setReferralTotal] = useState(0);
  const [referralPage, setReferralPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const headers = () => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/referral/config`,
        { credentials: 'include', headers: headers() }
      );
      const data = await res.json();
      if (data.success) setConfig(data.data);
    } catch (e) {
      toast.error('Failed to load referral config');
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/referral/analytics`,
        { credentials: 'include', headers: headers() }
      );
      const data = await res.json();
      if (data.success) setAnalytics(data.data);
    } catch (e) {
      toast.error('Failed to load analytics');
    }
  };

  const fetchReferrals = async (page = 1, status = '') => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/referral/list?${params}`,
        { credentials: 'include', headers: headers() }
      );
      const data = await res.json();
      if (data.success) {
        setReferrals(data.data.referrals);
        setReferralTotal(data.data.total);
      }
    } catch (e) {
      toast.error('Failed to load referrals');
    }
  };

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setLoading(true);
    Promise.all([fetchConfig(), fetchAnalytics(), fetchReferrals()]).finally(
      () => setLoading(false)
    );
  }, [user]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchReferrals(referralPage, statusFilter);
    }
  }, [referralPage, statusFilter, activeTab]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/referral/config`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: headers(),
          body: JSON.stringify(config),
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success('Configuration saved');
        setConfig(data.data);
      } else {
        toast.error(data.msg || 'Failed to save');
      }
    } catch (e) {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const [revokingId, setRevokingId] = useState<string | null>(null);

  const revokeReferral = async (referralId: string) => {
    if (!window.confirm('Are you sure you want to revoke this referral? This will claw back any points issued.')) {
      return;
    }
    if (revokingId) return; // prevent double-click
    setRevokingId(referralId);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/referral/${referralId}/revoke`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: headers(),
          body: JSON.stringify({ reason: 'Revoked by admin' }),
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success('Referral revoked');
        fetchReferrals(referralPage, statusFilter);
        fetchAnalytics();
      } else {
        toast.error(data.msg || 'Failed to revoke');
      }
    } catch (e) {
      toast.error('Failed to revoke referral');
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Gift className="h-8 w-8 text-purple-600" />
            Referral Program Management
          </h1>
          <p className="text-gray-600 mt-1">
            Configure referral rewards, view analytics, and manage referrals.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { id: 'config' as const, label: 'Configuration', icon: Settings },
            { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
            { id: 'list' as const, label: 'All Referrals', icon: Users },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2"
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Configuration Tab */}
        {activeTab === 'config' && config && (
          <div className="space-y-6">
            {/* Master Toggle */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Program Status</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-gray-500">
                      {config.isEnabled ? 'Active' : 'Inactive'}
                    </span>
                    <Switch
                      checked={config.isEnabled}
                      onCheckedChange={(checked) =>
                        setConfig({ ...config, isEnabled: checked })
                      }
                    />
                  </div>
                </CardTitle>
                <CardDescription>
                  Enable or disable the referral program globally
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Referrer Rewards */}
            <Card>
              <CardHeader>
                <CardTitle>Referrer Rewards</CardTitle>
                <CardDescription>
                  Configure separate reward amounts for customer and professional referrers. Customers earn booking credit, professionals earn level boost points.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Referrer Reward (points)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={config.referrerCustomerRewardAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          referrerCustomerRewardAmount: numVal(v),
                        });
                      }}
                    />
                    <p className="text-xs text-gray-500">Points awarded to customers who refer. 1 point = EUR 1 booking credit.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Professional Referrer Reward (points)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={config.referrerProfessionalRewardAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          referrerProfessionalRewardAmount: numVal(v),
                        });
                      }}
                    />
                    <p className="text-xs text-gray-500">Points awarded to professionals who refer. Contributes to professional level progression.</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reward Expiry (months)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={config.creditExpiryMonths}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          creditExpiryMonths: numVal(v),
                        });
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Referred User Benefits */}
            <Card>
              <CardHeader>
                <CardTitle>Referred User Benefits</CardTitle>
                <CardDescription>
                  Discounts for newly referred users
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Discount Type</Label>
                    <Select
                      value={config.referredCustomerDiscountType}
                      onValueChange={(value: 'percentage' | 'fixed') =>
                        setConfig({
                          ...config,
                          referredCustomerDiscountType: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed">Fixed Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Discount Value (
                      {config.referredCustomerDiscountType === 'percentage'
                        ? '%'
                        : 'EUR'}
                      )
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={config.referredCustomerDiscountValue ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          referredCustomerDiscountValue: numVal(v),
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Discount (EUR)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={config.referredCustomerDiscountMaxAmount ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          referredCustomerDiscountMaxAmount: numVal(v),
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>Professional Commission Reduction (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={config.referredProfessionalCommissionReduction ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          referredProfessionalCommissionReduction: numVal(v),
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Benefit Bookings Count</Label>
                    <Input
                      type="number"
                      min={0}
                      value={config.referredProfessionalBenefitBookings ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          referredProfessionalBenefitBookings: numVal(v),
                        });
                      }}
                    />
                    <p className="text-xs text-gray-500">
                      Number of bookings with reduced commission
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Limits & Thresholds */}
            <Card>
              <CardHeader>
                <CardTitle>Limits & Thresholds</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Referral Expiry (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={config.referralExpiryDays ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          referralExpiryDays: numVal(v),
                        });
                      }}
                    />
                    <p className="text-xs text-gray-500">
                      Time for referred user to complete qualifying action
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Referrals Per User (yearly)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={config.maxReferralsPerUser ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          maxReferralsPerUser: numVal(v),
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Booking Amount (EUR)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={config.minBookingAmountForTrigger ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConfig({
                          ...config,
                          minBookingAmountForTrigger: numVal(v),
                        });
                      }}
                    />
                    <p className="text-xs text-gray-500">
                      Minimum first booking value to trigger reward
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                onClick={saveConfig}
                disabled={saving}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && analytics && (
          <div className="space-y-6">
            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <p className="text-sm text-gray-500">Total Referrals</p>
                  </div>
                  <p className="text-2xl font-bold">
                    {analytics.totalReferrals}
                  </p>
                  <p className="text-xs text-gray-500">
                    {analytics.thisMonthReferrals} this month
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <p className="text-sm text-gray-500">Conversion Rate</p>
                  </div>
                  <p className="text-2xl font-bold">
                    {analytics.conversionRate}%
                  </p>
                  <p className="text-xs text-gray-500">
                    Signup to completion
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="h-4 w-4 text-purple-600" />
                    <p className="text-sm text-gray-500">Points Issued</p>
                  </div>
                  <p className="text-2xl font-bold">
                    &euro;{analytics.totalPointsIssued}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <p className="text-sm text-gray-500">Outstanding Points</p>
                  </div>
                  <p className="text-2xl font-bold">
                    &euro;{analytics.totalReferralPointsEarned}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Referral Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-amber-50 rounded-lg">
                    <Clock className="h-5 w-5 mx-auto text-amber-600 mb-2" />
                    <p className="text-2xl font-bold text-amber-900">
                      {analytics.pendingReferrals}
                    </p>
                    <p className="text-sm text-amber-700">Pending</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 mx-auto text-green-600 mb-2" />
                    <p className="text-2xl font-bold text-green-900">
                      {analytics.completedReferrals}
                    </p>
                    <p className="text-sm text-green-700">Completed</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <XCircle className="h-5 w-5 mx-auto text-gray-500 mb-2" />
                    <p className="text-2xl font-bold text-gray-900">
                      {analytics.expiredReferrals}
                    </p>
                    <p className="text-sm text-gray-700">Expired</p>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-2" />
                    <p className="text-2xl font-bold text-red-900">
                      {analytics.revokedReferrals}
                    </p>
                    <p className="text-sm text-red-700">Revoked</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Referrers */}
            {analytics.topReferrers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Top Referrers</CardTitle>
                  <CardDescription>
                    Users with the most completed referrals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analytics.topReferrers.map((referrer, idx) => (
                      <div
                        key={referrer._id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-400 w-6">
                            #{idx + 1}
                          </span>
                          <div>
                            <p className="font-medium">{referrer.name}</p>
                            <p className="text-xs text-gray-500">
                              {referrer.email}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {referrer.role}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">
                            {referrer.completedReferrals} completed
                          </p>
                          <p className="text-xs text-gray-500">
                            {referrer.totalReferrals} total
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Referrals List Tab */}
        {activeTab === 'list' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2">
              {['', 'pending', 'completed', 'expired', 'revoked'].map(
                (status) => (
                  <Button
                    key={status || 'all'}
                    variant={statusFilter === status ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setStatusFilter(status);
                      setReferralPage(1);
                    }}
                  >
                    {status || 'All'}
                  </Button>
                )
              )}
            </div>

            {/* Referrals Table */}
            <Card>
              <CardContent className="pt-6">
                {referrals.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No referrals found
                  </p>
                ) : (
                  <div className="space-y-3">
                    {referrals.map((ref) => (
                      <div
                        key={ref._id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                          <div>
                            <p className="text-xs text-gray-500">Referrer</p>
                            <p className="font-medium text-sm">
                              {ref.referrer?.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {ref.referrer?.email}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">
                              Referred User
                            </p>
                            <p className="font-medium text-sm">
                              {ref.referredUser?.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {ref.referredUser?.email}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Date</p>
                            <p className="text-sm">
                              {new Date(ref.createdAt).toLocaleDateString()}
                            </p>
                            {ref.status === 'pending' && (
                              <p className="text-xs text-amber-600">
                                Expires:{' '}
                                {new Date(ref.expiresAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <Badge
                              variant={
                                ref.status === 'completed'
                                  ? 'default'
                                  : ref.status === 'pending'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {ref.status}
                            </Badge>
                            {(ref.status === 'pending' ||
                              ref.status === 'completed') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => revokeReferral(ref._id)}
                                disabled={revokingId === ref._id}
                                className="text-red-600 hover:text-red-700"
                              >
                                {revokingId === ref._id ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Ban className="h-3 w-3 mr-1" />
                                )}
                                Revoke
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {referralTotal > 20 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={referralPage <= 1}
                      onClick={() => setReferralPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-500 flex items-center px-2">
                      Page {referralPage} of{' '}
                      {Math.ceil(referralTotal / 20)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        referralPage >= Math.ceil(referralTotal / 20)
                      }
                      onClick={() => setReferralPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
