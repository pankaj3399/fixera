'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Gift,
  Copy,
  Check,
  Users,
  Clock,
  CheckCircle2,
  Share2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAuthToken } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface ReferralData {
  referralCode?: string;
  points?: number;
  pointsExpiry?: string | null;
  totalReferrals?: number;
  pendingReferrals?: number;
  completedReferrals?: number;
  totalPointsEarned?: number;
  programEnabled?: boolean;
  referrerRewardAmount?: number;
  referredCustomerDiscountType?: string;
  referredCustomerDiscountValue?: number;
  referredCustomerDiscountMaxAmount?: number;
  referrals?: Array<{
    _id: string;
    referredUser: { name: string; email: string; createdAt: string } | null;
    status: string;
    rewardAmount: number;
    createdAt: string;
    expiresAt: string;
  }>;
}

interface ReferralCardProps {
  referralData?: ReferralData | null
}

export default function ReferralCard({ referralData: referralDataProp }: ReferralCardProps) {
  const { user } = useAuth();
  const hasExternalData = referralDataProp !== undefined
  const [data, setData] = useState<ReferralData | null>(referralDataProp ?? null);
  const [loading, setLoading] = useState(!hasExternalData);
  const [fetchError, setFetchError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const isProfessional = user?.role === 'professional';

  useEffect(() => {
    if (!hasExternalData) return
    setData(referralDataProp ?? null)
    setLoading(false)
  }, [hasExternalData, referralDataProp])

  const fetchReferralStats = async () => {
    try {
      setFetchError(false);
      const token = getAuthToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/referral/stats`,
        {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setFetchError(true);
      }
    } catch (e) {
      console.error('Failed to fetch referral stats:', e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    setGenerating(true);
    try {
      const token = getAuthToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/referral/generate-code`,
        {
          method: 'POST',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success('Referral code generated!');
        fetchReferralStats();
      } else {
        toast.error(json.msg || 'Failed to generate code');
      }
    } catch {
      toast.error('Failed to generate referral code');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (hasExternalData) return
    fetchReferralStats();
  }, [hasExternalData]);

  const copyLink = () => {
    if (!data?.referralCode) return;
    const link = `${window.location.origin}/join?ref=${encodeURIComponent(data.referralCode)}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Referral link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = () => {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode);
    setCopied(true);
    toast.success('Referral code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareVia = (platform: string) => {
    if (!data?.referralCode) return;
    const link = `${window.location.origin}/join?ref=${encodeURIComponent(data.referralCode)}`;
    const text = isProfessional
      ? 'Join Fixera as a professional and start earning points while building trust faster. Use my referral link:'
      : 'Join Fixera and get a discount on your first booking! Use my referral link:';

    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`,
      email: `mailto:?subject=${encodeURIComponent('Join Fixera!')}&body=${encodeURIComponent(`${text}\n\n${link}`)}`,
    };

    if (urls[platform]) {
      window.open(urls[platform], '_blank');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.programEnabled && !fetchError) {
    return null; // Don't show card if referral program is disabled
  }

  if (!data?.referralCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Gift className="h-5 w-5 text-purple-600" />
            Referral Program
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fetchError && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">Couldn&apos;t load your referral stats.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={fetchReferralStats}>
                Retry
              </Button>
            </div>
          )}
          <p className="text-sm text-gray-600 mb-4">
            {isProfessional
              ? 'Refer professionals to Fixera and earn points that help you level up faster.'
              : 'Refer customers to Fixera and earn reward value in points for future bookings when they complete their first booking.'}
          </p>
          <Button onClick={generateCode} disabled={generating} className="bg-purple-600 hover:bg-purple-700">
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Gift className="mr-2 h-4 w-4" />
                Get My Referral Code
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Gift className="h-5 w-5 text-purple-600" />
          Referral Program
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fetchError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">Couldn&apos;t refresh your latest referral stats.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchReferralStats}>
              Retry
            </Button>
          </div>
        )}
        <p className="text-sm text-gray-600">
          {isProfessional
            ? 'Professional referrals help you build points and trust faster.'
            : 'Customer referrals convert into booking value you can spend through your points balance.'}
        </p>
        {/* Referral Code Display */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
          <p className="text-xs text-gray-500 mb-1">Your Referral Code</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={data.referralCode}
              className="font-mono font-bold text-lg bg-white"
            />
            <Button variant="outline" size="icon" onClick={copyCode} title="Copy code">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={copyLink} className="flex-1">
              <ExternalLink className="mr-1 h-3 w-3" />
              Copy Link
            </Button>
            <Button variant="outline" size="sm" onClick={() => shareVia('whatsapp')} className="flex-1">
              <Share2 className="mr-1 h-3 w-3" />
              WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={() => shareVia('email')} className="flex-1">
              <Share2 className="mr-1 h-3 w-3" />
              Email
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <Users className="h-4 w-4 mx-auto text-blue-600 mb-1" />
            <p className="text-xl font-bold">{data.totalReferrals}</p>
            <p className="text-xs text-gray-500">Total Referrals</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <Clock className="h-4 w-4 mx-auto text-amber-600 mb-1" />
            <p className="text-xl font-bold">{data.pendingReferrals}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <CheckCircle2 className="h-4 w-4 mx-auto text-green-600 mb-1" />
            <p className="text-xl font-bold">{data.completedReferrals}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
        </div>

        {/* Points */}
        {(data.points ?? 0) > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm font-medium text-green-800">
              Available Points: <span className="text-lg font-bold">{data.points ?? 0} pts (&euro;{data.points ?? 0})</span>
            </p>
            {data.pointsExpiry && (
              <p className="text-xs text-green-600 mt-1">
                Expires: {new Date(data.pointsExpiry).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Reward info */}
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
          <p className="font-medium text-gray-700 mb-1">How it works:</p>
          <ul className="space-y-1">
            <li>1. Share your referral code or link</li>
            <li>2. {isProfessional ? 'A professional' : 'A customer'} signs up and completes their first booking</li>
            <li>3. You earn {data.referrerRewardAmount ?? 0} points (&euro;{data.referrerRewardAmount ?? 0})!</li>
          </ul>
        </div>

        {/* Recent Referrals */}
        {(data.referrals?.length ?? 0) > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Recent Referrals</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.referrals?.slice(0, 5).map((ref) => (
                <div key={ref._id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">{(ref.referredUser as { name?: string } | null)?.name || 'User'}</p>
                    <p className="text-xs text-gray-500">{new Date(ref.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={
                    ref.status === 'completed' ? 'default' :
                    ref.status === 'pending' ? 'secondary' :
                    'destructive'
                  }>
                    {ref.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

