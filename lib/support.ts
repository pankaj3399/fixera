import { authFetch } from "@/lib/utils";

const API = () => process.env.NEXT_PUBLIC_BACKEND_URL || "";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicketReply {
  authorId: string;
  authorRole: "professional" | "admin";
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  userId: string | { _id: string; name?: string; email?: string; role?: string };
  subject: string;
  description: string;
  status: SupportTicketStatus;
  replies: SupportTicketReply[];
  createdAt: string;
  updatedAt: string;
}

export type MeetingRequestStatus = "pending" | "scheduled" | "declined" | "cancelled";

export interface MeetingRequest {
  _id: string;
  userId: string | { _id: string; name?: string; email?: string; role?: string };
  topic: string;
  preferredTimes: string;
  durationMinutes: number;
  status: MeetingRequestStatus;
  adminResponse?: string;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
}

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok || body?.success === false) {
    throw new Error(body?.msg || `Request failed (${res.status})`);
  }
  return body.data as T;
}

export async function proListMyTickets(): Promise<SupportTicket[]> {
  const res = await authFetch(`${API()}/api/professionals/support/tickets`);
  return (await asJson<{ items: SupportTicket[] }>(res)).items;
}

export async function proCreateTicket(payload: { subject: string; description: string }): Promise<SupportTicket> {
  const res = await authFetch(`${API()}/api/professionals/support/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return asJson<SupportTicket>(res);
}

export async function proReplyTicket(id: string, body: string): Promise<SupportTicket> {
  const res = await authFetch(`${API()}/api/professionals/support/tickets/${id}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return asJson<SupportTicket>(res);
}

export async function proListMyMeetingRequests(): Promise<MeetingRequest[]> {
  const res = await authFetch(`${API()}/api/professionals/support/meeting-requests`);
  return (await asJson<{ items: MeetingRequest[] }>(res)).items;
}

export async function proCreateMeetingRequest(payload: {
  topic: string;
  preferredTimes: string;
  durationMinutes: number;
}): Promise<MeetingRequest> {
  const res = await authFetch(`${API()}/api/professionals/support/meeting-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return asJson<MeetingRequest>(res);
}

export async function adminListTickets(status?: SupportTicketStatus): Promise<SupportTicket[]> {
  const qs = status ? `?status=${status}` : "";
  const res = await authFetch(`${API()}/api/admin/support/tickets${qs}`);
  return (await asJson<{ items: SupportTicket[] }>(res)).items;
}

export async function adminUpdateTicket(id: string, payload: { status?: SupportTicketStatus; reply?: string }): Promise<SupportTicket> {
  const res = await authFetch(`${API()}/api/admin/support/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return asJson<SupportTicket>(res);
}

export async function adminListMeetingRequests(status?: MeetingRequestStatus): Promise<MeetingRequest[]> {
  const qs = status ? `?status=${status}` : "";
  const res = await authFetch(`${API()}/api/admin/support/meeting-requests${qs}`);
  return (await asJson<{ items: MeetingRequest[] }>(res)).items;
}

export async function adminUpdateMeetingRequest(id: string, payload: {
  status?: MeetingRequestStatus;
  adminResponse?: string;
  scheduledAt?: string;
}): Promise<MeetingRequest> {
  const res = await authFetch(`${API()}/api/admin/support/meeting-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return asJson<MeetingRequest>(res);
}
