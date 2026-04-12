'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { getAuthToken } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Briefcase, Calendar, Clock, FileText, GitCompareArrows, Loader2, Package, Plus, RefreshCw, Search } from "lucide-react"
import QuoteComparisonModal from "@/components/dashboard/QuoteComparisonModal"
import BookingTimelineBoard from "@/components/dashboard/BookingTimelineBoard"
import {
  type BookingStatus,
  QUOTE_STATUSES,
  QUOTE_FINISHED_STATUSES,
  BOOKING_FINISHED_STATUSES,
  PROFESSIONAL_BOOKING_MODE_STATUSES,
  getBookingStatusMeta,
  getBookingTitle,
  isProjectBooking,
} from "@/lib/dashboardBookingHelpers"

type ManagerMode = "bookings" | "quotes"

interface Booking {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  customer?: {
    _id: string
    name?: string
  }
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
  }
  createdAt?: string
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  scheduledBufferStartDate?: string
  scheduledBufferEndDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  payment?: {
    status?: string
    currency?: string
  }
  rescheduleRequest?: {
    status?: "pending" | "accepted" | "declined"
    reason?: string
    note?: string
    proposedSchedule?: {
      scheduledStartDate?: string
      scheduledExecutionEndDate?: string
      scheduledBufferStartDate?: string
      scheduledBufferEndDate?: string
      scheduledStartTime?: string
      scheduledEndTime?: string
    }
  }
  project?: {
    _id: string
    title?: string
  }
  professional?: {
    _id: string
    username?: string
    businessInfo?: {
      companyName?: string
    }
  }
}

interface ProfessionalBookingsQuotesManagerProps {
  mode: ManagerMode
}

