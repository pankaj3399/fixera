'use client'

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { getAuthToken } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, ArrowLeft, CalendarClock, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import { type WarrantyClaimStatus, STATUS_OPTIONS, STATUS_STYLES, REASON_LABELS } from "@/lib/warrantyClaim"

interface ClaimRecord {
  _id: string
  claimNumber: string
  status: WarrantyClaimStatus
  reason: string
  description: string
  createdAt?: string
  booking?: {
    _id: string
    bookingNumber?: string
    status?: string
  } | null
  customer?: {
    _id: string
    name?: string
    email?: string
  } | null
  proposal?: {
    message?: string
    proposedScheduleAt?: string
    customerDecision?: "accepted" | "declined"
  }
  escalation?: {
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
  sla?: {
    professionalResponseDueAt?: string
    customerConfirmationDueAt?: string
  }
}


const formatDate = (value?: string) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString()
}

export default function ProfessionalWarrantyClaimsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [claims, setClaims] = useState<ClaimRecord[]>([])
  const [statusFilter, setStatusFilter] = useState<"all" | WarrantyClaimStatus>("all")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalClaims, setTotalClaims] = useState(0)
  const [isLoadingClaims, setIsLoadingClaims] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login?redirect=/dashboard/warranty-claims")
    }
  }, [isAuthenticated, loading, router])

  useEffect(() => {
    if (!loading && isAuthenticated && user?.role !== "professional") {
      router.push("/dashboard")
    }
  }, [isAuthenticated, loading, router, user?.role])

  const fetchClaims = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthenticated || user?.role !== "professional") return
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

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/my?${params.toString()}`,
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
      setClaims([])
      setTotalPages(1)
      setTotalClaims(0)
      setError(err instanceof Error ? err.message : "Failed to load warranty claims")
    } finally {
      setIsLoadingClaims(false)
    }
  }, [isAuthenticated, page, statusFilter, user?.role])

  useEffect(() => {
    const controller = new AbortController()
    fetchClaims(controller.signal)
    return () => controller.abort()
  }, [fetchClaims])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-cyan-50 p-4">
        <div className="max-w-6xl mx-auto pt-20 space-y-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== "professional") return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-cyan-50 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-8 w-8 text-sky-600" />
              Warranty Claims
            </h1>
            <p className="text-slate-600">
              Manage post-completion warranty issues raised by customers.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button onClick={() => fetchClaims()} disabled={isLoadingClaims}>
              {isLoadingClaims ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <CardTitle>Claims Queue</CardTitle>
                <CardDescription>{totalClaims} claim(s) total</CardDescription>
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setPage(1)
                  setStatusFilter(value as "all" | WarrantyClaimStatus)
                }}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Filter status" />
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
            {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingClaims ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-lg" />
                ))}
              </div>
            ) : claims.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                No warranty claims found for this filter.
              </div>
            ) : (
              <div className="space-y-3">
                {claims.map((claim) => (
                  <div key={claim._id} className="rounded-lg border bg-white p-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{claim.claimNumber}</p>
                        <p className="text-xs text-slate-600">
                          {REASON_LABELS[claim.reason] || claim.reason} · Opened {formatDate(claim.createdAt)}
                        </p>
                      </div>
                      <Badge variant="outline" className={STATUS_STYLES[claim.status]}>
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
                        <p className="font-medium text-slate-800">Response SLA</p>
                        <p>{formatDate(claim.sla?.professionalResponseDueAt)}</p>
                      </div>
                    </div>

                    {claim.proposal?.message && (
                      <div className="rounded-md border bg-sky-50 px-3 py-2 text-xs text-sky-800">
                        Proposal: {claim.proposal.message}
                      </div>
                    )}
                    {claim.resolution?.summary && (
                      <div className="rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        Resolution: {claim.resolution.summary}
                      </div>
                    )}
                    {claim.escalation?.reason && (
                      <div className="rounded-md border bg-rose-50 px-3 py-2 text-xs text-rose-800">
                        Escalated: {claim.escalation.reason}
                        {claim.escalation.note ? ` (${claim.escalation.note})` : ""}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {claim.booking?._id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/bookings/${claim.booking?._id}`)}
                        >
                          <CalendarClock className="h-3.5 w-3.5 mr-1" />
                          Open Booking
                        </Button>
                      )}
                      {claim.status === "open" && (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                          Action needed: send a proposal
                        </span>
                      )}
                      {claim.status === "proposal_accepted" && (
                        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] text-violet-700">
                          Action needed: complete repair and mark resolved
                        </span>
                      )}
                      {claim.status === "resolved" && (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                          Waiting for customer confirmation
                        </span>
                      )}
                      {claim.status === "escalated" && (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                          Escalated to admin
                        </span>
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
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <p className="text-sm text-slate-600">
                  Page {page} of {totalPages}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-sky-100 bg-sky-50/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-sky-600" />
              Handling guidance
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700 space-y-1">
            <p>Respond to new claims within 5 business days to avoid automatic escalation.</p>
            <p>Use the booking detail page to send proposals, mark repairs resolved, and track confirmations.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
