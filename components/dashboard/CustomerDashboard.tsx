'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  CheckCircle, Clock, CreditCard,
  GitCompareArrows, Loader2, Package, Plus, Search, X,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { getAuthToken } from "@/lib/utils"
import {
  type BookingStatus,
  getBookingStatusMeta,
  CUSTOMER_QUOTE_STATUSES,
  CUSTOMER_BOOKING_STATUSES,
  CUSTOMER_QUOTE_STATUS_FILTERS,
  CUSTOMER_BOOKING_STATUS_FILTERS,
  customerBookingSummaryCounts,
  statusFilterScope,
} from "@/lib/dashboardBookingHelpers"
import { readFacetCounts, readServerCount, statusOptionCount } from "@/lib/dashboardOverview"
import { getCustomerActionItems, type ActionItem, type ActionNeededBooking, type CustomerActionItemKey } from "@/lib/actionNeededHelpers"
import QuoteComparisonModal from "@/components/dashboard/QuoteComparisonModal"
import SharedBookingsTable, { type SharedBookingRow } from "@/components/dashboard/SharedBookingsTable"
import SharedQuotesTable from "@/components/dashboard/SharedQuotesTable"

type Booking = SharedBookingRow & {
  bookingType: "professional" | "project"
  status: BookingStatus
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
    totalAmount?: number
    budget?: { min?: number; max?: number; currency?: string }
  }
  project?: { _id: string; title?: string; category?: string; service?: string } | null
  professional?: { _id: string; name?: string; username?: string; businessInfo?: { companyName?: string } } | null
  bookingSnapshot?: {
    project?: { id?: string; title?: string }
    selectedSubproject?: Record<string, unknown> | null
  } | null
}

interface WarrantyClaimAction {
  _id: string
  status: string
  claimNumber: string
  booking?: { _id?: string; bookingNumber?: string } | null
}

interface WarrantyDashboardAction {
  id: string
  bookingId: string
  label: string
  severity: "warning" | "urgent"
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

const CUSTOMER_ACTION_ITEM_KEYS = {
  acceptOrDeclineQuotation: "customerDashboard.actionNeeded.acceptOrDeclineQuotation",
  paymentNeeded: "customerDashboard.actionNeeded.paymentNeeded",
  acceptOrDeclineRescheduling: "customerDashboard.actionNeeded.acceptOrDeclineRescheduling",
  reviewCompletion: "customerDashboard.actionNeeded.reviewCompletion",
  reviewDispute: "customerDashboard.actionNeeded.reviewDispute",
} as const satisfies Record<CustomerActionItemKey, string>

const PAGE_SIZE = 20

interface ListState {
  items: Booking[]
  page: number
  totalPages: number
  /**
   * Server totals and facets. null = unknown: not loaded yet, the last
   * request failed, or a successful response did not include (or sent a
   * malformed) total or facet. Unknown is shown as "—" (or no count), never
   * as 0, and never as the previous query's numbers.
   */
  total: number | null
  statusCounts: Record<string, number> | null
  serviceCounts: Record<string, number> | null
  /** Service filter options; kept on failure so the filter stays usable. */
  distinctServices: string[]
  /** Filters (not the page) of the query the totals and counts belong to. */
  queryKey: string | null
  /** Status filter of that query: the scope the summary figures are summed over. */
  queryStatus: string | null
  loading: boolean
  error: string | null
}

/**
 * A failed list keeps its requested page (Retry repeats it) and its service
 * options, but its rows, pager, total and facet counts become unknown: they
 * described an earlier query, not the one that failed.
 */
const failedListState = (prev: ListState, page: number, error: string): ListState => ({
  ...prev,
  items: [],
  page,
  totalPages: 1,
  total: null,
  statusCounts: null,
  serviceCounts: null,
  loading: false,
  error,
})

const initialListState: ListState = {
  items: [],
  page: 1,
  totalPages: 1,
  total: null,
  statusCounts: null,
  serviceCounts: null,
  distinctServices: [],
  queryKey: null,
  queryStatus: null,
  loading: false,
  error: null,
}

export default function CustomerDashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const t = useTranslations("dashboardWidgets")
  const getErrorText = useErrorMessage()
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()

