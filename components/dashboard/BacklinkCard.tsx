'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  Timer,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, getAuthToken } from '@/lib/utils';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';
import {
  formatIsoDatesInMessage,
  RejectionTooltipBody,
  summarizeRejectionReason,
} from '@/lib/backlink-rejection';

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
const MAX_POLL_BACKOFF_MS = 60_000;

function BacklinkVerificationTooltip() {
  const t = useTranslations('dashboardWidgets');
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-slate-900">{t('backlink.howVerificationWorks')}</p>
      <ul className="space-y-2">
        <li className="flex gap-2">
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
          <span className="text-[11px] leading-snug text-muted-foreground">
            {t.rich('backlink.tooltipLink', {
              strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </span>
        </li>
        <li className="flex gap-2">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
          <span className="text-[11px] leading-snug text-muted-foreground">
            {t.rich('backlink.tooltipTiming', {
              strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </span>
        </li>
      </ul>
    </div>
  );
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const STATUS_CONFIG: Record<
  BacklinkStatus,
  {
    labelKey: `backlink.status.${BacklinkStatus}`;
    icon: React.ElementType;
    badgeClassName: string;
    rowClassName: string;
    iconClassName: string;
  }
> = {
  pending_verification: {
    labelKey: 'backlink.status.pending_verification',
    icon: Loader2,
    badgeClassName: 'bg-amber-100 text-amber-800 ring-amber-200/60',
    rowClassName: 'border-amber-200/80 bg-gradient-to-r from-amber-50/80 to-white',
    iconClassName: 'bg-amber-100 text-amber-600',
  },
  verifying: {
    labelKey: 'backlink.status.verifying',
    icon: Loader2,
    badgeClassName: 'bg-amber-100 text-amber-800 ring-amber-200/60',
    rowClassName: 'border-amber-200/80 bg-gradient-to-r from-amber-50/80 to-white',
    iconClassName: 'bg-amber-100 text-amber-600',
  },
  verified: {
    labelKey: 'backlink.status.verified',
    icon: CheckCircle2,
    badgeClassName: 'bg-emerald-100 text-emerald-800 ring-emerald-200/60',
    rowClassName: 'border-emerald-200/80 bg-gradient-to-r from-emerald-50/60 to-white',
    iconClassName: 'bg-emerald-100 text-emerald-600',
  },
  rejected: {
    labelKey: 'backlink.status.rejected',
    icon: XCircle,
    badgeClassName: 'bg-red-100 text-red-800 ring-red-200/60',
    rowClassName: 'border-red-200/80 bg-gradient-to-r from-red-50/50 to-white',
    iconClassName: 'bg-red-100 text-red-600',
  },
  revoked: {
    labelKey: 'backlink.status.revoked',
    icon: AlertCircle,
    badgeClassName: 'bg-slate-100 text-slate-700 ring-slate-200/60',
    rowClassName: 'border-slate-200 bg-gradient-to-r from-slate-50/80 to-white',
    iconClassName: 'bg-slate-100 text-slate-500',
  },
};

function notifyNewRejections(
  previous: BacklinkStats | null,
  next: BacklinkStats,
  fallbackReason: string,
  noLinkSummary: string,
): void {
  if (!previous) return;

  const prevById = new Map(previous.submissions.map((s) => [s._id, s]));

  for (const submission of next.submissions) {
    if (submission.status !== 'rejected') continue;

    const prior = prevById.get(submission._id);
    if (!prior || prior.status === 'rejected') continue;

    const rawRejection =
      submission.rejectionReason ??
      submission.adminReviewReason ??
      fallbackReason;
    const rejection = summarizeRejectionReason(rawRejection, noLinkSummary);

    toast.error(rejection.summary, {
      description: rejection.expandable ? rejection.full : undefined,
    });
  }
}

function remainingParts(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return { hours, minutes, seconds };
}

function cooldownParts(lastRejectedAt: string, cooldownHours: number) {
  const expiresAt = new Date(lastRejectedAt).getTime() + cooldownHours * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return null;
  return remainingParts(remaining);
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function ResubmitCooldownHint({
  expiresAt,
  onExpired,
}: {
  expiresAt: Date;
  onExpired: () => void;
}) {
  const t = useTranslations('dashboardWidgets');
  const [remaining, setRemaining] = useState(() => {
    const ms = expiresAt.getTime() - Date.now();
    return ms > 0 ? remainingParts(ms) : null;
  });

  useEffect(() => {
    const tick = () => {
      const ms = expiresAt.getTime() - Date.now();
      if (ms <= 0) {
        setRemaining(null);
        onExpired();
        return;
      }
      setRemaining(remainingParts(ms));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  if (!remaining) return null;

  const timeLeft =
    remaining.hours > 0
      ? t('backlink.duration.hoursMinutes', remaining)
      : remaining.minutes > 0
        ? t('backlink.duration.minutesSeconds', remaining)
        : t('backlink.duration.seconds', remaining);

  return (
    <p className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
        <Clock className="h-3 w-3 shrink-0" />
        {t.rich('backlink.resubmitAvailable', {
          time: timeLeft,
          strong: (chunks) => <span className="font-medium tabular-nums">{chunks}</span>,
        })}
      </span>
    </p>
  );
}

function StatusBadge({ status, tooltip }: { status: BacklinkStatus; tooltip?: string }) {
  const t = useTranslations('dashboardWidgets');
  const { intl } = useFormatLocale();
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const inFlight = isInFlight(status);
  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        cfg.badgeClassName,
        tooltip && 'cursor-help underline decoration-red-300/60 decoration-dotted underline-offset-2',
      )}
    >
      <Icon className={cn('h-3 w-3', inFlight && 'animate-spin')} />
      {t(cfg.labelKey)}
    </span>
  );

  if (!tooltip?.trim()) return badge;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="max-w-xs border border-red-100 bg-white px-3 py-2.5 text-foreground shadow-lg [&>svg:last-child]:hidden"
        >
          <RejectionTooltipBody
            reason={tooltip.trim()}
            locale={intl}
            labels={{
              title: t('backlink.noLinkTitle'),
              hint: t('backlink.noLinkHint'),
            }}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DomainLink({ submission }: { submission: BacklinkSubmission }) {
  const content = (
    <>
      <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="truncate font-medium text-slate-900">{submission.domain}</span>
      {isSafeHttpUrl(submission.submittedUrl) && (
        <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
      )}
    </>
  );

  if (isSafeHttpUrl(submission.submittedUrl)) {
    return (
      <a
        href={submission.submittedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 items-center gap-1.5 text-sm hover:text-indigo-700"
      >
        {content}
      </a>
    );
  }

  return <div className="flex min-w-0 items-center gap-1.5 text-sm">{content}</div>;
}

function SubmissionRow({
  submission,
  cooldownHours,
  submitting,
  onResubmit,
}: {
  submission: BacklinkSubmission;
  cooldownHours: number;
  submitting: boolean;
  onResubmit: (url: string) => void;
}) {
  const t = useTranslations('dashboardWidgets');
  const { intl } = useFormatLocale();
  const theme = STATUS_CONFIG[submission.status];
  const inFlight = isInFlight(submission.status);

  const cooldown =
    submission.status === 'rejected' && submission.lastRejectedAt
      ? cooldownParts(submission.lastRejectedAt, cooldownHours)
      : null;

  const cooldownLabel = cooldown
    ? cooldown.hours > 0
      ? t('backlink.duration.hoursMinutes', cooldown)
      : cooldown.minutes > 0
        ? t('backlink.duration.minutesSeconds', cooldown)
        : t('backlink.duration.seconds', cooldown)
    : null;

  const canResubmit = submission.status === 'rejected' && cooldown === null && !submitting;

  const hasExtraContent = inFlight || submission.status === 'revoked';

  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-sm ${theme.rowClassName}`}
    >
      <div
        className={cn(
          'flex gap-3 p-3.5 sm:gap-4 sm:p-4',
          hasExtraContent ? 'items-start' : 'items-center',
        )}
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${theme.iconClassName}`}
        >
          {inFlight ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <theme.icon className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <DomainLink submission={submission} />
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={submission.status}
                tooltip={
                  submission.status === 'rejected'
                    ? (submission.rejectionReason ?? submission.adminReviewReason)
                    : undefined
                }
              />
              {submission.status === 'verified' && submission.rewardPoints != null && (
                <span className="text-[11px] font-semibold tabular-nums text-emerald-700">
                  +{submission.rewardPoints}
                </span>
              )}
              {submission.status === 'rejected' && cooldown && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  <Timer className="h-3 w-3" />
                  {t('backlink.resubmitIn', { time: cooldownLabel ?? '' })}
                </div>
              )}
            </div>
          </div>

          {inFlight && (
            <p className="text-xs leading-relaxed text-amber-800">
              {t('backlink.crawling')}
            </p>
          )}

          {submission.status === 'revoked' && (
            <p className="text-xs text-slate-600">
              {submission.revokedAt
                ? t('backlink.revokedOn', {
                    date: new Date(submission.revokedAt).toLocaleDateString(intl, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }),
                  })
                : t('backlink.revoked')}
            </p>
          )}

        </div>

        {canResubmit && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 border-slate-200 bg-white text-xs shadow-sm hover:bg-slate-50"
            disabled={submitting}
            onClick={() => onResubmit(submission.submittedUrl)}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            {t('backlink.resubmit')}
          </Button>
        )}
      </div>
    </div>
  );
}

function shouldRefreshPointsBalance(
  previous: BacklinkStats | null,
  next: BacklinkStats,
): boolean {
  if (!previous) return false;
  if (next.totalPointsEarned !== previous.totalPointsEarned) return true;
  if (next.verifiedCount !== previous.verifiedCount) return true;

  const previousById = new Map(previous.submissions.map((s) => [s._id, s]));
  return next.submissions.some((submission) => {
    const prior = previousById.get(submission._id);
    return (
      prior != null &&
      (submission.status === 'verified') !== (prior.status === 'verified')
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
  const t = useTranslations('dashboardWidgets');
  const { intl } = useFormatLocale();
  const [stats, setStats] = useState<BacklinkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [cooldownExpiresAt, setCooldownExpiresAt] = useState<Date | null>(null);

  const clearCooldown = useCallback(() => setCooldownExpiresAt(null), []);
  const isOnCooldown =
    cooldownExpiresAt != null && cooldownExpiresAt.getTime() > Date.now();

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailureCountRef = useRef(0);
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
        notifyNewRejections(previous, data, t('backlink.errors.linkNotFound'), t('backlink.noLinkSummary'));
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
  }, [onPointsBalanceChange, t]);

  // ------------------------------------------------------------------
  // Polling: keep going while any submission is pending
  // ------------------------------------------------------------------

  const schedulePoll = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const backoffMs = Math.min(
      POLL_INTERVAL_MS * 2 ** pollFailureCountRef.current,
      MAX_POLL_BACKOFF_MS,
    );
    pollRef.current = setTimeout(async () => {
      const fresh = await fetchStats();
      const inFlight = fresh
        ? fresh.submissions.some((s) => isInFlight(s.status))
        : (statsRef.current?.submissions.some((s) => isInFlight(s.status)) ?? false);
      if (!mountedRef.current) return;
      if (fresh) {
        pollFailureCountRef.current = 0;
      } else if (inFlight) {
        pollFailureCountRef.current += 1;
      }
      if (inFlight) {
        schedulePoll();
      }
    }, backoffMs);
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
      toast.error(t('backlink.errors.urlRequired'));
      return;
    }
    if (!isSafeHttpUrl(targetUrl)) {
      toast.error(t('backlink.errors.urlInvalid'));
      return;
    }

    setSubmitting(true);
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
        toast.error(formatIsoDatesInMessage(json.msg ?? t('backlink.errors.submissionFailed'), intl));
        return;
      }

      setUrlInput('');
      toast.success(t('backlink.errors.submissionReceived'));
      await fetchStats();
    } catch {
      toast.error(t('backlink.errors.network'));
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
            {t('backlink.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            {t('backlink.paused')}
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
            {t('backlink.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
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
            {t('backlink.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">{t('backlink.loadFailed')}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setLoading(true);
                void fetchStats();
              }}
            >
              {t('common.retry')}
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
            {t('backlink.title')}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
                    aria-label={t('backlink.verificationInfo')}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={6}
                  className="max-w-xs border border-indigo-100 bg-white px-3 py-2.5 text-foreground shadow-lg [&>svg:last-child]:hidden"
                >
                  <BacklinkVerificationTooltip />
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {hasPending && (
              <Badge variant="secondary" className="ml-1 gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('backlink.verifying')}
              </Badge>
            )}
          </CardTitle>
          {stats && (
            <div className="text-right">
              <p className="text-xs text-slate-500">{t('backlink.pointsEarned')}</p>
              <p className="text-lg font-semibold text-emerald-600">
                {stats.totalPointsEarned}
              </p>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {t.rich('backlink.earnPerLink', {
            points: rewardPoints,
            strong: (chunks) => <span className="font-medium text-slate-700">{chunks}</span>,
          })}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {refreshError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              {t('backlink.refreshFailed')}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void fetchStats()}>
              {t('common.retry')}
            </Button>
          </div>
        )}
        {/* Submit form */}
        <div className="space-y-3">
          <label htmlFor="backlink-url-input" className="text-xs font-medium text-slate-700">
            {t('backlink.submitLabel')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="backlink-url-input"
              placeholder="https://yourblog.com/my-post"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
              disabled={submitting || isOnCooldown}
              className="text-sm"
            />
            <Button
              id="backlink-submit-btn"
              onClick={() => void handleSubmit()}
              disabled={submitting || !urlInput.trim() || isOnCooldown}
              className="h-9 shrink-0 px-4"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="sr-only">{t('backlink.submitting')}</span>
                </>
              ) : (
                t('backlink.submit')
              )}
            </Button>
          </div>

          {isOnCooldown && cooldownExpiresAt && (
            <ResubmitCooldownHint
              expiresAt={cooldownExpiresAt}
              onExpired={clearCooldown}
            />
          )}
        </div>

        {/* Submission history */}
        {submissions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('backlink.yourSubmissions')}
            </p>
            <div className="max-h-72 space-y-2.5 overflow-y-auto pr-0.5">
              {submissions.map((s) => (
                <SubmissionRow
                  key={s._id}
                  submission={s}
                  cooldownHours={cooldownHours}
                  submitting={submitting}
                  onResubmit={(url) => void handleSubmit(url)}
                />
              ))}
            </div>
          </div>
        )}

        {submissions.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center">
            <Link2 className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">{t('backlink.noSubmissions')}</p>
            <p className="text-xs text-slate-400">
              {t('backlink.noSubmissionsHint')}
            </p>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
