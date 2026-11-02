'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { messageFromApiBody } from "@/lib/apiErrors"
import { authFetch } from "@/lib/utils"
import {
  EMAIL_LOG_STATUSES,
  EMAIL_LOG_TEXT_FILTERS,
  EMPTY_EMAIL_LOG_FILTERS,
  buildEmailLogQuery,
  isBookingIdFilter,
  parseEmailLogsResponse,
  sameEmailLogFilters,
  type EmailLog,
  type EmailLogFilters,
  type EmailLogStatus,
} from "@/lib/admin/emailLogs"
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
import { Mail, RefreshCw, X } from "lucide-react"

const STATUS_BADGE: Record<EmailLogStatus, "default" | "destructive" | "secondary"> = {
  sent: "default",
  failed: "destructive",
  skipped: "secondary",
}

/** Text filters are debounced so typing does not fire one request per key. */
const TEXT_DEBOUNCE_MS = 400

export default function AdminEmailLogsPage() {
  const [filters, setFilters] = useState<EmailLogFilters>(EMPTY_EMAIL_LOG_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<EmailLogFilters>(EMPTY_EMAIL_LOG_FILTERS)
  const [page, setPage] = useState(1)
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Select/date filters apply immediately; text filters after a short pause.
  const textFilterChanged = EMAIL_LOG_TEXT_FILTERS.some((key) => filters[key] !== appliedFilters[key])
  useEffect(() => {
    if (sameEmailLogFilters(filters, appliedFilters)) return
    const timer = setTimeout(() => {
      setAppliedFilters(filters)
      setPage(1)
    }, textFilterChanged ? TEXT_DEBOUNCE_MS : 0)
    return () => clearTimeout(timer)
  }, [filters, appliedFilters, textFilterChanged])

  const queryString = useMemo(() => buildEmailLogQuery(appliedFilters, page), [appliedFilters, page])

  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await authFetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/email-logs?${queryString}`,
          { signal: controller.signal },
        )
        const json = await res.json().catch(() => null)
        if (controller.signal.aborted) return
        if (!res.ok) {
          setError(messageFromApiBody(json, "Failed to load email logs"))
          return
        }
        const result = parseEmailLogsResponse(json)
        setLogs(result.logs)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        if (result.page !== page) setPage(result.page)
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return
        console.error("email-logs fetch failed", err)
        setError("Failed to load email logs")
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()
    return () => controller.abort()
    // `page` is part of queryString; reloadToken forces a manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, reloadToken])

  const updateFilter = useCallback(<K extends keyof EmailLogFilters>(key: K, value: EmailLogFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const hasFilters = !sameEmailLogFilters(filters, EMPTY_EMAIL_LOG_FILTERS)
  const bookingFilterInvalid = filters.relatedBooking.trim().length > 0 && !isBookingIdFilter(filters.relatedBooking)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Mail className="h-6 w-6" />
              Email Logs
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Every transactional email the platform attempted, with its delivery outcome
            </p>
          </div>
          <div className="flex gap-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_EMAIL_LOG_FILTERS)}>
                <X className="h-4 w-4 mr-2" />
                Clear filters
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setReloadToken((n) => n + 1)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="email-log-to">Recipient contains</Label>
                <Input
                  id="email-log-to"
                  placeholder="e.g. jane@"
                  value={filters.to}
                  onChange={(e) => updateFilter("to", e.target.value)}
                />
                {filters.to.trim().length === 1 && (
                  <p className="text-xs text-gray-400">Type at least 2 characters</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-log-template">Template</Label>
                <Input
                  id="email-log-template"
                  placeholder="exact template name, e.g. booking-confirmation"
                  value={filters.template}
                  onChange={(e) => updateFilter("template", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-log-status">Status</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) => updateFilter("status", value as EmailLogFilters["status"])}
                >
                  <SelectTrigger id="email-log-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {EMAIL_LOG_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-log-booking">Booking ID</Label>
                <Input
                  id="email-log-booking"
                  placeholder="24-character booking id"
                  value={filters.relatedBooking}
                  onChange={(e) => updateFilter("relatedBooking", e.target.value)}
                  aria-invalid={bookingFilterInvalid}
                />
                {bookingFilterInvalid && (
                  <p className="text-xs text-amber-600">Enter the full 24-character booking id</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-log-from">From</Label>
                <Input
                  id="email-log-from"
                  type="date"
                  value={filters.from}
                  onChange={(e) => updateFilter("from", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-log-until">Until</Label>
                <Input
                  id="email-log-until"
                  type="date"
                  value={filters.until}
                  onChange={(e) => updateFilter("until", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <p role="alert" className="text-red-600">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setReloadToken((n) => n + 1)}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Mail className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No email log entries match these filters</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <p className="text-xs text-gray-500 mb-3">{total} matching {total === 1 ? "email" : "emails"}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-gray-500">
                    <th className="pb-2 pr-3">When</th>
                    <th className="pb-2 pr-3">Recipient</th>
                    <th className="pb-2 pr-3">Subject</th>
                    <th className="pb-2 pr-3">Template</th>
                    <th className="pb-2 pr-3">Booking</th>
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
                      aria-label={`Open details for email to ${log.to} at ${new Date(log.createdAt).toLocaleString()}`}
                      onClick={() => setSelectedLog(log)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedLog(log)
                        }
                      }}
                    >
                      <td className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-900 break-all">{log.to}</td>
                      <td className="py-2 pr-3 text-xs max-w-xs truncate" title={log.subject}>{log.subject || "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{log.template}</td>
                      <td className="py-2 pr-3 text-xs">
                        {log.relatedBooking ? (
                          <Link
                            href={`/admin/bookings/${log.relatedBooking}`}
                            className="text-blue-700 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            …{log.relatedBooking.slice(-8)}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={STATUS_BADGE[log.status]} className="text-xs">{log.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {!error && totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
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
              <DialogTitle className="text-base break-words">{selectedLog?.subject || "(no subject)"}</DialogTitle>
              <DialogDescription>
                {selectedLog && new Date(selectedLog.createdAt).toLocaleString()} · {selectedLog?.template}
              </DialogDescription>
            </DialogHeader>
            {selectedLog && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Recipient</p>
                  <p className="break-all">{selectedLog.to}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <Badge variant={STATUS_BADGE[selectedLog.status]}>{selectedLog.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Booking</p>
                  {selectedLog.relatedBooking ? (
                    <Link href={`/admin/bookings/${selectedLog.relatedBooking}`} className="text-blue-700 hover:underline break-all">
                      {selectedLog.relatedBooking}
                    </Link>
                  ) : <p>—</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Related user</p>
                  <p className="break-all">{selectedLog.relatedUser || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Triggered by</p>
                  <p className="break-all">{selectedLog.actorId || "—"}</p>
                </div>
                {selectedLog.errorMessage && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">Error</p>
                    <p className="text-red-600 text-xs break-words">{selectedLog.errorMessage}</p>
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
