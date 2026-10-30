import { authFetch } from "@/lib/utils";
import { ApiRequestError, apiErrorFromBody } from "@/lib/apiErrors";
import type { ServerSupportReason, SupportReasonId } from "@/lib/support/reasons";
import {
  adminSupportMeetingPath,
  buildAdminSupportMeetingBody,
  type AdminSupportMeetingAction,
} from "@/lib/support/meetingActions";
import { supportAttachmentMimeForName } from "@/lib/support/validation";

export {
  adminSupportMeetingPath,
  buildAdminSupportMeetingBody,
};
export type { AdminSupportMeetingAction };

const API = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export type SupportKind = "ticket" | "meeting";
export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type SupportMeetingStatus =
  | "pending"
  | "scheduled"
  | "declined"
  | "cancelled"
  | "completed";
export type SupportDisplayStatus = SupportTicketStatus | SupportMeetingStatus;
export type SupportUserType = "customer" | "professional";
export type SupportLocale = "en" | "nl" | "fr";
export type SupportReplyAuthorRole = "customer" | "professional" | "admin";

export interface SupportRequester {
  _id?: string;
  id: string;
  name?: string;
  email?: string;
  role?: string;
  deletedAt?: string | null;
  isAnonymized?: boolean;
}

export interface SupportBookingRef {
  _id: string;
  id: string;
  bookingNumber: string;
  title: string;
  projectTitle: string;
  counterpartName: string;
  counterpartyName: string;
  label: string;
}

