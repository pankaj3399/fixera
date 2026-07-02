'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAuthToken } from '@/lib/utils';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type BacklinkStatus =
  | 'pending_verification'
  | 'verifying'
  | 'verified'
  | 'rejected'
  | 'revoked';

const IN_FLIGHT: BacklinkStatus[] = ['pending_verification', 'verifying'];

function isInFlight(status: BacklinkStatus): boolean {
  return IN_FLIGHT.includes(status);
}

interface BacklinkSubmission {
  _id: string;
  submittedUrl: string;
  domain: string;
  status: BacklinkStatus;
  rewardPoints?: number;
  rewardIssuedAt?: string;
  rejectionReason?: string;
  adminReviewReason?: string;
  lastRejectedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

interface BacklinkStats {
  programEnabled: boolean;
  rewardPoints: number;
  resubmitCooldownHours: number;
  verifiedCount: number;
  totalPointsEarned: number;
  submissions: BacklinkSubmission[];
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const POLL_INTERVAL_MS = 8_000;

const STATUS_CONFIG: Record<
  BacklinkStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending_verification: {
    label: 'Verifying',
    icon: Clock,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  verifying: {
    label: 'Verifying',
    icon: Clock,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  verified: {
    label: 'Verified',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  revoked: {
    label: 'Revoked',
    icon: AlertCircle,
    className: 'bg-slate-50 text-slate-600 border-slate-200',
  },
};

function cooldownRemaining(lastRejectedAt: string, cooldownHours: number): string | null {
  const expiresAt = new Date(lastRejectedAt).getTime() + cooldownHours * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return null;
  const h = Math.floor(remaining / (1000 * 60 * 60));
  const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function StatusBadge({ status }: { status: BacklinkStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function SubmissionRow({
  submission,
  cooldownHours,
  onResubmit,
}: {
  submission: BacklinkSubmission;
  cooldownHours: number;
  onResubmit: (url: string) => void;
}) {
  const cooldown =
    submission.status === 'rejected' && submission.lastRejectedAt
      ? cooldownRemaining(submission.lastRejectedAt, cooldownHours)
      : null;

  const canResubmit = submission.status === 'rejected' && cooldown === null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-slate-50/50 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={submission.status} />
          <a
            href={submission.submittedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate text-xs text-slate-600 hover:text-slate-900 hover:underline"
          >
            {submission.domain}
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
        </div>

        {submission.status === 'verified' && submission.rewardPoints != null && (
          <p className="text-xs text-emerald-600">
            +{submission.rewardPoints} pts earned
          </p>
        )}

        {submission.status === 'rejected' && (
          <p className="text-xs text-red-600">
            {submission.rejectionReason ?? submission.adminReviewReason ?? 'Link not found on page'}
          </p>
        )}

        {submission.status === 'rejected' && cooldown && (
          <p className="text-xs text-slate-500">
            Resubmit available in {cooldown}
          </p>
        )}

        {submission.status === 'revoked' && (
          <p className="text-xs text-slate-500">
            Revoked {submission.revokedAt ? new Date(submission.revokedAt).toLocaleDateString() : ''}
          </p>
        )}

        {isInFlight(submission.status) && (
          <p className="text-xs text-amber-600">
            Crawling your page — this usually takes under a minute
          </p>
        )}
      </div>

      {canResubmit && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 text-xs"
          onClick={() => onResubmit(submission.submittedUrl)}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Resubmit
        </Button>
      )}
    </div>
  );
}

function shouldRefreshPointsBalance(
  previous: BacklinkStats | null,
  next: BacklinkStats,
): boolean {
  if (!previous) return false;
  if (next.totalPointsEarned > previous.totalPointsEarned) return true;
  if (next.verifiedCount > previous.verifiedCount) return true;

  const previousById = new Map(previous.submissions.map((s) => [s._id, s]));
  return next.submissions.some((submission) => {
    const prior = previousById.get(submission._id);
    return (
      submission.status === 'verified' &&
      prior != null &&
      prior.status !== 'verified'
    );
  });
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

interface BacklinkCardProps {
  onPointsBalanceChange?: () => void;
}

export default function BacklinkCard({ onPointsBalanceChange }: BacklinkCardProps) {
  const [stats, setStats] = useState<BacklinkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cooldownExpiresAt, setCooldownExpiresAt] = useState<Date | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const statsRef = useRef<BacklinkStats | null>(null);

  // ------------------------------------------------------------------
  // Fetch stats
  // ------------------------------------------------------------------

  const fetchStats = useCallback(async (): Promise<BacklinkStats | null> => {
    try {
      setRefreshError(false);
      if (!statsRef.current) setFetchError(false);
      const res = await fetch(`${BACKEND}/api/user/backlinks/stats`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!mountedRef.current) return null;
      if (!res.ok) {
        if (statsRef.current) setRefreshError(true);
        else setFetchError(true);
        return null;
      }
      const json = await res.json();
      if (json.success && mountedRef.current) {
        const data = json.data as BacklinkStats;
        const previous = statsRef.current;
        if (shouldRefreshPointsBalance(previous, data)) {
          onPointsBalanceChange?.();
        }
        statsRef.current = data;
        setStats(data);
        return data;
      }
      if (mountedRef.current) {
        if (statsRef.current) setRefreshError(true);
        else setFetchError(true);
      }
      return null;
    } catch {
      if (mountedRef.current) {
        if (statsRef.current) setRefreshError(true);
        else setFetchError(true);
      }
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [onPointsBalanceChange]);

  // ------------------------------------------------------------------
  // Polling: keep going while any submission is pending
  // ------------------------------------------------------------------

  const schedulePoll = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      const fresh = await fetchStats();
      const inFlight = fresh
        ? fresh.submissions.some((s) => isInFlight(s.status))
        : (statsRef.current?.submissions.some((s) => isInFlight(s.status)) ?? false);
      if (mountedRef.current && inFlight) {
        schedulePoll();
      }
    }, POLL_INTERVAL_MS);
  }, [fetchStats]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchStats();
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [fetchStats]);

  // Re-arm poll whenever in-flight submissions appear
  useEffect(() => {
    const hasPending = stats?.submissions.some((s) => isInFlight(s.status));
    if (hasPending) {
      schedulePoll();
    } else {
      if (pollRef.current) clearTimeout(pollRef.current);
    }
  }, [stats, schedulePoll]);

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  const handleSubmit = async (url?: string) => {
    const targetUrl = (url ?? urlInput).trim();
    if (!targetUrl) {
      setSubmitError('Please enter a URL');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setCooldownExpiresAt(null);

    try {
      const res = await fetch(`${BACKEND}/api/user/backlinks/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 429 && json.cooldownExpiresAt) {
          setCooldownExpiresAt(new Date(json.cooldownExpiresAt));
        }
        setSubmitError(json.msg ?? 'Submission failed');
        return;
      }

      setUrlInput('');
      toast.success('Submission received! We\'ll verify your link shortly.');
      await fetchStats();
    } catch {
      setSubmitError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------------
  // Render: program disabled
  // ------------------------------------------------------------------

  if (!loading && stats && !stats.programEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-5 w-5 text-indigo-600" />
            Backlink Rewards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            The backlink rewards program is currently paused.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------------------------------
  // Render: skeleton
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-5 w-5 text-indigo-600" />
            Backlink Rewards
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (!stats && fetchError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-5 w-5 text-indigo-600" />
            Backlink Rewards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">Couldn&apos;t load your backlink stats.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setLoading(true);
                void fetchStats();
              }}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------------------------------
  // Render: active
  // ------------------------------------------------------------------

  const rewardPoints = stats?.rewardPoints ?? 0;
  const cooldownHours = stats?.resubmitCooldownHours ?? 24;
  const submissions = stats?.submissions ?? [];
  const hasPending = submissions.some((s) => isInFlight(s.status));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-5 w-5 text-indigo-600" />
            Backlink Rewards
            {hasPending && (
              <Badge variant="secondary" className="ml-1 gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                Verifying
              </Badge>
            )}
          </CardTitle>
          {stats && (
            <div className="text-right">
              <p className="text-xs text-slate-500">Points earned</p>
              <p className="text-lg font-semibold text-emerald-600">
                {stats.totalPointsEarned}
              </p>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500">
          Link to Fixera from your website or blog and earn{' '}
          <span className="font-medium text-slate-700">{rewardPoints} points</span> per verified link.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {refreshError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              Couldn&apos;t refresh your latest backlink stats.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void fetchStats()}>
              Retry
            </Button>
          </div>
        )}
        {/* Submit form */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-700">
            Submit a page URL where you&apos;ve linked to Fixera
          </label>
          <div className="flex gap-2">
            <Input
              id="backlink-url-input"
              placeholder="https://yourblog.com/my-post"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setSubmitError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
              disabled={submitting}
              className="text-sm"
            />
            <Button
              id="backlink-submit-btn"
              onClick={() => void handleSubmit()}
              disabled={submitting || !urlInput.trim()}
              size="sm"
              className="shrink-0"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Submit'
              )}
            </Button>
          </div>

          {submitError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <div>
                <p>{submitError}</p>
                {cooldownExpiresAt && (
                  <p className="mt-0.5 text-red-500">
                    Resubmit available after{' '}
                    {cooldownExpiresAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stats row */}
        {stats && stats.verifiedCount > 0 && (
          <div className="flex gap-4 rounded-lg border bg-emerald-50/50 px-4 py-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Verified links</p>
              <p className="font-semibold text-slate-900">{stats.verifiedCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total earned</p>
              <p className="font-semibold text-emerald-600">{stats.totalPointsEarned} pts</p>
            </div>
          </div>
        )}

        {/* Submission history */}
        {submissions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Your submissions
            </p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {submissions.map((s) => (
                <SubmissionRow
                  key={s._id}
                  submission={s}
                  cooldownHours={cooldownHours}
                  onResubmit={(url) => void handleSubmit(url)}
                />
              ))}
            </div>
          </div>
        )}

        {submissions.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center">
            <Link2 className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No submissions yet</p>
            <p className="text-xs text-slate-400">
              Submit a URL above to start earning points
            </p>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Tip: your page must contain a visible link to fixera.com. Verification runs automatically and usually completes in under a minute.
        </p>
      </CardContent>
    </Card>
  );
}
