'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, isValid, parseISO, addDays, differenceInCalendarDays } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAuthToken } from "@/lib/utils"
import { Loader2, Lock, Plus, Trash2, Calendar, User, Info } from "lucide-react"

type CandidateResource = {
  _id: string
  name?: string
  email?: string
  username?: string
  unavailableDates?: string[]
}

type PlanRow = {
  resourceId: string
  plannedDates: string[]
  isNew: boolean
}

type PlanningPayload = {
  bookingId: string
  bookingNumber?: string
  customerName?: string
  status: string
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  assignedTeamMembers?: Array<{ _id?: string; name?: string; email?: string }>
  resourcePlan?: Array<{ resourceId?: string; startDate?: string; endDate?: string }>
  candidateResources?: CandidateResource[]
}

interface PlanningDialogProps {
  open: boolean
  bookingId: string | null
  onClose: () => void
  onUpdated?: () => void | Promise<void>
}

const safeFormatDate = (dateStr?: string | null, pattern = "dd MMM yyyy", fallback = "Unscheduled"): string => {
  if (!dateStr) return fallback
  const d = parseISO(dateStr)
  if (!isValid(d)) return fallback
  try {
    return format(d, pattern)
  } catch {
    return fallback
  }
}

const toDateInput = (value?: string | null): string => {
  if (!value) return ""
  const d = parseISO(value)
  if (!isValid(d)) return ""
  return format(d, "yyyy-MM-dd")
}

const todayInput = (): string => format(new Date(), "yyyy-MM-dd")

const getDaysBetweenDates = (startStr: string, endStr: string): string[] => {
  const dates: string[] = []
  const start = parseISO(startStr)
  const end = parseISO(endStr)
  if (!isValid(start) || !isValid(end)) return []
  let curr = new Date(start)
  while (curr <= end) {
    dates.push(format(curr, "yyyy-MM-dd"))
    curr = addDays(curr, 1)
  }
  return dates
}

const resourceLabel = (
  resourceId: string,
  candidates: CandidateResource[],
  assigned: Array<{ _id?: string; name?: string; email?: string }>
): string => {
  const fromCandidate = candidates.find((c) => c._id === resourceId)
  if (fromCandidate) return fromCandidate.name || fromCandidate.username || fromCandidate.email || resourceId
  const fromAssigned = assigned.find((a) => a._id === resourceId)
  if (fromAssigned) return fromAssigned.name || fromAssigned.email || resourceId
  return resourceId
}

