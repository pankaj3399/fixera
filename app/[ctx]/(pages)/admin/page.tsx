'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * `/admin` entry (Settings "Dashboard" button, login redirect default, typed
 * URL). The admin home is the role-aware `/dashboard` admin view, which shows
 * only the tabs and tool links this admin may open. This page renders inside
 * `AdminAccessGate` (admin layout), so non-admins are still sent to login and
 * the RBAC checks are unchanged. It is not a new navigation map.
 */
const ADMIN_HOME_PATH = '/dashboard'

export default function AdminIndexPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace(ADMIN_HOME_PATH)
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-500">
      Opening the admin dashboard…
    </div>
  )
}