export interface SupportAttachmentDto {
  url: string | null;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface SupportReplyDto {
  _id?: string;
  authorId?: string;
  authorRole: SupportReplyAuthorRole;
  body: string;
  createdAt: string;
}

export interface SupportMeetingDto {
  status: SupportMeetingStatus;
  scheduledAt: string | null;
  endAt: string | null;
  durationMinutes: number;
  timeZone: string | null;
  meetingLink: string | null;
  /** True only while scheduled with a real link; authoritative join gate. */
  linkActive?: boolean;
  linkAddedAt?: string | null;
  linkUpdatedAt?: string | null;
  confirmationEmailSentAt?: string | null;
  assignedAdminName: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  cancelledBy: "user" | "admin" | null;
  preferredTimes: string | null;
  adminResponse: string | null;
  legacy: boolean;
}

export interface SupportItemTags {
  reason: string | null;
  reasonLabel: string | null;
  booking: { id: string; number: string; label: string } | null;
  userType: SupportUserType;
  meetingAt: string | null;
  kind: SupportKind;
}

export interface SupportItem {
  _id: string;
  id: string;
  kind: SupportKind;
  ticketNumber: string | null;
  subject: string;
  description: string;
  reason: string | null;
  reasonLabel: string | null;
  status: SupportDisplayStatus;
  ticketStatus: SupportTicketStatus;
  requester: SupportRequester;
  requesterRole: SupportUserType;
  booking: SupportBookingRef | null;
  attachments: SupportAttachmentDto[];
  attachment: SupportAttachmentDto | null;
  replies: SupportReplyDto[];
  meeting: SupportMeetingDto | null;
  tags: SupportItemTags;
  createdAt: string;
  updatedAt: string;
}

export interface SupportInternalNote {
  _id?: string;
  id: string;
  body: string;
  admin: { _id?: string; id?: string; name?: string } | null;
  createdAt: string;
}

export interface SupportAdminUser {
  _id?: string;
  id: string;
  name?: string;
  email?: string;
  role?: string;
  deletedAt?: string | null;
  isAnonymized?: boolean;
}

export interface SupportAdminItem extends SupportItem {
  user: SupportAdminUser;
  userId: SupportAdminUser;
  meetingAdmin: SupportAdminUser | null;
  replyCount: number;
  lastReplyAt: string | null;
  legacy: boolean;
}

export interface SupportPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Backend guard: list pages above 200 are rejected rather than unbounded. */
export const SUPPORT_MAX_PAGE = 200;

export interface SupportList<T> {
  items: T[];
  pagination: SupportPagination;
}

export interface SupportCapabilities {
  role: SupportUserType;
  channels?: { tickets?: boolean; meetings?: boolean; chat?: boolean };
  canCreateTicket: boolean;
  canPlanMeeting: boolean;
  canUseSupportChat: boolean;
  supportChatEnabled: boolean;
  /** Legacy flag: true now that manual-link booking is enabled. */
  meetingProviderAvailable?: boolean;
  /** Booking and reservation are available even before a link is supplied. */
  meetingBookingAvailable?: boolean;
  /** `manual` means a support admin supplies the real HTTPS link. */
  meetingLinkMode?: "manual" | string;
  meetingLinkSuppliedByAdmin?: boolean;
  meetingConfirmationRequiresLink?: boolean;
  meetingDurationMinutes: number;
  locales: SupportLocale[];
  ticketReasons?: string[];
  reasons?: ServerSupportReason[];
  reasonLabels?: Record<string, string>;
}

export interface SupportBookingOption {
  bookingId: string;
  bookingNumber: string;
  projectTitle: string;
  counterpartyName: string;
  label: string;
}

export interface SupportSlot {
  start: string;
  end: string;
  localStart: string;
  localEnd: string;
  adminIds?: string[];
}

export interface SupportCalendarEvent {
  source: "support";
  kind: "meeting";
  id: string;
  ticketNumber: string | null;
  subject: string;
  status: SupportMeetingStatus;
  ticketStatus: SupportTicketStatus;
  start: string;
  end: string;
  localStart: string;
  localEnd: string;
  displayTimeZone: string;
  timeZone: string | null;
  durationMinutes: number;
  meetingLink: string | null;
  linkActive?: boolean;
  legacy: boolean;
  admin?: { id: string; name: string | null } | null;
  user?: { id: string; name: string | null; email: string | null } | null;
}

export interface SupportAvailability {
  timeZone: string;
  durationMinutes: number;
  slots: SupportSlot[];
  events?: SupportCalendarEvent[];
  admins?: Array<{ id: string; name?: string; timeZone?: string }>;
  /** Admin endpoint only: the professional whose calendar is combined. */
  professional?: { id: string; name?: string; timeZone?: string } | null;
}

export interface SupportCreateInput {
  kind: SupportKind;
  reason: SupportReasonId | string;
  subject: string;
  description: string;
  bookingId?: string;
  locale?: SupportLocale;
  attachment?: File | null;
  scheduledAt?: string;
  timeZone?: string;
}

export interface SupportCreateResult {
  item: SupportItem;
  emailSent: boolean | null;
}

export interface SupportReplyResult {
  item: SupportItem;
  emailSent: boolean | null;
}

export interface AdminSupportReplyResult {
  item: SupportAdminItem;
  emailSent: boolean | null;
}

export interface AdminSupportMeetingResult extends AdminSupportReplyResult {
  /** Server idempotency marker for repeated same-link saves. */
  unchanged: boolean | null;
}

export interface AdminSupportQuery {
  q?: string;
  status?: SupportDisplayStatus | "";
  userType?: SupportUserType | "";
  reason?: string;
  booking?: string;
  kind?: SupportKind | "";
  meeting?: "with" | "without" | "";
  meetingFrom?: string;
  meetingTo?: string;
  page?: number;
  limit?: number;
}

type Envelope<T> = {
  data: T;
  emailSent: boolean | null;
  unchanged: boolean | null;
};

async function parseEnvelope<T>(
  res: Response,
  fallback: string,
): Promise<Envelope<T>> {
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    throw apiErrorFromBody(body, fallback, { status: res.status });
  }
  if (body == null || body.data == null) {
    throw new ApiRequestError(
      "The server returned an unexpected response.",
      { kind: "invalidResponse", status: res.status },
    );
  }
  return {
    data: body.data as T,
    emailSent: typeof body.emailSent === "boolean" ? body.emailSent : null,
    unchanged: typeof body.unchanged === "boolean" ? body.unchanged : null,
  };
}

async function requestData<T>(
  url: string,
  fallback: string,
  init?: RequestInit,
): Promise<T> {
  const res = await authFetch(url, init);
  return (await parseEnvelope<T>(res, fallback)).data;
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  };
}

export async function getSupportCapabilities(
  signal?: AbortSignal,
): Promise<SupportCapabilities> {
  return requestData<SupportCapabilities>(
    `${API}/api/support/capabilities`,
    "We couldn't load support options. Please try again.",
    { signal },
  );
}

export async function listSupportBookings(
  signal?: AbortSignal,
): Promise<SupportBookingOption[]> {
  const data = await requestData<{ items: SupportBookingOption[] }>(
    `${API}/api/support/bookings`,
    "We couldn't load your bookings. Please try again.",
    { signal },
  );
  return Array.isArray(data.items) ? data.items : [];
}

