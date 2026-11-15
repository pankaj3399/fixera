'use client'

import { messageFromApiBody } from '@/lib/apiErrors';

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ClipboardList, Download, RefreshCw, X } from "lucide-react"
import { toast } from "sonner"

interface AuditLog {
  _id: string
  actor?: string
  actorRole?: string
  actorEmail?: string
  action: string
  targetType?: string
  targetId?: string
  method?: string
  path?: string
  details?: unknown
  ip?: string
  userAgent?: string
  status: 'success' | 'failure'
  statusCode?: number
  errorMessage?: string
  createdAt: string
}

interface AuditStats {
  total: number
  failures: number
  uniqueActors: number
}

const FALLBACK_ACTIONS = [
  'admin.professionals.approve',
  'admin.professionals.reject',
  'admin.professionals.suspend',
  'admin.professionals.reactivate',
  'admin.disputes.resolve',
  'admin.payment.refund',
  'admin.users.hard_delete',
  'admin.users.anonymize',
  'admin.cancellation_requests.approve',
  'admin.cancellation_requests.deny',
  'user.data_export',
  'user.anonymize',
]

const FALLBACK_TARGET_TYPES = ['User', 'Booking', 'Payment', 'WarrantyClaim', 'CancellationRequest', 'Referral']

const STATUSES: Array<'all' | 'success' | 'failure'> = ['all', 'success', 'failure']

