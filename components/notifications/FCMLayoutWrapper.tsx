'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FCMProvider } from '@/contexts/FCMProvider';
import { NotificationInboxProvider } from '@/contexts/NotificationInboxProvider';
import NotificationPermissionPrompt from '@/components/notifications/NotificationPermissionPrompt';
import LevelUpPopup from '@/components/dashboard/LevelUpPopup';
import dynamic from 'next/dynamic';

const ChatWidget = dynamic(() => import('@/components/chat/ChatWidget'), {
  ssr: false,
});

/**
 * FCMLayoutWrapper
 *
 * A thin client-component bridge that:
 *  1. Reads the current auth state from AuthContext
 *  2. Mounts FCMProvider (passes isAuthenticated so it knows when to init)
 *  3. Mounts NotificationInboxProvider for the bell dropdown
 *  4. Renders the non-intrusive permission prompt for authenticated users
 *
 * Must be a child of <AuthProvider>.
 */
const FCMLayoutWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const sessionKey = user?._id ?? null;

  return (
    <FCMProvider isAuthenticated={isAuthenticated} sessionKey={sessionKey}>
      <NotificationInboxProvider isAuthenticated={isAuthenticated} sessionKey={sessionKey}>
        {children}
        {isAuthenticated && <ChatWidget />}
        {isAuthenticated && <NotificationPermissionPrompt />}
        {isAuthenticated && <LevelUpPopup />}
      </NotificationInboxProvider>
    </FCMProvider>
  );
};

export default FCMLayoutWrapper;
