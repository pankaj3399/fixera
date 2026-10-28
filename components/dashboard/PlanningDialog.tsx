'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { format, parseISO, isValid } from "date-fns"
import type { Locale as DateFnsLocale } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getAuthToken } from "@/lib/utils"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { ChevronLeft, ChevronRight, Loader2, Lock } from "lucide-react"

type PlanningResource = {
  _id: string
  name?: string
  blockedDays?: string[]
  plannedDays?: string[]
}

type PlanningPayload = {
  bookingId: string
  bookingNumber?: string
  customerName?: string
  status: string
  startDate?: string
  windowFrom?: string
  windowTo?: string
  today?: string
  isInProgress?: boolean
  resources?: PlanningResource[]
}

interface PlanningDialogProps {
  open: boolean
  bookingId: string | null
  onClose: () => void
  onUpdated?: () => void | Promise<void>
}

type CellState = "planned" | "blocked" | "available"

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const parseDayKey = (value?: string | null): Date | null => {
  if (!value) return null
  const m = DAY_KEY_RE.exec(value)
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const d = parseISO(value)
  return isValid(d) ? d : null
}

const formatDayKeyLabel = (dayKey: string, fmt: string, locale: DateFnsLocale): string => {
  const m = DAY_KEY_RE.exec(dayKey)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : parseISO(dayKey)
  return isValid(d) ? format(d, fmt, { locale }) : ""
}

