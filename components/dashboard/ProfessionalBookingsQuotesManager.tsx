'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { getAuthToken } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, FileText, GitCompareArrows, Loader2, Plus, RefreshCw, Search } from "lucide-react"
import QuoteComparisonModal from "@/components/dashboard/QuoteComparisonModal"
import BookingTimelineBoard from "@/components/dashboard/BookingTimelineBoard"
import RefundRequestsPanel from "@/components/dashboard/RefundRequestsPanel"
import SharedBookingsTable from "@/components/dashboard/SharedBookingsTable"
import SharedQuotesTable from "@/components/dashboard/SharedQuotesTable"
import { useCurrency } from "@/contexts/CurrencyContext"
import { facetCount, sumStatusCounts } from "@/lib/dashboardOverview"
import {
  type BookingStatus,
  QUOTE_STATUSES,
  QUOTE_FINISHED_STATUSES,
  BOOKING_FINISHED_STATUSES,
  PROFESSIONAL_BOOKING_MODE_STATUSES,
} from "@/lib/dashboardBookingHelpers"

type ManagerMode = "bookings" | "quotes"

interface Booking {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  bookingNumber?: string
  customer?: {
    _id: string
    name?: string
  }
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
    totalAmount?: number
    budget?: { min?: number; max?: number; currency?: string }
  }
  createdAt?: string
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  scheduledBufferStartDate?: string
  scheduledBufferEndDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  actualStartDate?: string
  actualEndDate?: string
  priceModel?: string
  payment?: {
    status?: string
    currency?: string
    amount?: number
    totalWithVat?: number | null
    professionalPayout?: number | null
    refundedTotal?: number | null
    transferredAt?: string | null
    invoiceNumber?: string | null
    invoiceUrl?: string | null
    supplierInvoiceNumber?: string | null
    supplierInvoiceUrl?: string | null
  }
  extraCosts?: Array<{ status?: string; total?: number; amount?: number }> | null
  location?: {
    address?: string
    city?: string
    country?: string
    postalCode?: string
  }
  bookingSnapshot?: {
    project?: { id?: string; title?: string }
    selectedSubproject?: Record<string, unknown> | null
  } | null
  quotationNumber?: string | null
  currentQuoteVersion?: number | null
  acceptedQuoteVersion?: number | null
  quoteVersions?: Array<{
    version: number
    totalAmount?: number | null
    totalWithVat?: number | null
    amount?: number | null
    currency?: string | null
    submittedAt?: string | null
    createdAt?: string | null
    validUntil?: string | null
    firstPossibleStart?: string | null
    executionDuration?: { value?: number; unit?: string } | string | null
  }> | null
  quote?: {
    quotationNumber?: string | null
    currentVersion?: number | null
    acceptedVersion?: number | null
    submittedAt?: string | null
    validUntil?: string | null
    totalAmount?: number | null
    amount?: number | null
    currency?: string | null
  } | null
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
    category?: string
    service?: string
  }
  professional?: {
    _id: string
    username?: string
    professionalLevel?: string | null
    businessInfo?: {
      companyName?: string
    }
  }
  pricingSnapshot?: {
    totalAmount?: number
  }
  milestonePayments?: Array<{
    title?: string
    status?: string
    workStatus?: string
    amount?: number
  }>
}

interface ProfessionalBookingsQuotesManagerProps {
  mode: ManagerMode
}

const STATUS_KEYS = {
  rfq: "status.rfq",
  rfq_accepted: "status.rfq_accepted",
  draft_quote: "status.draft_quote",
  quoted: "status.quoted",
  quote_accepted: "status.quote_accepted",
  quote_rejected: "status.quote_rejected",
  payment_pending: "status.payment_pending",
  booked: "status.booked",
  rescheduling_requested: "status.rescheduling_requested",
  in_progress: "status.in_progress",
  professional_completed: "status.professional_completed",
  completed: "status.completed",
  cancelled: "status.cancelled",
  refunded: "status.refunded",
  dispute: "status.dispute",
  unknown: "status.unknown",
} as const

type StatusKeyValue = keyof typeof STATUS_KEYS