export async function listSupportItems(params: {
  kind?: SupportKind;
  status?: SupportDisplayStatus;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<SupportList<SupportItem>> {
  const query = new URLSearchParams();
  if (params.kind) query.set("kind", params.kind);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return requestData<SupportList<SupportItem>>(
    `${API}/api/support/items${qs ? `?${qs}` : ""}`,
    "We couldn't load your support items. Please try again.",
    { signal: params.signal },
  );
}

export async function getSupportItem(
  kind: SupportKind,
  id: string,
  signal?: AbortSignal,
): Promise<SupportItem> {
  return requestData<SupportItem>(
    `${API}/api/support/items/${kind}/${encodeURIComponent(id)}`,
    "We couldn't load that support item. Please try again.",
    { signal },
  );
}

/**
 * Some OS/browser combinations report an empty MIME type for a valid file.
 * Fill it from the allowed extension so the multipart upload carries a type the
 * server can compare against its magic-byte sniff; explicit MIME types are
 * never replaced.
 */
function normalizeSupportAttachment(file: File): File {
  if (file.type || !file.name) return file;
  const inferred = supportAttachmentMimeForName(file.name);
  if (!inferred || typeof File === "undefined") return file;
  try {
    return new File([file], file.name, {
      type: inferred,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

export async function createSupportItem(
  input: SupportCreateInput,
): Promise<SupportCreateResult> {
  const form = new FormData();
  form.append("kind", input.kind);
  form.append("reason", input.reason);
  form.append("subject", input.subject.trim());
  form.append("description", input.description.trim());
  if (input.bookingId) form.append("bookingId", input.bookingId);
  if (input.locale) form.append("locale", input.locale);
  if (input.kind === "meeting") {
    if (input.scheduledAt) form.append("scheduledAt", input.scheduledAt);
    if (input.timeZone) form.append("timeZone", input.timeZone);
  }
  if (input.attachment) {
    form.append("attachment", normalizeSupportAttachment(input.attachment));
  }

  const fallback =
    input.kind === "meeting"
      ? "We couldn't request that meeting. Please try again."
      : "We couldn't create your ticket. Please try again.";
  const res = await authFetch(`${API}/api/support/items`, {
    method: "POST",
    body: form,
  });
  const { data, emailSent } = await parseEnvelope<SupportItem>(res, fallback);
  return { item: data, emailSent };
}

export async function replySupportItem(
  kind: SupportKind,
  id: string,
  body: string,
): Promise<SupportItem> {
  const res = await authFetch(
    `${API}/api/support/items/${kind}/${encodeURIComponent(id)}/replies`,
    jsonBody({ body }),
  );
  return (await parseEnvelope<SupportItem>(
    res,
    "We couldn't add your reply. Please try again.",
  )).data;
}

export async function cancelSupportMeeting(
  id: string,
  reason?: string,
): Promise<SupportReplyResult> {
  const res = await authFetch(
    `${API}/api/support/items/meeting/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting: {
          action: "cancel",
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        },
      }),
    },
  );
  const { data, emailSent } = await parseEnvelope<SupportItem>(
    res,
    "We couldn't cancel that meeting. Please try again.",
  );
  return { item: data, emailSent };
}

export async function listSupportAvailability(params: {
  from: string;
  to: string;
  timeZone: string;
  excludeItemId?: string;
  signal?: AbortSignal;
}): Promise<SupportAvailability> {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    timeZone: params.timeZone,
  });
  if (params.excludeItemId) query.set("excludeItemId", params.excludeItemId);
  return requestData<SupportAvailability>(
    `${API}/api/support/meeting-availability?${query.toString()}`,
    "We couldn't load available meeting times. Please try again.",
    { signal: params.signal },
  );
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export async function adminListSupportItems(
  params: AdminSupportQuery & { signal?: AbortSignal } = {},
): Promise<SupportList<SupportAdminItem>> {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.status) query.set("status", params.status);
  if (params.userType) query.set("userType", params.userType);
  if (params.reason) query.set("reason", params.reason);
  if (params.booking?.trim()) query.set("booking", params.booking.trim());
  if (params.kind) query.set("kind", params.kind);
  if (params.meeting) query.set("meeting", params.meeting);
  if (params.meetingFrom) query.set("meetingFrom", params.meetingFrom);
  if (params.meetingTo) query.set("meetingTo", params.meetingTo);
  query.set("page", String(params.page || 1));
  query.set("limit", String(params.limit || 20));

  return requestData<SupportList<SupportAdminItem>>(
    `${API}/api/admin/support/items?${query.toString()}`,
    "Failed to load support items.",
    { signal: params.signal },
  );
}

export async function adminGetSupportItem(
  kind: SupportKind,
  id: string,
  signal?: AbortSignal,
): Promise<SupportAdminItem> {
  return requestData<SupportAdminItem>(
    `${API}/api/admin/support/items/${kind}/${encodeURIComponent(id)}`,
    "Failed to load the support item.",
    { signal },
  );
}

export async function adminListSupportNotes(
  kind: SupportKind,
  id: string,
  signal?: AbortSignal,
): Promise<SupportInternalNote[]> {
  const data = await requestData<{ items: SupportInternalNote[] }>(
    `${API}/api/admin/support/items/${kind}/${encodeURIComponent(id)}/notes`,
    "Failed to load internal notes.",
    { signal },
  );
  return Array.isArray(data.items) ? data.items : [];
}

export async function adminAddSupportNote(
  kind: SupportKind,
  id: string,
  body: string,
): Promise<SupportInternalNote> {
  const res = await authFetch(
    `${API}/api/admin/support/items/${kind}/${encodeURIComponent(id)}/notes`,
    jsonBody({ body }),
  );
  return (await parseEnvelope<SupportInternalNote>(
    res,
    "Failed to add the internal note.",
  )).data;
}

export async function adminReplySupportItem(
  kind: SupportKind,
  id: string,
  body: string,
): Promise<AdminSupportReplyResult> {
  const res = await authFetch(
    `${API}/api/admin/support/items/${kind}/${encodeURIComponent(id)}/replies`,
    jsonBody({ body }),
  );
  const { data, emailSent } = await parseEnvelope<SupportAdminItem>(
    res,
    "Failed to send the reply.",
  );
  return { item: data, emailSent };
}

export async function adminUpdateSupportStatus(
  kind: SupportKind,
  id: string,
  status: SupportTicketStatus,
): Promise<SupportAdminItem> {
  const res = await authFetch(
    `${API}/api/admin/support/items/${kind}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
  return (await parseEnvelope<SupportAdminItem>(
    res,
    "Failed to update the support status.",
  )).data;
}

export async function adminUpdateSupportMeeting(
  kind: SupportKind,
  id: string,
  action: AdminSupportMeetingAction,
): Promise<AdminSupportMeetingResult> {
  const res = await authFetch(
    `${API}${adminSupportMeetingPath(kind, id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAdminSupportMeetingBody(action)),
    },
  );
  const { data, emailSent, unchanged } = await parseEnvelope<SupportAdminItem>(
    res,
    "Failed to update the meeting.",
  );
  return { item: data, emailSent, unchanged };
}

/** Admin adds or replaces the real HTTPS link for an existing meeting. */
export function adminSetSupportMeetingLink(
  kind: SupportKind,
  id: string,
  meetingLink: string,
): Promise<AdminSupportMeetingResult> {
  return adminUpdateSupportMeeting(kind, id, {
    action: "set_link",
    meetingLink: meetingLink.trim(),
  });
}

export async function adminListSupportAvailability(params: {
  from: string;
  to: string;
  timeZone: string;
  excludeItemId?: string;
  /** The professional whose calendar must also be free (authorized owner context). */
  professionalId?: string;
  signal?: AbortSignal;
}): Promise<SupportAvailability> {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    timeZone: params.timeZone,
  });
  if (params.excludeItemId) query.set("excludeItemId", params.excludeItemId);
  if (params.professionalId) query.set("professionalId", params.professionalId);
  return requestData<SupportAvailability>(
    `${API}/api/admin/support/availability?${query.toString()}`,
    "Failed to load combined availability.",
    { signal: params.signal },
  );
}

export async function adminSetSupportChatEnabled(
  enabled: boolean,
): Promise<{ supportChatEnabled: boolean }> {
  const res = await authFetch(`${API}/api/admin/platform-settings/support-chat`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return (await parseEnvelope<{ supportChatEnabled: boolean }>(
    res,
    "Failed to update the support chat setting.",
  )).data;
}
