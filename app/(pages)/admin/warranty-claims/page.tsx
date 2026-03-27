'use client'

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { getAuthToken } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Clock, Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { type WarrantyClaimStatus, STATUS_OPTIONS, STATUS_STYLES as STATUS_BADGE_STYLES, REASON_LABELS } from "@/lib/warrantyClaim"

interface PopulatedBooking {
  _id: string
  bookingNumber?: string
  status?: string
}

interface PopulatedUser {
  _id: string
  name?: string
  email?: string
  businessInfo?: {
    companyName?: string
  }
}

interface WarrantyClaimRecord {
  _id: string
  claimNumber: string
  status: WarrantyClaimStatus
  reason: string
  description: string
  createdAt?: string
  updatedAt?: string
  booking?: PopulatedBooking | null
  customer?: PopulatedUser | null
  professional?: PopulatedUser | null
  escalation?: {
    escalatedAt?: string
    reason?: string
    note?: string
    autoEscalated?: boolean
  }
  resolution?: {
    summary?: string
    resolvedAt?: string
    customerConfirmedAt?: string
    autoClosedAt?: string
  }
}

interface WarrantyAnalytics {
  window?: {
    lastDays?: number
    since?: string
  }
  summary?: {
    totalClaims?: number
    totalEscalated?: number
    totalClosed?: number
    avgResolutionHours?: number
  }
  flaggedProfessionals?: Array<{
    professionalId: string
    professional?: PopulatedUser | null
    claimsCount: number
    escalatedCount: number
    completedBookings: number
    claimRate: number
  }>
}


const formatDate = (value?: string) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString()
}

