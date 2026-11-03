"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Info, Loader2, Play } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { apiErrorFromBody } from "@/lib/apiErrors"
import { getAuthToken } from "@/lib/utils"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
import { useAdminAccess } from "@/hooks/useAdminAccess"

/**
 * The existing on-demand maintenance checks ("Run Automated Checks"), shared
 * by the admin dashboard and Settings → Background Checks. Same four
 * endpoints, same `maintenance.run` permission, same messages. Nothing runs
 * unless an admin presses a button; the scheduled jobs are unchanged.
 */
export const BACKGROUND_CHECK_ENDPOINTS = {
  warranty: "run-warranty-checks",
  rfq: "run-rfq-checks",
  notif: "run-notification-reminders",
  autoaccept: "run-completion-auto-accept",
} as const

export default function BackgroundChecksPanel({
  onCompleted,
  className,
}: {
  /** Called after a check finished, e.g. to reload dashboard stats. */
  onCompleted?: () => void | Promise<void>
  className?: string
}) {
  const t = useTranslations("dashboard")
  const getErrorText = useErrorMessage()
  const { can } = useAdminAccess()
  const canRunMaintenance = can("maintenance.run")
  const [isRunningWarrantyCheck, setIsRunningWarrantyCheck] = useState(false)
  const [isRunningRfqCheck, setIsRunningRfqCheck] = useState(false)
  const [isRunningNotifReminders, setIsRunningNotifReminders] = useState(false)
  const [isRunningAutoAccept, setIsRunningAutoAccept] = useState(false)

  const runSchedulerCheck = async (type: 'warranty' | 'rfq' | 'notif' | 'autoaccept') => {
    if (!canRunMaintenance) {
      toast.error(t('errors.maintenanceForbidden'))
      return
    }
    const loadingMap = {
      warranty: setIsRunningWarrantyCheck,
      rfq: setIsRunningRfqCheck,
      notif: setIsRunningNotifReminders,
      autoaccept: setIsRunningAutoAccept,
    } as const
    const endpointMap = BACKGROUND_CHECK_ENDPOINTS
    const jobLabel = t(`maintenance.jobs.${type}`)
    const setLoading = loadingMap[type]
    const endpoint = endpointMap[type]
    setLoading(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/${endpoint}`,
        { method: 'POST', credentials: 'include', headers }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw apiErrorFromBody(payload, t('errors.runChecksFailed', { job: jobLabel }), { status: response.status })
      }
      const d = payload.data || {}
      if (type === 'warranty') {
        const parts: string[] = []
        if (d.escalated) parts.push(t('maintenance.toast.escalated', { count: d.escalated }))
        if (d.closed) parts.push(t('maintenance.toast.autoClosed', { count: d.closed }))
        if (d.errors?.length) parts.push(t('maintenance.toast.errors', { count: d.errors.length }))
        toast.success(parts.length ? t('maintenance.toast.warrantySummary', { details: parts.join(', ') }) : t('maintenance.toast.warrantyNone'))
      } else if (type === 'rfq') {
        const parts: string[] = []
        if (d.cancelled) parts.push(t('maintenance.toast.cancelled', { count: d.cancelled }))
        if (d.remindersSent) parts.push(t('maintenance.toast.remindersSent', { count: d.remindersSent }))
        if (d.expiredQuotationsFound) parts.push(t('maintenance.toast.expiredQuotations', { count: d.expiredQuotationsFound }))
        if (d.errors?.length) parts.push(t('maintenance.toast.errors', { count: d.errors.length }))
        toast.success(parts.length ? t('maintenance.toast.rfqSummary', { details: parts.join(', ') }) : t('maintenance.toast.rfqNone'))
      } else if (type === 'notif') {
        const parts: string[] = []
        for (const [key, val] of Object.entries(d)) {
          if (key === 'errors') continue
          if (typeof val === 'number' && val > 0) parts.push(`${key}: ${val}`)
        }
        if (d.errors?.length) parts.push(t('maintenance.toast.errors', { count: d.errors.length }))
        toast.success(parts.length ? t('maintenance.toast.remindersSummary', { details: parts.join(', ') }) : t('maintenance.toast.remindersNone'))
      } else {
        const parts: string[] = []
        if (d.autoAccepted) parts.push(t('maintenance.toast.autoAccepted', { count: d.autoAccepted }))
        if (d.skipped) parts.push(t('maintenance.toast.skipped', { count: d.skipped }))
        if (d.errors?.length) parts.push(t('maintenance.toast.errors', { count: d.errors.length }))
        toast.success(parts.length ? t('maintenance.toast.autoAcceptSummary', { details: parts.join(', ') }) : t('maintenance.toast.autoAcceptNone'))
      }
      await onCompleted?.()
    } catch (err) {
      toast.error(getErrorText(err, t('errors.runChecksFailed', { job: jobLabel })))
    } finally {
      setLoading(false)
    }
  }

  if (!canRunMaintenance) return null

  return (
  <Card className={className ?? "border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-blue-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl xl:col-span-2"}>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Play className="h-5 w-5 text-indigo-500" />
        {t("maintenance.title")}
      </CardTitle>
      <CardDescription>{t("maintenance.description")}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 flex items-center gap-1.5">
        <Button
          variant="outline"
          onClick={() => runSchedulerCheck('warranty')}
          disabled={isRunningWarrantyCheck}
          className="flex-1 border-rose-300 text-rose-700 hover:bg-rose-50"
        >
          {isRunningWarrantyCheck ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {t("maintenance.warrantyButton")}
        </Button>
        <div className="relative group">
          <Info className="h-4 w-4 text-slate-400 cursor-help" />
          <div className="absolute left-1/2 -translate-x-1/2 top-6 z-50 hidden group-hover:block w-72 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-lg">
            <p className="font-semibold text-slate-800 mb-1">{t("maintenance.whatDoesThisDo")}</p>
            <ul className="space-y-1 list-disc pl-3">
              <li>{t("maintenance.warrantyItem1")}</li>
              <li>{t("maintenance.warrantyItem2")}</li>
            </ul>
            <p className="mt-2 text-slate-400">{t("maintenance.safeOverdue")}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-1.5">
        <Button
          variant="outline"
          onClick={() => runSchedulerCheck('rfq')}
          disabled={isRunningRfqCheck}
          className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          {isRunningRfqCheck ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {t("maintenance.rfqButton")}
        </Button>
        <div className="relative group">
          <Info className="h-4 w-4 text-slate-400 cursor-help" />
          <div className="absolute right-0 top-6 z-50 hidden group-hover:block w-72 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-lg">
            <p className="font-semibold text-slate-800 mb-1">{t("maintenance.whatDoesThisDo")}</p>
            <ul className="space-y-1 list-disc pl-3">
              <li>{t("maintenance.rfqItem1")}</li>
              <li>{t("maintenance.rfqItem2")}</li>
              <li>{t("maintenance.rfqItem3")}</li>
            </ul>
            <p className="mt-2 text-slate-400">{t("maintenance.safeOverdue")}</p>
          </div>
        </div>
      </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 flex items-center gap-1.5">
        <Button
          variant="outline"
          onClick={() => runSchedulerCheck('notif')}
          disabled={isRunningNotifReminders}
          className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          {isRunningNotifReminders ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {t("maintenance.notificationsButton")}
        </Button>
        <div className="relative group">
          <button
            type="button"
            aria-label={t("maintenance.notificationsAria")}
            aria-describedby="notif-reminders-help"
            className="inline-flex rounded p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
          <div
            id="notif-reminders-help"
            role="tooltip"
            className="absolute left-1/2 -translate-x-1/2 top-6 z-50 hidden group-hover:block group-focus-within:block w-72 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-lg"
          >
            <p className="font-semibold text-slate-800 mb-1">{t("maintenance.whatDoesThisDo")}</p>
            <ul className="space-y-1 list-disc pl-3">
              <li>{t("maintenance.notificationsItem1")}</li>
              <li>{t("maintenance.notificationsItem2")}</li>
              <li>{t("maintenance.notificationsItem3")}</li>
            </ul>
            <p className="mt-2 text-slate-400">{t("maintenance.safeTracking")}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-1.5">
        <Button
          variant="outline"
          onClick={() => runSchedulerCheck('autoaccept')}
          disabled={isRunningAutoAccept}
          className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        >
          {isRunningAutoAccept ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {t("maintenance.autoAcceptButton")}
        </Button>
        <div className="relative group">
          <button
            type="button"
            aria-label={t("maintenance.autoAcceptAria")}
            aria-describedby="completion-autoaccept-help"
            className="inline-flex rounded p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
          <div
            id="completion-autoaccept-help"
            role="tooltip"
            className="absolute right-0 top-6 z-50 hidden group-hover:block group-focus-within:block w-72 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-lg"
          >
            <p className="font-semibold text-slate-800 mb-1">{t("maintenance.whatDoesThisDo")}</p>
            <ul className="space-y-1 list-disc pl-3">
              <li>{t("maintenance.autoAcceptItem1")}</li>
              <li>{t("maintenance.autoAcceptItem2")}</li>
            </ul>
            <p className="mt-2 text-slate-400">{t("maintenance.safeEligible")}</p>
          </div>
        </div>
      </div>
      </div>
    </CardContent>
  </Card>
  )
}
