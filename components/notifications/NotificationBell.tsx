'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { useFCM } from '@/contexts/FCMProvider';

interface NotificationBellProps {
  className?: string;
}

/**
 * Notification bell icon with a badge showing unread push count.
 * Clicking it opens the notification settings page.
 */
const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  const { unreadPushCount } = useFCM();

  return (
    <a
      id="notification-bell"
      href="/profile?tab=notifications"
      aria-label={`Notifications${unreadPushCount > 0 ? ` (${unreadPushCount} unread)` : ''}`}
      className={`relative inline-flex items-center justify-center h-8 w-8 rounded-full text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors ${className}`}
    >
      <Bell className="h-5 w-5" />
      {unreadPushCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white animate-pulse"
        >
          {unreadPushCount > 99 ? '99+' : unreadPushCount}
        </span>
      )}
    </a>
  );
};

export default NotificationBell;
