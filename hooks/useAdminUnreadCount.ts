import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChatPolling } from "@/hooks/useChatPolling";
import { authFetch } from "@/lib/utils";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;

export const ADMIN_ACTIVE_CONVERSATION_KEY = "fixera.admin.activeConversationId";
export const ADMIN_CONVERSATION_SEEN_PREFIX = "fixera.admin.conversationSeen.";

export const getAdminActiveConversationId = (): string => {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ADMIN_ACTIVE_CONVERSATION_KEY) || "";
  } catch {
    return "";
  }
};

export const setAdminActiveConversationId = (conversationId: string) => {
  if (typeof window === "undefined") return;
  try {
    if (conversationId) {
      window.localStorage.setItem(ADMIN_ACTIVE_CONVERSATION_KEY, conversationId);
    }
  } catch {
    // ignore storage errors
  }
};

export const getAdminConversationSeenAt = (conversationId: string): number => {
  if (typeof window === "undefined" || !conversationId) return 0;
  try {
    const raw = window.localStorage.getItem(ADMIN_CONVERSATION_SEEN_PREFIX + conversationId);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

export const markAdminConversationSeen = (conversationId: string, seenAt: number = Date.now()) => {
  if (typeof window === "undefined" || !conversationId) return;
  try {
    window.localStorage.setItem(ADMIN_CONVERSATION_SEEN_PREFIX + conversationId, String(seenAt));
    window.dispatchEvent(new CustomEvent("fixera:admin-chat-seen"));
  } catch {
    // ignore storage errors
  }
};

export const useAdminUnreadCount = () => {
  const { user, isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const enabled = isAuthenticated && user?.role === "admin";

  const poll = useCallback(async () => {
    if (!BACKEND) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await authFetch(`${BACKEND}/api/admin/conversations/unread-count`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        return;
      }
      const count = Number(json.data?.count);
      setUnreadCount(Number.isFinite(count) && count > 0 ? count : 0);
    } catch {
      // silently ignore polling errors
    }
  }, []);

  useChatPolling(poll, 15000, enabled, []);

  useEffect(() => {
    if (!enabled) return;
    const onSeen = () => void poll();
    window.addEventListener("fixera:admin-chat-seen", onSeen);
    return () => window.removeEventListener("fixera:admin-chat-seen", onSeen);
  }, [enabled, poll]);

  return { unreadCount, enabled };
};
