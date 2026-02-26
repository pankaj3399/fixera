import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChatPolling } from "@/hooks/useChatPolling";
import { fetchConversations } from "@/lib/chatApi";

const isAllowedRole = (role?: string) => role === "customer" || role === "professional";

export const useUnreadCount = () => {
  const { user, isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const userRole = user?.role;
  const enabled = isAuthenticated && isAllowedRole(userRole);

  const poll = useCallback(async () => {
    try {
      const data = await fetchConversations({ page: 1, limit: 50 });
      const total = (data.conversations || []).reduce((sum, c) => {
        if (userRole === "professional") {
          return sum + (c.professionalUnreadCount || 0);
        }
        return sum + (c.customerUnreadCount || 0);
      }, 0);
      setUnreadCount(total);
    } catch {
      // silently ignore polling errors
    }
  }, [userRole]);

  useChatPolling(poll, 15000, enabled, [userRole]);

  return { unreadCount, enabled };
};
