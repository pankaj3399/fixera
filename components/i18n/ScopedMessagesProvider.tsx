"use client";

import { useMemo, type ReactNode } from "react";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";

type MessageTree = Record<string, unknown>;

/**
 * Adds a route subtree's namespaces to the messages of the enclosing
 * provider (the root layout's). Only `locale` and `messages` are passed, so
 * formats, timeZone, now, onError and getMessageFallback are inherited from
 * the parent provider unchanged, and so are its formatter caches.
 */
export default function ScopedMessagesProvider({
  messages,
  children,
}: {
  messages: MessageTree;
  children: ReactNode;
}) {
  const locale = useLocale();
  const parentMessages = useMessages() as MessageTree;
  const merged = useMemo(
    () => ({ ...parentMessages, ...messages }),
    [parentMessages, messages]
  );
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
