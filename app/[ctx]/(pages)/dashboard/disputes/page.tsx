'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useVisiblePathname } from "@/hooks/useVisiblePathname"
import { useTranslations } from "next-intl"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, RefreshCw, Scale, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { facetCount, readFacetCounts } from "@/lib/dashboardOverview"

type DisputeStatusFilter = "all" | "open" | "resolved"

interface DisputeRecord {
  _id: string
  bookingNumber?: string
  status: string
  customer?: { _id: string; name?: string } | null
  professional?: { _id: string; name?: string } | null
  project?: { _id: string; title?: string } | null
  payment?: { totalWithVat?: number; currency?: string } | null
  scheduledStartDate?: string
  dispute?: {
    raisedBy: string
    reason: string
    description: string
    raisedAt: string
    resolvedAt?: string
    resolution?: string
    adminAdjustedAmount?: number
    slaDeadline?: string
  }
}

const formatDate = (value: string | undefined, intl: string) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString(intl)
}

export default function DashboardDisputesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = useVisiblePathname()
  const t = useTranslations("dashboard")
  const { intl } = useFormatLocale()

  const [items, setItems] = useState<DisputeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const requestRef = useRef<AbortController | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  // FT2 #10a: status/service filters with counts, like the other dashboards.
  const [statusFilter, setStatusFilter] = useState<DisputeStatusFilter>("all")
  const [serviceFilter, setServiceFilter] = useState("all")
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null)
  const [serviceCounts, setServiceCounts] = useState<Record<string, number> | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!loading && !user) {
      const redirect = pathname || '/dashboard/disputes'
      router.push(`/login?redirect=${encodeURIComponent(redirect)}`)
    }
  }, [user, loading, router, pathname])

  const fetchDisputes = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setIsLoading(true)
    setLoadFailed(false)
    setItems([])
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (serviceFilter !== "all") params.set("service", serviceFilter)
      if (debouncedSearch) params.set("q", debouncedSearch)
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/disputes/mine?${params.toString()}`, { signal: controller.signal })
      if (!res.ok) throw new Error('Disputes request failed')
      const json = await res.json()
      if (controller.signal.aborted) return
      if (!json.success) throw new Error('Disputes request failed')
      setItems(json.data?.items || [])
      setTotalPages(json.data?.pagination?.totalPages || 0)
      setStatusCounts(readFacetCounts(json.data?.statusCounts))
      setServiceCounts(readFacetCounts(json.data?.serviceCounts))
    } catch {
      if (!controller.signal.aborted) {
        setLoadFailed(true)
        toast.error(t("disputes.loadFailed"))
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [t, page, statusFilter, serviceFilter, debouncedSearch])

  useEffect(() => {
    if (user) void fetchDisputes()
    return () => requestRef.current?.abort()
  }, [user, fetchDisputes])

  if (loading || !user) return null

  // Services come from the counts; a selected service stays listed even
  // when the other filter leaves it with no disputes.
  const serviceOptions = Array.from(new Set([
    ...Object.keys(serviceCounts ?? {}),
    ...(serviceFilter !== "all" ? [serviceFilter] : []),
  ])).sort((a, b) => a.localeCompare(b))
  const statusOptions: Array<{ value: DisputeStatusFilter; label: string }> = [
    { value: "all", label: t("disputes.allStatuses") },
    { value: "open", label: t("disputes.statusOpen") },
    { value: "resolved", label: t("disputes.statusResolved") },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-4xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Scale className="h-6 w-6" />
              {t("disputes.title")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t("disputes.subtitle")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDisputes}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label={t("disputes.search")}
            placeholder={t("disputes.search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full sm:w-64 bg-white"
          />
          <Select value={serviceFilter} onValueChange={(value) => { setPage(1); setServiceFilter(value) }}>
            <SelectTrigger className="w-full sm:w-[220px]" aria-label={t("disputes.filterService")}>
              <SelectValue placeholder={t("disputes.filterService")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("disputes.allServices")}</SelectItem>
              {serviceOptions.map((service) => (
                <SelectItem key={service} value={service}>
                  {serviceCounts ? `${service} (${facetCount(serviceCounts, service)})` : service}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => { setPage(1); setStatusFilter(value as DisputeStatusFilter) }}>
            <SelectTrigger className="w-full sm:w-[220px]" aria-label={t("common.filterStatus")}>
              <SelectValue placeholder={t("common.filterStatus")} />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  {option.value !== "all" && statusCounts ? ` (${facetCount(statusCounts, option.value)})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(() => {
          const filteredItems = items.filter(i => i.dispute)
          if (isLoading) {
            return (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
              </div>
            )
          }
          if (loadFailed) return <p role="alert" className="text-sm text-red-700">{t("disputes.loadFailed")}</p>
          if (filteredItems.length === 0) {
            return (
              <Card>
                <CardContent className="py-12 text-center">
                  <ShieldCheck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">{t("disputes.empty")}</p>
                </CardContent>
              </Card>
            )
          }
          return (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const dispute = item.dispute!
              const isResolved = !!dispute.resolvedAt
              const slaBreached =
                !isResolved && !!dispute.slaDeadline && new Date(dispute.slaDeadline) < new Date()
              return (
                <Card key={item._id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{item.bookingNumber || item._id}</span>
                          <Badge variant={isResolved ? 'default' : 'destructive'} className="text-xs">
                            {isResolved ? t("disputes.statusResolved") : t("disputes.statusOpen")}
                          </Badge>
                          {slaBreached && (
                            <Badge variant="destructive" className="text-xs bg-red-700">
                              {t("disputes.slaBreached")}
                            </Badge>
                          )}
                        </div>
                        {item.project?.title && (
                          <p className="text-xs text-gray-400">{item.project.title}</p>
                        )}
                        <p className="text-xs text-red-600 font-medium mt-1">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          {dispute.reason}
                        </p>
                        {dispute.description && (
                          <p className="text-xs text-gray-600">{dispute.description}</p>
                        )}
                        {isResolved && dispute.resolution && (
                          <p className="text-xs text-green-700 font-medium">
                            {t("disputes.resolution", { value: dispute.resolution })}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          {t("disputes.raised", { date: formatDate(dispute.raisedAt, intl) })}
                          {dispute.resolvedAt ? ` · ${t("disputes.resolvedOn", { date: formatDate(dispute.resolvedAt, intl) })}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 items-end shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => router.push(`/bookings/${item._id}`)}
                        >
                          {t("disputes.viewBooking")}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          )
        })()}
        <div className="flex items-center justify-between gap-3" aria-live="polite">
          <span className="text-sm text-gray-500">{t("common.pageOf", { page, total: Math.max(1, totalPages) })}</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={isLoading || page <= 1} onClick={() => setPage(p => p - 1)}>{t("common.previous")}</Button>
            <Button variant="outline" disabled={isLoading || page >= totalPages} onClick={() => setPage(p => p + 1)}>{t("common.next")}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