  const statusLabel = (status: string) => {
    const key = STATUS_KEYS[status as StatusKeyValue]
    return key ? t(key) : status
  }

  const [quotes, setQuotes] = useState<ListState>(initialListState)
  const [bookings, setBookings] = useState<ListState>(initialListState)
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaimAction[]>([])
  const [actionBookings, setActionBookings] = useState<ActionNeededBooking[]>([])
  const [actionsLoading, setActionsLoading] = useState(false)
  const [actionsError, setActionsError] = useState<string | null>(null)

  // Filter state
  const [quoteSearch, setQuoteSearch] = useState("")
  const [debouncedQuoteSearch, setDebouncedQuoteSearch] = useState("")
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("all")
  const [quoteServiceFilter, setQuoteServiceFilter] = useState("all")

  const [bookingSearch, setBookingSearch] = useState("")
  const [debouncedBookingSearch, setDebouncedBookingSearch] = useState("")
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all")
  const [bookingServiceFilter, setBookingServiceFilter] = useState("all")
  const [addressFilter, setAddressFilter] = useState("")
  const [debouncedAddressFilter, setDebouncedAddressFilter] = useState("")

  // Selected quotes keep their row data, so a comparison can span pages even
  // though each page load replaces quotes.items.
  const [selectedQuotes, setSelectedQuotes] = useState<Map<string, Booking>>(new Map())
  const [showComparison, setShowComparison] = useState(false)
  const comparisonCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (comparisonCleanupRef.current) clearTimeout(comparisonCleanupRef.current)
    }
  }, [])

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuoteSearch(quoteSearch), 500)
    return () => clearTimeout(timer)
  }, [quoteSearch])
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBookingSearch(bookingSearch), 500)
    return () => clearTimeout(timer)
  }, [bookingSearch])
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAddressFilter(addressFilter), 500)
    return () => clearTimeout(timer)
  }, [addressFilter])

  // Per-list request counters: only the newest request for a list may write
  // its rows, counts and pager (older, slower responses are discarded).
  const latestListRequest = useRef({ quotes: 0, bookings: 0 })
  const fetchList = useCallback(async (
    kind: "quotes" | "bookings",
    opts: { page: number; status: string; service: string; search: string; address: string },
  ) => {
    const setState = kind === "quotes" ? setQuotes : setBookings
    const requestId = ++latestListRequest.current[kind]
    const queryKey = JSON.stringify([opts.status, opts.service, opts.search.trim(), kind === "bookings" ? opts.address.trim() : ""])
    // Another page of the same query keeps its totals while loading; a new
    // filter makes them unknown until its own response arrives.
    setState((prev) => (prev.queryKey === queryKey
      ? { ...prev, loading: true, error: null }
      : { ...prev, total: null, statusCounts: null, serviceCounts: null, queryKey, queryStatus: opts.status, loading: true, error: null }))
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const params = new URLSearchParams({
        page: String(opts.page),
        limit: String(PAGE_SIZE),
      })
      // "all" queries the tab's mode set; the awaiting-payment alias covers
      // both accepted states server-side.
      const modeStatuses = kind === "quotes" ? CUSTOMER_QUOTE_STATUSES : CUSTOMER_BOOKING_STATUSES
      params.append("status", statusFilterScope(opts.status, modeStatuses).join(","))
      if (opts.service !== "all") params.append("service", opts.service)
      if (opts.search.trim()) params.append("search", opts.search.trim())
      if (kind === "bookings" && opts.address.trim().length >= 2) params.append("addressFilter", opts.address.trim())

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?${params.toString()}`,
        { credentials: "include", headers }
      )
      const data = await response.json()
      if (requestId !== latestListRequest.current[kind]) return
      if (!response.ok || !data.success) {
        // Remember the page that failed, so Retry repeats that request.
        setState((prev) => failedListState(prev, opts.page, getErrorText(data, t("customerDashboard.loadFailed"))))
        return
      }
      setState({
        items: Array.isArray(data.bookings) ? data.bookings : [],
        page: data.pagination?.page ?? opts.page,
        totalPages: data.pagination?.totalPages ?? 1,
        // A successful but partial response keeps what it lacks unknown:
        // only an explicit finite count is a count (0 included).
        total: readServerCount(data.pagination?.total),
        statusCounts: readFacetCounts(data.statusCounts),
        serviceCounts: readFacetCounts(data.serviceCounts),
        distinctServices: Array.isArray(data.distinctServices) ? data.distinctServices : [],
        queryKey,
        queryStatus: opts.status,
        loading: false,
        error: null,
      })
    } catch (err) {
      if (requestId !== latestListRequest.current[kind]) return
      setState((prev) => failedListState(prev, opts.page, getErrorText(err, t("customerDashboard.loadFailed"))))
    }
  }, [getErrorText, t])

  // Server-driven tab lists: every row on every page is reachable, counts
  // come from the server facet (never page-derived).
  useEffect(() => {
    void fetchList("quotes", { page: 1, status: quoteStatusFilter, service: quoteServiceFilter, search: debouncedQuoteSearch, address: "" })
  }, [fetchList, quoteStatusFilter, quoteServiceFilter, debouncedQuoteSearch])

  useEffect(() => {
    void fetchList("bookings", { page: 1, status: bookingStatusFilter, service: bookingServiceFilter, search: debouncedBookingSearch, address: debouncedAddressFilter })
  }, [fetchList, bookingStatusFilter, bookingServiceFilter, debouncedBookingSearch, debouncedAddressFilter])

  // Action-needed items resolve from a dedicated server query over
  // action-relevant statuses so paging the main tabs never hides them.
  useEffect(() => {
    const loadActions = async () => {
      setActionsLoading(true)
      setActionsError(null)
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const params = new URLSearchParams({
          page: "1",
          limit: "50",
          status: "rfq,quoted,quote_accepted,payment_pending,rescheduling_requested,professional_completed,dispute",
        })
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?${params.toString()}`,
          { credentials: "include", headers },
        )
        const payload = await response.json()
        if (response.ok && payload.success) setActionBookings(payload.bookings || [])
        else setActionsError(getErrorText(payload, t("customerDashboard.loadFailed")))
      } catch (err) {
        // A failed load must not masquerade as "no actions".
        setActionsError(getErrorText(err, t("customerDashboard.loadFailed")))
      } finally {
        setActionsLoading(false)
      }
    }
    void loadActions()
    // Mount-only load; the message helpers only format a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const loadClaims = async () => {
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/my?limit=50`, {
          credentials: "include",
          headers,
        })
        const payload = await response.json()
        if (response.ok && payload.success) setWarrantyClaims(payload.data?.claims || [])
      } catch {
        // non-blocking
      }
    }
    void loadClaims()
  }, [])

  // Action items
  const actionItems = useMemo(() => getCustomerActionItems(actionBookings), [actionBookings])
  const warrantyActionItems = useMemo<WarrantyDashboardAction[]>(() => {
    return warrantyClaims.reduce<WarrantyDashboardAction[]>((acc, claim) => {
      if (!claim.booking?._id) return acc
      if (claim.status === "proposal_sent") {
        acc.push({ id: claim._id, bookingId: claim.booking._id, label: t("customerDashboard.warrantyAction.proposal"), severity: "warning" })
      }
      if (claim.status === "resolved") {
        acc.push({ id: claim._id, bookingId: claim.booking._id, label: t("customerDashboard.warrantyAction.resolved"), severity: "urgent" })
      }
      return acc
    }, [])
  }, [warrantyClaims, t])

  const toggleQuoteSelection = useCallback((booking: Booking) => {
    setSelectedQuotes(prev => {
      const next = new Map(prev)
      if (next.has(booking._id)) next.delete(booking._id)
      else next.set(booking._id, booking)
      return next
    })
  }, [])

  const comparisonBookings = useMemo(
    () => Array.from(selectedQuotes.values())
      .map((b) => ({
        _id: b._id,
        professional: b.professional ?? undefined,
        rfqData: b.rfqData,
        status: b.status,
      })),
    [selectedQuotes]
  )
  const visibleSelectedCount = comparisonBookings.length

  // Summary stats from server totals (never page-derived). A figure whose
  // inputs are unknown (first load, a failed list, or a response without
  // them) shows "—", not 0. Active and completed are summed over the same
  // status scope as the filtered total.
  const UNKNOWN = "—"
  const { active: summaryActive, completed: totalCompleted } = customerBookingSummaryCounts(bookings.statusCounts, bookings.queryStatus)
  const summaryTotal = bookings.total != null && quotes.total != null ? bookings.total + quotes.total : null

  const gotoQuotesPage = (page: number) => {
    void fetchList("quotes", { page, status: quoteStatusFilter, service: quoteServiceFilter, search: debouncedQuoteSearch, address: "" })
  }
  const gotoBookingsPage = (page: number) => {
    void fetchList("bookings", { page, status: bookingStatusFilter, service: bookingServiceFilter, search: debouncedBookingSearch, address: debouncedAddressFilter })
  }

  const renderSearchFilters = (
    search: string,
    setSearch: (v: string) => void,
    debouncedSearch: string,
    statusFilter: string,
    setStatusFilter: (v: string) => void,
    statusOptions: { id: string; label: string }[],
    serviceFilter: string,
    setServiceFilter: (v: string) => void,
    placeholder: string,
    services: string[],
    counts: Record<string, number> | null,
  ) => (
    <div className="flex flex-col sm:flex-row gap-4 mb-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        {search !== debouncedSearch && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 animate-spin" />
        )}
        <Input
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 pr-10"
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder={t("customerDashboard.filters.filterByStatus")} />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(opt => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.id === "all"
                  ? t("common.all")
                  : counts
                    ? `${statusLabel(opt.id)} (${statusOptionCount(counts, opt.id)})`
                    : statusLabel(opt.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t("customerDashboard.filters.filterByService")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allServices")}</SelectItem>
            {services.map(svc => (
              <SelectItem key={svc} value={svc}>{svc}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  // A failed list keeps its filters mounted (rendered by the caller) and offers
  // a retry of the same page; stale rows from the previous query stay hidden.
  const renderListError = (message: string, retry: () => void) => (
    <Card className="bg-rose-50 border border-rose-100">
      <CardContent role="alert" className="flex flex-col gap-3 py-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        <Button variant="outline" size="sm" onClick={retry}>{t("common.retry")}</Button>
      </CardContent>
    </Card>
  )

  const renderPager = (state: ListState, gotoPage: (page: number) => void) => (
    state.totalPages > 1 && (
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-gray-600">
        <span>{t("common.pageOf", { page: state.page, total: state.totalPages })}</span>
        <div className="space-x-2">
          <Button variant="outline" size="sm" disabled={state.page <= 1 || state.loading} onClick={() => gotoPage(state.page - 1)}>
            {t("common.previous")}
          </Button>
          <Button variant="outline" size="sm" disabled={state.page >= state.totalPages || state.loading} onClick={() => gotoPage(state.page + 1)}>
            {t("common.next")}
          </Button>
        </div>
      </div>
    )
  )

  const renderActionItem = (item: ActionItem<CustomerActionItemKey>) => {
    const booking = item.booking
    const actionLabelKey = CUSTOMER_ACTION_ITEM_KEYS[item.labelKey]
    const { className: statusClasses } = getBookingStatusMeta(booking.status)
    const severityClasses = item.severity === "urgent"
      ? "border-red-200 bg-red-50/50"
      : "border-amber-200 bg-amber-50/50"

    return (
      <div
        key={booking._id}
        className={`border rounded-lg p-4 transition-colors ${severityClasses}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs capitalize ${statusClasses}`}>
                {statusLabel(booking.status)}
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs ${item.severity === "urgent" ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}
              >
                {t(actionLabelKey)}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/bookings/${booking._id}`)}
              className="text-xs"
            >
              {t("common.view")}
            </Button>
            {(booking.status === 'quote_accepted' || booking.status === 'payment_pending') && (
              <Button
                size="sm"
                onClick={() => router.push(`/bookings/${booking._id}/payment`)}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                <CreditCard className="h-3 w-3 mr-1" />
                {t("customerDashboard.payNow")}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderEmptyState = (message: string) => (
    <Card className="bg-white/80 backdrop-blur border border-dashed border-indigo-200">
      <CardContent className="py-8 text-center text-sm text-gray-600">
        {message}
      </CardContent>
    </Card>
  )

  const renderLoadingSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {t("customerDashboard.welcome", { name: user?.name ?? "" })}
            </h1>
            <p className="text-gray-600">
              {t("customerDashboard.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="bg-white/70 backdrop-blur border border-pink-100 hover:border-pink-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("customerDashboard.bookAnother")}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="my_bookings" className="space-y-6">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex h-auto min-w-full w-max p-1 bg-muted rounded-md">
              <TabsTrigger value="my_bookings" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t("customerDashboard.tabs.myBookings")} {bookings.total != null && bookings.total > 0 && `(${bookings.total})`}
              </TabsTrigger>
              <TabsTrigger value="my_quotes" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t("customerDashboard.tabs.myQuotes")} {quotes.total != null && quotes.total > 0 && `(${quotes.total})`}
              </TabsTrigger>
              <TabsTrigger value="action_needed" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t("customerDashboard.tabs.actionNeeded")} {(actionItems.length + warrantyActionItems.length) > 0 && `(${actionItems.length + warrantyActionItems.length})`}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="my_bookings" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="bg-white/80 backdrop-blur border border-indigo-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-indigo-900">
                    <Package className="h-5 w-5 text-indigo-500" />
                    {t("customerDashboard.stats.total")}
                  </CardTitle>
                  <CardDescription>{t("customerDashboard.stats.totalHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-indigo-900">{summaryTotal ?? UNKNOWN}</p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur border border-emerald-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-emerald-900">
                    <Clock className="h-5 w-5 text-emerald-500" />
                    {t("customerDashboard.stats.active")}
                  </CardTitle>
                  <CardDescription>{t("customerDashboard.stats.activeHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-emerald-900">{summaryActive ?? UNKNOWN}</p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur border border-teal-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-teal-900">
                    <CheckCircle className="h-5 w-5 text-teal-500" />
                    {t("customerDashboard.stats.completed")}
                  </CardTitle>
                  <CardDescription>{t("customerDashboard.stats.completedHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-teal-900">{totalCompleted ?? UNKNOWN}</p>
                </CardContent>
              </Card>
            </div>

            {bookings.loading && renderLoadingSkeleton()}
            <>
                {renderSearchFilters(
                  bookingSearch, setBookingSearch, debouncedBookingSearch,
                  bookingStatusFilter, setBookingStatusFilter, CUSTOMER_BOOKING_STATUS_FILTERS,
                  bookingServiceFilter, setBookingServiceFilter,
                  t("customerDashboard.filters.searchBookings"),
                  bookings.distinctServices,
                  bookings.statusCounts,
                )}
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    {addressFilter !== debouncedAddressFilter ? (
                      <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 animate-spin" />
                    ) : addressFilter ? (
                      <button
                        type="button"
                        aria-label={t("customerDashboard.filters.clearAddressFilter")}
                        onClick={() => setAddressFilter("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-rose-400 rounded"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                    <Input
                      aria-label={t("customerDashboard.filters.filterByAddress")}
                      placeholder={t("customerDashboard.filters.filterByAddress")}
                      value={addressFilter}
                      onChange={(e) => setAddressFilter(e.target.value)}
                      className="pl-10 pr-10"
                    />
                  </div>
                </div>
                {!bookings.loading && bookings.error && renderListError(bookings.error, () => gotoBookingsPage(bookings.page))}
                {!bookings.loading && !bookings.error && bookings.items.length === 0 && renderEmptyState(t("customerDashboard.emptyBookings"))}
                {!bookings.loading && !bookings.error && bookings.items.length > 0 && (
                  <>
                    <SharedBookingsTable
                      bookings={bookings.items}
                      viewerRole="customer"
                      formatMoney={formatMoney}
                      intl={intl}
                      statusLabel={statusLabel}
                      invoiceLabel={t("customerDashboard.invoice")}
                      downloadLabel={t("customerDashboard.download")}
                      chatLabel={t("customerDashboard.chat")}
                      warrantyLabel={t("customerDashboard.openWarrantyClaim")}
                      payNowLabel={t("customerDashboard.payNow")}
                      viewLabel={t("customerDashboard.viewDetails")}
                    />
                    {renderPager(bookings, gotoBookingsPage)}
                  </>
                )}
            </>
          </TabsContent>

          <TabsContent value="my_quotes" className="space-y-6">
            {quotes.loading && renderLoadingSkeleton()}
            <>
                {renderSearchFilters(
                  quoteSearch, setQuoteSearch, debouncedQuoteSearch,
                  quoteStatusFilter, setQuoteStatusFilter, CUSTOMER_QUOTE_STATUS_FILTERS,
                  quoteServiceFilter, setQuoteServiceFilter,
                  t("customerDashboard.filters.searchQuotes"),
                  quotes.distinctServices,
                  quotes.statusCounts,
                )}
                {!quotes.loading && quotes.error && renderListError(quotes.error, () => gotoQuotesPage(quotes.page))}
                {!quotes.loading && !quotes.error && visibleSelectedCount >= 2 && (
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={() => setShowComparison(true)}
                      className="text-xs"
                    >
                      <GitCompareArrows className="h-3 w-3 mr-1" />
                      {t("customerDashboard.compareQuotes", { count: visibleSelectedCount })}
                    </Button>
                  </div>
                )}
                {!quotes.loading && !quotes.error && quotes.items.length === 0 && renderEmptyState(t("customerDashboard.emptyQuotes"))}
                {!quotes.loading && !quotes.error && quotes.items.length > 0 && (
                  <>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {quotes.items.map((booking) => (
                        <label key={booking._id} className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Checkbox
                            checked={selectedQuotes.has(booking._id)}
                            onCheckedChange={() => toggleQuoteSelection(booking)}
                            aria-label={t("customerDashboard.selectForComparison", { title: booking.bookingNumber || booking._id })}
                          />
                          {booking.bookingNumber || booking._id}
                        </label>
                      ))}
                    </div>
                    <SharedQuotesTable
                      bookings={quotes.items}
                      viewerRole="customer"
                      formatMoney={formatMoney}
                      intl={intl}
                      statusLabel={statusLabel}
                      chatLabel={t("customerDashboard.chat")}
                      acceptPayLabel={t("customerDashboard.acceptPay")}
                      viewLabel={t("customerDashboard.viewDetails")}
                    />
                    {renderPager(quotes, gotoQuotesPage)}
                  </>
                )}
            </>
          </TabsContent>

          {/* Action Needed Tab */}
          <TabsContent value="action_needed" className="space-y-4">
            {actionsLoading && renderLoadingSkeleton()}
            {!actionsLoading && actionsError && (
              <Card className="border-rose-200 bg-rose-50">
                <CardContent role="alert" className="py-4 text-sm text-rose-700">{actionsError}</CardContent>
              </Card>
            )}
            {!actionsLoading && !actionsError && actionItems.length === 0 && warrantyActionItems.length === 0 && (
              renderEmptyState(t("customerDashboard.emptyActions"))
            )}
            {!actionsLoading && (actionItems.length > 0 || warrantyActionItems.length > 0) && (
              <div className="space-y-3">
                {actionItems.map(renderActionItem)}
                {warrantyActionItems.map((item) => (
                  <div key={item.id} className={`border rounded-lg p-4 ${item.severity === "urgent" ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{item.label}</p>
                        <p className="text-xs text-slate-600">{t("customerDashboard.warrantyFlow", { id: item.bookingId })}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/bookings/${item.bookingId}`)}>{t("common.view")}</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {comparisonBookings.length >= 2 && (
          <QuoteComparisonModal
            open={showComparison}
            onOpenChange={(open) => {
              setShowComparison(open)
              if (!open) {
                if (comparisonCleanupRef.current) clearTimeout(comparisonCleanupRef.current)
                comparisonCleanupRef.current = setTimeout(() => setSelectedQuotes(new Map()), 300)
              }
            }}
            bookings={comparisonBookings}
          />
        )}
      </div>
    </div>
  )
}
