'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
  professional?: {
    _id: string
    name?: string
    email?: string
    businessInfo?: {
      companyName?: string
    }
  } | null
  proposal?: {
    message?: string
    resolveByDate?: string
    proposedScheduleAt?: string
    customerDecision?: "accepted" | "declined"
  }
  evidence?: string[]
  escalation?: {
    reason?: string
    note?: string
    autoEscalated?: boolean
  }
  resolution?: {
    summary?: string
    attachments?: string[]
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

const getClaimAttachments = (claim: ClaimRecord) => [
  ...(Array.isArray(claim.evidence) ? claim.evidence : []),
  ...(Array.isArray(claim.resolution?.attachments) ? claim.resolution.attachments : []),
]

export default function WarrantyClaimsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchSuffix = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const claimIdFromQuery = searchParams.get("claimId") || null
  const statusFromQuery = searchParams.get("status")

  const [claims, setClaims] = useState<ClaimRecord[]>([])
  const [statusFilter, setStatusFilter] = useState<"all" | WarrantyClaimStatus>("all")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalClaims, setTotalClaims] = useState(0)
  const [isLoadingClaims, setIsLoadingClaims] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [highlightedClaim, setHighlightedClaim] = useState<ClaimRecord | null>(null)

  const normalizedStatusFromQuery = useMemo(() => {
    if (!statusFromQuery) return null
    if (statusFromQuery === "all") return "all"
    return STATUS_OPTIONS.some((option) => option.value === statusFromQuery)
      ? (statusFromQuery as WarrantyClaimStatus)
      : null
  }, [statusFromQuery])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push(`/login?redirect=/dashboard/warranty-claims${searchSuffix}`)
    }
  }, [isAuthenticated, loading, router, searchSuffix])

  useEffect(() => {
    if (!loading && isAuthenticated && user?.role !== "professional" && user?.role !== "customer") {
      router.push("/dashboard")
    }
  }, [isAuthenticated, loading, router, user?.role])

  useEffect(() => {
    if (claimIdFromQuery) return
    setStatusFilter(normalizedStatusFromQuery ?? "all")
    setPage((currentPage) => (currentPage === 1 ? currentPage : 1))
  }, [claimIdFromQuery, normalizedStatusFromQuery])

  const fetchClaimById = useCallback(async (claimId: string, signal?: AbortSignal) => {
    if (!isAuthenticated || (user?.role !== "professional" && user?.role !== "customer")) return null

    const token = getAuthToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/${claimId}`,
      { credentials: "include", headers, signal }
    )
    const payload = await response.json()
    const claim = payload.claim || payload.data?.claim
    if (!response.ok || !payload.success || !claim) {
      throw new Error(payload.msg || "Failed to load warranty claim")
    }

    return claim as ClaimRecord
  }, [isAuthenticated, user?.role])

  useEffect(() => {
    if (!claimIdFromQuery) {
      setHighlightedClaim(null)
      setStatusFilter(normalizedStatusFromQuery ?? "all")
      setPage((currentPage) => (currentPage === 1 ? currentPage : 1))
      return
    }

    const controller = new AbortController()

    ;(async () => {
      try {
        const claim = await fetchClaimById(claimIdFromQuery, controller.signal)
        if (!claim) return

        setHighlightedClaim(claim)
        setPage(1)
        setStatusFilter(claim.status)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setHighlightedClaim(null)
        setError(err instanceof Error ? err.message : "Failed to load warranty claim")
      }
    })()

    return () => controller.abort()
  }, [claimIdFromQuery, fetchClaimById, normalizedStatusFromQuery])

  const fetchClaims = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthenticated || (user?.role !== "professional" && user?.role !== "customer")) return
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
      const nextClaims = Array.isArray(data.claims) ? data.claims : []
      if (highlightedClaim) {
        const matchesFilter = statusFilter === "all" || highlightedClaim.status === statusFilter
        if (matchesFilter && !nextClaims.some((claim: ClaimRecord) => claim._id === highlightedClaim._id)) {
          setClaims([highlightedClaim, ...nextClaims])
          setTotalClaims(Math.max(data.pagination?.total || 0, nextClaims.length + 1))
          setTotalPages(Math.max(data.pagination?.totalPages || 1, 1))
          return
        }
      }

      setClaims(nextClaims)
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
  }, [highlightedClaim, isAuthenticated, page, statusFilter, user?.role])

  useEffect(() => {
    const controller = new AbortController()
    fetchClaims(controller.signal)
    return () => controller.abort()
  }, [fetchClaims])

  useEffect(() => {
    if (!claimIdFromQuery || claims.length === 0) return

    const frame = window.requestAnimationFrame(() => {
      const el = document.getElementById(`claim-${claimIdFromQuery}`)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.classList.add("ring-2", "ring-sky-400", "ring-offset-2")
      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-sky-400", "ring-offset-2")
      }, 2200)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [claimIdFromQuery, claims])

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

  if (!isAuthenticated || (user?.role !== "professional" && user?.role !== "customer")) return null

  const isProfessional = user?.role === "professional"

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
              {isProfessional
                ? "Manage post-completion warranty issues raised by customers."
                : "Track your warranty claims, proposals, escalations, and resolution updates."}
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
                {claims.map((claim) => {
                  const attachments = getClaimAttachments(claim)

                  return (
                  <div id={`claim-${claim._id}`} key={claim._id} className="rounded-lg border bg-white p-4 space-y-3 transition-shadow">
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
                        <p className="font-medium text-slate-800">{isProfessional ? "Customer" : "Professional"}</p>
                        <p>
                          {isProfessional
                            ? (claim.customer?.name || claim.customer?.email || "-")
                            : (claim.professional?.businessInfo?.companyName ||
                              claim.professional?.name ||
                              claim.professional?.email ||
                              "-")}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{isProfessional ? "Response SLA" : "Confirmation SLA"}</p>
                        <p>{formatDate(isProfessional ? claim.sla?.professionalResponseDueAt : claim.sla?.customerConfirmationDueAt)}</p>
                      </div>
                    </div>

                    {claim.proposal?.message && (
                      <div className="rounded-md border bg-sky-50 px-3 py-2 text-xs text-sky-800">
                        Resolve proposal: {claim.proposal.message}
                        {(claim.proposal.resolveByDate || claim.proposal.proposedScheduleAt) && (
                          <div className="mt-1 text-sky-700">
                            Resolve date: {formatDate(claim.proposal.resolveByDate || claim.proposal.proposedScheduleAt)}
                          </div>
                        )}
                      </div>
                    )}
                    {attachments.length > 0 && (
                      <div className="rounded-md border bg-white px-3 py-2 text-xs text-slate-700">
                        <p className="mb-2 font-medium text-slate-800">Attachments</p>
                        <div className="space-y-1">
                          {attachments.map((attachment, index) => (
                            <a
                              key={`${attachment}-${index}`}
                              href={attachment}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="block text-indigo-700 hover:underline"
                            >
                              Open attachment {index + 1}
                            </a>
                          ))}
                        </div>
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
                          {isProfessional ? "Action needed: send a proposal" : "Claim opened and awaiting professional response"}
                        </span>
                      )}
                      {claim.status === "proposal_accepted" && (
                        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] text-violet-700">
                          {isProfessional ? "Action needed: complete repair and mark resolved" : "Proposal accepted. Waiting for repair completion"}
                        </span>
                      )}
                      {claim.status === "resolved" && (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                          {isProfessional ? "Waiting for customer confirmation" : "Action needed: review the resolution and confirm"}
                        </span>
                      )}
                      {claim.status === "escalated" && (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                          Escalated to admin
                        </span>
                      )}
                    </div>
                  </div>
                  )
                })}
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
            {isProfessional ? (
              <>
                <p>Respond to new claims within 5 business days to avoid automatic escalation.</p>
                <p>Use the booking detail page to send proposals, mark repairs resolved, and track confirmations.</p>
              </>
            ) : (
              <>
                <p>Open the related booking to review claim details, proposal updates, and repair progress.</p>
                <p>Use the booking page to accept or decline proposals, confirm resolutions, or escalate if the issue remains unresolved.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
