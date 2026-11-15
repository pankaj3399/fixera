'use client'

import { getErrorMessage, messageFromApiBody } from '@/lib/apiErrors';


import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Link2, Settings, BarChart3, List, Loader2, Save, CheckCircle, Check,
  XCircle, AlertTriangle, Clock, RefreshCw, Ban, ThumbsUp, ExternalLink,
  ChevronDown, Inbox, User, Globe, X, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, getAuthToken } from '@/lib/utils';
import { RejectionTooltipBody } from '@/lib/backlink-rejection';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface BacklinkConfig {
  isEnabled: boolean;
  customerRewardPoints: number;
  professionalRewardPoints: number;
  allowedTargetDomains: string[];
  crawlTimeoutMs: number;
  requireFollowLink: boolean;
  resubmitCooldownHours: number;
}

interface BacklinkAnalytics {
  total: number;
  pending: number;
  verified: number;
  rejected: number;
  revoked: number;
  thisMonth: number;
  totalPointsIssued: number;
  totalUnclawedPoints: number;
  topSubmitters: Array<{ _id: string; name: string; email: string; role: string; verifiedCount: number; totalPoints: number }>;
}

type SubmissionStatus = 'pending_verification' | 'verifying' | 'verified' | 'rejected' | 'revoked';

interface Submission {
  _id: string;
  userId: { _id: string; name: string; email: string; role: string } | null;
  submittedUrl: string;
  domain: string;
  status: SubmissionStatus;
  rewardPoints?: number;
  rejectionReason?: string;
  unclawedPoints?: number;
  ipAddress?: string;
  createdAt: string;
  revokedAt?: string;
  revokedBy?: { name: string; email: string } | null;
  reviewedBy?: { name: string; email: string } | null;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const POLL_INTERVAL_MS = 8_000;

function authHeaders() {
  const token = getAuthToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function isInFlight(status: SubmissionStatus): boolean {
  return status === 'pending_verification' || status === 'verifying';
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}


const STATUS_FILTERS = ['', 'pending_verification', 'verifying', 'verified', 'rejected', 'revoked'] as const;
const STATUS_LABELS: Record<string, string> = {
  '': 'All', pending_verification: 'Queued', verifying: 'Verifying', verified: 'Verified', rejected: 'Rejected', revoked: 'Revoked',
};

function normalizeAllowedDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function StatusBadge({ status, tooltip }: { status: string; tooltip?: string }) {
  const config: Record<string, { className: string; icon: LucideIcon }> = {
    pending_verification: { className: 'bg-amber-50 text-amber-800 ring-amber-200/60', icon: Clock },
    verifying: { className: 'bg-amber-50 text-amber-800 ring-amber-200/60', icon: Loader2 },
    verified: { className: 'bg-emerald-50 text-emerald-800 ring-emerald-200/60', icon: CheckCircle },
    rejected: { className: 'bg-red-50 text-red-800 ring-red-200/60', icon: XCircle },
    revoked: { className: 'bg-slate-50 text-slate-700 ring-slate-200/60', icon: Ban },
  };
  const { className, icon: Icon } = config[status] ?? { className: 'bg-muted text-muted-foreground ring-border', icon: AlertTriangle };
  const spinning = status === 'verifying';
  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        className,
        tooltip && 'cursor-help underline decoration-red-300/60 decoration-dotted underline-offset-2',
      )}
    >
      <Icon className={cn('h-3 w-3', spinning && 'animate-spin')} />
      {STATUS_LABELS[status] ?? status}
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
          <RejectionTooltipBody reason={tooltip.trim()} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const ROW_THEMES: Record<SubmissionStatus, string> = {
  pending_verification: 'border-l-amber-400',
  verifying: 'border-l-amber-400',
  verified: 'border-l-emerald-400',
  rejected: 'border-l-red-400',
  revoked: 'border-l-slate-300',
};

function formatSubmissionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function AdminSubmissionRow({
  sub,
  actionId,
  onApprove,
  onReject,
  onRevoke,
  onReprocess,
}: {
  sub: Submission;
  actionId: string | null;
  onApprove: () => void;
  onReject: () => void;
  onRevoke: () => void;
  onReprocess: () => void;
}) {
  const busy = actionId === sub._id;
  const inFlight = isInFlight(sub.status);
  const showApprove = sub.status === 'pending_verification' || sub.status === 'rejected';
  const showReject = showApprove;
  const showRevoke = sub.status === 'verified';
  const showReprocess = sub.status === 'rejected' || sub.status === 'pending_verification';
  const hasActions = showApprove || showReject || showRevoke || showReprocess;

  return (
    <div className={cn('border-l-[3px] px-4 py-4 sm:px-6', ROW_THEMES[sub.status])}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {isSafeHttpUrl(sub.submittedUrl) ? (
              <a
                href={sub.submittedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground hover:text-indigo-600"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{sub.domain}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </a>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{sub.domain}</span>
              </span>
            )}
            <StatusBadge
              status={sub.status}
              tooltip={sub.status === 'rejected' ? sub.rejectionReason : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground/80">{sub.userId?.name ?? 'Unknown'}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{sub.userId?.email ?? '—'}</span>
            {sub.userId?.role && (
              <>
                <span aria-hidden>·</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal capitalize">
                  {sub.userId.role}
                </Badge>
              </>
            )}
          </div>

          {inFlight && (
            <p className="text-xs text-amber-700">Crawling page — actions available when crawl completes</p>
          )}

          {sub.unclawedPoints != null && sub.unclawedPoints > 0 && (
            <p className="inline-flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {sub.unclawedPoints} pts could not be clawed back
            </p>
          )}

          {sub.rewardPoints != null && sub.status === 'verified' && (
            <p className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle className="h-3 w-3" />
              +{sub.rewardPoints} pts awarded
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
          <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
            {formatSubmissionDate(sub.createdAt)}
          </span>
          {hasActions && !inFlight && (
          <div className="flex items-center gap-1">
            {showApprove && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                disabled={busy}
                onClick={onApprove}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Approve</span>
              </Button>
            )}
            {showReject && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                disabled={busy}
                onClick={onReject}
              >
                <XCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Reject</span>
              </Button>
            )}
            {showRevoke && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                disabled={busy}
                onClick={onRevoke}
              >
                <Ban className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Revoke</span>
              </Button>
            )}
            {showReprocess && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-muted-foreground hover:bg-muted"
                disabled={busy}
                onClick={onReprocess}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Reprocess</span>
              </Button>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value.toLocaleString()}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const STATUS_BREAKDOWN = [
  {
    key: 'pending' as const,
    label: 'Pending',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    surface: 'bg-amber-50/60 border-amber-100/80',
    text: 'text-amber-900',
    muted: 'text-amber-700/80',
  },
  {
    key: 'verified' as const,
    label: 'Verified',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    surface: 'bg-emerald-50/60 border-emerald-100/80',
    text: 'text-emerald-900',
    muted: 'text-emerald-700/80',
  },
  {
    key: 'rejected' as const,
    label: 'Rejected',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    surface: 'bg-red-50/60 border-red-100/80',
    text: 'text-red-900',
    muted: 'text-red-700/80',
  },
  {
    key: 'revoked' as const,
    label: 'Revoked',
    dot: 'bg-slate-400',
    bar: 'bg-slate-400',
    surface: 'bg-slate-50/80 border-slate-200/80',
    text: 'text-slate-900',
    muted: 'text-slate-600/80',
  },
] as const;

function AllowedDomainsCombobox({
  value,
  onChange,
}: {
  value: string[];
  onChange: (domains: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    setSearch('');
  }, [open]);

  const query = search.trim();
  const normalizedQuery = query ? normalizeAllowedDomain(query) : null;
  const queryLower = query.toLowerCase();

  const sortedDomains = [...value].sort((a, b) => a.localeCompare(b));
  const filteredDomains = query
    ? sortedDomains.filter((d) => d.includes(queryLower))
    : sortedDomains;

  const canCreate = Boolean(normalizedQuery && !value.includes(normalizedQuery));
  const showInvalidHint = Boolean(query && !normalizedQuery);

  const toggleDomain = (domain: string) => {
    if (value.includes(domain)) {
      onChange(value.filter((d) => d !== domain));
    } else {
      onChange([...value, domain]);
    }
  };

  const addDomain = (raw: string) => {
    const host = normalizeAllowedDomain(raw);
    if (!host) {
      toast.error('Enter a valid hostname (e.g. fixtract.com or https://fixtract.com)');
      return;
    }
    if (value.includes(host)) {
      toast.error('Domain is already selected');
      return;
    }
    onChange([...value, host]);
    setSearch('');
  };

  const removeDomain = (domain: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange(value.filter((d) => d !== domain));
  };

  return (
    <div className="space-y-2">
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            open && 'border-ring ring-ring/50 ring-[3px]',
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {value.length === 0 ? (
              <span className="text-muted-foreground">Select or add domains…</span>
            ) : value.length <= 2 ? (
              value.map((d) => (
                <Badge
                  key={d}
                  variant="secondary"
                  className="h-6 max-w-full gap-1 rounded-md border-indigo-200/60 bg-indigo-50 px-2 text-xs font-normal text-indigo-800"
                >
                  <span className="truncate">{d}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => removeDomain(d, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        removeDomain(d, e as unknown as React.MouseEvent);
                      }
                    }}
                    className="shrink-0 rounded-sm text-indigo-500 hover:text-indigo-800"
                    aria-label={`Remove ${d}`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))
            ) : (
              <span className="text-foreground">{value.length} domains selected</span>
            )}
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Allowed target domains"
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
          >
            <div className="border-b p-2">
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or add domain…"
                className="h-8 border-0 bg-muted/50 shadow-none focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (canCreate && normalizedQuery) addDomain(query);
                    else if (showInvalidHint) addDomain(query);
                  }
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
            </div>

            <div className="max-h-60 overflow-y-auto p-1">
              {filteredDomains.length > 0 ? (
                filteredDomains.map((domain) => {
                  const checked = value.includes(domain);
                  return (
                    <div
                      key={domain}
                      role="option"
                      aria-selected={checked}
                      tabIndex={0}
                      onClick={() => toggleDomain(domain)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleDomain(domain);
                        }
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs',
                          checked && 'border-primary bg-primary text-primary-foreground',
                        )}
                      >
                        {checked && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{domain}</span>
                    </div>
                  );
                })
              ) : !canCreate && !showInvalidHint ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No domains configured — type a hostname to add one.
                </p>
              ) : null}

              {canCreate && normalizedQuery && (
                <button
                  type="button"
                  onClick={() => addDomain(query)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-indigo-700 hover:bg-indigo-50"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-dashed border-indigo-300 text-indigo-600">+</span>
                  Add &ldquo;{normalizedQuery}&rdquo;
                </button>
              )}

              {showInvalidHint && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  Enter a valid hostname (http/https URL or domain only).
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBreakdown({ analytics }: { analytics: BacklinkAnalytics }) {
  const counts = {
    pending: analytics.pending,
    verified: analytics.verified,
    rejected: analytics.rejected,
    revoked: analytics.revoked,
  };
  const statusTotal = STATUS_BREAKDOWN.reduce((sum, s) => sum + counts[s.key], 0);
  const pct = (n: number) => (statusTotal > 0 ? Math.round((n / statusTotal) * 100) : 0);

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Status Breakdown</CardTitle>
            <CardDescription>Share of submissions by current status</CardDescription>
          </div>
          <p className="text-sm tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{statusTotal.toLocaleString()}</span> total
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="space-y-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/80 shadow-inner">
            {statusTotal > 0 ? (
              STATUS_BREAKDOWN.map((s) => {
                const count = counts[s.key];
                if (count === 0) return null;
                return (
                  <div
                    key={s.key}
                    className={cn(s.bar, 'relative min-w-0 transition-all first:rounded-l-full last:rounded-r-full')}
                    style={{ width: `${pct(count)}%` }}
                    title={`${s.label}: ${count} (${pct(count)}%)`}
                  />
                );
              })
            ) : (
              <div className="h-full w-full rounded-full bg-muted" />
            )}
          </div>

          {statusTotal > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {STATUS_BREAKDOWN.map((s) => {
                const count = counts[s.key];
                if (count === 0) return null;
                return (
                  <div key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden />
                    <span>{s.label}</span>
                    <span className="font-medium tabular-nums text-foreground">{pct(count)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STATUS_BREAKDOWN.map((s) => {
            const count = counts[s.key];
            const share = pct(count);
            const isEmpty = count === 0;

            return (
              <div
                key={s.key}
                className={cn(
                  'flex overflow-hidden rounded-xl border',
                  isEmpty ? 'border-border/60 bg-muted/20' : s.surface,
                )}
              >
                <div
                  className={cn('w-1 shrink-0', isEmpty ? 'bg-muted-foreground/20' : s.bar)}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', isEmpty ? 'bg-muted-foreground/30' : s.dot)}
                        aria-hidden
                      />
                      <span className={cn('truncate text-sm font-medium', isEmpty ? 'text-muted-foreground' : s.text)}>
                        {s.label}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-xs font-medium tabular-nums',
                        isEmpty ? 'text-muted-foreground' : s.muted,
                      )}
                    >
                      {share}%
                    </span>
                  </div>

                  <p
                    className={cn(
                      'text-3xl font-semibold tracking-tight tabular-nums',
                      isEmpty ? 'text-muted-foreground/50' : s.text,
                    )}
                  >
                    {count.toLocaleString()}
                  </p>

                  {!isEmpty && statusTotal > 0 && (
                    <p className={cn('text-xs tabular-nums', s.muted)}>
                      {count.toLocaleString()} of {statusTotal.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------
// Main page
// ------------------------------------------------------------------

export default function AdminBacklinksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<'config' | 'analytics' | 'list'>('config');
  const [config, setConfig] = useState<BacklinkConfig | null>(null);
  const [analytics, setAnalytics] = useState<BacklinkAnalytics | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [listRefreshError, setListRefreshError] = useState(false);
  const [submissionsLoadError, setSubmissionsLoadError] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const pageRef = useRef(page);
  const statusFilterRef = useRef(statusFilter);
  pageRef.current = page;
  statusFilterRef.current = statusFilter;

  // Reason modal state
  const [reasonModal, setReasonModal] = useState<{ id: string; action: 'reject' | 'revoke' } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const fetchConfig = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/backlinks/config`, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) throw new Error('config fetch failed');
      const d = await res.json();
      if (d.success) { setConfig(d.data); return true; }
      toast.error(messageFromApiBody(d, 'Failed to load config'));
      return false;
    } catch {
      toast.error('Failed to load backlink config');
      return false;
    }
  }, []);

  const fetchAnalytics = useCallback(async (opts?: { silent?: boolean }): Promise<boolean> => {
    try {
      if (opts?.silent) setListRefreshError(false);
      const res = await fetch(`${BACKEND}/api/admin/backlinks/analytics`, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) throw new Error('analytics fetch failed');
      const d = await res.json();
      if (d.success) { setAnalytics(d.data); return true; }
      if (!opts?.silent) toast.error(messageFromApiBody(d, 'Failed to load analytics'));
      else setListRefreshError(true);
      return false;
    } catch {
      if (!opts?.silent) toast.error('Failed to load analytics');
      else setListRefreshError(true);
      return false;
    }
  }, []);

  const fetchSubmissions = useCallback(async (p = 1, status = '', opts?: { silent?: boolean }): Promise<boolean> => {
    try {
      setSubmissionsLoadError(false);
      if (opts?.silent) setListRefreshError(false);
      else setListLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (status) params.set('status', status);
      const res = await fetch(`${BACKEND}/api/admin/backlinks/list?${params}`, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) throw new Error('list fetch failed');
      const d = await res.json();
      if (d.success) {
        setSubmissions(d.data.submissions);
        setTotal(d.data.pagination.total);
        return true;
      }
      setSubmissionsLoadError(true);
      if (!opts?.silent) toast.error(messageFromApiBody(d, 'Failed to load submissions'));
      else setListRefreshError(true);
      return false;
    } catch {
      setSubmissionsLoadError(true);
      if (!opts?.silent) toast.error('Failed to load submissions');
      else setListRefreshError(true);
      return false;
    } finally {
      if (!opts?.silent) setListLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [cfgOk] = await Promise.all([fetchConfig(), fetchAnalytics(), fetchSubmissions()]);
    if (!cfgOk) setLoadError(true);
    setLoading(false);
  }, [fetchConfig, fetchAnalytics, fetchSubmissions]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/auth/signin'); return; }
    if (user.role !== 'admin') { router.push('/dashboard'); return; }
    void loadAll();
  }, [authLoading, user, router, loadAll]);

  useEffect(() => {
    if (tab === 'list') void fetchSubmissions(page, statusFilter);
  }, [tab, page, statusFilter, fetchSubmissions]);

  useEffect(() => {
    if (tab !== 'list') return;
    if (!submissions.some((s) => isInFlight(s.status))) return;
    const id = setInterval(() => {
      void fetchSubmissions(pageRef.current, statusFilterRef.current, { silent: true });
      void fetchAnalytics({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tab, submissions, fetchSubmissions, fetchAnalytics]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/backlinks/config`, {
        method: 'PUT', credentials: 'include', headers: authHeaders(), body: JSON.stringify(config),
      });
      const d = await res.json();
      if (d.success) { toast.success('Configuration saved'); setConfig(d.data); }
      else toast.error(messageFromApiBody(d, 'Failed to save'));
    } catch (error) { toast.error(getErrorMessage(error, 'Failed to save configuration')); }
    finally { setSaving(false); }
  };

  const doAction = async (id: string, action: 'approve' | 'reprocess') => {
    if (actionId) return;
    setActionId(id);
    try {
      const res = await fetch(`${BACKEND}/api/admin/backlinks/${id}/${action}`, {
        method: 'POST', credentials: 'include', headers: authHeaders(),
      });
      const d = await res.json();
      if (d.success) {
        toast.success(messageFromApiBody(d, `${action} successful`));
        fetchSubmissions(page, statusFilter);
        fetchAnalytics();
      } else {
        toast.error(messageFromApiBody(d, `${action} failed`));
      }
    } catch (error) { toast.error(getErrorMessage(error, 'Backlink action failed')); }
    finally { setActionId(null); }
  };

  const submitReason = async () => {
    if (!reasonModal || !reasonInput.trim()) return;
    setActionId(reasonModal.id);
    setReasonModal(null);
    try {
      const res = await fetch(`${BACKEND}/api/admin/backlinks/${reasonModal.id}/${reasonModal.action}`, {
        method: 'POST', credentials: 'include', headers: authHeaders(),
        body: JSON.stringify({ reason: reasonInput.trim() }),
      });
      const d = await res.json();
      if (d.success) { toast.success(messageFromApiBody(d, 'Done')); fetchSubmissions(page, statusFilter); fetchAnalytics(); }
      else toast.error(messageFromApiBody(d, 'Failed'));
    } catch (error) { toast.error(getErrorMessage(error, 'Backlink action failed')); }
    finally { setActionId(null); setReasonInput(''); }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );

  const LoadErrorCard = ({ label, onRetry }: { label: string; onRetry: () => void }) => (
    <Card>
      <CardContent className="pt-6 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
        <p className="text-gray-600">{label}</p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />Retry
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Link2 className="h-8 w-8 text-indigo-600" />
            Backlink Rewards Management
          </h1>
          <p className="text-gray-600 mt-1">Configure the backlink program, view analytics, and manage submission queue.</p>
        </div>

        {/* Tabs */}
        <div className="inline-flex rounded-lg border bg-card p-1 shadow-sm">
          {([
            { id: 'config' as const, label: 'Configuration', icon: Settings },
            { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
            { id: 'list' as const, label: 'Submissions', icon: List },
          ] as const).map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2"
            >
              <t.icon className="h-4 w-4" />{t.label}
            </Button>
          ))}
        </div>

        {/* ── CONFIG TAB ───────────────────────────────────────────── */}
        {tab === 'config' && !config && loadError && (
          <LoadErrorCard label="Failed to load configuration." onRetry={() => void loadAll()} />
        )}
        {tab === 'config' && config && (
          <div className="space-y-6">

            {/* Master toggle */}
            <Card>
              <CardHeader className="items-center">
                <CardTitle>Program Status</CardTitle>
                <CardDescription>Enable or disable the backlink rewards program globally.</CardDescription>
                <CardAction className="self-center">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-gray-500">{config.isEnabled ? 'Active' : 'Inactive'}</span>
                    <Switch checked={config.isEnabled} onCheckedChange={(v) => setConfig({ ...config, isEnabled: v })} />
                  </div>
                </CardAction>
              </CardHeader>
            </Card>

            {/* Rewards */}
            <Card>
              <CardHeader><CardTitle>Reward Points</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer reward (pts)</Label>
                  <Input type="number" min={0} value={config.customerRewardPoints}
                    onChange={(e) => setConfig({ ...config, customerRewardPoints: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Professional reward (pts)</Label>
                  <Input type="number" min={0} value={config.professionalRewardPoints}
                    onChange={(e) => setConfig({ ...config, professionalRewardPoints: Number(e.target.value) || 0 })} />
                </div>
              </CardContent>
            </Card>

            {/* Allowed domains */}
            <Card>
              <CardHeader>
                <CardTitle>Allowed Target Domains</CardTitle>
                <CardDescription>Hostnames a submitted page must link TO. FRONTEND_URL is always included at runtime.</CardDescription>
              </CardHeader>
              <CardContent>
                <AllowedDomainsCombobox
                  value={config.allowedTargetDomains}
                  onChange={(allowedTargetDomains) => setConfig({ ...config, allowedTargetDomains })}
                />
              </CardContent>
            </Card>

            {/* Verification settings */}
            <Card>
              <CardHeader><CardTitle>Verification Settings</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Crawl timeout (ms)</Label>
                  <Input type="number" min={5000} max={120000} value={config.crawlTimeoutMs}
                    onChange={(e) => setConfig({ ...config, crawlTimeoutMs: Math.min(120000, Math.max(5000, Number(e.target.value) || 30000)) })} />
                </div>
                <div className="space-y-2">
                  <Label>Resubmit cooldown (hours)</Label>
                  <Input type="number" min={0} value={config.resubmitCooldownHours}
                    onChange={(e) => setConfig({ ...config, resubmitCooldownHours: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
                <div className="space-y-2">
                  <Label>Require follow link</Label>
                  <div className="flex items-center gap-3 pt-2">
                    <Switch checked={config.requireFollowLink}
                      onCheckedChange={(v) => setConfig({ ...config, requireFollowLink: v })} />
                    <span className="text-sm text-gray-500">{config.requireFollowLink ? 'Yes — nofollow links rejected' : 'No — nofollow links accepted'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={saveConfig} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save Configuration</>}
              </Button>
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ────────────────────────────────────────── */}
        {tab === 'analytics' && !analytics && (
          <LoadErrorCard label="Failed to load analytics." onRetry={() => void fetchAnalytics()} />
        )}
        {tab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="Total Submissions" value={analytics.total} sub={`${analytics.thisMonth.toLocaleString()} this month`} icon={List} />
              <MetricCard label="Verified" value={analytics.verified} sub="Links rewarded" icon={CheckCircle} />
              <MetricCard label="Points Issued" value={analytics.totalPointsIssued} sub="Via backlinks" icon={Link2} />
              <MetricCard label="Unrecovered Pts" value={analytics.totalUnclawedPoints} sub="Could not recover" icon={AlertTriangle} />
            </div>

            <StatusBreakdown analytics={analytics} />

            {analytics.topSubmitters.length > 0 && (
              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Top Submitters</CardTitle>
                  <CardDescription>Users with the most verified backlinks</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {analytics.topSubmitters.map((s, i) => (
                      <div key={s._id} className="flex items-center justify-between gap-4 px-6 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{s.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                          </div>
                          <Badge variant="secondary" className="hidden shrink-0 text-xs sm:inline-flex">{s.role}</Badge>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums text-emerald-600">{s.verifiedCount} verified</p>
                          <p className="text-xs text-muted-foreground">{s.totalPoints.toLocaleString()} pts total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── SUBMISSIONS TAB ──────────────────────────────────────── */}
        {tab === 'list' && submissionsLoadError && submissions.length === 0 && (
          <LoadErrorCard
            label="Failed to load submissions."
            onRetry={() => void fetchSubmissions(page, statusFilter)}
          />
        )}
        {tab === 'list' && !(submissionsLoadError && submissions.length === 0) && (
          <div className="space-y-4">
            {listRefreshError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 shadow-sm">
                <p className="text-sm text-amber-800">Couldn&apos;t refresh the submission queue.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setListRefreshError(false);
                    void fetchSubmissions(page, statusFilter);
                    void fetchAnalytics();
                  }}
                >
                  Retry
                </Button>
              </div>
            )}

            <Card>
              <CardHeader className="space-y-4 border-b pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Submission Queue</CardTitle>
                    <CardDescription>
                      {total > 0
                        ? `${total.toLocaleString()} submission${total === 1 ? '' : 's'}`
                        : 'Review and action backlink submissions'}
                    </CardDescription>
                  </div>
                  <Select
                    value={statusFilter || 'all'}
                    onValueChange={(value) => {
                      setPage(1);
                      setStatusFilter(value === 'all' ? '' : value);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_FILTERS.map((s) => (
                        <SelectItem key={s || 'all'} value={s || 'all'}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {listLoading && submissions.length === 0 ? (
                  <div className="divide-y">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2 px-6 py-4">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-64" />
                        <Skeleton className="h-8 w-32" />
                      </div>
                    ))}
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-14 text-center">
                    <Inbox className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-foreground">No submissions found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {statusFilter
                        ? `No ${STATUS_LABELS[statusFilter]?.toLowerCase() ?? 'matching'} submissions in the queue`
                        : 'Submissions will appear here when users submit backlink URLs'}
                    </p>
                  </div>
                ) : (
                  <div className={cn('divide-y', listLoading && 'pointer-events-none opacity-60')}>
                    {submissions.map((sub) => (
                      <AdminSubmissionRow
                        key={sub._id}
                        sub={sub}
                        actionId={actionId}
                        onApprove={() => doAction(sub._id, 'approve')}
                        onReject={() => { setReasonModal({ id: sub._id, action: 'reject' }); setReasonInput(''); }}
                        onRevoke={() => { setReasonModal({ id: sub._id, action: 'revoke' }); setReasonInput(''); }}
                        onReprocess={() => doAction(sub._id, 'reprocess')}
                      />
                    ))}
                  </div>
                )}

                {total > 20 && (
                  <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="text-sm text-muted-foreground">
                      Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total.toLocaleString()}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page === 1 || listLoading} onClick={() => setPage(page - 1)}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page * 20 >= total || listLoading} onClick={() => setPage(page + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Reason modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold capitalize">{reasonModal.action} submission</h2>
            <p className="text-sm text-gray-500">Provide a reason — this will be sent to the user via push notification.</p>
            <Textarea
              rows={4}
              placeholder="Reason…"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setReasonModal(null)}>Cancel</Button>
              <Button onClick={submitReason} disabled={!reasonInput.trim()}
                className={reasonModal.action === 'revoke' ? 'bg-red-600 hover:bg-red-700' : ''}>
                Confirm {reasonModal.action}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
