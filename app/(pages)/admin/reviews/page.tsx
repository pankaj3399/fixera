'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, EyeOff, Eye, Loader2, MessageSquareWarning, RefreshCw, Search, Shield, Star } from "lucide-react"
import { toast } from "sonner"

type ReviewFilterStatus = "all" | "visible" | "hidden"

interface PopulatedUser {
  _id: string
  name?: string
  profileImage?: string
  businessInfo?: {
    companyName?: string
  }
}

interface PopulatedProject {
  _id: string
  title?: string
}

interface CustomerReview {
  communicationLevel?: number
  valueOfDelivery?: number
  qualityOfService?: number
  comment?: string
  reviewedAt?: string
  isHidden?: boolean
  hiddenAt?: string
  reply?: {
    comment?: string
    repliedAt?: string
  }
}

interface ReviewRecord {
  _id: string
  bookingNumber?: string
  customerReview?: CustomerReview
  customer?: PopulatedUser | null
  professional?: PopulatedUser | null
  project?: PopulatedProject | null
  createdAt?: string
}

interface ReviewStats {
  total: number
  hidden: number
  visible: number
}

interface ReviewsPayload {
  reviews: ReviewRecord[]
  stats: ReviewStats
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const formatDate = (value?: string) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString()
}

const getAverageRating = (review?: CustomerReview) => {
  if (
    review?.communicationLevel == null ||
    review?.valueOfDelivery == null ||
    review?.qualityOfService == null
  ) return null
  return ((review.communicationLevel + review.valueOfDelivery + review.qualityOfService) / 3).toFixed(1)
}

