'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAuthToken } from "@/lib/utils"
import { Loader2, Lock, Plus, Trash2 } from "lucide-react"

type CandidateResource = {
  _id: string
  name?: string
  email?: string
  username?: string
}

type PlanRow = {
  resourceId: string
  startDate: string
  endDate: string
  used: boolean
  isNew: boolean
}

type PlanningPayload = {
  bookingId: string
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

const toDateInput = (value?: string | null): string => {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

const todayInput = (): string => new Date().toISOString().slice(0, 10)

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
  const [startDate, setStartDate] = useState<string>("")
  const [candidates, setCandidates] = useState<CandidateResource[]>([])
  const [assigned, setAssigned] = useState<Array<{ _id?: string; name?: string; email?: string }>>([])
  const [rows, setRows] = useState<PlanRow[]>([])
  const [addResourceId, setAddResourceId] = useState<string>("")

  const today = useMemo(() => todayInput(), [])
  const isInProgress = status === "in_progress" || status === "professional_completed"

  const withAuthHeaders = () => {
    const token = getAuthToken()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  const hydrate = useCallback((payload: PlanningPayload) => {
    setStatus(payload.status || "")
    const start = toDateInput(payload.scheduledStartDate)
    setStartDate(start)
    const cands = payload.candidateResources || []
    setCandidates(cands)
    setAssigned(payload.assignedTeamMembers || [])

    const todayStr = todayInput()
    const plan = payload.resourcePlan || []
    if (plan.length > 0) {
      setRows(
        plan.map((p) => {
          const s = toDateInput(p.startDate) || start
          const used = !!s && s < todayStr
          return {
            resourceId: p.resourceId || "",
            startDate: s,
            endDate: toDateInput(p.endDate) || s || start,
            used,
            isNew: false,
          }
        })
      )
    } else {
      const fallbackEnd = toDateInput(payload.scheduledExecutionEndDate) || start
      setRows(
        (payload.assignedTeamMembers || [])
          .filter((m) => !!m._id)
          .map((m) => ({
            resourceId: m._id as string,
            startDate: start,
            endDate: fallbackEnd,
            used: false,
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
  }, [open, bookingId, hydrate, onClose])

  const availableToAdd = useMemo(() => {
    const usedIds = new Set(rows.map((r) => r.resourceId))
    return candidates.filter((c) => !usedIds.has(c._id))
  }, [candidates, rows])

  const updateRow = (index: number, patch: Partial<PlanRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const addRow = () => {
    if (!addResourceId) return
    const start = isInProgress ? today : startDate || today
    setRows((prev) => [
      ...prev,
      {
        resourceId: addResourceId,
        startDate: start,
        endDate: start,
        used: false,
        isNew: true,
      },
    ])
    setAddResourceId("")
  }

  const validate = (): string | null => {
    if (rows.length === 0) return "At least one resource is required"
    if (!startDate) return "Booking has no scheduled start date"
    for (const row of rows) {
      if (!row.resourceId) return "Each row needs a resource"
      if (!row.endDate) return "Each resource needs an end date"
      if (row.startDate < startDate) return "A resource cannot start before the booking start date"
      if (row.endDate < row.startDate) return "An end date cannot be before its start date"
      if (isInProgress) {
        if (row.used && row.endDate < today) return "A resource already in use cannot end before today"
        if (row.isNew && row.startDate < today) return "New resources can only start from today onward"
      }
    }
    return null
  }

  const submit = async () => {
    if (!bookingId) return
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/planning`, {
        method: "PUT",
        credentials: "include",
        headers: withAuthHeaders(),
        body: JSON.stringify({
          resourcePlan: rows.map((r) => ({
            resourceId: r.resourceId,
            startDate: r.startDate,
            endDate: r.endDate,
          })),
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

  const projectEnd = useMemo(() => {
    let max = ""
    for (const row of rows) {
      if (row.endDate && row.endDate > max) max = row.endDate
    }
    return max
  }, [rows])

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Planning</DialogTitle>
          <DialogDescription>
            Manage the resources working on this booking and each resource&apos;s schedule.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                <span>
                  Booking start: <strong>{startDate ? format(new Date(startDate), "dd MMM yyyy") : "Unscheduled"}</strong>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                The start date is read-only here. Change it via a reschedule request.
                {isInProgress && " Work in progress: dates up to today are locked. Used resources can be shortened but not removed."}
              </p>
            </div>

            <div className="space-y-2">
              {rows.length === 0 && (
                <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
                  No resources planned yet. Add one below.
                </p>
              )}
              {rows.map((row, index) => {
                const lockDelete = isInProgress && row.used
                const minStart = isInProgress && row.isNew ? today : startDate
                const minEnd = isInProgress && row.used ? today : row.startDate || startDate
                return (
                  <div key={`${row.resourceId}-${index}`} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {resourceLabel(row.resourceId, candidates, assigned)}
                        {row.used && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            <Lock className="h-2.5 w-2.5" /> In use
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                        onClick={() => removeRow(index)}
                        disabled={lockDelete}
                        title={lockDelete ? "A resource in use cannot be removed" : "Remove resource"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-500">Start</Label>
                        <Input
                          type="date"
                          value={row.startDate}
                          min={minStart}
                          disabled={row.used}
                          onChange={(event) => updateRow(index, { startDate: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-500">End</Label>
                        <Input
                          type="date"
                          value={row.endDate}
                          min={minEnd}
                          onChange={(event) => updateRow(index, { endDate: event.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {availableToAdd.length > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-[11px] text-slate-500">Add resource</Label>
                  <Select value={addResourceId} onValueChange={setAddResourceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a team member" />
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
                <Button type="button" variant="outline" onClick={addRow} disabled={!addResourceId}>
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Project timeline:{" "}
              <strong>{startDate ? format(new Date(startDate), "dd MMM yyyy") : "Unscheduled"}</strong>
              {" → "}
              <strong>{projectEnd ? format(new Date(projectEnd), "dd MMM yyyy") : "—"}</strong>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving || rows.length === 0}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save plan
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
