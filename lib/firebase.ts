import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, type Messaging } from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

// Initialise Firebase only once
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Returns the Firebase Messaging instance.
 * Must only be called on the client side (it uses browser APIs).
 * Returns null if running in a server context or if config is missing.
 */
export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    console.warn('Firebase config missing – push notifications disabled');
    return null;
  }
  return getMessaging(firebaseApp);
}

export { firebaseApp };
