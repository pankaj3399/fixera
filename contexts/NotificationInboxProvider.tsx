'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getAuthToken } from '@/lib/utils';

export interface InboxNotification {
  id: string;
  eventKey: string;
  category: string;
  title: string;
  body: string;
  clickUrl: string;
  entityType?: string;
  entityId?: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationInboxContextValue {
  items: InboxNotification[];
  pendingItems: InboxNotification[] | null;
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationInboxContext = createContext<NotificationInboxContextValue>({
  items: [],
  pendingItems: null,
  unreadCount: 0,
  loading: false,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
});

export const useNotificationInbox = () => useContext(NotificationInboxContext);

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').replace(/\/+$/, '');
const POLL_MS = 45_000;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

interface ProviderProps {
  isAuthenticated: boolean;
  sessionKey: string | null;
  children: React.ReactNode;
}

export const NotificationInboxProvider: React.FC<ProviderProps> = ({
  isAuthenticated,
  sessionKey,
  children,
}) => {
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [pendingItems, setPendingItems] = useState<InboxNotification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const sessionKeyRef = useRef(sessionKey);
  const abortRef = useRef<AbortController | null>(null);
  const pendingAbortRef = useRef<AbortController | null>(null);

  // Sync account guard + clear inbox before paint so stale requests cannot repopulate it.
  useLayoutEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    sessionKeyRef.current = sessionKey;
    abortRef.current?.abort();
    abortRef.current = null;
    pendingAbortRef.current?.abort();
    pendingAbortRef.current = null;
    setPendingItems(null);
    setItems([]);
    setUnreadCount(0);
    setLoading(false);
  }, [isAuthenticated, sessionKey]);

  const refreshInbox = useCallback(async () => {
    if (!isAuthenticatedRef.current || !BACKEND_URL) {
      setItems([]);
      setUnreadCount(0);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestSessionKey = sessionKeyRef.current;

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/notifications?limit=20`, {
        credentials: 'include',
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) return;
      if (
        !isAuthenticatedRef.current ||
        sessionKeyRef.current !== requestSessionKey ||
        controller.signal.aborted
      ) return;
      const json = await res.json();
      if (
        !isAuthenticatedRef.current ||
        sessionKeyRef.current !== requestSessionKey ||
        controller.signal.aborted
      ) return;
      if (json?.success && json.data) {
        setItems(json.data.items ?? []);
        setUnreadCount(json.data.unreadCount ?? 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // ignore transient network errors
    } finally {
      if (!controller.signal.aborted && sessionKeyRef.current === requestSessionKey) {
        setLoading(false);
      }
    }
  }, []);

  // The popup must not depend on the bell's most recent 20 entries. Walk the
  // API's unread cursor independently, including level-ups on older pages.
  const refreshPending = useCallback(async () => {
    if (!isAuthenticatedRef.current || !BACKEND_URL) {
      setPendingItems(null);
      return;
    }
    pendingAbortRef.current?.abort();
    const controller = new AbortController();
    pendingAbortRef.current = controller;
    const requestSessionKey = sessionKeyRef.current;
    const isCurrent = () => isAuthenticatedRef.current && sessionKeyRef.current === requestSessionKey && !controller.signal.aborted;
    const pending: InboxNotification[] = [];
    const cursors = new Set<string>();
    let cursor: string | null = null;
    try {
      do {
        const query = new URLSearchParams({ limit: '50', unreadOnly: 'true', eventKeys: 'customer.loyalty_tier_up,professional.leveling_up' });
        if (cursor) query.set('before', cursor);
        const res = await fetch(`${BACKEND_URL}/api/user/notifications?${query}`, {
          credentials: 'include', headers: authHeaders(), signal: controller.signal,
        });
        if (!isCurrent() || !res.ok) return;
        const json = await res.json();
        if (!isCurrent() || !json?.success || !Array.isArray(json.data?.items)) return;
        pending.push(...json.data.items);
        cursor = typeof json.data.nextCursor === 'string' && json.data.nextCursor ? json.data.nextCursor : null;
        if (cursor && cursors.has(cursor)) return;
        if (cursor) cursors.add(cursor);
      } while (cursor);
      if (isCurrent()) setPendingItems(pending);
    } catch {
      // Retain the previous unread snapshot; focus/poll/recovery refresh retries.
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([refreshInbox(), refreshPending()]);
  }, [refreshInbox, refreshPending]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    setPendingItems((prev) => prev?.map((n) => n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n) ?? null);
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      const res = await fetch(`${BACKEND_URL}/api/user/notifications/${id}/read`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to mark notification as read');
    } catch {
      void refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setPendingItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })) ?? null);
    setUnreadCount(0);

    try {
      const res = await fetch(`${BACKEND_URL}/api/user/notifications/read-all`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to mark all notifications as read');
    } catch {
      void refresh();
    }
  }, [refresh]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void refresh();

    const onFocus = () => { void refresh(); };
    const onInboxRefresh = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('fixtract:inbox-refresh', onInboxRefresh);
    const interval = window.setInterval(() => { void refresh(); }, POLL_MS);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('fixtract:inbox-refresh', onInboxRefresh);
      window.clearInterval(interval);
      abortRef.current?.abort();
      pendingAbortRef.current?.abort();
    };
  }, [isAuthenticated, sessionKey, refresh]);

  const value = useMemo(
    () => ({ items, pendingItems, unreadCount, loading, refresh, markRead, markAllRead }),
    [items, pendingItems, unreadCount, loading, refresh, markRead, markAllRead],
  );

  return (
    <NotificationInboxContext.Provider value={value}>
      {children}
    </NotificationInboxContext.Provider>
  );
};
