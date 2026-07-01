'use client';

import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useFCM } from '@/contexts/FCMProvider';
import { CONSENT_EVENT, getConsent } from '@/lib/consent';

const DISMISSED_KEY = 'fixera_push_prompt_dismissed';

/**
 * NotificationPermissionPrompt
 *
 * A non-intrusive slide-in banner that asks the user to enable push
 * notifications. It only appears:
 *  - When the browser supports notifications
 *  - When permission has not yet been granted or denied
 *  - When the user hasn't previously dismissed the prompt (localStorage flag)
 *
 * It is meant to be rendered inside the FCMProvider tree.
 */
const NotificationPermissionPrompt: React.FC = () => {
  const { permissionGranted, requestPermission } = useFCM();
  const [show, setShow] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [consentResolved, setConsentResolved] = useState(true);

  useEffect(() => {
    const refreshConsent = () => setConsentResolved(getConsent() !== null);
    refreshConsent();
    window.addEventListener(CONSENT_EVENT, refreshConsent);
    return () => window.removeEventListener(CONSENT_EVENT, refreshConsent);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!consentResolved) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return; // already granted or denied
    if (permissionGranted) return;

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;

    // Show the prompt after a short delay so it doesn't immediately compete
    // with the page rendering.
    const timer = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(timer);
  }, [permissionGranted, consentResolved]);

  const handleAllow = async () => {
    setRequesting(true);
    await requestPermission();
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Enable push notifications"
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-40
        flex items-center gap-4
        max-w-md w-[calc(100%-2rem)]
        rounded-2xl shadow-2xl
        bg-white dark:bg-gray-900
        border border-gray-100 dark:border-gray-800
        px-5 py-4
        transition-all duration-500
        ${show ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
      `}
    >
      {/* Icon */}
      <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-md">
        <Bell className="h-5 w-5 text-white" />
      </div>

      {/* Copy */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
          Stay in the loop
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
          Get instant updates for bookings, messages &amp; more.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          id="fcm-enable-btn"
          onClick={handleAllow}
          disabled={requesting}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white text-xs font-medium px-3.5 py-2 disabled:opacity-60"
        >
          {requesting ? 'Enabling…' : 'Enable'}
        </button>
        <button
          id="fcm-dismiss-btn"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default NotificationPermissionPrompt;