export default function AdminReviewsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [reviews, setReviews] = useState<ReviewRecord[]>([])
  const [stats, setStats] = useState<ReviewStats>({ total: 0, hidden: 0, visible: 0 })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalReviews, setTotalReviews] = useState(0)
  const [statusFilter, setStatusFilter] = useState<ReviewFilterStatus>("visible")
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actioningReviewId, setActioningReviewId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) {
      router.push("/login?redirect=/admin/reviews")
    } else if (user?.role !== "admin") {
      router.push("/dashboard")
    }
  }, [isAuthenticated, loading, router, user?.role])

  useEffect(() => {
    const timeout = setTimeout(() => {
      const nextQuery = searchInput.trim()
      setSearchQuery(nextQuery)
      setPage((currentPage) => (currentPage === 1 ? currentPage : 1))
    }, 350)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const fetchReviews = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthenticated || user?.role !== "admin") return
    if (signal?.aborted || !isMountedRef.current) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("limit", "20")
      params.set("status", statusFilter)
      if (searchQuery) params.set("search", searchQuery)

      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/reviews?${params.toString()}`,
        { signal }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || "Failed to load reviews")
      }
      if (signal?.aborted || !isMountedRef.current) return

      const data: ReviewsPayload = payload.data
      setReviews(Array.isArray(data.reviews) ? data.reviews : [])
      setStats(data.stats || { total: 0, hidden: 0, visible: 0 })
      setTotalPages(data.pagination?.totalPages || 1)
      setTotalReviews(data.pagination?.total || 0)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      if (signal?.aborted || !isMountedRef.current) return
      console.error("[ADMIN][REVIEWS] fetch failed", err)
      setReviews([])
      setStats({ total: 0, hidden: 0, visible: 0 })
      setTotalPages(1)
      setTotalReviews(0)
      setError(err instanceof Error ? err.message : "Failed to load reviews")
    } finally {
      if (!isMountedRef.current || signal?.aborted) return
      setIsLoading(false)
    }
  }, [isAuthenticated, page, searchQuery, statusFilter, user?.role])

  useEffect(() => {
    const controller = new AbortController()
    fetchReviews(controller.signal)
    return () => controller.abort()
  }, [fetchReviews, refreshKey])

  const mutateVisibility = async (review: ReviewRecord, nextAction: "hide" | "unhide") => {
    setActioningReviewId(review._id)
    try {
      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/reviews/${review._id}/${nextAction}`,
        { method: "PUT" }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || `Failed to ${nextAction} review`)
      }

      toast.success(nextAction === "hide" ? "Review hidden" : "Review restored")
      await fetchReviews()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${nextAction} review`)
    } finally {
      if (isMountedRef.current) {
        setActioningReviewId(null)
      }
    }
  }

  const statusLabel = useMemo(() => {
    if (statusFilter === "hidden") return "hidden"
    if (statusFilter === "all") return "moderated"
    return "visible"
  }, [statusFilter])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-rose-50 p-4">
        <div className="max-w-7xl mx-auto pt-20 space-y-6">
          <Skeleton className="h-8 w-72" />
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== "admin") return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-rose-50 p-4">
      <div className="max-w-7xl mx-auto pt-20 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <MessageSquareWarning className="h-8 w-8 text-amber-600" />
              Review Moderation
            </h1>
            <p className="text-slate-600 mt-2 max-w-2xl">
              Hide reviews that are inappropriate, incorrect, or misleading, and restore them when they were hidden by mistake.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Back to Dashboard
            </Button>
            <Button
              onClick={() => {
                setPage(1)
                setRefreshKey((prev) => prev + 1)
              }}
              disabled={isLoading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh Queue
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="h-4 w-4 text-slate-500" />
                Total Reviews
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-600" />
                Public Reviews
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-700">{stats.visible}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-amber-700" />
                Hidden Reviews
              </CardTitle>
              <CardDescription>Use this queue to audit moderation decisions.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <p className="text-2xl font-bold text-amber-800">{stats.hidden}</p>
              <Button
                variant="outline"
                className="border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => {
                  setStatusFilter("hidden")
                  setPage(1)
                }}
              >
                Review Hidden
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Moderation Queue</CardTitle>
                <CardDescription>
                  {totalReviews} {statusLabel} review(s) match the current filters.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-[260px]">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search comment or booking number"
                    className="pl-9"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setPage(1)
                    setStatusFilter(value as ReviewFilterStatus)
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visible">Visible</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                    <SelectItem value="all">All Reviews</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-rose-50 px-4 py-3 text-sm text-slate-700">
              Use <span className="font-medium">Hide Review</span> when a review is misleading, abusive, or factually wrong. Hidden reviews are removed from public rating calculations and public review feeds.
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-44 rounded-lg" />
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">
                No reviews match the current filters.
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => {
                  const averageRating = getAverageRating(review.customerReview)
                  const professionalName =
                    review.professional?.businessInfo?.companyName ||
                    review.professional?.name ||
                    "Unknown professional"

                  return (
                    <div key={review._id} className="rounded-xl border bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={review.customerReview?.isHidden ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-700"}>
                              {review.customerReview?.isHidden ? "Hidden" : "Visible"}
                            </Badge>
                            {averageRating ? (
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                {averageRating}
                              </span>
                            ) : null}
                            <span className="text-xs text-slate-500">
                              Reviewed {formatDate(review.customerReview?.reviewedAt || review.createdAt)}
                            </span>
                            {review.customerReview?.hiddenAt && (
                              <span className="text-xs text-amber-700">
                                Hidden {formatDate(review.customerReview.hiddenAt)}
                              </span>
                            )}
                          </div>

                          <div className="grid gap-3 md:grid-cols-3 text-sm">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Customer</p>
                              <p className="font-medium text-slate-900">{review.customer?.name || "Unknown customer"}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Professional</p>
                              <p className="font-medium text-slate-900">{professionalName}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Project</p>
                              <p className="font-medium text-slate-900">{review.project?.title || "Unknown project"}</p>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-4 text-sm">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Booking</p>
                              <p className="font-medium text-slate-900">{review.bookingNumber || review._id}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Communication</p>
                              <p className="font-medium text-slate-900">{review.customerReview?.communicationLevel ?? "-"}/5</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Value</p>
                              <p className="font-medium text-slate-900">{review.customerReview?.valueOfDelivery ?? "-"}/5</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Quality</p>
                              <p className="font-medium text-slate-900">{review.customerReview?.qualityOfService ?? "-"}/5</p>
                            </div>
                          </div>

                          <div className="rounded-lg bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Review Comment</p>
                            <p className="text-sm text-slate-700 whitespace-pre-line">
                              {review.customerReview?.comment?.trim() || "No written comment provided."}
                            </p>
                          </div>

                          {review.customerReview?.reply?.comment && (
                            <div className="rounded-lg border border-slate-200 px-4 py-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Professional Reply</p>
                              <p className="text-sm text-slate-700 whitespace-pre-line">{review.customerReview.reply.comment}</p>
                            </div>
                          )}
                        </div>

                        <div className="w-full lg:w-[220px] space-y-2">
                          <Button
                            className={review.customerReview?.isHidden ? "w-full bg-emerald-600 hover:bg-emerald-700" : "w-full bg-rose-600 hover:bg-rose-700"}
                            onClick={() => mutateVisibility(review, review.customerReview?.isHidden ? "unhide" : "hide")}
                            disabled={actioningReviewId === review._id}
                          >
                            {actioningReviewId === review._id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : review.customerReview?.isHidden ? (
                              <Eye className="h-4 w-4 mr-2" />
                            ) : (
                              <EyeOff className="h-4 w-4 mr-2" />
                            )}
                            {review.customerReview?.isHidden ? "Restore Review" : "Hide Review"}
                          </Button>

                          {review.professional?._id && (
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => window.open(`/professional/${review.professional?._id}`, "_blank")}
                            >
                              Open Professional Page
                            </Button>
                          )}

                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
                            This action changes public review visibility immediately.
                          </div>
                        </div>
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
      </div>
    </div>
  )
}
