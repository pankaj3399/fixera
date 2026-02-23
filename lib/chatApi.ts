import { getAuthToken } from "@/lib/utils";
import type { ChatConversation, ConversationListResponse, MessageListResponse, ChatMessage } from "@/types/chat";

const getAuthHeaders = (headers?: Record<string, string>) => {
  const token = getAuthToken();
  const merged: Record<string, string> = { ...(headers || {}) };
  if (token) {
    merged.Authorization = `Bearer ${token}`;
  }
  return merged;
};

const parseJson = async <T,>(response: Response): Promise<T | null> => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const toErrorMessage = async (response: Response, fallback: string) => {
  const data = await parseJson<{ msg?: string; message?: string }>(response);
  return data?.msg || data?.message || fallback;
};

const API_BASE = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`;

export const createOrGetConversation = async (payload: {
  professionalId: string;
  bookingId?: string;
}) => {
  const response = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  const data = await parseJson<{ success?: boolean; conversation?: ChatConversation; msg?: string }>(response);
  if (!response.ok || !data?.success || !data.conversation) {
    throw new Error(data?.msg || `Failed to start chat (${response.status})`);
  }

  return data.conversation;
};

export const fetchConversations = async (params?: { page?: number; limit?: number }) => {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));

  const response = await fetch(`${API_BASE}/conversations${query.toString() ? `?${query.toString()}` : ""}`, {
    method: "GET",
    credentials: "include",
    headers: getAuthHeaders(),
  });

  const data = await parseJson<ConversationListResponse>(response);
  if (!response.ok || !data?.success || !data.data) {
    throw new Error((data && data.msg) || `Failed to load conversations (${response.status})`);
  }

  return data.data;
};

export const fetchConversationMessages = async (
  conversationId: string,
  params?: { before?: string; limit?: number }
) => {
  const query = new URLSearchParams();
  if (params?.before) query.set("before", params.before);
  if (params?.limit) query.set("limit", String(params.limit));

  const response = await fetch(
    `${API_BASE}/conversations/${encodeURIComponent(conversationId)}/messages${query.toString() ? `?${query.toString()}` : ""}`,
    {
      method: "GET",
      credentials: "include",
      headers: getAuthHeaders(),
    }
  );

  const data = await parseJson<MessageListResponse>(response);
  if (!response.ok || !data?.success || !data.data) {
    throw new Error((data && data.msg) || `Failed to load messages (${response.status})`);
  }

  return data.data;
};

export const sendConversationMessage = async (
  conversationId: string,
  payload: { text?: string; images?: string[] }
) => {
  const response = await fetch(`${API_BASE}/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  const data = await parseJson<{ success?: boolean; message?: ChatMessage; msg?: string }>(response);
  if (!response.ok || !data?.success || !data.message) {
    throw new Error((data && data.msg) || `Failed to send message (${response.status})`);
  }

  return data.message;
};

export const markConversationAsRead = async (conversationId: string) => {
  const response = await fetch(`${API_BASE}/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
  });

  if (!response.ok) {
    const message = await toErrorMessage(response, `Failed to mark conversation as read (${response.status})`);
    throw new Error(message);
  }
};

export const uploadChatImage = async (file: File, conversationId?: string) => {
  const formData = new FormData();
  formData.append("image", file);
  if (conversationId) {
    formData.append("conversationId", conversationId);
  }

  const response = await fetch(`${API_BASE}/upload-image`, {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders(),
    body: formData,
  });

  const data = await parseJson<{ success?: boolean; data?: { url: string; key: string }; msg?: string }>(response);
  if (!response.ok || !data?.success || !data.data) {
    throw new Error((data && data.msg) || `Image upload failed (${response.status})`);
  }

  return data.data;
};
