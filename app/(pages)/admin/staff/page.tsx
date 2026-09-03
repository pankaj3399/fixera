'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { addDays } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { RequireAdminPermission } from '@/components/admin/RequireAdminPermission';
import {
  ADMIN_ACCESS_AREA_KEYS,
  ADMIN_ACCESS_AREA_LABELS,
  ADMIN_ACCESS_LEVELS,
  ADMIN_ROLE_ACCESS,
  ADMIN_ROLE_LABELS,
  ADMIN_ROLES,
  type AdminAccessLevel,
  type AdminPermissionLevels,
  type AdminRole,
} from '@/lib/adminRbac';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import WeeklyAvailabilityCalendar, { type CalendarEvent } from '@/components/calendar/WeeklyAvailabilityCalendar';
import {
  addIsoDays,
  buildBlockedCalendarEvents,
  hasStoredScheduleTimes,
  parseClockTime,
  resolveAdminAvailabilityTimeZone,
  safeFormatInTimeZone,
} from '@/lib/admin/availabilityCalendar';
import { ArrowLeft, CalendarDays, Copy, Loader2 } from 'lucide-react';
import { messageFromApiBody, readJsonResponse } from '@/lib/apiErrors';

type StaffMember = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  adminRole: AdminRole;
  accountStatus: string;
  invitePending?: boolean;
  inviteExpired?: boolean;
  permissions: string[];
  permissionLevels?: AdminPermissionLevels;
  createdAt?: string;
  currentStatusSince?: string;
  timeZone?: string;
  availability?: Record<string, { available?: boolean; startTime?: string; endTime?: string }>;
  blockedDates?: Array<{ date: string; reason?: string }>;
  blockedRanges?: Array<{ startDate: string; endDate: string; reason?: string }>;
};

const API = process.env.NEXT_PUBLIC_BACKEND_URL;

function buildAvailabilityCalendar(member: StaffMember, viewerTimeZone: string) {
  const sourceTimeZone = resolveAdminAvailabilityTimeZone(member.timeZone, viewerTimeZone);
  const resolvedViewerTimeZone = resolveAdminAvailabilityTimeZone(viewerTimeZone, 'UTC');
  const today = new Date();
  const viewerToday = safeFormatInTimeZone(today, resolvedViewerTimeZone, 'yyyy-MM-dd', 'UTC');
  const viewerIsoDay = Number(safeFormatInTimeZone(today, resolvedViewerTimeZone, 'i', 'UTC'));
  const viewerMonday = addIsoDays(viewerToday, 1 - viewerIsoDay);
  const viewerWeekStart = fromZonedTime(`${viewerMonday}T00:00:00`, resolvedViewerTimeZone);
  const viewerWeekEnd = fromZonedTime(`${addIsoDays(viewerMonday, 7)}T00:00:00`, resolvedViewerTimeZone);
  const sourceSeed = safeFormatInTimeZone(addDays(viewerWeekStart, -2), sourceTimeZone, 'yyyy-MM-dd', resolvedViewerTimeZone);
  const availability = member.availability || {};
  const isTwentyFourSeven = !hasStoredScheduleTimes(availability);
  const events: CalendarEvent[] = [];

  for (let offset = 0; offset < 11; offset += 1) {
    const sourceDate = addIsoDays(sourceSeed, offset);
    const sourceDay = safeFormatInTimeZone(
      fromZonedTime(`${sourceDate}T12:00:00`, sourceTimeZone),
      sourceTimeZone,
      'EEEE',
      resolvedViewerTimeZone,
    ).toLowerCase();
    const schedule = availability[sourceDay];
    if (isTwentyFourSeven) {
      const start = fromZonedTime(`${sourceDate}T00:00:00`, sourceTimeZone);
      const end = fromZonedTime(`${addIsoDays(sourceDate, 1)}T00:00:00`, sourceTimeZone);
      if (end <= viewerWeekStart || start >= viewerWeekEnd) continue;
      events.push({
        id: `admin-availability-${sourceDate}`,
        type: 'personal',
        title: '24/7',
        start,
        end,
        readOnly: true,
      });
      continue;
    }

    if (!schedule?.available || !schedule.startTime || !schedule.endTime) continue;

    const startTime = parseClockTime(schedule.startTime);
    const endTime = parseClockTime(schedule.endTime);
    if (!startTime || !endTime || endTime <= startTime) continue;

    const start = fromZonedTime(`${sourceDate}T${startTime}:00`, sourceTimeZone);
    const end = fromZonedTime(`${sourceDate}T${endTime}:00`, sourceTimeZone);
    if (end <= viewerWeekStart || start >= viewerWeekEnd) continue;
    events.push({
      id: `admin-availability-${sourceDate}`,
      type: 'personal',
      title: 'Available',
      start,
      end,
      readOnly: true,
    });
  }

  events.push(
    ...buildBlockedCalendarEvents(
      member.blockedDates || [],
      member.blockedRanges || [],
      sourceTimeZone,
      resolvedViewerTimeZone,
      `admin-staff-${member._id}`,
    ),
  );

  return { events, hasConfiguredSchedule: !isTwentyFourSeven };
}