export default function AdminAuditLogsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null)

  const [actionOptions, setActionOptions] = useState<string[]>(FALLBACK_ACTIONS)
  const [targetTypeOptions, setTargetTypeOptions] = useState<string[]>(FALLBACK_TARGET_TYPES)

  const [actionFilter, setActionFilter] = useState<string>('all')
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all')
  const [actorEmail, setActorEmail] = useState('')
  const [debouncedActorEmail, setDebouncedActorEmail] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [untilDate, setUntilDate] = useState('')

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logsAbortRef = useRef<AbortController | null>(null)
  const statsAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedActorEmail(actorEmail.trim())
      setPage(1)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [actorEmail])

  useEffect(() => {
    if (user?.role !== 'admin') return
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/audit-logs/actions`)
        const json = await res.json()
        if (cancelled || !res.ok || !json?.success) return
        const actions = Array.isArray(json.data?.actions) ? json.data.actions.filter(Boolean) : []
        const targetTypes = Array.isArray(json.data?.targetTypes) ? json.data.targetTypes.filter(Boolean) : []
        if (actions.length > 0) setActionOptions(actions)
        if (targetTypes.length > 0) setTargetTypeOptions(targetTypes)
      } catch {
        // keep fallback lists
      }
    })()
    return () => { cancelled = true }
  }, [user])

  const filterParams = useMemo(() => {
    const params = new URLSearchParams()
    if (actionFilter !== 'all') params.set('action', actionFilter)
    if (targetTypeFilter !== 'all') params.set('targetType', targetTypeFilter)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (debouncedActorEmail.length >= 2) params.set('actorEmail', debouncedActorEmail)
    if (fromDate) params.set('from', fromDate)
    if (untilDate) params.set('until', untilDate)
    return params
  }, [actionFilter, targetTypeFilter, statusFilter, debouncedActorEmail, fromDate, untilDate])

  const queryString = useMemo(() => {
    const params = new URLSearchParams(filterParams)
    params.set('page', page.toString())
    params.set('limit', '25')
    return params.toString()
  }, [page, filterParams])

  const statsQueryString = useMemo(() => filterParams.toString(), [filterParams])

  const fetchLogs = useCallback(async () => {
    logsAbortRef.current?.abort()
    const controller = new AbortController()
    logsAbortRef.current = controller
    setIsLoading(true)
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/audit-logs?${queryString}`,
        { signal: controller.signal }
      )
      if (controller.signal.aborted) return
      const json = await res.json()
      if (controller.signal.aborted) return
      if (!res.ok || !json.success) {
        toast.error(messageFromApiBody(json, 'Failed to load audit logs'))
        return
      }
      setLogs(json.data.logs as AuditLog[])
      setTotalPages(json.data.pagination.totalPages)
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      console.error('audit-logs fetch failed', err)
      toast.error('Failed to load audit logs')
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [queryString])

  const fetchStats = useCallback(async () => {
    statsAbortRef.current?.abort()
    const controller = new AbortController()
    statsAbortRef.current = controller
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/audit-logs/stats?${statsQueryString}`,
        { signal: controller.signal }
      )
      if (controller.signal.aborted) return
      const json = await res.json()
      if (controller.signal.aborted) return
      if (res.ok && json.success) setStats(json.data as AuditStats)
    } catch {
      // silent (includes AbortError)
    }
  }, [statsQueryString])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchLogs()
      fetchStats()
    }
  }, [user, fetchLogs, fetchStats])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      logsAbortRef.current?.abort()
      statsAbortRef.current?.abort()
    }
  }, [])

  const exportLogs = useCallback(async (format: 'csv' | 'json') => {
    setExporting(format)
    try {
      const params = new URLSearchParams(filterParams)
      const trimmedActorEmail = actorEmail.trim()
      if (trimmedActorEmail.length >= 2) {
        params.set('actorEmail', trimmedActorEmail)
      } else {
        params.delete('actorEmail')
      }
      if (format === 'json') params.set('format', 'json')
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/audit-logs/export?${params.toString()}`
      )
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(messageFromApiBody(json, 'Failed to export audit logs'))
        return
      }
      const blob = await res.blob()
      const stamp = new Date().toISOString().slice(0, 10)
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `audit-logs-${stamp}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
      toast.success(`Exported audit logs (${format.toUpperCase()})`)
    } catch {
      toast.error('Failed to export audit logs')
    } finally {
      setExporting(null)
    }
  }, [filterParams, actorEmail])

  if (loading || !user) return null
  if (user.role !== 'admin') return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              Audit Logs
            </h1>
            <p className="text-sm text-gray-500 mt-1">Every state-changing admin and account action</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={!!exporting}
              onClick={() => exportLogs('csv')}
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!exporting}
              onClick={() => exportLogs('json')}
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { fetchLogs(); fetchStats() }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
                <p className="text-sm text-gray-500">Total events (filtered)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-600">{stats.failures}</div>
                <p className="text-sm text-gray-500">Failures</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">{stats.uniqueActors}</div>
                <p className="text-sm text-gray-500">Unique actors</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="action-filter">Action</Label>
                <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1) }}>
                  <SelectTrigger id="action-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {actionOptions.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="target-filter">Target type</Label>
                <Select value={targetTypeFilter} onValueChange={(v) => { setTargetTypeFilter(v); setPage(1) }}>
                  <SelectTrigger id="target-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All targets</SelectItem>
                    {targetTypeOptions.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="status-filter">Status</Label>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as 'all' | 'success' | 'failure'); setPage(1) }}>
                  <SelectTrigger id="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="actor-email">Actor email contains</Label>
                <div className="relative">
                  <Input
                    id="actor-email"
                    aria-label="Filter by actor email substring"
                    placeholder="e.g. admin@"
                    value={actorEmail}
                    onChange={(e) => setActorEmail(e.target.value)}
                  />
                  {actorEmail && (
                    <button
                      type="button"
                      aria-label="Clear actor email filter"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                      onClick={() => setActorEmail('')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {actorEmail.length > 0 && actorEmail.length < 2 && (
                  <p className="text-xs text-gray-400">Type at least 2 characters</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="from-date">From</Label>
                <Input
                  id="from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="until-date">Until</Label>
                <Input
                  id="until-date"
                  type="date"
                  value={untilDate}
                  onChange={(e) => { setUntilDate(e.target.value); setPage(1) }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No audit log entries match these filters</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-gray-500">
                    <th className="pb-2 pr-3">When</th>
                    <th className="pb-2 pr-3">Actor</th>
                    <th className="pb-2 pr-3">Action</th>
                    <th className="pb-2 pr-3">Target</th>
                    <th className="pb-2 pr-3">IP</th>
                    <th className="pb-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log._id}
                      className="border-b last:border-0 cursor-pointer hover:bg-gray-50 focus:outline-none focus:bg-gray-100"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open details for audit log ${log.action} at ${new Date(log.createdAt).toLocaleString()}`}
                      onClick={() => setSelectedLog(log)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedLog(log)
                        }
                      }}
                    >
                      <td className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="text-xs">
                          <div className="text-gray-900">{log.actorEmail || '—'}</div>
                          <div className="text-gray-400">{log.actorRole || ''}</div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{log.action}</td>
                      <td className="py-2 pr-3 text-xs">
                        {log.targetType ? (
                          <>
                            <span className="font-medium">{log.targetType}</span>
                            <span className="text-gray-400">{log.targetId ? ` · ${String(log.targetId).slice(-8)}` : ''}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500">{log.ip || '—'}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                          {log.status}
                          {log.statusCode ? ` ${log.statusCode}` : ''}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null) }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-mono text-base">{selectedLog?.action}</DialogTitle>
              <DialogDescription>
                {selectedLog && new Date(selectedLog.createdAt).toLocaleString()} · {selectedLog?.method} {selectedLog?.path}
              </DialogDescription>
            </DialogHeader>
            {selectedLog && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Actor</p>
                    <p>{selectedLog.actorEmail || '—'}</p>
                    <p className="text-xs text-gray-400">{selectedLog.actorRole}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Target</p>
                    <p>{selectedLog.targetType || '—'}</p>
                    <p className="text-xs text-gray-400 break-all">{selectedLog.targetId || ''}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">IP</p>
                    <p>{selectedLog.ip || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <p>
                      <Badge variant={selectedLog.status === 'success' ? 'default' : 'destructive'}>
                        {selectedLog.status} {selectedLog.statusCode || ''}
                      </Badge>
                    </p>
                  </div>
                </div>
                {selectedLog.errorMessage && (
                  <div>
                    <p className="text-xs text-gray-500">Error</p>
                    <p className="text-red-600 text-xs">{selectedLog.errorMessage}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Details</p>
                  <pre className="bg-gray-50 border rounded p-3 text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.details ?? {}, null, 2)}
                  </pre>
                </div>
                {selectedLog.userAgent && (
                  <div>
                    <p className="text-xs text-gray-500">User agent</p>
                    <p className="text-xs text-gray-600 break-all">{selectedLog.userAgent}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
