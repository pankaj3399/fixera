'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { toast } from 'sonner';
import { firebaseConfig, getFirebaseMessaging } from '@/lib/firebase';
import { getAuthToken } from '@/lib/utils';

// ------------------------------------------------------------------
// Context
// ------------------------------------------------------------------

interface FCMContextValue {
  permissionGranted: boolean;
  fcmToken: string | null;
  requestPermission: () => Promise<boolean>;
  unreadPushCount: number;
}

const FCMContext = createContext<FCMContextValue>({
  permissionGranted: false,
  fcmToken: null,
  requestPermission: async () => false,
  unreadPushCount: 0,
});

export const useFCM = () => useContext(FCMContext);

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').replace(/\/+$/, '');
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';
const FETCH_TIMEOUT_MS = 15_000;
const SW_ACTIVATION_TIMEOUT_MS = 10_000;

async function saveTokenToServer(token: string): Promise<void> {
  const authToken = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${BACKEND_URL}/api/user/fcm/token`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ token, origin: window.location.origin }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`FCM token registration failed: ${response.status}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('FCM token request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function removeTokenFromServer(token: string): Promise<void> {
  const authToken = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${BACKEND_URL}/api/user/fcm/token`, {
      method: 'DELETE',
      credentials: 'include',
      headers,
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`FCM token removal failed: ${response.status}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('FCM token request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function injectFirebaseConfigIntoSw(worker: ServiceWorker | null): void {
  if (!worker || !firebaseConfig.apiKey || !firebaseConfig.projectId) return;
  worker.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });
}

async function waitForActiveWorker(
  reg: ServiceWorkerRegistration,
  timeoutMs = SW_ACTIVATION_TIMEOUT_MS,
): Promise<ServiceWorker | null> {
  if (reg.active) return reg.active;

  const worker = reg.installing ?? reg.waiting;
  if (!worker) return null;

  return new Promise((resolve) => {
    const onStateChange = () => {
      if (worker.state === 'activated') {
        cleanup();
        resolve(reg.active);
      } else if (worker.state === 'redundant') {
        cleanup();
        resolve(null);
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(reg.active);
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeoutId);
      worker.removeEventListener('statechange', onStateChange);
    };

    worker.addEventListener('statechange', onStateChange);
  });
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    const active = await waitForActiveWorker(reg);
    injectFirebaseConfigIntoSw(active);
    return reg;
  } catch (err) {
    console.warn('[FCM] Service worker registration failed:', err);
    return null;
  }
}

function navigateToUrl(router: ReturnType<typeof useRouter>, url: string): void {
  try {
    const target = new URL(url, window.location.origin);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return;
    }
    if (target.origin === window.location.origin) {
      router.push(`${target.pathname}${target.search}${target.hash}`);
      return;
    }
    window.location.href = target.toString();
  } catch {
    // ignore malformed notification targets
  }
}

// ------------------------------------------------------------------
// Provider
// ------------------------------------------------------------------

interface FCMProviderProps {
  isAuthenticated: boolean;
  children: React.ReactNode;
}

export const FCMProvider: React.FC<FCMProviderProps> = ({ isAuthenticated, children }) => {
  const router = useRouter();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [unreadPushCount, setUnreadPushCount] = useState(0);
  const initialised = useRef(false);
  const currentToken = useRef<string | null>(null);
  const authSession = useRef(0);

  const obtainToken = useCallback(async (swReg: ServiceWorkerRegistration): Promise<boolean> => {
    const messaging = getFirebaseMessaging();
    if (!messaging) return false;

    try {
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (!token) return false;

      if (token !== currentToken.current) {
        await saveTokenToServer(token);
        currentToken.current = token;
        setFcmToken(token);
      }
      return true;
    } catch (err) {
      console.warn('[FCM] Failed to obtain token:', err);
      return false;
    }
  }, []);

  const bootstrapFcm = useCallback(async (): Promise<boolean> => {
    const swReg = await registerServiceWorker();
    if (!swReg) return false;

    const ready = await obtainToken(swReg);
    if (ready) setPermissionGranted(true);
    return ready;
  }, [obtainToken]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;

    if (Notification.permission === 'granted') {
      return bootstrapFcm();
    }

    const result = await Notification.requestPermission();
    if (result === 'granted') {
      return bootstrapFcm();
    }

    return false;
  }, [bootstrapFcm]);

  useEffect(() => {
    if (!isAuthenticated) return;
    authSession.current += 1;
    if (initialised.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    initialised.current = true;

    const init = async () => {
      if (Notification.permission === 'granted') {
        await bootstrapFcm();
      }
    };

    void init();
  }, [isAuthenticated, bootstrapFcm]);

  useEffect(() => {
    if (!permissionGranted) return;

    const messaging = getFirebaseMessaging();
    if (!messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      const { title = 'Fixera', body = '' } = payload.notification ?? {};
      const data = (payload.data ?? {}) as Record<string, string>;
      const url = data.clickUrl || '/';

      setUnreadPushCount((n) => n + 1);

      toast(title, {
        description: body,
        duration: 6000,
        action: {
          label: 'View',
          onClick: () => navigateToUrl(router, url),
        },
      });
    });

    return unsubscribe;
  }, [permissionGranted, router]);

  useEffect(() => {
    const onFocus = () => setUnreadPushCount(0);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (isAuthenticated) return;

    initialised.current = false;
    setPermissionGranted(false);

    const token = currentToken.current;
    const logoutSession = authSession.current;
    if (!token) {
      setFcmToken(null);
      return;
    }

    const cleanup = async () => {
      try {
        await removeTokenFromServer(token);
      } catch (err) {
        console.warn('[FCM] Failed to remove token from server:', err);
      }

      if (authSession.current !== logoutSession) return;

      const messaging = getFirebaseMessaging();
      if (messaging) {
        try {
          await deleteToken(messaging);
        } catch (err) {
          console.warn('[FCM] Failed to delete browser token:', err);
        }
      }

      if (authSession.current !== logoutSession) return;

      currentToken.current = null;
      setFcmToken(null);
    };

    void cleanup();
  }, [isAuthenticated]);

  const contextValue = useMemo(
    () => ({ permissionGranted, fcmToken, requestPermission, unreadPushCount }),
    [permissionGranted, fcmToken, requestPermission, unreadPushCount],
  );

  return (
    <FCMContext.Provider value={contextValue}>
      {children}
    </FCMContext.Provider>
  );
};