function authInit(init?: RequestInit): RequestInit {
  return {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  };
}

function StaffPageInner() {
  const { user } = useAuth();
  const viewerTimeZone = user?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [adminRole, setAdminRole] = useState<AdminRole>('care');
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [roleAccess, setRoleAccess] = useState<Partial<Record<AdminRole, AdminPermissionLevels>>>({});
  const [savingRoleAccess, setSavingRoleAccess] = useState(false);
  const [availabilityMember, setAvailabilityMember] = useState<StaffMember | null>(null);
  const availabilityCalendar = useMemo(
    () => availabilityMember
      ? buildAvailabilityCalendar(availabilityMember, viewerTimeZone)
      : { events: [], hasConfiguredSchedule: false },
    [availabilityMember, viewerTimeZone],
  );

  const setRowBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/staff`, authInit());
      const json = await readJsonResponse<{ data?: StaffMember[] }>(res);
      if (!res.ok || !json.success) {
        throw new Error(messageFromApiBody(json, 'Failed to load staff'));
      }
      setStaff(json.data || []);
    } catch (err: unknown) {
      if (!silent) toast.error(err instanceof Error ? err.message : 'Failed to load staff');
      throw err;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (user?.adminRole !== 'super') return;
    void fetch(`${API}/api/admin/staff/permissions`, authInit())
      .then(async (res) => {
        const json = await readJsonResponse<{ data?: { roles?: Partial<Record<AdminRole, AdminPermissionLevels>> } }>(res);
        if (!res.ok || !json.success) throw new Error(messageFromApiBody(json, 'Failed to load role access'));
        setRoleAccess(json.data?.roles || {});
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to load role access'));
  }, [user?.adminRole]);

  const applyInviteResponse = (
    json: {
      data?: StaffMember;
      inviteUrl?: string;
      emailSent?: boolean;
      emailError?: string;
      resent?: boolean;
      msg?: string;
    }
  ) => {
    // Only surface the bearer invite URL when email delivery failed
    setLastInviteUrl(json.emailSent ? null : json.inviteUrl || null);
    if (json.emailSent) {
      toast.success(
        json.resent
          ? `Invite resent to ${json.data?.email}`
          : `Invite email sent to ${json.data?.email}`
      );
    } else {
      toast.warning(json.msg || `Invite ready for ${json.data?.email} — email was not sent`);
      if (json.emailError) {
        toast.message(json.emailError, { duration: 8000 });
      }
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLastInviteUrl(null);
    try {
      const res = await fetch(
        `${API}/api/admin/staff`,
        authInit({
          method: 'POST',
          body: JSON.stringify({ name, email, phone: phone || undefined, adminRole }),
        })
      );
      const json = await readJsonResponse<{
        success?: boolean;
        msg?: string;
        field?: 'email' | 'phone' | 'name';
        inviteUrl?: string;
        emailSent?: boolean;
        emailError?: string;
        resent?: boolean;
        data?: StaffMember;
      }>(res);
      if (!res.ok || !json.success) {
        throw new Error(messageFromApiBody(json, `Invite failed (${res.status})`));
      }
      applyInviteResponse(json);
      setName('');
      setEmail('');
      setPhone('');
      setAdminRole('care');
      if (json.data) {
        const member = json.data;
        setStaff((prev) => {
          const exists = prev.some((m) => m._id === member._id);
          return exists ? prev.map((m) => (m._id === member._id ? member : m)) : [member, ...prev];
        });
      } else {
        await load({ silent: true });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateRole = async (staffId: string, nextRole: AdminRole) => {
    const previous = staff.find((m) => m._id === staffId);
    if (!previous || previous.adminRole === nextRole) return;

    setRowBusy(staffId, true);
    setStaff((prev) =>
      prev.map((m) => (m._id === staffId ? { ...m, adminRole: nextRole } : m))
    );

    try {
      const res = await fetch(
        `${API}/api/admin/staff/${staffId}`,
        authInit({ method: 'PATCH', body: JSON.stringify({ adminRole: nextRole }) })
      );
      const json = await readJsonResponse<{ data?: StaffMember }>(res);
      if (!res.ok || !json.success) {
        throw new Error(messageFromApiBody(json, 'Update failed'));
      }
      if (json.data) {
        const updated = json.data;
        setStaff((prev) => prev.map((m) => (m._id === staffId ? { ...m, ...updated } : m)));
      }
      toast.success('Role updated');
    } catch (err: unknown) {
      setStaff((prev) => prev.map((m) => (m._id === staffId ? previous : m)));
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setRowBusy(staffId, false);
    }
  };

  const resendInvite = async (member: StaffMember) => {
    setRowBusy(member._id, true);
    try {
      const res = await fetch(
        `${API}/api/admin/staff/${member._id}/resend-invite`,
        authInit({ method: 'POST' })
      );
      const json = await readJsonResponse<{
        data?: StaffMember;
        inviteUrl?: string;
        emailSent?: boolean;
        emailError?: string;
        resent?: boolean;
        msg?: string;
      }>(res);
      if (!res.ok || !json.success) {
        throw new Error(messageFromApiBody(json, 'Resend failed'));
      }
      applyInviteResponse(json);
      if (json.data) {
        setStaff((prev) => prev.map((m) => (m._id === member._id ? { ...m, ...json.data } : m)));
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Resend failed');
    } finally {
      setRowBusy(member._id, false);
    }
  };

  const toggleStatus = async (member: StaffMember) => {
    const next = member.accountStatus === 'active' ? 'suspended' : 'active';
    const previousStatus = member.accountStatus;

    setRowBusy(member._id, true);
    setStaff((prev) =>
      prev.map((m) => (m._id === member._id ? { ...m, accountStatus: next } : m))
    );

    try {
      const res = await fetch(
        `${API}/api/admin/staff/${member._id}`,
        authInit({ method: 'PATCH', body: JSON.stringify({ accountStatus: next }) })
      );
      const json = await readJsonResponse<{
        data?: StaffMember;
        inviteUrl?: string;
        emailSent?: boolean;
        emailError?: string;
        resent?: boolean;
        msg?: string;
      }>(res);
      if (!res.ok || !json.success) {
        throw new Error(messageFromApiBody(json, 'Update failed'));
      }
      if (json.data) {
        setStaff((prev) =>
          prev.map((m) => (m._id === member._id ? { ...m, ...json.data } : m))
        );
      }
      toast.success(next === 'active' ? 'Staff reactivated' : 'Staff suspended');
    } catch (err: unknown) {
      setStaff((prev) =>
        prev.map((m) =>
          m._id === member._id ? { ...m, accountStatus: previousStatus } : m
        )
      );
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setRowBusy(member._id, false);
    }
  };

  const updateRoleAccess = async (role: AdminRole, area: (typeof ADMIN_ACCESS_AREA_KEYS)[number], level: AdminAccessLevel) => {
    const previousRoleAccess = roleAccess;
    const next = {
      ...roleAccess,
      [role]: { ...(roleAccess[role] || {}), [area]: level },
    };
    setRoleAccess(next);
    setSavingRoleAccess(true);
    try {
      const res = await fetch(`${API}/api/admin/staff/permissions`, authInit({ method: 'PUT', body: JSON.stringify({ roles: next }) }));
      const json = await readJsonResponse<{ data?: { roles?: Partial<Record<AdminRole, AdminPermissionLevels>> } }>(res);
      if (!res.ok || !json.success) throw new Error(messageFromApiBody(json, 'Failed to save role access'));
      setRoleAccess(json.data?.roles || next);
      toast.success('Role permissions updated');
    } catch (err: unknown) {
      setRoleAccess(previousRoleAccess);
      toast.error(err instanceof Error ? err.message : 'Failed to save role access');
    } finally {
      setSavingRoleAccess(false);
    }
  };

  const formatAdminDate = (value?: string) => value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: viewerTimeZone }).format(new Date(value))
    : '—';

  const formatViewerDate = (value: string, format = 'MMM d, yyyy HH:mm') => {
    try {
      return formatInTimeZone(new Date(value), viewerTimeZone, format);
    } catch {
      return 'Invalid date';
    }
  };

  const roleSummary = (role: AdminRole) => {
    const configured = roleAccess[role];
    if (!configured) return ADMIN_ROLE_ACCESS[role];
    return ADMIN_ACCESS_AREA_KEYS
      .filter((area) => configured[area] && configured[area] !== 'none')
      .map((area) => configured[area] === 'read' ? `${ADMIN_ACCESS_AREA_LABELS[area]} (read-only)` : ADMIN_ACCESS_AREA_LABELS[area]);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pt-24 pb-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">Staff & roles</h1>
          <p className="mt-1 text-sm text-slate-600">
            Invite team members and assign configurable access. Signed in as{' '}
            {user?.name}.
          </p>
        </div>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-lg">Invite staff</CardTitle>
            <CardDescription>
              Fill in their details, pick a role, then send the invite. They&apos;ll get an email with a
              link to set their password.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={invite} className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Contact details
                </p>
                <div className="space-y-2">
                  <Label htmlFor="staff-name">Name</Label>
                  <Input
                    id="staff-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Johnson"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-email">Email</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@fixtract.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-phone">Phone (optional)</Label>
                  <Input
                    id="staff-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+32 …"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Inviting…
                      </>
                    ) : (
                      'Invite admin'
                    )}
                  </Button>
                  {lastInviteUrl ? (
                    <div className="inline-flex h-9 max-w-full items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-sm text-blue-950">
                      <span className="truncate">Invite link ready</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(lastInviteUrl);
                            toast.success('Invite link copied');
                          } catch {
                            toast.error('Could not copy');
                          }
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-blue-900 hover:bg-blue-100"
                        aria-label="Copy invite link"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Role & access
                </p>
                <div className="space-y-2" role="radiogroup" aria-label="Admin role">
                  {ADMIN_ROLES.map((role) => {
                    const selected = adminRole === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setAdminRole(role)}
                        className={
                          selected
                            ? 'flex w-full items-start gap-3 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2.5 text-left text-white'
                            : 'flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                        }
                      >
                        <span
                          className={
                            selected
                              ? 'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-white'
                              : 'mt-0.5 flex h-4 w-4 shrink-0 rounded-full border-2 border-slate-300'
                          }
                          aria-hidden
                        >
                          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{ADMIN_ROLE_LABELS[role]}</span>
                          <span
                            className={
                              selected
                                ? 'mt-0.5 block text-xs text-slate-300'
                                : 'mt-0.5 block text-xs text-slate-500'
                            }
                          >
                            {roleSummary(role).slice(0, 3).join(' · ')}
                            {roleSummary(role).length > 3
                              ? ` · +${roleSummary(role).length - 3} more`
                              : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Team</CardTitle>
            <CardDescription>
              {loading ? 'Loading…' : `${staff.length} admin account${staff.length === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading staff…</p>
            ) : staff.length === 0 ? (
              <p className="text-sm text-slate-500">No staff accounts yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Name</th>
                      <th className="px-3 py-2.5 font-medium">Email</th>
                      <th className="px-3 py-2.5 font-medium">Role</th>
                      <th className="px-3 py-2.5 font-medium">Created on</th>
                      <th className="px-3 py-2.5 text-center font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Status since</th>
                      <th className="px-3 py-2.5 font-medium">Availability</th>
                      <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-white">
                    {staff.map((member) => {
                      const isSelf = member._id === user?._id;
                      const rowBusy = busyIds.has(member._id);
                      return (
                        <tr key={member._id} className="hover:bg-slate-50/80">
                          <td className="px-3 py-3 font-medium text-slate-900">
                            {member.name}
                            {isSelf ? (
                              <span className="ml-2 text-xs font-normal text-slate-400">you</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-slate-600">{member.email}</td>
                          <td className="px-3 py-3">
                            <Select
                              value={member.adminRole}
                              onValueChange={(v) => updateRole(member._id, v as AdminRole)}
                              disabled={isSelf || rowBusy}
                            >
                              <SelectTrigger className="h-8 w-[150px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ADMIN_ROLES.map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {ADMIN_ROLE_LABELS[role]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-600">{formatAdminDate(member.createdAt)}</td>
                          <td className="px-3 py-3 text-center">
                            <Badge
                              variant={
                                member.accountStatus === 'active'
                                  ? 'secondary'
                                  : member.accountStatus === 'pending' ||
                                      member.accountStatus === 'invite_expired'
                                    ? 'outline'
                                    : 'destructive'
                              }
                              className="font-normal capitalize"
                            >
                              {member.accountStatus === 'invite_expired'
                                ? 'Invite expired'
                                : member.accountStatus}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-600">{formatAdminDate(member.currentStatusSince)}</td>
                          <td className="px-3 py-3">
                            <Button variant="outline" size="sm" onClick={() => setAvailabilityMember(member)}>
                              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />Calendar
                            </Button>
                          </td>
                          <td className="px-3 py-3 text-right">
                            {member.accountStatus !== 'suspended' &&
                            member.accountStatus !== 'rejected' &&
                            (member.invitePending ||
                              member.inviteExpired ||
                              member.accountStatus === 'pending' ||
                              member.accountStatus === 'invite_expired') ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resendInvite(member)}
                                disabled={isSelf || rowBusy}
                              >
                                Resend invite
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleStatus(member)}
                                disabled={isSelf || rowBusy}
                              >
                                {member.accountStatus === 'active' ? 'Suspend' : 'Reactivate'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Role access overview</CardTitle>
            <CardDescription>
              Quick reference for what each role can open in admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-y bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Admin area</th>
                  {ADMIN_ROLES.map((role) => (
                    <th key={role} className="px-3 py-2.5 text-center font-medium">
                      {ADMIN_ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {ADMIN_ACCESS_AREA_KEYS.map((area) => (
                  <tr key={area} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 text-slate-800">{ADMIN_ACCESS_AREA_LABELS[area]}</td>
                    {ADMIN_ROLES.map((role) => (
                      <td key={role} className="px-3 py-2.5 text-center">
                        {user?.adminRole === 'super' ? (
                          <Select
                            value={roleAccess[role]?.[area] || 'none'}
                            onValueChange={(value) => void updateRoleAccess(role, area, value as AdminAccessLevel)}
                            disabled={savingRoleAccess || role === 'super'}
                          >
                            <SelectTrigger className="mx-auto h-8 w-[112px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ADMIN_ACCESS_LEVELS.map((level) => (
                                <SelectItem key={level} value={level}>
                                  {level === 'write' ? 'Write' : level === 'read' ? 'Read-only' : 'No'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs capitalize text-slate-600">{roleAccess[role]?.[area] || '—'}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Dialog open={Boolean(availabilityMember)} onOpenChange={(open) => { if (!open) setAvailabilityMember(null); }}>
          <DialogContent className="flex max-h-[90vh] min-h-0 w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{availabilityMember?.name}&apos;s availability calendar</DialogTitle>
              <DialogDescription>
                Converted to your timezone ({viewerTimeZone}). The source schedule is stored in {availabilityMember?.timeZone || 'UTC'}.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
              <WeeklyAvailabilityCalendar
                title="Weekly availability"
                description={availabilityCalendar.hasConfiguredSchedule
                  ? `Displayed in your timezone (${viewerTimeZone}).`
                  : 'No weekly schedule is configured, so this admin is available 24/7.'}
                events={availabilityCalendar.events}
                dayStart="00:00"
                dayEnd="23:59"
                visibleDays={[0, 1, 2, 3, 4, 5, 6]}
                timeZone={viewerTimeZone}
              />
              {availabilityMember?.blockedDates?.length ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><p className="font-semibold">Blocked dates</p>{availabilityMember.blockedDates.map((item, index) => <p key={`${item.date}-${index}`}>{formatViewerDate(item.date, 'MMM d, yyyy')}{item.reason ? ` — ${item.reason}` : ''}</p>)}</div> : null}
              {availabilityMember?.blockedRanges?.length ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><p className="font-semibold">Blocked slots</p>{availabilityMember.blockedRanges.map((range, index) => <p key={`${range.startDate}-${index}`}>{formatViewerDate(range.startDate)} – {formatViewerDate(range.endDate)}{range.reason ? ` — ${range.reason}` : ''}</p>)}</div> : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function AdminStaffPage() {
  return (
    <RequireAdminPermission permission="staff.manage">
      <StaffPageInner />
    </RequireAdminPermission>
  );
}