export default function ProfessionalBookingsQuotesManager({ mode }: ProfessionalBookingsQuotesManagerProps) {
  const PAGE_SIZE = 20
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const t = useTranslations("dashboardWidgets")
  const getErrorText = useErrorMessage()
  const { intl } = useFormatLocale()
  const { formatMoney } = useCurrency()

  const statusLabel = (status: string) => {
    const key = STATUS_KEYS[status as StatusKeyValue]
    return key ? t(key) : status
  }

  const [bookings, setBookings] = useState<Booking[]>([])
  const [timelineBookings, setTimelineBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalBookings, setTotalBookings] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [serviceCounts, setServiceCounts] = useState<Record<string, number>>({})
  const [hasMore, setHasMore] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [serviceFilter, setServiceFilter] = useState("all")
  const [customerNameFilter, setCustomerNameFilter] = useState("")
  const [debouncedCustomerNameFilter, setDebouncedCustomerNameFilter] = useState("")
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
        setLoadingCustomersError(t("professionalManager.errors.loadCustomers"))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error("Error fetching active customers:", err)
      setLoadingCustomersError(t("professionalManager.errors.loadCustomers"))
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
        setLoadingProjectsError(t("professionalManager.errors.loadProjects"))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error("Error fetching active projects:", err)
      setLoadingProjectsError(t("professionalManager.errors.loadProjects"))
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
        toast.error(getErrorText(data, t("professionalManager.errors.createQuote")))
      }
    } catch (err) {
      console.error("Error creating direct quotation:", err)
      toast.error(getErrorText(err, t("professionalManager.errors.createQuote")))
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
    const timer = setTimeout(() => setDebouncedCustomerNameFilter(customerNameFilter), 500)
    return () => clearTimeout(timer)
  }, [customerNameFilter])

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

  const withCount = (id: string, label: string) => {
    if (id === "all") return label
    if (mode === "bookings" && id === "awaiting_payment") {
      return `${label} (${facetCount(statusCounts, "quote_accepted") + facetCount(statusCounts, "payment_pending")})`
    }
    return `${label} (${facetCount(statusCounts, id)})`
  }

  const statusOptions = mode === "quotes"
    ? [
        { id: "all", label: t("common.allStatuses") },
        { id: "rfq", label: withCount("rfq", t("status.rfq")) },
        { id: "rfq_accepted", label: withCount("rfq_accepted", t("status.rfq_accepted")) },
        { id: "draft_quote", label: withCount("draft_quote", t("status.draft_quote")) },
        { id: "quoted", label: withCount("quoted", t("status.quoted")) },
        { id: "quote_accepted", label: withCount("quote_accepted", t("status.quote_accepted")) },
        { id: "quote_rejected", label: withCount("quote_rejected", t("status.quote_rejected")) },
      ]
    : [
        { id: "all", label: t("common.allStatuses") },
        { id: "awaiting_payment", label: withCount("awaiting_payment", t("status.payment_pending")) },
        { id: "booked", label: withCount("booked", t("status.booked")) },
        { id: "rescheduling_requested", label: withCount("rescheduling_requested", t("status.rescheduling_requested")) },
        { id: "in_progress", label: withCount("in_progress", t("status.in_progress")) },
        { id: "completed", label: withCount("completed", t("status.completed")) },
        { id: "cancelled", label: withCount("cancelled", t("status.cancelled")) },
        { id: "dispute", label: withCount("dispute", t("status.dispute")) },
        { id: "refunded", label: withCount("refunded", t("status.refunded")) },
      ]

  const pageCopy = mode === "bookings"
    ? {
      title: t("professionalManager.page.bookingsTitle"),
      description: t("professionalManager.page.bookingsDescription"),
      pendingTitle: t("professionalManager.page.pendingBookings"),
      finishedTitle: t("professionalManager.page.finishedBookings"),
      empty: t("professionalManager.page.emptyBookings"),
    }
    : {
      title: t("professionalManager.page.quotesTitle"),
      description: t("professionalManager.page.quotesDescription"),
      pendingTitle: t("professionalManager.page.pendingQuotes"),
      finishedTitle: t("professionalManager.page.finishedQuotes"),
      empty: t("professionalManager.page.emptyQuotes"),
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
      const trimmedCustomerName = debouncedCustomerNameFilter?.trim()
      if (trimmedCustomerName) params.append("customerNameFilter", trimmedCustomerName)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?${params}`,
        { credentials: "include", headers }
      )
      const data = await response.json()

      if (response.ok && data.success) {
        if (Array.isArray(data.distinctServices)) {
          setAllServices(data.distinctServices)
        }
        if (data.statusCounts && typeof data.statusCounts === "object") {
          setStatusCounts(data.statusCounts)
        }
        if (data.serviceCounts && typeof data.serviceCounts === "object") {
          setServiceCounts(data.serviceCounts)
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
        const msg = getErrorText(data, t("professionalManager.errors.loadBookings"))
        if (append) {
          setLoadMoreError(msg)
        } else {
          setError(msg)
        }
      }
    } catch (fetchError) {
      console.error("Failed to fetch bookings:", fetchError)
      if (append) {
        setLoadMoreError(getErrorText(fetchError, t("professionalManager.errors.loadBookings")))
      } else {
        setError(getErrorText(fetchError, t("professionalManager.errors.loadBookings")))
      }
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [isAuthenticated, user?.role, mode, statusFilter, serviceFilter, debouncedSearch, debouncedCustomerNameFilter?.trim(), getErrorText, t])

  const refreshBookings = useCallback(async () => {
    await fetchBookings(1, false)
  }, [fetchBookings])

  const TIMELINE_STATUSES = ["booked", "rescheduling_requested", "in_progress", "professional_completed", "payment_pending", "quote_accepted", "dispute"]
  const FINISHED_ONLY_STATUSES = new Set(["completed", "cancelled", "refunded"])

  const fetchTimelineBookings = useCallback(async () => {
    if (!isAuthenticated || user?.role !== "professional") return

    if (statusFilter !== "all" && FINISHED_ONLY_STATUSES.has(statusFilter)) {
      setTimelineBookings([])
      return
    }

    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`

      const TIMELINE_STATUS_MAP: Record<string, string> = {
        awaiting_payment: "quote_accepted,payment_pending",
      }
      const activeStatuses = statusFilter !== "all"
        ? (TIMELINE_STATUS_MAP[statusFilter] ?? statusFilter)
        : TIMELINE_STATUSES.join(",")
      const allTimelineBookings: Booking[] = []
      let page = 1
      const limit = 50

      while (true) {
        const params = new URLSearchParams({ page: String(page), limit: String(limit), status: activeStatuses })
        if (serviceFilter !== "all") params.append("service", serviceFilter)
        if (debouncedSearch) params.append("search", debouncedSearch)
        const trimmedCustomerName = debouncedCustomerNameFilter?.trim()
        if (trimmedCustomerName) params.append("customerNameFilter", trimmedCustomerName)
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?${params.toString()}`,
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
  }, [isAuthenticated, user?.role, statusFilter, serviceFilter, debouncedSearch, debouncedCustomerNameFilter?.trim()])

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
    () => filteredBookings
      .filter(b => selectedQuoteIds.has(b._id))
      .map((b) => ({
        _id: b._id,
        professional: b.professional ?? undefined,
        rfqData: b.rfqData,
        quotationNumber: b.quotationNumber ?? undefined,
        status: b.status,
      })),
    [filteredBookings, selectedQuoteIds]
  )

  // Server facet counts drive the pending/finished cards (never page-derived).
  const finishedModeStatuses = useMemo(
    () => Array.from(mode === "quotes" ? QUOTE_FINISHED_STATUSES : BOOKING_FINISHED_STATUSES),
    [mode],
  )
  const pendingModeStatuses = useMemo(() => {
    const modeSet = mode === "quotes" ? QUOTE_STATUSES : PROFESSIONAL_BOOKING_MODE_STATUSES
    const finished = mode === "quotes" ? QUOTE_FINISHED_STATUSES : BOOKING_FINISHED_STATUSES
    return Array.from(modeSet).filter((status) => !finished.has(status))
  }, [mode])



  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-600">{t("common.loading")}</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== "professional") {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("professionalManager.backToDashboard")}
          </Button>
          <div className="flex gap-2">
            {mode === "quotes" && comparisonBookings.length >= 2 && (
              <Button
                variant="outline"
                onClick={() => setShowComparison(true)}
                className="text-xs"
              >
                <GitCompareArrows className="h-4 w-4 mr-2" />
                {t("professionalManager.compare", { count: comparisonBookings.length })}
              </Button>
            )}
            {mode === "quotes" && (
              <Button
                onClick={() => { setShowCreateQuoteModal(true) }}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("professionalManager.createQuote")}
              </Button>
            )}
            <Button variant="outline" onClick={() => void handleRefresh()} disabled={isLoading || isLoadingMore}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              {t("professionalManager.refresh")}
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">{pageCopy.title}</h1>
          <p className="text-gray-600 mt-1">{pageCopy.description}</p>
        </div>

        {mode === "bookings" && <RefundRequestsPanel />}

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("professionalManager.stats.total")}</CardDescription>
              <CardTitle>{totalBookings}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-gray-500">
              {t("professionalManager.stats.currentlyLoaded", { count: relevantBookings.length })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("professionalManager.stats.pending")}</CardDescription>
              <CardTitle>{sumStatusCounts(statusCounts, pendingModeStatuses)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("professionalManager.stats.finished")}</CardDescription>
              <CardTitle>{sumStatusCounts(statusCounts, finishedModeStatuses)}</CardTitle>
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
              aria-label={mode === "quotes" ? t("professionalManager.searchQuotesAria") : t("professionalManager.searchBookingsAria")}
              placeholder={mode === "quotes" ? t("professionalManager.searchQuotesPlaceholder") : t("professionalManager.searchBookingsPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("professionalManager.filterByStatus")} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("professionalManager.filterByService")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allServices")}</SelectItem>
                {uniqueServices.map(svc => (
                  <SelectItem key={svc} value={svc}>{svc} ({facetCount(serviceCounts, svc)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 -mt-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            {customerNameFilter.trim() !== debouncedCustomerNameFilter.trim() && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 animate-spin" />
            )}
            <Input
              aria-label={t("professionalManager.filterByCustomerName")}
              placeholder={t("professionalManager.filterByCustomerName")}
              value={customerNameFilter}
              onChange={(e) => setCustomerNameFilter(e.target.value)}
              className="pl-10 pr-10"
            />
          </div>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              {t("common.loading")}
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
            emptyLabel={t("professionalManager.timelineEmpty")}
          />
        )}

        {!isLoading && !error && filteredBookings.length > 0 && (
          <div className="space-y-4">
            {mode === "quotes" && (
              <div className="flex flex-wrap gap-2">
                {filteredBookings.map((booking) => (
                  <label key={booking._id} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Checkbox
                      checked={selectedQuoteIds.has(booking._id)}
                      onCheckedChange={() => toggleQuoteSelection(booking._id)}
                      aria-label={t("professionalManager.selectForComparison")}
                    />
                    {booking.bookingNumber || booking._id}
                  </label>
                ))}
              </div>
            )}
            {mode === "quotes" ? (
              <SharedQuotesTable
                bookings={filteredBookings}
                viewerRole="professional"
                formatMoney={formatMoney}
                intl={intl}
                statusLabel={statusLabel}
                chatLabel={t("customerDashboard.chat")}
                acceptPayLabel={t("customerDashboard.acceptPay")}
                viewLabel={t("common.view")}
              />
            ) : (
              <SharedBookingsTable
                bookings={filteredBookings}
                viewerRole="professional"
                formatMoney={formatMoney}
                intl={intl}
                statusLabel={statusLabel}
                invoiceLabel={t("customerDashboard.invoice")}
                downloadLabel={t("customerDashboard.download")}
                chatLabel={t("customerDashboard.chat")}
                warrantyLabel={t("customerDashboard.openWarrantyClaim")}
                payNowLabel={t("customerDashboard.payNow")}
                viewLabel={t("common.view")}
              />
            )}
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
              {isLoadingMore ? t("common.loading") : t("professionalManager.loadMore")}
            </Button>
          </div>
        )}
      </div>

      {/* Create Direct Quote Modal */}
      <Dialog open={showCreateQuoteModal} onOpenChange={setShowCreateQuoteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("professionalManager.dialog.title")}</DialogTitle>
            <DialogDescription>{t("professionalManager.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">{t("professionalManager.dialog.linkedProject")}</p>
              {loadingProjects ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("professionalManager.dialog.loadingProjects")}
                </div>
              ) : loadingProjectsError ? (
                <p className="text-sm text-red-500">{loadingProjectsError}</p>
              ) : (
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("professionalManager.dialog.chooseProject")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("professionalManager.dialog.noLinkedProject")}</SelectItem>
                    {activeProjects.map(project => (
                      <SelectItem key={project._id} value={project._id}>
                        {project.title || t("professionalManager.dialog.untitledProject")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-gray-500">
                {t("professionalManager.dialog.projectHint")}
              </p>
            </div>
            {loadingCustomers ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("professionalManager.dialog.loadingCustomers")}
              </div>
            ) : loadingCustomersError ? (
              <p className="text-sm text-red-500 text-center py-4">
                {loadingCustomersError}
              </p>
            ) : activeCustomers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                {t("professionalManager.dialog.noConversations")}
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
                    <p className="font-medium text-sm">{customer.name || t("professionalManager.dialog.customerFallback")}</p>
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
