'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown, Menu } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminNavigationBadges } from '@/hooks/useAdminNavigationBadges'
import {
  ADMIN_HOME_PATHS,
  resolveActiveAdminNav,
  visibleAdminNavigation,
  visibleBadgeKeys,
} from '@/lib/admin/navigation'
import { AdminNavigationMenu } from './AdminNavigationMenu'

/**
 * Shared admin frame: the document-ordered admin menu beside the page.
 * Rendered only after the admin gate has admitted the user, so no link is
 * shown before access is known. Page content keeps its own layout; the
 * content column is `min-w-0` so wide tables scroll inside it.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const { user } = useAuth()
  const groups = useMemo(() => visibleAdminNavigation(user), [user])
  const active = useMemo(() => resolveActiveAdminNav(pathname), [pathname])
  const homeCurrent = (ADMIN_HOME_PATHS as readonly string[]).includes(pathname)
  const hasBadges = useMemo(() => visibleBadgeKeys(groups).length > 0, [groups])
  const badges = useAdminNavigationBadges({ user, enabled: hasBadges, pathname })

  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  // Close the mobile menu after navigating.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  if (groups.length === 0) return <>{children}</>

  return (
    <div className="lg:flex lg:items-start" data-admin-shell>
      <div className="sticky top-[var(--header-offset,4rem)] z-30 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={panelId}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <Menu className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          Admin menu
          <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {mobileOpen && (
          <div id={panelId} className="mt-2 max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <AdminNavigationMenu
              groups={groups}
              active={active}
              badges={badges}
              idPrefix="admin-nav-mobile"
              homeCurrent={homeCurrent}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        )}
      </div>

      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white/80 lg:block">
        <div className="sticky top-[calc(var(--header-offset,4rem)+3.25rem)] max-h-[calc(100vh-var(--header-offset,4rem)-3.25rem)] overflow-y-auto overscroll-contain px-3 py-6">
          <AdminNavigationMenu groups={groups} active={active} badges={badges} homeCurrent={homeCurrent} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
