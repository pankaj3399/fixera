import type { ReactNode } from "react";
import { getMessages } from "next-intl/server";
import {
  pickMessages,
  scopeNamespaces,
  type ClientMessageScope,
} from "@/i18n/clientNamespaces";
import ScopedMessagesProvider from "./ScopedMessagesProvider";

/**
 * Server half of the per-route message scope: picks the scope's namespaces
 * (see i18n/clientNamespaces.ts) for the request's locale and hands only
 * those to the client, where they are merged onto the root layout's set.
 * Must wrap everything a layout renders.
 */
export default async function ScopedIntlProvider({
  scope,
  children,
}: {
  scope: ClientMessageScope;
  children: ReactNode;
}) {
  const messages = (await getMessages()) as Record<string, unknown>;
  return (
    <ScopedMessagesProvider messages={pickMessages(messages, scopeNamespaces(scope))}>
      {children}
    </ScopedMessagesProvider>
  );
}
