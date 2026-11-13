import type { SupportMeetingDto } from "../support";

function isRealHttpsMeetingLink(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      Boolean(parsed.hostname) &&
      value.length <= 500
    );
  } catch {
    return false;
  }
}

/**
 * Manual-link meeting lifecycle as the user actually experiences it.
 *
 * `pending` means the 30-minute slot is really reserved but no meeting link
 * exists yet. `scheduled` only becomes joinable once the server returns a real
 * HTTPS link. A scheduled record without a link is surfaced honestly as
 * `missing_link` instead of pretending it is confirmed.
 */
export type SupportMeetingPhase =
  | "legacy"
  | "awaiting_link"
  | "confirmed"
  | "missing_link"
  | "cancelled"
  | "declined"
  | "completed";

type MeetingPhaseInput = Pick<
  SupportMeetingDto,
  "status" | "meetingLink" | "linkActive" | "legacy"
>;

/**
 * A real link is joinable only when it validates and the server does not
 * explicitly mark it inactive. `linkActive` is the authoritative gate; the
 * URL check is a second safety net for older payloads.
 */
export function supportMeetingHasActiveLink(
  meeting: Pick<SupportMeetingDto, "meetingLink" | "linkActive"> | null | undefined,
): boolean {
  if (!meeting || !isRealHttpsMeetingLink(meeting.meetingLink)) return false;
  return meeting.linkActive !== false;
}

export function supportMeetingPhase(
  meeting: MeetingPhaseInput | null | undefined,
): SupportMeetingPhase | null {
  if (!meeting) return null;
  if (meeting.legacy) return "legacy";

  if (meeting.status === "cancelled") return "cancelled";
  if (meeting.status === "declined") return "declined";
  if (meeting.status === "completed") return "completed";
  if (meeting.status === "pending") return "awaiting_link";
  if (meeting.status === "scheduled") {
    return supportMeetingHasActiveLink(meeting) ? "confirmed" : "missing_link";
  }
  return null;
}

/**
 * Copy for the professional right after submit. The assigned admin's default
 * link confirms the meeting at once (the email carries time + link); without
 * one the slot is only reserved and the acknowledgement says the link follows.
 */
export function supportMeetingSubmitOutcome(
  meeting: MeetingPhaseInput | null | undefined,
): "confirmed" | "reserved" {
  return supportMeetingPhase(meeting) === "confirmed" ? "confirmed" : "reserved";
}

/** Join URL only for a confirmed meeting with a validated real HTTPS link. */
export function supportMeetingJoinUrl(
  meeting: Pick<
    SupportMeetingDto,
    "status" | "meetingLink" | "linkActive" | "legacy"
  > | null | undefined,
): string | null {
  if (!meeting || meeting.legacy || meeting.status !== "scheduled") return null;
  return supportMeetingHasActiveLink(meeting) ? meeting.meetingLink : null;
}

/** Whether a support admin may add/edit the link for this meeting. */
export function canAdminSetSupportMeetingLink(params: {
  itemKind: "ticket" | "meeting";
  meeting: Pick<
    SupportMeetingDto,
    "status" | "meetingLink" | "legacy" | "scheduledAt"
  > | null;
  canWrite: boolean;
  now?: Date;
}): boolean {
  const { itemKind, meeting, canWrite, now = new Date() } = params;
  if (!canWrite || itemKind !== "meeting" || !meeting || meeting.legacy) {
    return false;
  }
  if (meeting.status !== "pending" && meeting.status !== "scheduled") {
    return false;
  }
  if (!meeting.scheduledAt) return false;
  const start = new Date(meeting.scheduledAt);
  if (!Number.isFinite(start.getTime())) return false;
  // The server refuses link changes once the reserved time has passed.
  return start.getTime() > now.getTime();
}

/**
 * Rescheduling is allowed for future pending/scheduled meetings. A support
 * admin may additionally repair a pending meeting whose link-less slot passed;
 * the server permits that specific case.
 */
export function canRescheduleSupportMeeting(params: {
  meeting: Pick<
    SupportMeetingDto,
    "status" | "meetingLink" | "legacy" | "scheduledAt"
  > | null;
  asAdmin?: boolean;
  now?: Date;
}): boolean {
  const { meeting, asAdmin = false, now = new Date() } = params;
  if (!meeting || meeting.legacy) return false;
  if (meeting.status !== "pending" && meeting.status !== "scheduled") return false;
  if (!meeting.scheduledAt) return false;
  const start = new Date(meeting.scheduledAt);
  if (!Number.isFinite(start.getTime())) return false;
  if (start.getTime() > now.getTime()) return true;
  return asAdmin && meeting.status === "pending" && !meeting.meetingLink;
}

/** Cancellation uses the same time rules as the server. */
export function canCancelSupportMeeting(params: {
  meeting: Pick<
    SupportMeetingDto,
    "status" | "meetingLink" | "legacy" | "scheduledAt"
  > | null;
  asAdmin?: boolean;
  now?: Date;
}): boolean {
  const { meeting, asAdmin = false, now = new Date() } = params;
  if (!meeting || meeting.legacy) return false;
  if (meeting.status !== "pending" && meeting.status !== "scheduled") return false;
  if (!meeting.scheduledAt) return false;
  const start = new Date(meeting.scheduledAt);
  if (!Number.isFinite(start.getTime())) return false;
  // Admins may cancel a past pending/scheduled meeting; owners may not.
  if (asAdmin) return true;
  if (start.getTime() > now.getTime()) return true;
  return meeting.status === "pending" && !meeting.meetingLink;
}

/** Completion is terminal and only makes sense after a real link was saved. */
export function canCompleteSupportMeeting(
  meeting: Pick<
    SupportMeetingDto,
    "status" | "meetingLink" | "linkActive" | "legacy"
  > | null | undefined,
): boolean {
  if (!meeting || meeting.legacy) return false;
  return meeting.status === "scheduled" && supportMeetingHasActiveLink(meeting);
}
