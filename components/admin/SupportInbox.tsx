"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarClock,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  StickyNote,
  XCircle,
} from "lucide-react";
import { ApiRequestError, getErrorMessage } from "@/lib/apiErrors";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { adminSupportItemMatchesFilters } from "@/lib/support/adminFilters";
import {
  adminAddSupportNote,
  adminListSupportNotes,
  adminListSupportItems,
  adminReplySupportItem,
  adminSetSupportMeetingLink,
  adminUpdateSupportMeeting,
  adminUpdateSupportStatus,
  type AdminSupportMeetingAction,
  type AdminSupportMeetingResult,
  type SupportAdminItem,
  type SupportDisplayStatus,
  type SupportInternalNote,
  type SupportSlot,
  type SupportTicketStatus,
  SUPPORT_MAX_PAGE,
} from "@/lib/support";
import { isFutureMeeting, resolveSupportTimeZone } from "@/lib/support/dates";
import {
  canAdminSetSupportMeetingLink,
  canCancelSupportMeeting,
  canCompleteSupportMeeting,
  canRescheduleSupportMeeting,
  supportMeetingHasActiveLink,
} from "@/lib/support/meetingState";
import {
  SUPPORT_MEETING_LINK_MAX_LENGTH,
  isSafeSupportMeetingLink,
  validateSupportMeetingLink,
  type SupportMeetingLinkError,
} from "@/lib/support/validation";
import AdminSupportSlotPicker from "@/components/admin/AdminSupportSlotPicker";
import { SUPPORT_REASONS } from "@/lib/support/reasons";
import { cn } from "@/lib/utils";
import { isAnonymizedIdentity } from "@/lib/anonymizedUsers";

const TICKET_STATUSES: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

const DISPLAY_STATUSES: SupportDisplayStatus[] = [
  ...TICKET_STATUSES,
  "pending",
  "scheduled",
  "declined",
  "cancelled",
  "completed",
];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  pending: "Pending",
  scheduled: "Scheduled",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Completed",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  scheduled: "bg-emerald-100 text-emerald-700",
  declined: "bg-rose-100 text-rose-700",
  cancelled: "bg-gray-100 text-gray-600",
  completed: "bg-indigo-100 text-indigo-700",
};

const PAGE_SIZE = 20;

/**
 * Feedback for a set-link save whose row was removed by the active filter.
 * The inline card notice unmounts with the row, so the inbox keeps the same
 * outcome and a retry action at page level.
 */
interface DroppedLinkNotice {
  kind: SupportAdminItem["kind"];
  id: string;
  meetingLink: string;
  outcome: "sent" | "failed" | "none";
  unchanged: boolean;
}

function AdminStatusPill({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STATUS_STYLES[status] || "bg-gray-100 text-gray-600",
      )}
    >
      {label || STATUS_LABELS[status] || status.replace(/_/g, " ")}
    </span>
  );
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function meetingLinkValidationMessage(
  error: SupportMeetingLinkError,
): string | null {
  switch (error) {
    case "required":
      return "Enter the meeting link.";
    case "length":
      return `The meeting link must be ${SUPPORT_MEETING_LINK_MAX_LENGTH} characters or fewer.`;
    case "invalid":
      return "Enter a complete meeting link, for example https://meet.example.com/room.";
    case "https":
      return "The meeting link must start with https://.";
    case "credentials":
      return "The meeting link must not contain a username or password.";
    default:
      return null;
  }
}

function formatAdminDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAdminFullDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