export default function AdminWarrantyClaimsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [claims, setClaims] = useState<WarrantyClaimRecord[]>([])
  const [analytics, setAnalytics] = useState<WarrantyAnalytics | null>(null)
  const [isLoadingClaims, setIsLoadingClaims] = useState(true)
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | WarrantyClaimStatus>("all")
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalClaims, setTotalClaims] = useState(0)
  const [closingClaimId, setClosingClaimId] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) {
      router.push("/login?redirect=/admin/warranty-claims")
    } else if (user?.role !== "admin") {
      router.push("/dashboard")
    }
  }, [isAuthenticated, loading, router, user?.role])

  useEffect(() => {
    const timeout = setTimeout(() => setSearchQuery(searchInput.trim()), 350)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const fetchAnalytics = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthenticated || user?.role !== "admin") return
    setIsLoadingAnalytics(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/admin/analytics`,
        { credentials: "include", headers, signal }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || "Failed to load warranty analytics")
      }
      setAnalytics(payload.data || null)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      console.error("[ADMIN][WARRANTY] analytics fetch failed", err)
      setError(err instanceof Error ? err.message : "Failed to load warranty analytics")
    } finally {
      setIsLoadingAnalytics(false)
    }
  }, [isAuthenticated, user?.role])

  const fetchClaims = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthenticated || user?.role !== "admin") return
    setIsLoadingClaims(true)
    setError(null)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("limit", "20")
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (searchQuery) params.set("search", searchQuery)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/admin/list?${params.toString()}`,
        { credentials: "include", headers, signal }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || "Failed to load warranty claims")
      }

      const data = payload.data || {}
      setClaims(Array.isArray(data.claims) ? data.claims : [])
      setTotalPages(data.pagination?.totalPages || 1)
      setTotalClaims(data.pagination?.total || 0)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      console.error("[ADMIN][WARRANTY] claims fetch failed", err)
      setError(err instanceof Error ? err.message : "Failed to load warranty claims")
    } finally {
      setIsLoadingClaims(false)
    }
  }, [isAuthenticated, page, searchQuery, statusFilter, user?.role])

  useEffect(() => {
    const controller = new AbortController()
    fetchAnalytics(controller.signal)
    return () => controller.abort()
  }, [fetchAnalytics])

  useEffect(() => {
    const controller = new AbortController()
    fetchClaims(controller.signal)
    return () => controller.abort()
  }, [fetchClaims])

  const closeClaim = async (claim: WarrantyClaimRecord) => {
    const note = window.prompt("Add a closing note for audit history:", "Closed by admin")
    if (note === null) return

    setClosingClaimId(claim._id)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/admin/${claim._id}/close`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ note: note.trim() || "Closed by admin" }),
        }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || "Failed to close claim")
      }
      toast.success(`Claim ${claim.claimNumber} closed`)
      await Promise.all([fetchClaims(), fetchAnalytics()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to close claim")
    } finally {
      setClosingClaimId(null)
    }
  }

  const summary = analytics?.summary
  const flaggedPros = analytics?.flaggedProfessionals || []
  const analyticsWindowDays = analytics?.window?.lastDays || 30

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 p-4">
        <div className="max-w-7xl mx-auto pt-20 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== "admin") return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 p-4">
      <div className="max-w-7xl mx-auto pt-20 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-8 w-8 text-rose-600" />
              Warranty Claims
            </h1>
            <p className="text-slate-600">
              Monitor claims, escalations, and resolution quality in one place.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Back to Dashboard
            </Button>
            <Button onClick={() => { fetchClaims(); fetchAnalytics() }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                Claims ({analyticsWindowDays}d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{isLoadingAnalytics ? "..." : summary?.totalClaims || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-orange-500" />
                Escalated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{isLoadingAnalytics ? "..." : summary?.totalEscalated || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Closed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{isLoadingAnalytics ? "..." : summary?.totalClosed || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-500" />
                Avg Resolution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {isLoadingAnalytics ? "..." : `${Number(summary?.avgResolutionHours || 0).toFixed(1)}h`}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Claims Queue</CardTitle>
            <CardDescription>
              {totalClaims} claim(s) found
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => {
                    setPage(1)
                    setSearchInput(e.target.value)
                  }}
                  placeholder="Search by claim number..."
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setPage(1)
                  setStatusFilter(value as "all" | WarrantyClaimStatus)
                }}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            {isLoadingClaims ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-28 rounded-lg" />
                ))}
              </div>
            ) : claims.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                No claims match the current filters.
              </div>
            ) : (
              <div className="space-y-3">
                {claims.map((claim) => (
                  <div key={claim._id} className="rounded-lg border bg-white p-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {claim.claimNumber}
                        </p>
                        <p className="text-xs text-slate-600">
                          {REASON_LABELS[claim.reason] || claim.reason} · Opened {formatDate(claim.createdAt)}
                        </p>
                      </div>
                      <Badge variant="outline" className={STATUS_BADGE_STYLES[claim.status]}>
                        {claim.status.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    <p className="text-sm text-slate-700 whitespace-pre-line">{claim.description}</p>

                    <div className="grid md:grid-cols-3 gap-3 text-xs text-slate-600">
                      <div>
                        <p className="font-medium text-slate-800">Booking</p>
                        <p>{claim.booking?.bookingNumber || claim.booking?._id || "-"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">Customer</p>
                        <p>{claim.customer?.name || claim.customer?.email || "-"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">Professional</p>
                        <p>{claim.professional?.name || claim.professional?.businessInfo?.companyName || claim.professional?.email || "-"}</p>
                      </div>
                    </div>

                    {claim.escalation?.reason && (
                      <div className="rounded-md bg-rose-50 border border-rose-100 px-3 py-2 text-xs text-rose-700">
                        Escalation: {claim.escalation.reason}
                        {claim.escalation.note ? ` (${claim.escalation.note})` : ""}
                      </div>
                    )}

                    {claim.resolution?.summary && (
                      <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
                        Resolution: {claim.resolution.summary}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {claim.booking?._id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/bookings/${claim.booking?._id}`, "_blank")}
                        >
                          View Booking
                        </Button>
                      )}
                      {claim.status !== "closed" && (
                        <Button
                          size="sm"
                          onClick={() => closeClaim(claim)}
                          disabled={closingClaimId === claim._id}
                        >
                          {closingClaimId === claim._id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                          Close Claim
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <p className="text-sm text-slate-600">
                  Page {page} of {totalPages}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flagged Professionals</CardTitle>
            <CardDescription>
              Professionals over configured warranty-claim threshold.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAnalytics ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : flaggedPros.length === 0 ? (
              <div className="text-sm text-slate-500">No professionals currently exceed the configured threshold.</div>
            ) : (
              <div className="space-y-3">
                {flaggedPros.map((item) => (
                  <div key={item.professionalId} className="rounded-lg border bg-white px-3 py-2">
                    <p className="text-sm font-medium text-slate-900">
                      {item.professional?.name || item.professional?.businessInfo?.companyName || item.professional?.email || item.professionalId}
                    </p>
                    <p className="text-xs text-slate-600">
                      Claim rate: {(item.claimRate * 100).toFixed(1)}% · Claims: {item.claimsCount} · Escalated: {item.escalatedCount} · Completed bookings: {item.completedBookings}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