const enumerateDays = (from?: string, to?: string): string[] => {
  const start = parseDayKey(from)
  const end = parseDayKey(to)
  if (!start || !end || end < start) return []
  const days: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  let guard = 0
  while (cursor <= endUtc && guard < 1000) {
    guard++
    const y = cursor.getUTCFullYear()
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0")
    const d = String(cursor.getUTCDate()).padStart(2, "0")
    days.push(`${y}-${m}-${d}`)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

const isWeekend = (dayKey: string): boolean => {
  const d = parseDayKey(dayKey)
  if (!d) return false
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

export default function PlanningDialog({ open, bookingId, onClose, onUpdated }: PlanningDialogProps) {
  const t = useTranslations("dashboardWidgets")
  const { dateFns } = useFormatLocale()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payload, setPayload] = useState<PlanningPayload | null>(null)
  const [planned, setPlanned] = useState<Record<string, Set<string>>>({})
  const [weekStart, setWeekStart] = useState(0)

  const withAuthHeaders = () => {
    const token = getAuthToken()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  const hydrate = useCallback((data: PlanningPayload) => {
    setPayload(data)
    const map: Record<string, Set<string>> = {}
    for (const resource of data.resources || []) {
      map[resource._id] = new Set(resource.plannedDays || [])
    }
    setPlanned(map)
  }, [])

  useEffect(() => {
    if (!open || !bookingId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/planning`, {
          method: "PUT",
          credentials: "include",
          headers: withAuthHeaders(),
          body: JSON.stringify({ load: true }),
        })
        const body = await response.json().catch(() => null)
        if (!response.ok || !body?.success) {
          toast.error(body?.error?.message || t("planningDialog.loadFailed"))
          if (!cancelled) onClose()
          return
        }
        if (!cancelled) hydrate(body.data as PlanningPayload)
      } catch {
        toast.error(t("planningDialog.loadFailed"))
        if (!cancelled) onClose()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookingId, hydrate])

  const days = useMemo(
    () => enumerateDays(payload?.windowFrom, payload?.windowTo),
    [payload?.windowFrom, payload?.windowTo]
  )

  const PAGE_SIZE = 25
  useEffect(() => {
    setWeekStart(0)
  }, [payload?.bookingId])
  const visibleDays = useMemo(
    () => days.slice(weekStart, weekStart + PAGE_SIZE),
    [days, weekStart]
  )
  const hasPrevWeek = weekStart > 0
  const hasNextWeek = weekStart + PAGE_SIZE < days.length

  const blockedByResource = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const resource of payload?.resources || []) {
      map[resource._id] = new Set(resource.blockedDays || [])
    }
    return map
  }, [payload?.resources])

  const today = payload?.today
  const isInProgress = !!payload?.isInProgress

  const cellState = useCallback(
    (resourceId: string, dayKey: string): CellState => {
      if (planned[resourceId]?.has(dayKey)) return "planned"
      if (blockedByResource[resourceId]?.has(dayKey)) return "blocked"
      if (isInProgress && today && dayKey < today) return "blocked"
      return "available"
    },
    [planned, blockedByResource, isInProgress, today]
  )

  const isLocked = useCallback(
    (resourceId: string, dayKey: string): boolean => {
      if (blockedByResource[resourceId]?.has(dayKey)) return true
      if (isInProgress && today && dayKey < today) return true
      return false
    },
    [blockedByResource, isInProgress, today]
  )

  const toggleCell = useCallback(
    (resourceId: string, dayKey: string) => {
      if (isLocked(resourceId, dayKey)) return
      const isStartDate = !!payload?.startDate && dayKey === payload.startDate
      if (isStartDate && planned[resourceId]?.has(dayKey)) {
        const othersOnStart = Object.entries(planned).some(
          ([rid, set]) => rid !== resourceId && set.has(dayKey)
        )
        if (!othersOnStart) {
          toast.error(t("planningDialog.keepStartResource"))
          return
        }
      }
      setPlanned((prev) => {
        const next = { ...prev }
        const set = new Set(next[resourceId] || [])
        if (set.has(dayKey)) set.delete(dayKey)
        else set.add(dayKey)
        next[resourceId] = set
        return next
      })
    },
    [isLocked, planned, payload?.startDate, t]
  )

  const submit = async () => {
    if (!bookingId || !payload) return
    setSaving(true)
    try {
      const resourcePlan = (payload.resources || []).map((resource) => ({
        resourceId: resource._id,
        days: Array.from(planned[resource._id] || []).sort(),
      }))
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/planning`, {
        method: "PUT",
        credentials: "include",
        headers: withAuthHeaders(),
        body: JSON.stringify({ resourcePlan }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.success) {
        toast.error(body?.error?.message || t("planningDialog.saveFailed"))
        return
      }
      toast.success(t("planningDialog.updated"))
      if (body.data) hydrate(body.data as PlanningPayload)
      await onUpdated?.()
      onClose()
    } catch {
      toast.error(t("planningDialog.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const startLabel = payload?.startDate
    ? formatDayKeyLabel(payload.startDate, "dd MMM yyyy", dateFns)
    : t("common.unscheduled")

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t("planningDialog.title")}
            {payload?.bookingNumber ? ` — ${payload.bookingNumber}` : ""}
          </DialogTitle>
          <DialogDescription>
            {payload?.customerName ? `${t("planningDialog.customer", { name: payload.customerName })} ` : ""}
            {t("planningDialog.description")}
          </DialogDescription>
        </DialogHeader>

        {loading || !payload ? (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                <span>
                  {t.rich("planningDialog.bookingStart", {
                    date: startLabel,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {t("planningDialog.startDateHint")}
                {isInProgress && ` ${t("planningDialog.inProgressHint")}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border border-emerald-400 bg-emerald-300" /> {t("planningDialog.planned")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border border-sky-400 bg-sky-300" /> {t("planningDialog.unavailable")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border border-slate-300 bg-white" /> {t("planningDialog.available")}
              </span>
            </div>

            {visibleDays.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekStart((prev) => Math.max(0, prev - PAGE_SIZE))}
                  disabled={!hasPrevWeek}
                  aria-label={t("planningDialog.previousDays")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium text-slate-600">
                  {formatDayKeyLabel(visibleDays[0], "dd MMM", dateFns)} – {formatDayKeyLabel(visibleDays[visibleDays.length - 1], "dd MMM yyyy", dateFns)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekStart((prev) => prev + PAGE_SIZE)}
                  disabled={!hasNextWeek}
                  aria-label={t("planningDialog.nextDays")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[140px] border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-left font-medium text-slate-700">
                      {t("planningDialog.resource")}
                    </th>
                    {visibleDays.map((dayKey) => {
                      const weekend = isWeekend(dayKey)
                      return (
                        <th
                          key={dayKey}
                          className={`border-b border-r border-slate-200 px-1 py-1 text-center font-medium ${weekend ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-600"}`}
                        >
                          <div>{formatDayKeyLabel(dayKey, "EE", dateFns)}</div>
                          <div>{formatDayKeyLabel(dayKey, "dd", dateFns)}</div>
                          <div className="text-[9px] text-slate-400">{formatDayKeyLabel(dayKey, "MMM", dateFns)}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(payload.resources || []).map((resource) => (
                    <tr key={resource._id}>
                      <td className="sticky left-0 z-10 min-w-[140px] border-b border-r border-slate-200 bg-white px-2 py-1 font-medium text-slate-800">
                        {resource.name || resource._id}
                      </td>
                      {visibleDays.map((dayKey) => {
                        const state = cellState(resource._id, dayKey)
                        const locked = isLocked(resource._id, dayKey)
                        const weekend = isWeekend(dayKey)
                        let cls = "bg-white hover:bg-slate-50"
                        if (state === "planned") cls = "bg-emerald-300 hover:bg-emerald-400"
                        else if (state === "blocked") cls = "bg-sky-300"
                        else if (weekend) cls = "bg-slate-50 hover:bg-slate-100"
                        return (
                          <td
                            key={dayKey}
                            className={`h-8 w-9 border-b border-r border-slate-200 p-0 text-center ${cls} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
                            onClick={() => toggleCell(resource._id, dayKey)}
                            onKeyDown={locked ? undefined : (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                toggleCell(resource._id, dayKey)
                              }
                            }}
                            role={locked ? undefined : "button"}
                            tabIndex={locked ? undefined : 0}
                            aria-label={locked
                              ? t("planningDialog.cellLabelLocked", { resource: resource.name || resource._id, day: formatDayKeyLabel(dayKey, "dd MMM yyyy", dateFns) })
                              : t("planningDialog.cellLabel", { resource: resource.name || resource._id, day: formatDayKeyLabel(dayKey, "dd MMM yyyy", dateFns) })}
                            title={locked
                              ? t("planningDialog.cellLabelLocked", { resource: resource.name || resource._id, day: formatDayKeyLabel(dayKey, "dd MMM yyyy", dateFns) })
                              : t("planningDialog.cellLabel", { resource: resource.name || resource._id, day: formatDayKeyLabel(dayKey, "dd MMM yyyy", dateFns) })}
                          >
                            {state === "blocked" ? <Lock className="mx-auto h-3 w-3 text-sky-700" /> : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("planningDialog.savePlan")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
