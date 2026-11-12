/**
 * The backend records an admin closing a support chat as a system message
 * whose text is the English, UTC notice "Chat closed on 29 Aug 2026, 00:35 UTC"
 * (fixera-server src/utils/adminSupportChat.ts). Viewers get it translated,
 * with the message time in their own time zone.
 */
const CHAT_CLOSED_NOTICE = /^Chat closed on .+ UTC$/;

export function isChatClosedNoticeText(text: string | null | undefined): boolean {
  return typeof text === "string" && CHAT_CLOSED_NOTICE.test(text.trim());
}

export function isChatClosedNotice(message: { senderRole?: string | null; text?: string | null }): boolean {
  return message.senderRole === "system" && isChatClosedNoticeText(message.text);
}

/** Close time in the viewer's locale and local time zone; null when unknown. */
export function formatChatClosedAt(at: string | Date | null | undefined, intlLocale: string): string | null {
  if (!at) return null;
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
