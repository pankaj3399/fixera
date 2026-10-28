'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotificationInbox } from '@/contexts/NotificationInboxProvider';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';

interface NotificationBellProps {
  className?: string;
}

/**
 * Notification bell with dropdown inbox of received notifications.
 */
const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  const t = useTranslations('notifications');
  const { intl } = useFormatLocale();
  const router = useRouter();
  const { items, unreadCount, loading, markRead, markAllRead, refresh } = useNotificationInbox();

  const relativeTime = (iso: string): string => {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diffSec = Math.round((Date.now() - then) / 1000);
    if (diffSec < 60) return t('bell.justNow');
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return t('bell.minutesAgo', { count: diffMin });
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return t('bell.hoursAgo', { count: diffHr });
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 7) return t('bell.daysAgo', { count: diffDay });
    return new Date(iso).toLocaleDateString(intl);
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void refresh();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          id="notification-bell"
          type="button"
          aria-label={
            unreadCount > 0
              ? t('bell.ariaLabelUnread', { count: unreadCount })
              : t('bell.ariaLabel')
          }
          className={`relative inline-flex items-center justify-center h-8 w-8 rounded-full text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors ${className}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-80 sm:w-96 p-0" align="end" forceMount>
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <DropdownMenuLabel className="px-2 py-1.5 text-sm font-semibold">{t('bell.title')}</DropdownMenuLabel>
          <div className="flex items-center">
            {unreadCount > 0 && (
              <DropdownMenuItem
                className="gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 focus:text-blue-700 cursor-pointer rounded-sm"
                onSelect={(e) => {
                  e.preventDefault();
                  void markAllRead();
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('bell.markAllRead')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className="p-0">
              <Link
                href="/profile?tab=notifications"
                aria-label={t('bell.settings')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </DropdownMenuItem>
          </div>
        </div>
        <DropdownMenuSeparator className="my-0" />

        <div className="max-h-80 overflow-y-auto">
          {loading && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-gray-400">{t('bell.loading')}</p>
          )}
          {!loading && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-gray-400">{t('bell.empty')}</p>
          )}
          {items.map((n) => {
            const unread = !n.readAt;
            return (
              <DropdownMenuItem
                key={n.id}
                className={`flex flex-col items-start gap-0.5 px-3 py-2.5 cursor-pointer rounded-none focus:bg-gray-50 ${
                  unread ? 'bg-blue-50/60' : ''
                }`}
                onSelect={(e) => {
                  e.preventDefault();
                  if (unread) void markRead(n.id);
                  if (n.clickUrl) {
                    try {
                      const url = new URL(n.clickUrl, window.location.origin);
                      if (url.origin === window.location.origin) {
                        router.push(`${url.pathname}${url.search}${url.hash}`);
                      } else {
                        window.location.href = n.clickUrl;
                      }
                    } catch {
                      router.push(n.clickUrl);
                    }
                  }
                }}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <p className={`text-sm leading-snug ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                    {n.title}
                  </p>
                  <span className="shrink-0 text-[10px] text-gray-400 mt-0.5">
                    {relativeTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 w-full">{n.body}</p>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