export default function ProfessionalBookingsQuotesManager({ mode }: ProfessionalBookingsQuotesManagerProps) {
  const PAGE_SIZE = 20
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [timelineBookings, setTimelineBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalBookings, setTotalBookings] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [serviceFilter, setServiceFilter] = useState("all")
  const [allServices, setAllServices] = useState<string[]>([])
  const [showCreateQuoteModal, setShowCreateQuoteModal] = useState(false)
  const [activeCustomers, setActiveCustomers] = useState<Array<{ _id: string; name?: string; email?: string }>>([])
  const [activeProjects, setActiveProjects] = useState<Array<{ _id: string; title?: string }>>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingCustomersError, setLoadingCustomersError] = useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingProjectsError, setLoadingProjectsError] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none")
  const [creatingQuote, setCreatingQuote] = useState(false)
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<Set<string>>(new Set())
  const [showComparison, setShowComparison] = useState(false)

  const toggleQuoteSelection = useCallback((bookingId: string) => {
    setSelectedQuoteIds(prev => {
      const next = new Set(prev)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
  }, [])

  const fetchActiveCustomersControllerRef = useRef<AbortController | null>(null)

  const fetchActiveCustomers = async () => {
    fetchActiveCustomersControllerRef.current?.abort()
    const controller = new AbortController()
    fetchActiveCustomersControllerRef.current = controller

    setLoadingCustomers(true)
    setLoadingCustomersError(null)
    setActiveCustomers([])
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/active-customers`,
        { credentials: "include", headers, signal: controller.signal }
      )
      if (controller.signal.aborted) return
      const data = await response.json()
      if (controller.signal.aborted) return
      if (response.ok && data?.success) {
        setActiveCustomers(data.data?.customers || [])
      } else {
        setLoadingCustomersError("Failed to load customers")
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error("Error fetching active customers:", err)
      setLoadingCustomersError("Failed to load customers")
    } finally {
      if (!controller.signal.aborted) {
        setLoadingCustomers(false)
      }
    }
  }

  const fetchActiveProjectsControllerRef = useRef<AbortController | null>(null)

  const fetchActiveProjects = async () => {
    fetchActiveProjectsControllerRef.current?.abort()
    const controller = new AbortController()
    fetchActiveProjectsControllerRef.current = controller

    setLoadingProjects(true)
    setLoadingProjectsError(null)
    setActiveProjects([])
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/active-projects`,
        { credentials: "include", headers, signal: controller.signal }
      )
      if (controller.signal.aborted) return
      const data = await response.json()
      if (controller.signal.aborted) return
      if (response.ok && data?.success) {
        const projects = Array.isArray(data.data?.projects) ? data.data.projects : []
        setActiveProjects(projects)
        if (projects.length === 1) {
          setSelectedProjectId(projects[0]._id)
        } else {
          setSelectedProjectId("none")
        }
      } else {
        setLoadingProjectsError("Failed to load active projects")
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error("Error fetching active projects:", err)
      setLoadingProjectsError("Failed to load active projects")
    } finally {
      if (!controller.signal.aborted) {
        setLoadingProjects(false)
      }
    }
  }

  const handleCreateDirectQuote = async (customerId: string) => {
    setCreatingQuote(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/direct`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            customerId,
            projectId: selectedProjectId !== "none" ? selectedProjectId : undefined,
          }),
        }
      )
      const data = await response.json()
      if (response.ok && data?.success) {
        setShowCreateQuoteModal(false)
        router.push(`/bookings/${data.data.bookingId}?action=quote`)
      } else {
        alert(data?.error?.message || "Failed to create quotation")
      }
    } catch (err) {
      console.error("Error creating direct quotation:", err)
      alert("Failed to create quotation")
    } finally {
      setCreatingQuote(false)
    }
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    if (!showCreateQuoteModal) {
      setSelectedProjectId("none")
      fetchActiveCustomersControllerRef.current?.abort()
      fetchActiveProjectsControllerRef.current?.abort()
      return
    }

    void fetchActiveCustomers()
    void fetchActiveProjects()

    return () => {
      fetchActiveCustomersControllerRef.current?.abort()
      fetchActiveProjectsControllerRef.current?.abort()
    }
  }, [showCreateQuoteModal])

  const statusOptions = mode === "quotes"
    ? [
        { id: "all", label: "All Statuses" },
        { id: "rfq", label: "RFQ" },
        { id: "rfq_accepted", label: "RFQ Accepted" },
        { id: "draft_quote", label: "Draft Quote" },
        { id: "quoted", label: "Quoted" },
        { id: "quote_accepted", label: "Accepted" },
        { id: "quote_rejected", label: "Rejected" },
      ]
    : [
        { id: "all", label: "All Statuses" },
        { id: "awaiting_payment", label: "Awaiting Payment" },
        { id: "booked", label: "Booked" },
        { id: "rescheduling_requested", label: "Rescheduling Request" },
        { id: "in_progress", label: "In Progress" },
        { id: "completed", label: "Completed" },
        { id: "cancelled", label: "Cancelled" },
        { id: "dispute", label: "Dispute" },
        { id: "refunded", label: "Refunded" },
      ]

  const pageCopy = mode === "bookings"
    ? {
      title: "Manage Bookings",
      description: "View all pending and finished bookings.",
      pendingTitle: "Pending Bookings",
      finishedTitle: "Finished Bookings",
      empty: "No bookings found.",
    }
    : {
      title: "Manage Quotes",
      description: "View all pending and finished quotes.",
      pendingTitle: "Pending Quotes",
      finishedTitle: "Finished Quotes",
      empty: "No quotes found.",
    }

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const redirect = mode === "bookings" ? "/dashboard/bookings" : "/dashboard/quotes"
      router.push(`/login?redirect=${encodeURIComponent(redirect)}`)
    }
  }, [authLoading, isAuthenticated, mode, router])

  useEffect(() => {
    if (!authLoading && isAuthenticated && user?.role && user.role !== "professional") {
      router.push("/dashboard")
    }
  }, [authLoading, isAuthenticated, router, user?.role])

  const fetchBookings = useCallback(async (pageToLoad = 1, append = false) => {
    if (!isAuthenticated || user?.role !== "professional") return

    if (append) {
      setIsLoadingMore(true)
      setLoadMoreError(null)
    } else {
      setIsLoading(true)
      setError(null)
    }

    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const params = new URLSearchParams({
        page: String(pageToLoad),
        limit: String(PAGE_SIZE),
      })
      if (statusFilter !== "all") {
        if (mode === "bookings" && statusFilter === "awaiting_payment") {
          params.append("status", "quote_accepted,payment_pending")
        } else {
        params.append("status", statusFilter)
        }
      } else {
        // Send mode-appropriate statuses so pagination counts match
        const modeStatuses = mode === "quotes"
          ? Array.from(QUOTE_STATUSES).join(",")
          : Array.from(PROFESSIONAL_BOOKING_MODE_STATUSES).join(",")
        params.append("status", modeStatuses)
      }
      if (serviceFilter !== "all") params.append("service", serviceFilter)
      if (debouncedSearch) params.append("search", debouncedSearch)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?${params}`,
        { credentials: "include", headers }
      )
      const data = await response.json()

      if (response.ok && data.success) {
        if (Array.isArray(data.distinctServices)) {
          setAllServices(data.distinctServices)
        }
        const incomingBookings = Array.isArray(data.bookings) ? data.bookings : []
        const pagination = data.pagination || {}
        const totalFromApi = typeof pagination.total === "number" ? pagination.total : null
        const totalPagesFromApi = typeof pagination.totalPages === "number" ? pagination.totalPages : null

        if (totalFromApi != null) {
          setTotalBookings(totalFromApi)
        } else {
          setTotalBookings((prevTotal) => append ? prevTotal + incomingBookings.length : incomingBookings.length)
        }

        setCurrentPage(pageToLoad)
        if (totalPagesFromApi != null) {
          setHasMore(pageToLoad < totalPagesFromApi)
        } else if (totalFromApi != null) {
          setHasMore(pageToLoad * PAGE_SIZE < totalFromApi)
        } else {
          setHasMore(incomingBookings.length === PAGE_SIZE)
        }

        setBookings((prevBookings) => {
          if (!append) return incomingBookings
          const merged = [...prevBookings]
          const seen = new Set(prevBookings.map((booking) => booking._id))

          for (const booking of incomingBookings) {
            if (!seen.has(booking._id)) {
              merged.push(booking)
              seen.add(booking._id)
            }
          }

          return merged
        })
      } else {
        const msg = data.msg || "Failed to load bookings."
        if (append) {
          setLoadMoreError(msg)
        } else {
          setError(msg)
        }
      }
    } catch (fetchError) {
      console.error("Failed to fetch bookings:", fetchError)
      if (append) {
        setLoadMoreError("Failed to load bookings.")
      } else {
        setError("Failed to load bookings.")
      }
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [isAuthenticated, user?.role, mode, statusFilter, serviceFilter, debouncedSearch])

  const refreshBookings = useCallback(async () => {
    await fetchBookings(1, false)
  }, [fetchBookings])

  const fetchTimelineBookings = useCallback(async () => {
    if (!isAuthenticated || user?.role !== "professional") return

    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`

      const activeStatuses = ["booked", "rescheduling_requested", "in_progress", "professional_completed", "payment_pending", "quote_accepted", "dispute"].join(",")
      const allTimelineBookings: Booking[] = []
      let page = 1
      const limit = 50

      while (true) {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?page=${page}&limit=${limit}&status=${activeStatuses}`,
          { credentials: "include", headers }
        )
        const data = await response.json()
        if (!response.ok || !data.success) {
          break
        }

        const incoming = Array.isArray(data.bookings) ? data.bookings : []
        allTimelineBookings.push(...incoming)
        const totalPages = data.pagination?.totalPages ?? 1
        if (page >= totalPages || incoming.length < limit) break
        page++
      }

      setTimelineBookings(allTimelineBookings)
    } catch (error) {
      console.error("Failed to fetch timeline bookings:", error)
    }
  }, [isAuthenticated, user?.role])

  useEffect(() => {
    void refreshBookings()
  }, [refreshBookings])

  useEffect(() => {
    if (mode !== "bookings") return
    void fetchTimelineBookings()
  }, [fetchTimelineBookings, mode])

  const handleRefresh = useCallback(async () => {
    await refreshBookings()
    if (mode === "bookings") {
      await fetchTimelineBookings()
    }
  }, [fetchTimelineBookings, mode, refreshBookings])

  const relevantBookings = useMemo(() => {
    return bookings.filter((booking) => {
      return mode === "quotes"
        ? QUOTE_STATUSES.has(booking.status)
        : PROFESSIONAL_BOOKING_MODE_STATUSES.has(booking.status)
    })
  }, [bookings, mode])

  // Unique services for the filter dropdown (prefer server-provided list)
  const uniqueServices = allServices.length > 0
    ? allServices
    : Array.from(new Set(relevantBookings.map(b => b.rfqData?.serviceType).filter(Boolean))) as string[]

  // Filters are now applied server-side; relevantBookings just splits quotes vs bookings
  const filteredBookings = relevantBookings

  const comparisonBookings = useMemo(
    () => filteredBookings.filter(b => selectedQuoteIds.has(b._id)),
    [filteredBookings, selectedQuoteIds]
  )

  const pendingBookings = useMemo(() => {
    return filteredBookings.filter((booking) => {
      if (mode === "quotes") {
        return !QUOTE_FINISHED_STATUSES.has(booking.status)
      }
      return !BOOKING_FINISHED_STATUSES.has(booking.status)
    })
  }, [mode, filteredBookings])

  const finishedBookings = useMemo(() => {
    return filteredBookings.filter((booking) => {
      if (mode === "quotes") {
        return QUOTE_FINISHED_STATUSES.has(booking.status)
      }
      return BOOKING_FINISHED_STATUSES.has(booking.status)
    })
  }, [mode, filteredBookings])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== "professional") {
    return null
  }

  const renderBookingList = (items: Booking[], emptyLabel: string) => {
    if (items.length === 0) {
      return <p className="text-sm text-gray-500 py-6 text-center">{emptyLabel}</p>
    }

    return (
      <div className="space-y-3">
        {items.map((booking) => {
          const isProject = isProjectBooking(booking)
          const { label, className } = getBookingStatusMeta(booking.status)
          const createdAt = booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : null

          return (
            <div
              key={booking._id}
              className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                {mode === "quotes" && (
                  <Checkbox
                    checked={selectedQuoteIds.has(booking._id)}
                    onCheckedChange={() => toggleQuoteSelection(booking._id)}
                    className="mt-1 shrink-0"
                    aria-label={`Select for comparison`}
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isProject ? (
                      <Package className="h-4 w-4 text-indigo-500 shrink-0" />
                    ) : (
                      <Briefcase className="h-4 w-4 text-indigo-500 shrink-0" />
                    )}
                    <h3 className="font-semibold text-sm text-gray-900 truncate">
                      {getBookingTitle(booking)}
                    </h3>
                  </div>
                  <div className="text-xs text-gray-600 flex flex-wrap gap-3">
                    <span>Customer: {booking.customer?.name || "Unknown"}</span>
                    {createdAt && <span>Created: {createdAt}</span>}
                  </div>
                  <div className="mt-2">
                    <Badge variant="outline" className={`text-xs capitalize ${className}`}>
                      {label}
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/bookings/${booking._id}`)}
                    className="text-xs"
                  >
                    View
                  </Button>
                  {mode === "quotes" && booking.status === "rfq" && (
                    <Button
                      size="sm"
                      onClick={() => router.push(`/bookings/${booking._id}?action=quote`)}
                      className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
                      title="Sends a single-amount quotation. To split into milestones, open View → Accept RFQ → Build Quotation."
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      Quick Quote
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex gap-2">
            {mode === "quotes" && comparisonBookings.length >= 2 && (
              <Button
                variant="outline"
                onClick={() => setShowComparison(true)}
                className="text-xs"
              >
                <GitCompareArrows className="h-4 w-4 mr-2" />
                Compare ({comparisonBookings.length})
              </Button>
            )}
            {mode === "quotes" && (
              <Button
                onClick={() => { setShowCreateQuoteModal(true) }}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Quote
              </Button>
            )}
            <Button variant="outline" onClick={() => void handleRefresh()} disabled={isLoading || isLoadingMore}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">{pageCopy.title}</h1>
          <p className="text-gray-600 mt-1">{pageCopy.description}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle>{totalBookings}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-gray-500">
              {relevantBookings.length} currently loaded
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle>{pendingBookings.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Finished</CardDescription>
              <CardTitle>{finishedBookings.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            {searchTerm !== debouncedSearch && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 animate-spin" />
            )}
            <Input
              placeholder={`Search ${mode}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                {uniqueServices.map(svc => (
                  <SelectItem key={svc} value={svc}>{svc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              Loading...
            </CardContent>
          </Card>
        )}

        {!isLoading && error && (
          <Card className="border border-rose-100 bg-rose-50">
            <CardContent className="py-4 text-sm text-rose-700">
              {error}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && mode === "bookings" && (
          <BookingTimelineBoard
            bookings={timelineBookings}
            viewerRole="professional"
            onBookingUpdated={async () => {
              await Promise.all([refreshBookings(), fetchTimelineBookings()])
            }}
            emptyLabel="No active professional bookings fall inside the centered two-month timeline."
          />
        )}

        {!isLoading && !error && filteredBookings.length > 0 && (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="h-5 w-5 text-amber-600" />
                    {pageCopy.pendingTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {renderBookingList(pendingBookings, `No pending ${mode}.`)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5 text-emerald-600" />
                    {pageCopy.finishedTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {renderBookingList(finishedBookings, `No finished ${mode}.`)}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!isLoading && !error && filteredBookings.length === 0 && !hasMore && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-gray-500">
              {pageCopy.empty}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && hasMore && (
          <div className="flex flex-col items-center gap-2">
            {loadMoreError && (
              <p className="text-sm text-rose-600">{loadMoreError}</p>
            )}
            <Button
              variant="outline"
              onClick={() => fetchBookings(currentPage + 1, true)}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </div>

      {/* Create Direct Quote Modal */}
      <Dialog open={showCreateQuoteModal} onOpenChange={setShowCreateQuoteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Direct Quotation</DialogTitle>
            <DialogDescription>Select a customer from your active conversations and optionally link the quote to one of your published projects.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Linked project</p>
              {loadingProjects ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading projects...
                </div>
              ) : loadingProjectsError ? (
                <p className="text-sm text-red-500">{loadingProjectsError}</p>
              ) : (
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked project</SelectItem>
                    {activeProjects.map(project => (
                      <SelectItem key={project._id} value={project._id}>
                        {project.title || "Untitled project"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-gray-500">
                Linking a project lets the quote reuse its title and booking configuration later in the flow.
              </p>
            </div>
            {loadingCustomers ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading customers...
              </div>
            ) : loadingCustomersError ? (
              <p className="text-sm text-red-500 text-center py-4">
                {loadingCustomersError}
              </p>
            ) : activeCustomers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No active conversations found. Start a conversation with a customer first.
              </p>
            ) : (
              activeCustomers.map(customer => (
                <button
                  key={customer._id}
                  onClick={() => handleCreateDirectQuote(customer._id)}
                  disabled={creatingQuote}
                  className="w-full text-left p-3 rounded-lg border hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-sm">{customer.name || "Customer"}</p>
                    {customer.email && <p className="text-xs text-gray-500">{customer.email}</p>}
                  </div>
                  <FileText className="h-4 w-4 text-gray-400" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <QuoteComparisonModal
        open={showComparison}
        onOpenChange={setShowComparison}
        bookings={comparisonBookings}
      />
    </div>
  )
}
