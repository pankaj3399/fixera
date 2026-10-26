/**
 * Shared identity guard for records whose account was anonymized.
 *
 * The server is expected to project `isAnonymized`/`deletedAt`. The canonical
 * placeholder values are a defensive fallback for rows written before those
 * flags were added. This module deliberately has no React dependency.
 */

export interface AnonymizableIdentity {
  name?: string | null;
  email?: string | null;
  username?: string | null;
  deletedAt?: string | null;
  isAnonymized?: boolean | null;
}

export interface ConversationParty extends AnonymizableIdentity {
  _id?: string;
  role?: string;
  profileImage?: string;
  businessInfo?: { city?: string; country?: string };
  createdAt?: string;
}

export interface ConversationPartySource {
  type?: string;
  customerId?: ConversationParty | null;
  professionalId?: ConversationParty | null;
  supportTargetUserId?: ConversationParty | null;
  supportAdminId?: ConversationParty | null;
}

/**
 * Null-safe direct counterparty lookup. Support conversations resolve the
 * admin for participants and the target for admins.
 */
export function conversationCounterparty(
  conversation: ConversationPartySource | null | undefined,
  role?: string | null
): ConversationParty | null {
  if (!conversation) return null;
  if (conversation.type === "support") {
    return role === "admin"
      ? conversation.supportTargetUserId ?? null
      : conversation.supportAdminId ?? null;
  }
  if (role === "professional") return conversation.customerId ?? null;
  return conversation.professionalId ?? null;
}

/** True only for a direct conversation whose other participant is anonymized. */
export function isConversationCounterpartyAnonymized(
  conversation: ConversationPartySource | null | undefined,
  role?: string | null
): boolean {
  if (!conversation || conversation.type === "support") return false;
  return isAnonymizedIdentity(conversationCounterparty(conversation, role));
}

const DELETED_NAME_RE = /^\[?deleted user\]?$/i
const DELETED_EMAIL_RE = /^deleted-[^@\s]+@anon\.local$/i

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function isCanonicalDeletedIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const identity = value as AnonymizableIdentity
  const name = nonEmptyString(identity.name)
  const email = nonEmptyString(identity.email)
  return Boolean(
    (name && DELETED_NAME_RE.test(name)) ||
      (email && DELETED_EMAIL_RE.test(email))
  )
}

export function isRedactedPlaceholderText(value: unknown): boolean {
  if (typeof value !== "string") return false
  const normalized = value.trim().toLowerCase()
  return normalized === "[deleted message]" || normalized === "[deleted]"
}

export function isAnonymizedIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const identity = value as AnonymizableIdentity
  if (identity.isAnonymized === true) return true
  if (nonEmptyString(identity.deletedAt)) return true
  return isCanonicalDeletedIdentity(identity)
}