export default function SupportInbox() {
  const { canWriteSupport, supportAccess } = useAdminAccess();

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [userType, setUserType] = useState("");
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState("");
  const [kind, setKind] = useState("");
  const [meeting, setMeeting] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SupportAdminItem[] | null>(null);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [droppedLinkNotice, setDroppedLinkNotice] = useState<DroppedLinkNotice | null>(null);
  const [linkRetryBusy, setLinkRetryBusy] = useState(false);
  const [linkRetryError, setLinkRetryError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = qInput.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => {
      setQ(trimmed);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [qInput, q]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    adminListSupportItems({
      q,
      status: status as SupportDisplayStatus | "",
      userType: userType as "customer" | "professional" | "",
      reason,
      booking,
      kind: kind as "ticket" | "meeting" | "",
      meeting: meeting as "with" | "without" | "",
      page,
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setPagination(result.pagination);
        // After a mutation drops the last row on the final page, move to the
        // new last page instead of showing an empty stale page number.
        if (
          page > 1 &&
          result.items.length === 0 &&
          result.pagination.totalPages < page
        ) {
          setPage(Math.max(1, result.pagination.totalPages));
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(getErrorMessage(error, "Failed to load support items"));
        setItems((current) => current ?? []);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [q, status, userType, reason, booking, kind, meeting, page, reloadKey]);

  const updateFilter = (
    setter: (value: string) => void,
    value: string,
  ) => {
    setter(value);
    setPage(1);
  };

  const resetFilters = () => {
    setQInput("");
    setQ("");
    setStatus("");
    setUserType("");
    setReason("");
    setBooking("");
    setKind("");
    setMeeting("");
    setPage(1);
  };

  const updateItem = (next: SupportAdminItem) => {
    setItems((current) =>
      current
        ? current.map((item) =>
            item.kind === next.kind && (item._id || item.id) === (next._id || next.id)
              ? next
              : item,
          )
        : current,
    );
  };

  /**
   * Successful mutations must reconcile with the active server query. Drop the
   * row immediately when it no longer satisfies a structured filter, adjust
   * the visible count, then re-fetch the current page so pagination and totals
   * are authoritative. Keyed cards keep any unsent local drafts.
   */
  const applyMutation = (next: SupportAdminItem) => {
    const stillMatches = adminSupportItemMatchesFilters(next, {
      q,
      status,
      userType,
      reason,
      booking,
      kind,
      meeting,
    });

    if (stillMatches) {
      updateItem(next);
    } else {
      setLoading(true);
      setItems((current) =>
        current
          ? current.filter(
              (item) =>
                !(
                  item.kind === next.kind &&
                  (item._id || item.id) === (next._id || next.id)
                ),
            )
          : current,
      );
      setPagination((current) => {
        if (!current) return current;
        const total = Math.max(0, current.total - 1);
        return {
          ...current,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / current.limit),
        };
      });
    }

    // Single, abortable re-fetch of the current query/page. This also repairs
    // ordering, totals and an empty last page after local reconciliation.
    setReloadKey((value) => value + 1);
    return stillMatches;
  };

  const handleLinkPersisted = (notice: DroppedLinkNotice) => {
    setLinkRetryError(null);
    setDroppedLinkNotice(notice);
  };

  const retryDroppedLinkEmail = async () => {
    if (!droppedLinkNotice || linkRetryBusy) return;
    setLinkRetryBusy(true);
    setLinkRetryError(null);
    try {
      const result = await adminSetSupportMeetingLink(
        droppedLinkNotice.kind,
        droppedLinkNotice.id,
        droppedLinkNotice.meetingLink,
      );
      updateItem(result.item);
      setDroppedLinkNotice((current) =>
        current
          ? {
              ...current,
              outcome:
                result.emailSent === true
                  ? "sent"
                  : result.emailSent === false
                    ? "failed"
                    : "none",
              unchanged: result.unchanged === true,
            }
          : current,
      );
    } catch (error) {
      setLinkRetryError(
        getErrorMessage(error, "Failed to retry the meeting link email."),
      );
    } finally {
      setLinkRetryBusy(false);
    }
  };

  const firstLoad = loading && items === null;
  const showEmpty =
    !loading && !firstLoad && !loadError && items !== null && items.length === 0;
  const maxPage = pagination
    ? Math.min(pagination.totalPages, SUPPORT_MAX_PAGE)
    : 1;

  return (
    <div className="space-y-5">
      <section
        aria-label="Support filters"
        className="rounded-2xl border border-indigo-100 bg-white/85 p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2 lg:col-span-4">
            <label
              htmlFor="support-search"
              className="block text-xs font-semibold uppercase tracking-wide text-indigo-700"
            >
              Search
            </label>
            <div className="relative">
              <Search
                size={15}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400"
              />
              <input
                id="support-search"
                type="search"
                value={qInput}
                onChange={(event) => setQInput(event.target.value)}
                maxLength={100}
                placeholder="User name, email, phone, ticket number or subject"
                className="w-full rounded-xl border border-indigo-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          <FilterSelect
            id="support-filter-status"
            label="Status"
            value={status}
            onChange={(value) => updateFilter(setStatus, value)}
          >
            <option value="">All statuses</option>
            {DISPLAY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="support-filter-user-type"
            label="User type"
            value={userType}
            onChange={(value) => updateFilter(setUserType, value)}
          >
            <option value="">All users</option>
            <option value="customer">Customers</option>
            <option value="professional">Professionals</option>
          </FilterSelect>

          <FilterSelect
            id="support-filter-reason"
            label="Reason"
            value={reason}
            onChange={(value) => updateFilter(setReason, value)}
          >
            <option value="">All reasons</option>
            {SUPPORT_REASONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="support-filter-kind"
            label="Type"
            value={kind}
            onChange={(value) => updateFilter(setKind, value)}
          >
            <option value="">All types</option>
            <option value="ticket">Tickets</option>
            <option value="meeting">Meetings</option>
          </FilterSelect>

          <div className="space-y-1">
            <label
              htmlFor="support-filter-booking"
              className="block text-xs font-semibold uppercase tracking-wide text-indigo-700"
            >
              Booking
            </label>
            <input
              id="support-filter-booking"
              value={booking}
              onChange={(event) => updateFilter(setBooking, event.target.value)}
              maxLength={100}
              placeholder="Number or ID"
              className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <FilterSelect
            id="support-filter-meeting"
            label="Meeting"
            value={meeting}
            onChange={(value) => updateFilter(setMeeting, value)}
          >
            <option value="">All items</option>
            <option value="with">With meeting</option>
            <option value="without">Without meeting</option>
          </FilterSelect>

          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <RotateCcw size={14} aria-hidden />
              Reset filters
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-indigo-50 pt-3 text-xs text-indigo-500">
          <span>
            {pagination
              ? `${pagination.total} result${pagination.total === 1 ? "" : "s"}`
              : "Loading results…"}
          </span>
          {loading && items !== null && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={12} aria-hidden className="animate-spin" />
              Updating…
            </span>
          )}
        </div>
      </section>

      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2">
            <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
            {loadError}
          </span>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 sm:self-auto"
          >
            <RefreshCw size={12} aria-hidden />
            Retry
          </button>
        </div>
      )}

      {supportAccess === "read" && (
        <p
          role="status"
          className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 text-xs text-indigo-800"
        >
          Read-only support access. You can view tickets and meeting state, but
          replies, notes, status changes and meeting actions require write access.
        </p>
      )}

      {droppedLinkNotice && (
        <div
          role={droppedLinkNotice.outcome === "failed" ? "alert" : "status"}
          className={cn(
            "flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
            droppedLinkNotice.outcome === "failed"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : droppedLinkNotice.outcome === "sent"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-slate-50 text-slate-700",
          )}
        >
          <span className="flex items-start gap-2">
            {droppedLinkNotice.outcome === "failed" ? (
              <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0" />
            )}
            <span className="space-y-0.5">
              <span className="block font-semibold">
                {droppedLinkNotice.outcome === "failed"
                  ? "Meeting link saved, but the email could not be sent."
                  : droppedLinkNotice.outcome === "sent"
                    ? "Meeting link saved and the participant was emailed."
                    : droppedLinkNotice.unchanged
                      ? "This meeting link is already saved."
                      : "Meeting link saved."}
              </span>
              <span className="block">
                {droppedLinkNotice.outcome === "failed"
                  ? "The link and reservation are safe. Retry the email now; you do not need to recreate the meeting, ticket or link."
                  : droppedLinkNotice.outcome === "sent"
                    ? "The email was sent successfully."
                    : droppedLinkNotice.unchanged
                      ? "No new email was sent for this unchanged link."
                      : "No email was sent for this update. If the meeting has already passed, reschedule it to send a new email."}{" "}
                It no longer matches the current filter, so it was removed from
                this list.
              </span>
              {linkRetryError && (
                <span className="block font-medium">{linkRetryError}</span>
              )}
            </span>
          </span>
          <span className="flex flex-wrap gap-2 self-start sm:self-auto">
            {droppedLinkNotice.outcome === "failed" && (
              <button
                type="button"
                onClick={() => void retryDroppedLinkEmail()}
                disabled={linkRetryBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linkRetryBusy && (
                  <Loader2 size={12} aria-hidden className="animate-spin" />
                )}
                Retry email
              </button>
            )}
            {droppedLinkNotice.outcome !== "failed" && (
              <button
                type="button"
                onClick={() => updateFilter(setStatus, "scheduled")}
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Show scheduled items
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDroppedLinkNotice(null);
                setLinkRetryError(null);
              }}
              className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Dismiss
            </button>
          </span>
        </div>
      )}

      {firstLoad ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-indigo-500">
          <Loader2 size={18} aria-hidden className="animate-spin" />
          Loading support items…
        </div>
      ) : showEmpty ? (
        <div className="rounded-2xl border border-dashed border-indigo-300 bg-white px-5 py-12 text-center text-sm text-indigo-500">
          No support items match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {(items || []).map((item) => (
            <AdminSupportCard
              key={`${item.kind}:${item._id || item.id}`}
              item={item}
              canWrite={canWriteSupport}
              onUpdated={applyMutation}
              onLinkPersisted={handleLinkPersisted}
            />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav
          aria-label="Support items pagination"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm text-indigo-600"
        >
          <span>
            Page {pagination.page} of {maxPage}
            {pagination.totalPages > SUPPORT_MAX_PAGE ? "+" : ""} · {pagination.total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-medium transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft size={14} aria-hidden />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(maxPage, value + 1))}
              disabled={page >= maxPage || loading}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-medium transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight size={14} aria-hidden />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wide text-indigo-700"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
      >
        {children}
      </select>
    </div>
  );
}

function AdminSupportCard({
  item,
  canWrite,
  onUpdated,
  onLinkPersisted,
}: {
  item: SupportAdminItem;
  canWrite: boolean;
  onUpdated: (item: SupportAdminItem) => boolean;
  onLinkPersisted: (notice: DroppedLinkNotice) => void;
}) {
  const meeting = item.meeting;
  const legacy = Boolean(item.legacy || meeting?.legacy);
  const readOnlyLegacyMeeting = item.kind === "meeting" && legacy;
  const user = item.user || item.userId;
  const recipientUnavailable = isAnonymizedIdentity(user);
  const ownerId = user?._id || user?.id || null;
  const reasonLabel =
    item.reasonLabel ||
    SUPPORT_REASONS.find((reason) => reason.id === item.reason)?.label ||
    "";
  const meetingLink = isSafeSupportMeetingLink(meeting?.meetingLink)
    ? meeting?.meetingLink
    : null;
  const meetingConfirmed = supportMeetingHasActiveLink(meeting);
  const attachmentUrl = safeUrl(item.attachment?.url);

  const [statusSaving, setStatusSaving] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<SupportInternalNote[] | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const notesAbort = useRef<AbortController | null>(null);
  const viewerTimeZone = useMemo(
    () => resolveSupportTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone),
    [],
  );
  const [meetingEditor, setMeetingEditor] = useState<
    "reschedule" | "cancel" | "complete" | "link" | null
  >(null);
  const [newMeetingSlot, setNewMeetingSlot] = useState<SupportSlot | null>(null);
  const [meetingActionError, setMeetingActionError] = useState<string | null>(null);
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [meetingRefreshKey, setMeetingRefreshKey] = useState(0);
  const [cancelReason, setCancelReason] = useState("");
  const [meetingLinkDraft, setMeetingLinkDraft] = useState("");
  const [meetingLinkError, setMeetingLinkError] = useState<string | null>(null);
  const [meetingLinkNotice, setMeetingLinkNotice] = useState<{
    unchanged: boolean;
    emailSent: boolean | null;
    replaced: boolean;
  } | null>(null);

  useEffect(() => {
    return () => notesAbort.current?.abort();
  }, []);

  const updateStatus = async (next: SupportTicketStatus) => {
    if (statusSaving || next === item.ticketStatus) return;
    setStatusSaving(true);
    try {
      const updated = await adminUpdateSupportStatus(
        item.kind,
        item._id || item.id,
        next,
      );
      onUpdated(updated);
      toast.success("Status updated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update the status"));
    } finally {
      setStatusSaving(false);
    }
  };

  const sendReply = async () => {
    const body = replyDraft.trim();
    if (!body || replySending) return;
    setReplySending(true);
    try {
      const { item: updated, emailSent } = await adminReplySupportItem(
        item.kind,
        item._id || item.id,
        body,
      );
      onUpdated(updated);
      setReplyDraft("");
      toast.success("Reply sent");
      if (emailSent === false) {
        toast.warning("Reply saved, but the email could not be sent.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to send the reply"));
    } finally {
      setReplySending(false);
    }
  };

  const loadNotes = async () => {
    notesAbort.current?.abort();
    const controller = new AbortController();
    notesAbort.current = controller;
    setNotesLoading(true);
    setNotesError(null);
    try {
      const next = await adminListSupportNotes(
        item.kind,
        item._id || item.id,
        controller.signal,
      );
      if (!controller.signal.aborted) setNotes(next);
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotesError(getErrorMessage(error, "Failed to load internal notes"));
      setNotes((current) => current ?? []);
    } finally {
      if (!controller.signal.aborted) setNotesLoading(false);
    }
  };

  const toggleNotes = () => {
    if (notesOpen) {
      setNotesOpen(false);
      return;
    }
    setNotesOpen(true);
    if (notes === null) void loadNotes();
  };

  const addNote = async () => {
    const body = noteDraft.trim();
    if (!body || noteSaving) return;
    setNoteSaving(true);
    try {
      const note = await adminAddSupportNote(
        item.kind,
        item._id || item.id,
        body,
      );
      setNotes((current) => [...(current || []), note]);
      setNoteDraft("");
      toast.success("Internal note added");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to add the internal note"));
    } finally {
      setNoteSaving(false);
    }
  };

  const runMeetingAction = async (
    action: AdminSupportMeetingAction,
  ): Promise<AdminSupportMeetingResult | null> => {
    if (meetingBusy) return null;
    setMeetingBusy(true);
    setMeetingActionError(null);
    try {
      const result =
        action.action === "set_link"
          ? await adminSetSupportMeetingLink(
              item.kind,
              item._id || item.id,
              action.meetingLink || "",
            )
          : await adminUpdateSupportMeeting(item.kind, item._id || item.id, action);
      const stillVisible = onUpdated(result.item);

      if (action.action === "set_link") {
        const updatedLink = result.item.meeting?.meetingLink || action.meetingLink || "";
        setMeetingLinkDraft(updatedLink);
        setMeetingLinkError(null);
        setMeetingEditor("link");
        setMeetingLinkNotice({
          unchanged: result.unchanged === true,
          emailSent: result.emailSent,
          replaced: Boolean(meeting?.meetingLink),
        });
        if (!stillVisible) {
          // The inline notice unmounts with a filtered-out row, so keep the
          // same outcome and a retry path at page level.
          onLinkPersisted({
            kind: item.kind,
            id: item._id || item.id,
            meetingLink: updatedLink,
            outcome:
              result.emailSent === true
                ? "sent"
                : result.emailSent === false
                  ? "failed"
                  : "none",
            unchanged: result.unchanged === true,
          });
        }
        return result;
      }

      setMeetingEditor(null);
      setNewMeetingSlot(null);
      setCancelReason("");
      if (action.action === "cancel") {
        toast.success("Meeting cancelled");
      } else if (action.action === "complete") {
        toast.success("Meeting completed");
      } else {
        toast.success(
          result.item.meeting?.status === "pending"
            ? "Meeting rescheduled. The meeting link is still awaiting an admin."
            : "Meeting rescheduled",
        );
      }
      if (result.emailSent === false) {
        toast.warning(
          action.action === "reschedule"
            ? "Meeting rescheduled, but the email could not be sent. Reschedule the same time again to retry the email."
            : "Meeting updated, but the email could not be sent.",
        );
      }
      return result;
    } catch (error) {
      const status = error instanceof ApiRequestError ? error.status : undefined;
      const code = error instanceof ApiRequestError ? error.code : undefined;
      if (status === 409 && code === "SLOT_UNAVAILABLE") {
        setNewMeetingSlot(null);
        setMeetingRefreshKey((value) => value + 1);
        setMeetingActionError("That time is no longer available. Choose another slot.");
      } else {
        setMeetingActionError(
          getErrorMessage(
            error,
            action.action === "set_link"
              ? "Failed to save the meeting link."
              : "Failed to update the meeting.",
          ),
        );
      }
      return null;
    } finally {
      setMeetingBusy(false);
    }
  };

  const submitMeetingLink = () => {
    if (meetingBusy) return;
    const problem = validateSupportMeetingLink(meetingLinkDraft);
    if (problem) {
      setMeetingLinkError(meetingLinkValidationMessage(problem));
      setMeetingLinkNotice(null);
      return;
    }
    setMeetingLinkError(null);
    void runMeetingAction({
      action: "set_link",
      meetingLink: meetingLinkDraft.trim(),
    });
  };

  const closed = (item.ticketStatus || item.status) === "closed";
  const fullDate = formatAdminDate(item.createdAt);
  const meetingActionsAllowed = canWrite && !recipientUnavailable;
  const meetingCanReschedule = meetingActionsAllowed && canRescheduleSupportMeeting({
    meeting,
    asAdmin: true,
  });
  const meetingCanCancel = meetingActionsAllowed && canCancelSupportMeeting({ meeting, asAdmin: true });
  const meetingCanComplete = meetingActionsAllowed && canCompleteSupportMeeting(meeting);
  const meetingCanSetLink = canAdminSetSupportMeetingLink({
    itemKind: item.kind,
    meeting,
    canWrite: meetingActionsAllowed,
  });
  const meetingLinkPast =
    Boolean(meeting?.scheduledAt) &&
    !isFutureMeeting(meeting?.scheduledAt) &&
    (meeting?.status === "pending" || meeting?.status === "scheduled");

  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-100 via-blue-100 to-cyan-100 p-[1.5px] shadow-sm">
      <article className="space-y-3 rounded-[calc(1rem-1.5px)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {item.ticketNumber ? (
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700">
                  {item.ticketNumber}
                </span>
              ) : (
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  Legacy
                </span>
              )}
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  item.kind === "meeting"
                    ? "bg-cyan-50 text-cyan-700"
                    : "bg-blue-50 text-blue-700",
                )}
              >
                {item.kind === "meeting" ? "Meeting" : "Ticket"}
              </span>
              {meeting && (
                <AdminStatusPill status={meeting.status} />
              )}
              {legacy && (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Read-only
                </span>
              )}
            </div>
            <h3 className="break-words text-base font-semibold text-slate-900">
              {item.subject || "(No subject)"}
            </h3>
            <p className="text-xs text-slate-500">
              {recipientUnavailable ? "Deleted user" : user?.name || "Unknown user"}
              {!recipientUnavailable && user?.email ? ` · ${user.email}` : ""}
              {user?.role ? ` · ${user.role}` : ""} · {fullDate}
            </p>
          </div>

          {canWrite && !readOnlyLegacyMeeting ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor={`admin-support-status-${item.kind}-${item._id || item.id}`}
                className="text-[11px] font-medium text-slate-500"
              >
                Ticket status
              </label>
              <select
                id={`admin-support-status-${item.kind}-${item._id || item.id}`}
                value={item.ticketStatus || "open"}
                onChange={(event) =>
                  void updateStatus(event.target.value as SupportTicketStatus)
                }
                disabled={statusSaving}
                className="rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-xs outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
              >
                {TICKET_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
              {statusSaving && (
                <Loader2 size={13} aria-hidden className="animate-spin text-indigo-500" />
              )}
            </div>
          ) : readOnlyLegacyMeeting ? null : (
            <AdminStatusPill
              status={item.ticketStatus || item.status}
              label={STATUS_LABELS[item.ticketStatus || item.status]}
            />
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {reasonLabel ? (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
              {reasonLabel}
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
              No reason
            </span>
          )}
          {item.booking && (
            <span className="max-w-full truncate rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
              {item.booking.label}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {item.requesterRole === "customer" ? "Customer" : "Professional"}
          </span>
          {item.tags?.meetingAt && (
            <span className="rounded-full bg-cyan-50 px-2 py-0.5 font-medium text-cyan-700">
              Meeting {formatAdminDate(item.tags.meetingAt)}
            </span>
          )}
        </div>

        {item.description && (
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
            {item.description}
          </p>
        )}

        {item.attachment && (
          <div className="text-xs">
            {attachmentUrl ? (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-indigo-700 transition hover:bg-indigo-100"
              >
                <FileText size={13} aria-hidden />
                <span className="max-w-[18rem] truncate">{item.attachment.fileName}</span>
                <ExternalLink size={12} aria-hidden />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-600">
                <FileText size={13} aria-hidden />
                {item.attachment.fileName}
              </span>
            )}
          </div>
        )}

        {item.replies.length > 0 && (
          <div className="space-y-2 border-l-2 border-indigo-100 pl-3">
            {item.replies.map((reply, index) => (
              <div
                key={reply._id || `${reply.createdAt}-${index}`}
                className="text-xs"
              >
                <span
                  className={cn(
                    "font-semibold",
                    reply.authorRole === "admin" ? "text-blue-700" : "text-indigo-700",
                  )}
                >
                  {reply.authorRole === "admin"
                    ? "Admin"
                    : reply.authorRole === "customer"
                      ? "Customer"
                      : "Professional"}
                </span>
                <span className="text-slate-400">
                  {" · "}
                  {formatAdminDate(reply.createdAt)}
                </span>
                <p className="whitespace-pre-wrap break-words text-slate-700">
                  {reply.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {meeting && (
          <div className="space-y-1.5 rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2.5 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatusPill
                status={meeting.status}
                label={meeting.status === "pending" ? "Awaiting link" : undefined}
              />
              <span className="font-semibold">
                {meeting.scheduledAt
                  ? `${meeting.status === "cancelled" || meeting.status === "declined" || meeting.status === "completed" ? "Was scheduled" : meeting.status === "pending" ? "Reserved" : "Scheduled"}: ${formatAdminFullDate(meeting.scheduledAt)}`
                  : "No scheduled time"}
              </span>
            </div>
            {meeting.scheduledAt && (
              <p className="text-slate-500">
                Browser time · {Intl.DateTimeFormat().resolvedOptions().timeZone}
                {meeting.timeZone ? ` · Stored time zone: ${meeting.timeZone}` : ""}
              </p>
            )}
            <p className="text-slate-500">Duration: {meeting.durationMinutes} minutes</p>
            <p className="text-slate-500">
              Assigned admin:{" "}
              {item.meetingAdmin?.name ||
                item.meetingAdmin?.email ||
                meeting.assignedAdminName ||
                "Not assigned"}
            </p>
            {recipientUnavailable ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
                Historical meeting. The recipient account is no longer available, so
                the participant cannot join and meeting-link actions are disabled. The
                scheduled time and status are retained for history.
              </p>
            ) : meeting.status === "pending" ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
                Slot reserved. Waiting for a support admin to add the real meeting
                link. The participant has not received a meeting link yet.
              </p>
            ) : meetingConfirmed ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-900">
                Confirmed. The real meeting link is saved and the participant can join
                at the scheduled time.
              </p>
            ) : meeting.status === "scheduled" ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-900">
                Marked scheduled without a valid meeting link. Add a real HTTPS link
                before telling the participant the meeting is confirmed.
              </p>
            ) : null}
            {meetingLink ? (
              recipientUnavailable ? (
                <div className="space-y-1">
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
                    Meeting link hidden because the recipient account is no longer
                    available. The historical meeting time and status remain visible.
                  </p>
                  {meeting.linkUpdatedAt ? (
                    <p className="text-slate-500">
                      Link last updated: {formatAdminDate(meeting.linkUpdatedAt)}
                    </p>
                  ) : meeting.linkAddedAt ? (
                    <p className="text-slate-500">
                      Link added: {formatAdminDate(meeting.linkAddedAt)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <a
                    href={meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-700 underline-offset-2 hover:underline"
                  >
                    <ExternalLink size={12} aria-hidden />
                    Open meeting link
                  </a>
                  {meeting.linkUpdatedAt ? (
                    <p className="text-slate-500">
                      Link last updated: {formatAdminDate(meeting.linkUpdatedAt)}
                    </p>
                  ) : meeting.linkAddedAt ? (
                    <p className="text-slate-500">
                      Link added: {formatAdminDate(meeting.linkAddedAt)}
                    </p>
                  ) : null}
                </>
              )
            ) : recipientUnavailable ? (
              <p className="text-slate-500">
                No meeting link was retained for this historical meeting.
              </p>
            ) : meeting.status === "cancelled" ||
              meeting.status === "declined" ||
              meeting.status === "completed" ? (
              <p className="text-slate-500">No meeting link was provided.</p>
            ) : meeting.status === "pending" ? (
              <p className="text-amber-700">No meeting link has been added yet.</p>
            ) : (
              <p className="text-rose-700">
                No valid HTTPS meeting link is stored for this scheduled meeting.
              </p>
            )}
            {meeting.status === "scheduled" && meetingConfirmed && (
              <p className="text-slate-500">
                {meeting.confirmationEmailSentAt
                  ? `Confirmation email sent: ${formatAdminDate(meeting.confirmationEmailSentAt)}`
                  : "Confirmation email has not been recorded as sent."}
              </p>
            )}
            {meeting.preferredTimes && (
              <p>Preferred times (legacy): {meeting.preferredTimes}</p>
            )}
            {meeting.adminResponse && (
              <p>Legacy admin response: {meeting.adminResponse}</p>
            )}
            {meeting.cancellationReason && (
              <p className="text-rose-700">
                Cancellation reason: {meeting.cancellationReason}
              </p>
            )}
            {meetingActionsAllowed && !readOnlyLegacyMeeting && meetingLinkPast && (
              <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                {meeting.status === "pending" && !meeting.meetingLink
                  ? "The reserved time has passed. Reschedule this pending meeting to request a new slot."
                  : "The reserved time has passed. The meeting link can no longer be added or changed."}
              </p>
            )}

            {canWrite &&
              !readOnlyLegacyMeeting &&
              (meetingCanSetLink ||
                meetingCanReschedule ||
                meetingCanCancel ||
                meetingCanComplete) && (
                <div className="mt-2 space-y-2 border-t border-cyan-100 pt-2">
                  <div className="flex flex-wrap gap-2">
                    {meetingCanSetLink && (
                      <button
                        type="button"
                        onClick={() => {
                          if (meetingEditor === "link") {
                            setMeetingEditor(null);
                            return;
                          }
                          setMeetingLinkDraft(
                            isSafeSupportMeetingLink(meeting.meetingLink)
                              ? meeting.meetingLink
                              : "",
                          );
                          setMeetingLinkError(null);
                          setMeetingLinkNotice(null);
                          setMeetingActionError(null);
                          setMeetingEditor("link");
                        }}
                        aria-expanded={meetingEditor === "link"}
                        disabled={meetingBusy}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-cyan-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Link2 size={12} aria-hidden />
                        {meeting.meetingLink ? "Edit meeting link" : "Add meeting link"}
                      </button>
                    )}
                    {meetingCanReschedule && (
                      <button
                        type="button"
                        onClick={() =>
                          setMeetingEditor((current) =>
                            current === "reschedule" ? null : "reschedule",
                          )
                        }
                        aria-expanded={meetingEditor === "reschedule"}
                        disabled={meetingBusy}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CalendarClock size={12} aria-hidden />
                        Reschedule
                      </button>
                    )}
                    {meetingCanCancel && (
                      <button
                        type="button"
                        onClick={() =>
                          setMeetingEditor((current) =>
                            current === "cancel" ? null : "cancel",
                          )
                        }
                        aria-expanded={meetingEditor === "cancel"}
                        disabled={meetingBusy}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle size={12} aria-hidden />
                        Cancel
                      </button>
                    )}
                    {meetingCanComplete && (
                      <button
                        type="button"
                        onClick={() =>
                          setMeetingEditor((current) =>
                            current === "complete" ? null : "complete",
                          )
                        }
                        aria-expanded={meetingEditor === "complete"}
                        disabled={meetingBusy}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CalendarCheck2 size={12} aria-hidden />
                        Complete
                      </button>
                    )}
                  </div>

                  {meetingActionError && (
                    <p role="alert" className="text-[11px] text-rose-700">
                      {meetingActionError}
                    </p>
                  )}

                  {meetingEditor === "link" && (
                    <div className="space-y-2 rounded-lg border border-cyan-200 bg-white p-2.5">
                      <p className="text-[11px] text-slate-600">
                        Paste the real meeting link supplied by support. A complete
                        HTTPS URL is required; it is shown to the participant and
                        included in the meeting email. No link is generated
                        automatically.
                      </p>
                      <label
                        htmlFor={`admin-meeting-link-${item._id || item.id}`}
                        className="block text-[11px] font-medium text-slate-700"
                      >
                        Meeting link (HTTPS)
                      </label>
                      <input
                        id={`admin-meeting-link-${item._id || item.id}`}
                        type="url"
                        inputMode="url"
                        value={meetingLinkDraft}
                        onChange={(event) => {
                          setMeetingLinkDraft(event.target.value);
                          setMeetingLinkError(null);
                          setMeetingLinkNotice(null);
                        }}
                        maxLength={SUPPORT_MEETING_LINK_MAX_LENGTH}
                        disabled={meetingBusy}
                        aria-invalid={Boolean(meetingLinkError)}
                        aria-describedby={
                          meetingLinkError
                            ? `admin-meeting-link-error-${item._id || item.id}`
                            : undefined
                        }
                        placeholder="https://meet.example.com/room"
                        className="w-full rounded-lg border border-cyan-200 bg-white px-2.5 py-1.5 text-xs outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200 disabled:opacity-50"
                      />
                      {meetingLinkError && (
                        <p
                          id={`admin-meeting-link-error-${item._id || item.id}`}
                          role="alert"
                          className="text-[11px] text-rose-700"
                        >
                          {meetingLinkError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={submitMeetingLink}
                          disabled={meetingBusy || !meetingLinkDraft.trim()}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {meetingBusy && (
                            <Loader2 size={12} aria-hidden className="animate-spin" />
                          )}
                          {meeting.meetingLink ? "Update link" : "Save link"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMeetingEditor(null);
                            setMeetingLinkError(null);
                            setMeetingActionError(null);
                          }}
                          disabled={meetingBusy}
                          className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
                        >
                          Close
                        </button>
                      </div>
                      {meetingLinkNotice && (
                        <div
                          role="status"
                          className="space-y-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-700"
                        >
                          <p className="font-semibold text-slate-900">
                            {meetingLinkNotice.unchanged
                              ? "This meeting link is already saved."
                              : meetingLinkNotice.replaced
                                ? "Meeting link updated and saved."
                                : "Meeting link saved."}
                          </p>
                          {meetingLinkNotice.emailSent === true && (
                            <p className="text-emerald-700">
                              The updated meeting details were emailed to the
                              participant.
                            </p>
                          )}
                          {meetingLinkNotice.emailSent === false && (
                            <p className="text-rose-700">
                              The link is saved, but the email could not be sent. Save
                              the same link again to retry the email.
                            </p>
                          )}
                          {meetingLinkNotice.emailSent === null &&
                            meetingLinkNotice.unchanged && (
                              <p className="text-slate-500">
                                No new email was sent for this unchanged link.
                              </p>
                            )}
                          {meetingLinkNotice.emailSent === null &&
                            !meetingLinkNotice.unchanged && (
                              <p className="text-slate-500">
                                No new email was sent for this update.
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  )}

                  {meetingEditor === "reschedule" && (
                    <div className="space-y-2">
                      <AdminSupportSlotPicker
                        itemId={item._id || item.id}
                        professionalId={ownerId}
                        timeZone={viewerTimeZone}
                        selected={newMeetingSlot}
                        disabled={meetingBusy}
                        refreshKey={meetingRefreshKey}
                        onSelect={(slot) => {
                          setNewMeetingSlot(slot);
                          setMeetingActionError(null);
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!newMeetingSlot) return;
                            void runMeetingAction({
                              action: "reschedule",
                              scheduledAt: newMeetingSlot.start,
                              timeZone: viewerTimeZone,
                            });
                          }}
                          disabled={!newMeetingSlot || meetingBusy}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {meetingBusy && (
                            <Loader2 size={12} aria-hidden className="animate-spin" />
                          )}
                          Confirm new time
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMeetingEditor(null);
                            setNewMeetingSlot(null);
                            setMeetingActionError(null);
                          }}
                          disabled={meetingBusy}
                          className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}

                  {meetingEditor === "cancel" && (
                    <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5">
                      <p className="text-[11px] text-rose-800">
                        Cancel this meeting? The reserved time will be released and the
                        requester will receive a cancellation email.
                      </p>
                      <label
                        htmlFor={`admin-meeting-cancel-reason-${item._id || item.id}`}
                        className="block text-[11px] font-medium text-rose-800"
                      >
                        Cancellation reason (optional)
                      </label>
                      <input
                        id={`admin-meeting-cancel-reason-${item._id || item.id}`}
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        maxLength={500}
                        className="w-full rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void runMeetingAction({
                              action: "cancel",
                              reason: cancelReason.trim() || undefined,
                            })
                          }
                          disabled={meetingBusy}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"
                        >
                          {meetingBusy && (
                            <Loader2 size={12} aria-hidden className="animate-spin" />
                          )}
                          Confirm cancellation
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMeetingEditor(null);
                            setMeetingActionError(null);
                          }}
                          disabled={meetingBusy}
                          className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-50"
                        >
                          Keep meeting
                        </button>
                      </div>
                    </div>
                  )}

                  {meetingEditor === "complete" && (
                    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                      <p className="text-[11px] text-emerald-900">
                        Mark this meeting as completed? The reserved time will be released.
                        No email is sent for completion.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void runMeetingAction({ action: "complete" })}
                          disabled={meetingBusy}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
                        >
                          {meetingBusy && (
                            <Loader2 size={12} aria-hidden className="animate-spin" />
                          )}
                          Confirm completion
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMeetingEditor(null);
                            setMeetingActionError(null);
                          }}
                          disabled={meetingBusy}
                          className="inline-flex min-h-9 items-center rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </div>
        )}

        {readOnlyLegacyMeeting ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            This historical meeting request is read-only. Its replies and private notes are
            managed by the legacy record and are not part of the new support flow.
          </p>
        ) : (
          <>
            {canWrite && !closed && recipientUnavailable && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                This account has been anonymized. Public replies and outbound
                email are disabled because the recipient is no longer available.
              </p>
            )}
            {canWrite && !closed && !recipientUnavailable && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label
                  htmlFor={`admin-support-reply-${item.kind}-${item._id || item.id}`}
                  className="sr-only"
                >
                  Public reply to {item.subject}
                </label>
                <input
                  id={`admin-support-reply-${item.kind}-${item._id || item.id}`}
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendReply();
                    }
                  }}
                  disabled={replySending}
                  placeholder="Public reply — the user receives this by email"
                  className="min-w-0 flex-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={replySending || !replyDraft.trim()}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {replySending ? (
                    <Loader2 size={13} aria-hidden className="animate-spin" />
                  ) : (
                    <MessageSquare size={13} aria-hidden />
                  )}
                  Send reply
                </button>
              </div>
            )}
            {closed && canWrite && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                This ticket is closed. Reopen it before sending another public reply.
              </p>
            )}

            {canWrite && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60">
                <button
                  type="button"
                  onClick={toggleNotes}
                  aria-expanded={notesOpen}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Lock size={12} aria-hidden />
                    Internal notes — not shared with the user
                  </span>
                  <span className="text-[10px] font-normal text-amber-700">
                    {notesOpen ? "Hide" : "Show"}
                  </span>
                </button>
                {notesOpen && (
                  <div className="space-y-2 border-t border-amber-200 px-3 py-2.5">
                    {notesLoading ? (
                      <p className="flex items-center gap-1.5 text-xs text-amber-800">
                        <Loader2 size={12} aria-hidden className="animate-spin" />
                        Loading internal notes…
                      </p>
                    ) : notesError ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-rose-700">
                        <span>{notesError}</span>
                        <button
                          type="button"
                          onClick={() => void loadNotes()}
                          className="rounded-md border border-rose-200 bg-white px-2 py-1 font-medium"
                        >
                          Retry
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {(notes || []).length === 0 ? (
                          <p className="text-xs text-amber-800">No internal notes yet.</p>
                        ) : (
                          (notes || []).map((note, index) => (
                            <div
                              key={note.id || note._id || index}
                              className="rounded-lg border border-amber-200 bg-white/70 px-2.5 py-2 text-xs text-amber-950"
                            >
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-amber-700">
                                <StickyNote size={11} aria-hidden />
                                <span className="font-semibold">
                                  {note.admin?.name || "Admin"}
                                </span>
                                <span>· {formatAdminDate(note.createdAt)}</span>
                              </div>
                              <p className="mt-0.5 whitespace-pre-wrap break-words">
                                {note.body}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label
                        htmlFor={`admin-support-note-${item.kind}-${item._id || item.id}`}
                        className="sr-only"
                      >
                        Private internal note
                      </label>
                      <input
                        id={`admin-support-note-${item.kind}-${item._id || item.id}`}
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        placeholder="Add a private note (never emailed)"
                        maxLength={5000}
                        className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                      />
                      <button
                        type="button"
                        onClick={() => void addNote()}
                        disabled={noteSaving || !noteDraft.trim()}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {noteSaving && (
                          <Loader2 size={11} aria-hidden className="animate-spin" />
                        )}
                        Add note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </article>
    </div>
  );
}
