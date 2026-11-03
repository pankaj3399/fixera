import {
  parseAdminNavBadgeCounts,
  type AdminNavBadgeCounts,
  type AdminNavBadgeSnapshot,
} from '@/lib/admin/navigation'

export type FetchAdminNavBadgeCounts = (signal: AbortSignal) => Promise<AdminNavBadgeCounts>

export interface AdminNavBadgeStore {
  getSnapshot(): AdminNavBadgeSnapshot
  subscribe(listener: () => void): () => void
  /** Switch to another admin/role (or `null` when signed out): old counts are dropped at once. */
  setIdentity(identity: string | null): void
  /** One request for every badge; a newer request or identity supersedes it. */
  refresh(): Promise<void>
  dispose(): void
}

const EMPTY: AdminNavBadgeSnapshot = Object.freeze({ identity: null, status: 'idle', counts: null })

export function createAdminNavBadgeStore(fetchCounts: FetchAdminNavBadgeCounts): AdminNavBadgeStore {
  let snapshot: AdminNavBadgeSnapshot = EMPTY
  let sequence = 0
  let inFlight: AbortController | null = null
  let disposed = false
  const listeners = new Set<() => void>()

  const publish = (next: AdminNavBadgeSnapshot) => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }
  const abortInFlight = () => {
    inFlight?.abort()
    inFlight = null
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setIdentity(identity) {
      if (disposed || identity === snapshot.identity) return
      abortInFlight()
      sequence += 1
      publish(identity ? { identity, status: 'idle', counts: null } : EMPTY)
    },
    async refresh() {
      const identity = snapshot.identity
      if (disposed || !identity) return
      abortInFlight()
      const request = ++sequence
      const controller = new AbortController()
      inFlight = controller
      if (snapshot.status === 'idle') publish({ identity, status: 'loading', counts: null })
      const current = () => !disposed && request === sequence && snapshot.identity === identity
      try {
        const counts = await fetchCounts(controller.signal)
        if (!current()) return
        publish({ identity, status: 'ready', counts })
      } catch {
        if (!current() || controller.signal.aborted) return
        // Unknown, not zero: the badges show "count unavailable".
        publish({ identity, status: 'error', counts: null })
      } finally {
        if (inFlight === controller) inFlight = null
      }
    },
    dispose() {
      disposed = true
      abortInFlight()
      sequence += 1
      listeners.clear()
    },
  }
}

/** GET /api/admin/navigation/badges with the session credentials. */
export function createHttpBadgeFetcher(
  backendUrl: string | undefined,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
): FetchAdminNavBadgeCounts {
  return async (signal) => {
    if (!backendUrl) throw new Error('Backend URL is not configured')
    const response = await fetchImpl(`${backendUrl}/api/admin/navigation/badges`, {
      credentials: 'include',
      cache: 'no-store',
      signal,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.success) throw new Error(`badge request failed (${response.status})`)
    return parseAdminNavBadgeCounts(body.data?.counts)
  }
}

/**
 * Whose counts are shown. Any change of user, role or effective access
 * starts from an empty snapshot so no previous role's count is displayed.
 */
export function adminNavBadgeIdentity(
  user: {
    _id?: string | null
    role?: string | null
    adminRole?: string | null
    adminPermissions?: readonly string[] | null
    adminAccessLevels?: Record<string, unknown> | null
    adminPermissionLevels?: Record<string, unknown> | null
  } | null | undefined,
): string | null {
  if (!user || user.role !== 'admin' || !user._id) return null
  const sorted = (value: Record<string, unknown> | null | undefined) =>
    value ? Object.keys(value).sort().map((key) => `${key}:${String(value[key])}`).join(',') : ''
  return [
    user._id,
    user.adminRole ?? '',
    [...(user.adminPermissions || [])].sort().join(','),
    sorted(user.adminAccessLevels),
    sorted(user.adminPermissionLevels),
  ].join('|')
}
