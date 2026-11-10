'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { authFetch } from '@/lib/utils'
import {
  adminNavBadgeIdentity,
  createAdminNavBadgeStore,
  createHttpBadgeFetcher,
} from '@/lib/admin/navigationBadgeStore'
import type { AdminNavBadgeSnapshot } from '@/lib/admin/navigation'

/** Modest poll while the tab is visible; navigation and focus refresh sooner. */
export const ADMIN_NAV_BADGE_POLL_MS = 30_000
const MIN_FOCUS_REFRESH_GAP_MS = 5_000
/** Pages may dispatch this after an action to refresh the counters at once. */
export const ADMIN_NAV_BADGES_REFRESH_EVENT = 'fixtract:admin-nav-badges-refresh'

const SERVER_SNAPSHOT: AdminNavBadgeSnapshot = { identity: null, status: 'idle', counts: null }

type BadgeUser = Parameters<typeof adminNavBadgeIdentity>[0]

/**
 * One request for all visible badges. Counts are server-authorized; the
 * client never sends a role. Old counts are dropped as soon as the
 * user/role/access changes, and stale responses are ignored.
 */
export function useAdminNavigationBadges({
  user,
  enabled,
  pathname,
}: {
  user: BadgeUser
  /** False when no badge item is visible to this admin: nothing is fetched. */
  enabled: boolean
  pathname: string
}): AdminNavBadgeSnapshot {
  const [store] = useState(() =>
    createAdminNavBadgeStore(createHttpBadgeFetcher(process.env.NEXT_PUBLIC_BACKEND_URL, authFetch)),
  )
  const identity = enabled ? adminNavBadgeIdentity(user) : null

  // Unmount or identity change: abort the request and drop the old counts, so
  // a late response is ignored (strict-mode remounts simply set it again).
  useEffect(() => {
    store.setIdentity(identity)
    return () => store.setIdentity(null)
  }, [store, identity])

  // Initial load and every navigation (actions usually end in one).
  useEffect(() => {
    if (!identity) return
    void store.refresh()
  }, [store, identity, pathname])

  useEffect(() => {
    if (!identity) return
    let lastRefresh = Date.now()
    const refresh = (force = false) => {
      if (document.visibilityState !== 'visible') return
      if (!force && Date.now() - lastRefresh < MIN_FOCUS_REFRESH_GAP_MS) return
      lastRefresh = Date.now()
      void store.refresh()
    }
    const onFocus = () => refresh()
    const onVisibility = () => refresh()
    const onRequested = () => refresh(true)
    const timer = window.setInterval(() => refresh(true), ADMIN_NAV_BADGE_POLL_MS)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(ADMIN_NAV_BADGES_REFRESH_EVENT, onRequested)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(ADMIN_NAV_BADGES_REFRESH_EVENT, onRequested)
    }
  }, [store, identity])

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT)
  // Never show counts that belong to another identity, even for one render.
  return snapshot.identity === identity ? snapshot : SERVER_SNAPSHOT
}
