import type {
  AnonymizeCleanup,
  AnonymizeRecoveryRecord,
  AnonymizeRecoveryState,
} from "@/lib/adminAnonymize"

const STORAGE_PREFIX = "fixera-admin-anonymize-recovery:"
const STORAGE_VERSION = 2
const V2_PREFIX = `${STORAGE_PREFIX}v${STORAGE_VERSION}:`

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">

const VALID_STATES: AnonymizeRecoveryState[] = [
  "already_anonymized",
  "recovery_required",
  "status_unknown",
]

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function cleanupFrom(value: unknown): AnonymizeCleanup {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    pendingFiles: numberOrZero(record.pendingFiles),
    pendingCalendarReleases: numberOrZero(record.pendingCalendarReleases),
    deletedFiles: numberOrZero(record.deletedFiles),
    failedFiles: numberOrZero(record.failedFiles),
    completedAt: stringOrNull(record.completedAt),
    // Never persisted: a server error message can carry identifying text. The
    // pending signal is preserved by the counts, which is what the card reads.
    lastError: null,
  }
}

/** The exact field set that may be written to browser storage. */
function storedRecord(record: AnonymizeRecoveryRecord) {
  return {
    targetId: record.targetId,
    role: record.role,
    state: record.state,
    identityRemoved: record.identityRemoved,
    ...(record.legacyAnonymized ? { legacyAnonymized: true } : {}),
    ...(typeof record.accessDisabled === "boolean"
      ? { accessDisabled: record.accessDisabled }
      : {}),
    ...(typeof record.needsRedaction === "boolean"
      ? { needsRedaction: record.needsRedaction }
      : {}),
    cleanup: { ...record.cleanup, lastError: null },
    source: record.source,
  }
}

function stateFrom(record: Record<string, unknown>): AnonymizeRecoveryState {
  if (VALID_STATES.includes(record.state as AnonymizeRecoveryState)) {
    return record.state as AnonymizeRecoveryState
  }
  // A previous format could only describe "cleanup pending". Never claim the
  // identity was removed when the stored record does not prove it.
  return "recovery_required"
}

function sanitizeRecord(value: unknown): AnonymizeRecoveryRecord | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const target = record.target && typeof record.target === "object"
    ? (record.target as Record<string, unknown>)
    : null
  const targetId =
    stringOrNull(record.targetId) ||
    stringOrNull(target?.id) ||
    stringOrNull(target?._id)
  if (!targetId) return null
  const role =
    stringOrNull(record.role) ||
    stringOrNull(target?.role)
  return {
    targetId,
    role,
    state: stateFrom(record),
    identityRemoved: record.identityRemoved === true,
    ...(record.legacyAnonymized === true ? { legacyAnonymized: true } : {}),
    ...(typeof record.accessDisabled === "boolean"
      ? { accessDisabled: record.accessDisabled }
      : {}),
    ...(typeof record.needsRedaction === "boolean"
      ? { needsRedaction: record.needsRedaction }
      : {}),
    cleanup: cleanupFrom(record.cleanup),
    source: record.source === "server" ? "server" : "session",
  }
}

export function anonymizeRecoveryStorageKey(adminId: string, scope: string): string {
  return `${V2_PREFIX}${encodeURIComponent(adminId)}:${encodeURIComponent(scope)}`
}

export function readAnonymizeRecoveryRecords(
  storage: StorageLike,
  adminId: string,
  scope: string,
): AnonymizeRecoveryRecord[] {
  const key = anonymizeRecoveryStorageKey(adminId, scope)
  let raw: string | null = null
  try {
    raw = storage.getItem(key)
  } catch {
    return []
  }
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    try {
      storage.removeItem(key)
    } catch {
      // Storage can be unavailable in restricted contexts.
    }
    return []
  }

  if (!Array.isArray(parsed)) {
    try {
      storage.removeItem(key)
    } catch {
      // Ignore restricted storage.
    }
    return []
  }

  const byTarget = new Map<string, AnonymizeRecoveryRecord>()
  for (const entry of parsed) {
    const record = sanitizeRecord(entry)
    if (!record) continue
    byTarget.set(record.targetId, record)
  }
  const records = Array.from(byTarget.values())
  // Rewrite so old names, emails, avatars or unknown fields cannot survive in
  // the browser record even when the component only reads safe fields.
  writeAnonymizeRecoveryRecords(storage, adminId, scope, records)
  return records
}

export function writeAnonymizeRecoveryRecords(
  storage: StorageLike,
  adminId: string,
  scope: string,
  records: AnonymizeRecoveryRecord[],
): void {
  const key = anonymizeRecoveryStorageKey(adminId, scope)
  try {
    if (records.length === 0) {
      storage.removeItem(key)
      return
    }
    storage.setItem(key, JSON.stringify(records.map(storedRecord)))
  } catch {
    // Session storage can be unavailable in private/restricted contexts. The
    // in-memory recovery card still works for this page view.
  }
}

function keysWithPrefix(storage: StorageLike, prefix: string): string[] {
  const keys: string[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
  } catch {
    return []
  }
  return keys
}

/**
 * The old format was not admin-scoped and could contain a name or email. It is
 * discarded rather than migrated because ownership cannot be proven; the
 * server-side pending-cleanup query is the cross-browser source of truth.
 */
export function purgeLegacyAnonymizeRecoveryStorage(storage: StorageLike): void {
  for (const key of keysWithPrefix(storage, STORAGE_PREFIX)) {
    if (key.startsWith(V2_PREFIX)) continue
    try {
      storage.removeItem(key)
    } catch {
      // Ignore restricted storage.
    }
  }
}

/**
 * Logout clears the operator's recovery records except unknown-outcome ones.
 *
 * A `status_unknown` record is the only local pointer to a request whose
 * server-side outcome was never confirmed; the authoritative list may not
 * contain that target at all. The record carries no identity data (target id,
 * role, state and counts only) and its storage key is scoped to the admin id,
 * so it is safe to keep until the next sign-in reconciles it.
 */
export function pruneAnonymizeRecoveryStorageForLogout(storage: StorageLike): void {
  for (const key of keysWithPrefix(storage, V2_PREFIX)) {
    try {
      const raw = storage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        storage.removeItem(key)
        continue
      }
      const kept = parsed
        .map((entry) => sanitizeRecord(entry))
        .filter((record): record is AnonymizeRecoveryRecord =>
          Boolean(record) && record!.state === "status_unknown")
      if (kept.length === 0) {
        storage.removeItem(key)
      } else {
        storage.setItem(key, JSON.stringify(kept.map(storedRecord)))
      }
    } catch {
      try {
        storage.removeItem(key)
      } catch {
        // Ignore restricted storage.
      }
    }
  }
}

export function purgeAllAnonymizeRecoveryStorage(storage: StorageLike): void {
  for (const key of keysWithPrefix(storage, STORAGE_PREFIX)) {
    try {
      storage.removeItem(key)
    } catch {
      // Ignore restricted storage.
    }
  }
}