export default function PlanningDialog({ open, bookingId, onClose, onUpdated }: PlanningDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string>("")
  const [bookingNumber, setBookingNumber] = useState<string>("")
  const [customerName, setCustomerName] = useState<string>("")
  const [startDate, setStartDate] = useState<string>("")
  const [candidates, setCandidates] = useState<CandidateResource[]>([])
  const [assigned, setAssigned] = useState<Array<{ _id?: string; name?: string; email?: string }>>([])
  const [rows, setRows] = useState<PlanRow[]>([])
  const [addResourceId, setAddResourceId] = useState<string>("")

  const todayStr = useMemo(() => todayInput(), [])
  const isInProgress = status === "in_progress" || status === "professional_completed"

  const withAuthHeaders = () => {
    const token = getAuthToken()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  const hydrate = useCallback((payload: PlanningPayload) => {
    setStatus(payload.status || "")
    setBookingNumber(payload.bookingNumber || "")
    setCustomerName(payload.customerName || "")
    const start = toDateInput(payload.scheduledStartDate)
    setStartDate(start)
    const cands = payload.candidateResources || []
    setCandidates(cands)
    setAssigned(payload.assignedTeamMembers || [])

    const plan = payload.resourcePlan || []
    if (plan.length > 0) {
      const daysMap = new Map<string, Set<string>>()
      for (const p of plan) {
        const rid = p.resourceId
        if (!rid) continue
        if (!daysMap.has(rid)) {
          daysMap.set(rid, new Set())
        }
        const s = toDateInput(p.startDate)
        const e = toDateInput(p.endDate)
        if (s && e) {
          const days = getDaysBetweenDates(s, e)
          for (const d of days) {
            daysMap.get(rid)!.add(d)
          }
        }
      }

      const newRows: PlanRow[] = []
      daysMap.forEach((dateSet, resourceId) => {
        newRows.push({
          resourceId,
          plannedDates: Array.from(dateSet),
          isNew: false
        })
      })
      setRows(newRows)
    } else {
      const fallbackEnd = toDateInput(payload.scheduledExecutionEndDate) || start
      const initialDays = (start && fallbackEnd) ? getDaysBetweenDates(start, fallbackEnd) : []

      setRows(
        (payload.assignedTeamMembers || [])
          .filter((m) => !!m._id)
          .map((m) => ({
            resourceId: m._id as string,
            plannedDates: [...initialDays],
            isNew: false,
          }))
      )
    }
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
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) {
          toast.error(payload?.error?.message || "Failed to load planning")
          if (!cancelled) onClose()
          return
        }
        if (!cancelled) hydrate(payload.data as PlanningPayload)
      } catch {
        toast.error("Failed to load planning")
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

  const availableToAdd = useMemo(() => {
    const usedIds = new Set(rows.map((r) => r.resourceId))
    return candidates.filter((c) => !usedIds.has(c._id))
  }, [candidates, rows])

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const addRow = () => {
    if (!addResourceId) return
    setRows((prev) => [
      ...prev,
      {
        resourceId: addResourceId,
        plannedDates: [],
        isNew: true,
      },
    ])
    setAddResourceId("")
  }

  const getContiguousRanges = (dateStrings: string[]): Array<{ startDate: string; endDate: string }> => {
    if (dateStrings.length === 0) return []
    const sorted = [...dateStrings].sort()
    const ranges: Array<{ startDate: string; endDate: string }> = []
    
    let currentStart = sorted[0]
    let currentEnd = sorted[0]
    
    for (let i = 1; i < sorted.length; i++) {
      const dateA = parseISO(currentEnd)
      const dateB = parseISO(sorted[i])
      const diffDays = differenceInCalendarDays(dateB, dateA)
      
      if (diffDays === 1) {
        currentEnd = sorted[i]
      } else {
        ranges.push({ startDate: currentStart, endDate: currentEnd })
        currentStart = sorted[i]
        currentEnd = sorted[i]
      }
    }
    ranges.push({ startDate: currentStart, endDate: currentEnd })
    return ranges
  }

  const submit = async () => {
    if (!bookingId) return
    if (rows.length === 0) {
      toast.error("At least one resource is required")
      return
    }
    const totalPlannedDays = rows.reduce((sum, r) => sum + r.plannedDates.length, 0)
    if (totalPlannedDays === 0) {
      toast.error("At least one resource day must be planned")
      return
    }

    setSaving(true)
    try {
      const resourcePlanPayload: Array<{ resourceId: string; startDate: string; endDate: string }> = []
      
      for (const row of rows) {
        const ranges = getContiguousRanges(row.plannedDates)
        for (const r of ranges) {
          resourcePlanPayload.push({
            resourceId: row.resourceId,
            startDate: r.startDate,
            endDate: r.endDate,
          })
        }
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/planning`, {
        method: "PUT",
        credentials: "include",
        headers: withAuthHeaders(),
        body: JSON.stringify({
          resourcePlan: resourcePlanPayload,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(payload?.error?.message || "Failed to save planning")
        return
      }
      toast.success("Planning updated.")
      await onUpdated?.()
      onClose()
    } catch {
      toast.error("Failed to save planning")
    } finally {
      setSaving(false)
    }
  }

  const timelineStart = useMemo(() => {
    if (isInProgress) return todayStr
    return startDate || todayStr
  }, [isInProgress, startDate, todayStr])

  const gridDates = useMemo(() => {
    const dates: Date[] = []
    const start = parseISO(timelineStart)
    if (!isValid(start)) return []
    for (let i = 0; i < 30; i++) {
      dates.push(addDays(start, i))
    }
    return dates
  }, [timelineStart])

  const monthHeaders = useMemo(() => {
    const headers: Array<{ label: string; span: number }> = []
    if (gridDates.length === 0) return headers
    
    let currentMonth = format(gridDates[0], "MMMM yyyy")
    let count = 0
    
    for (const d of gridDates) {
      const mLabel = format(d, "MMMM yyyy")
      if (mLabel !== currentMonth) {
        headers.push({ label: currentMonth, span: count })
        currentMonth = mLabel
        count = 1
      } else {
        count++
      }
    }
    if (count > 0) {
      headers.push({ label: currentMonth, span: count })
    }
    return headers
  }, [gridDates])

  const togglePlannedDate = (rowIndex: number, dateStr: string) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIndex) return row
        const exists = row.plannedDates.includes(dateStr)
        const newDates = exists
          ? row.plannedDates.filter((d) => d !== dateStr)
          : [...row.plannedDates, dateStr]
        return { ...row, plannedDates: newDates }
      })
    )
  }

  const projectTimelineEnd = useMemo(() => {
    let max = ""
    for (const row of rows) {
      for (const d of row.plannedDates) {
        if (d > max) max = d
      }
    }
    return max
  }, [rows])

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onClose()}>
      <DialogContent className="max-w-4xl p-6">
        <DialogHeader className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <DialogTitle className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Calendar className="h-5.5 w-5.5 text-indigo-600" />
              Resource Planning
              {bookingNumber && (
                <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200/50">
                  {bookingNumber}
                </span>
              )}
            </DialogTitle>
          </div>
          {customerName && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-1.5 w-fit">
              <User className="h-4 w-4 text-slate-400" />
              Customer: <span className="font-semibold text-slate-800">{customerName}</span>
            </div>
          )}
          <DialogDescription className="text-sm text-slate-500">
            Manage your team schedule for this project. Check or uncheck available days below to allocate them.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Context message */}
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs text-amber-800 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Planning window:</span> Starts on{" "}
                <strong>{safeFormatDate(startDate, "dd MMM yyyy", "Unscheduled")}</strong>.
                {isInProgress && " Project is in progress: past days are locked and preserved automatically. You can schedule new days starting from today."}
              </div>
            </div>

            {/* Grid Timeline Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 bg-slate-50/60 border border-slate-200/40 rounded-lg p-2.5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mr-1">Legend:</span>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 bg-emerald-500 rounded border border-emerald-600/20" />
                <span>Planned (Green)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 bg-sky-100 rounded border border-sky-200 flex items-center justify-center">
                  <Lock className="h-2 w-2 text-sky-600/70" />
                </span>
                <span>Unavailable / Booked (Blue)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 bg-white rounded border border-slate-200" />
                <span>Available (Blanc)</span>
              </div>
            </div>

            {/* Grid Timeline Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
              <div className="overflow-x-auto max-w-full relative scrollbar-thin">
                <table className="w-full border-collapse text-left table-fixed">
                  <thead>
                    {/* Month headers row */}
                    <tr className="bg-slate-50/80 border-b border-slate-200">
                      <th className="sticky left-0 bg-slate-50/90 border-r border-slate-200 p-2 text-xs font-bold text-slate-500 w-[160px] min-w-[160px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        Resource
                      </th>
                      {monthHeaders.map((m, idx) => (
                        <th
                          key={`${m.label}-${idx}`}
                          colSpan={m.span}
                          className="border-r border-slate-200/60 px-2 py-1.5 text-center text-xs font-bold text-indigo-700 tracking-wide bg-indigo-50/40"
                        >
                          {m.label}
                        </th>
                      ))}
                    </tr>
                    {/* Day numbers row */}
                    <tr className="bg-slate-50/30 border-b border-slate-200">
                      <th className="sticky left-0 bg-slate-50/90 border-r border-slate-200 p-2 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {/* Empty spacer for resource column header */}
                      </th>
                      {gridDates.map((d) => (
                        <th
                          key={d.toISOString()}
                          className={`border-r border-slate-200/60 px-1 py-1.5 text-center text-[10px] font-semibold text-slate-600 min-w-[34px] w-[34px] ${
                            d.getDay() === 0 || d.getDay() === 6 ? "bg-slate-50" : ""
                          }`}
                        >
                          <div className="leading-tight">{format(d, "d")}</div>
                          <div className="text-[8px] text-slate-400 font-normal leading-tight mt-0.5">
                            {format(d, "EEE").slice(0, 1)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={gridDates.length + 1}
                          className="px-4 py-8 text-center text-sm text-slate-400 bg-slate-50/20 italic"
                        >
                          No resources planned yet. Add team members below.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, index) => {
                        const cand = candidates.find((c) => c._id === row.resourceId)
                        const name = resourceLabel(row.resourceId, candidates, assigned)
                        const lockDelete = isInProgress && row.plannedDates.some((d) => d < todayStr)
                        
                        return (
                          <tr key={row.resourceId} className="hover:bg-slate-50/30 transition-colors">
                            <td className="sticky left-0 bg-white border-r border-slate-200 p-2 font-medium text-xs text-slate-900 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] truncate">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="truncate pr-1 font-semibold text-slate-800" title={name}>
                                  {name}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50/50"
                                  onClick={() => removeRow(index)}
                                  disabled={lockDelete}
                                  title={lockDelete ? "This resource has past planned days and cannot be removed" : "Remove resource"}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                            {gridDates.map((date) => {
                              const dateStr = format(date, "yyyy-MM-dd")
                              const isUnavailable = cand?.unavailableDates?.includes(dateStr)
                              const isPlanned = row.plannedDates.includes(dateStr)
                              const isPastLocked = isInProgress && dateStr < todayStr
                              
                              let cellBg = "bg-white hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
                              if (isUnavailable) {
                                cellBg = "bg-sky-50 text-sky-800 cursor-not-allowed"
                              } else if (isPastLocked) {
                                if (isPlanned) {
                                  cellBg = "bg-emerald-500/70 text-white cursor-not-allowed font-semibold opacity-80"
                                } else {
                                  cellBg = "bg-slate-100 text-slate-400 cursor-not-allowed opacity-60"
                                }
                              } else if (isPlanned) {
                                cellBg = "bg-emerald-500 hover:bg-emerald-600 text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] font-semibold"
                              } else if (date.getDay() === 0 || date.getDay() === 6) {
                                cellBg = "bg-slate-50/60 hover:bg-slate-100 active:bg-slate-200 cursor-pointer"
                              }

                              return (
                                <td
                                  key={dateStr}
                                  className={`border-r border-slate-200/50 p-0 text-center text-xs h-9 select-none transition-colors ${cellBg}`}
                                  onClick={() => {
                                    if (isUnavailable || isPastLocked) return
                                    togglePlannedDate(index, dateStr)
                                  }}
                                >
                                  {isUnavailable ? (
                                    <div className="flex items-center justify-center h-full">
                                      <Lock className="h-2.5 w-2.5 text-sky-600/70" />
                                    </div>
                                  ) : null}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add Resource Selector */}
            {availableToAdd.length > 0 && (
              <div className="flex items-end gap-3 bg-slate-50/55 border border-slate-200/60 rounded-xl p-4.5">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Add Team Member</Label>
                  <Select value={addResourceId} onValueChange={setAddResourceId}>
                    <SelectTrigger className="bg-white border-slate-200 shadow-sm focus:ring-2 focus:ring-indigo-500/25">
                      <SelectValue placeholder="Select a resource to add..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name || c.username || c.email || c._id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addRow}
                  disabled={!addResourceId}
                  className="bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm h-10 px-4"
                >
                  <Plus className="mr-1.5 h-4 w-4 text-slate-500" /> Add Resource
                </Button>
              </div>
            )}

            {/* Timeline Summary info */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 flex items-center justify-between gap-3">
              <div>
                Project Timeline bounds:{" "}
                <strong>{safeFormatDate(startDate, "dd MMM yyyy", "Unscheduled")}</strong>
                {" → "}
                <strong>{safeFormatDate(projectTimelineEnd, "dd MMM yyyy", "Unscheduled")}</strong>
              </div>
              <div className="text-slate-400 font-medium">30 days grid</div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <Button variant="outline" onClick={onClose} disabled={saving} className="border-slate-200 text-slate-700">
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={saving || rows.length === 0}
                className="bg-indigo-600 text-white hover:bg-indigo-700 shadow-md font-semibold px-5"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Planning Board
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
