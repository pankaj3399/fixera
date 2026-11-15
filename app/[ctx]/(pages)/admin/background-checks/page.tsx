'use client'

import { ShieldCheck } from 'lucide-react'
import { RequireAdminPermission } from '@/components/admin/RequireAdminPermission'
import BackgroundChecksPanel from '@/components/admin/BackgroundChecksPanel'

/**
 * Settings → Background Checks. The document names this menu item only; the
 * existing background checks are the on-demand maintenance runs that the
 * admin dashboard offers as "Run Automated Checks". Same jobs, same
 * `maintenance.run` permission. Opening this page runs nothing.
 */
export default function AdminBackgroundChecksPage() {
  return (
    <RequireAdminPermission permission="maintenance.run">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
        <div className="mx-auto max-w-5xl space-y-6 pt-20">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <ShieldCheck className="h-6 w-6 text-indigo-600" aria-hidden="true" />
              Background Checks
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              These checks also run on their normal schedule. Use a button below to run one now; nothing runs when
              this page opens.
            </p>
          </div>
          <BackgroundChecksPanel className="border-indigo-100 bg-white shadow-sm" />
        </div>
      </div>
    </RequireAdminPermission>
  )
}
