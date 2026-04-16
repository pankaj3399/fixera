'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Briefcase, Calendar, CheckCircle, Clock, CreditCard,
  GitCompareArrows, Loader2, Package, Plus, Search,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { getAuthToken } from "@/lib/utils"
import StartChatButton from "@/components/chat/StartChatButton"
import {
  type BookingStatus,
  getBookingStatusMeta,
  getBookingTitle,
  isProjectBooking,
  CUSTOMER_QUOTE_STATUSES,
  CUSTOMER_BOOKING_STATUSES,
  CUSTOMER_QUOTE_STATUS_FILTERS,
  CUSTOMER_BOOKING_STATUS_FILTERS,
} from "@/lib/dashboardBookingHelpers"
import { getCustomerActionItems, type ActionItem } from "@/lib/actionNeededHelpers"
import QuoteComparisonModal from "@/components/dashboard/QuoteComparisonModal"
import BookingTimelineBoard from "@/components/dashboard/BookingTimelineBoard"

interface Booking {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  bookingNumber?: string
  customer?: { _id: string; name?: string; email?: string; phone?: string; customerType?: string }
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
    totalAmount?: number
    budget?: { min?: number; max?: number; currency?: string }
  }
  scheduledStartDate?: string
  scheduledBufferStartDate?: string
  scheduledBufferEndDate?: string
  scheduledEndDate?: string
  scheduledExecutionEndDate?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  createdAt?: string
  project?: { _id: string; title?: string; category?: string; service?: string }
  professional?: { _id: string; name?: string; username?: string; businessInfo?: { companyName?: string } }
  payment?: { status?: string; currency?: string; amount?: number }
  location?: { address?: string; city?: string; country?: string }
  pricingSnapshot?: { totalAmount?: number }
  milestonePayments?: Array<{ title?: string; status?: string; workStatus?: string; amount?: number }>
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
    previousSchedule?: {
      scheduledStartDate?: string
      scheduledExecutionEndDate?: string
      scheduledBufferStartDate?: string
      scheduledBufferEndDate?: string
      scheduledStartTime?: string
      scheduledEndTime?: string
    }
  }
  warrantyCoverage?: {
    duration?: { value?: number; unit?: "months" | "years" }
    startsAt?: string
    endsAt?: string
    source?: "quote" | "project_subproject"
  }
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

const formatBudget = (booking: Booking): string | null => {
  const budget = booking.rfqData?.budget
  if (!budget || (budget.min == null && budget.max == null)) return null
  const currency = budget.currency || "€"
  if (budget.min != null && budget.max != null && budget.min !== budget.max) {
    return `${currency}${budget.min.toLocaleString()} – ${currency}${budget.max.toLocaleString()}`
  }
  const value = budget.min ?? budget.max
  if (value == null) return null
  return `${currency}${value.toLocaleString()}`
}

const ACCENT_CLASSES = {
  indigo: {
    icon: "text-indigo-500",
    border: "border-indigo-200",
    hoverBorder: "hover:border-indigo-300",
  },
  blue: {
    icon: "text-blue-500",
    border: "border-blue-200",
    hoverBorder: "hover:border-blue-300",
  },
  emerald: {
    icon: "text-emerald-500",
    border: "border-emerald-200",
    hoverBorder: "hover:border-emerald-300",
  },
  teal: {
    icon: "text-teal-500",
    border: "border-teal-200",
    hoverBorder: "hover:border-teal-300",
  },
} as const

type AccentKey = keyof typeof ACCENT_CLASSES

export default function CustomerDashboard() {
  const { user } = useAuth()
  const router = useRouter()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaimAction[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState<string | null>(null)

  // Filter state
  const [quoteSearch, setQuoteSearch] = useState("")
  const [debouncedQuoteSearch, setDebouncedQuoteSearch] = useState("")
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("all")
  const [quoteServiceFilter, setQuoteServiceFilter] = useState("all")

  const [bookingSearch, setBookingSearch] = useState("")
  const [debouncedBookingSearch, setDebouncedBookingSearch] = useState("")
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all")
  const [bookingServiceFilter, setBookingServiceFilter] = useState("all")

  const [selectedQuoteIds, setSelectedQuoteIds] = useState<Set<string>>(new Set())
  const [showComparison, setShowComparison] = useState(false)
  const comparisonCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (comparisonCleanupRef.current) clearTimeout(comparisonCleanupRef.current)
    }
  }, [])

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuoteSearch(quoteSearch), 500)
    return () => clearTimeout(t)
  }, [quoteSearch])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBookingSearch(bookingSearch), 500)
    return () => clearTimeout(t)
  }, [bookingSearch])

  const fetchAllBookings = useCallback(async () => {
    setBookingsLoading(true)
    setBookingsError(null)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const allBookings: Booking[] = []
      let page = 1
      const limit = 50

      while (true) {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?page=${page}&limit=${limit}`,
          { credentials: "include", headers }
        )
        const data = await response.json()
        if (!response.ok || !data.success) {
          setBookingsError(data.msg || "Failed to load your bookings.")
          return
        }
        const incoming = data.bookings || []
        allBookings.push(...incoming)
        const totalPages = data.pagination?.totalPages ?? 1
        if (page >= totalPages || incoming.length < limit) break
        page++
      }

      setBookings(allBookings)
    } catch {
      setBookingsError("Failed to load your bookings.")
    } finally {
      setBookingsLoading(false)
    }
  }, [])

  // Fetch all bookings via pagination
  useEffect(() => {
    void fetchAllBookings()
  }, [fetchAllBookings])

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

  // Split into quotes and bookings
  const quoteBookings = useMemo(
    () => bookings.filter(b => CUSTOMER_QUOTE_STATUSES.has(b.status)),
    [bookings]
  )
  const activeBookings = useMemo(
    () => bookings.filter(b => CUSTOMER_BOOKING_STATUSES.has(b.status)),
    [bookings]
  )

  // Action items
  const actionItems = useMemo(() => getCustomerActionItems(bookings), [bookings])
  const warrantyActionItems = useMemo<WarrantyDashboardAction[]>(() => {
    return warrantyClaims.reduce<WarrantyDashboardAction[]>((acc, claim) => {
      if (!claim.booking?._id) return acc
      if (claim.status === "proposal_sent") {
        acc.push({ id: claim._id, bookingId: claim.booking._id, label: "Accept or decline warranty proposal", severity: "warning" })
      }
      if (claim.status === "resolved") {
        acc.push({ id: claim._id, bookingId: claim.booking._id, label: "Accept or decline warranty resolution", severity: "urgent" })
      }
      return acc
    }, [])
  }, [warrantyClaims])

  // Unique services across all bookings
  const allServices = useMemo(() => {
    return Array.from(new Set(bookings.map(b => b.project?.service || b.rfqData?.serviceType).filter(Boolean))) as string[]
  }, [bookings])

  // Filtered quotes
  const filteredQuotes = useMemo(() => {
    return quoteBookings.filter(b => {
      if (quoteStatusFilter !== "all" && b.status !== quoteStatusFilter) return false
      if (quoteServiceFilter !== "all" && (b.project?.service || b.rfqData?.serviceType) !== quoteServiceFilter) return false
      if (debouncedQuoteSearch) {
        const term = debouncedQuoteSearch.toLowerCase()
        const title = getBookingTitle(b).toLowerCase()
        const svc = (b.project?.service || b.rfqData?.serviceType || "").toLowerCase()
        const addr = (b.location?.address || "").toLowerCase()
        const bNum = (b.bookingNumber || "").toLowerCase()
        if (!title.includes(term) && !svc.includes(term) && !addr.includes(term) && !bNum.includes(term)) return false
      }
      return true
    })
  }, [quoteBookings, quoteStatusFilter, quoteServiceFilter, debouncedQuoteSearch])

  // Filtered bookings
  const filteredActiveBookings = useMemo(() => {
    return activeBookings.filter(b => {
      if (bookingStatusFilter !== "all") {
        const matchesAwaitingPayment =
          bookingStatusFilter === "payment_pending" &&
          (b.status === "payment_pending" || b.status === "quote_accepted")
        if (!matchesAwaitingPayment && b.status !== bookingStatusFilter) return false
      }
      if (bookingServiceFilter !== "all" && (b.project?.service || b.rfqData?.serviceType) !== bookingServiceFilter) return false
      if (debouncedBookingSearch) {
        const term = debouncedBookingSearch.toLowerCase()
        const title = getBookingTitle(b).toLowerCase()
        const svc = (b.project?.service || b.rfqData?.serviceType || "").toLowerCase()
        const addr = (b.location?.address || "").toLowerCase()
        const bNum = (b.bookingNumber || "").toLowerCase()
        if (!title.includes(term) && !svc.includes(term) && !addr.includes(term) && !bNum.includes(term)) return false
      }
      return true
    })
  }, [activeBookings, bookingStatusFilter, bookingServiceFilter, debouncedBookingSearch])

  const toggleQuoteSelection = useCallback((bookingId: string) => {
    setSelectedQuoteIds(prev => {
      const next = new Set(prev)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
  }, [])

  const comparisonBookings = useMemo(
    () => filteredQuotes.filter(b => selectedQuoteIds.has(b._id)),
    [filteredQuotes, selectedQuoteIds]
  )
  const visibleSelectedCount = comparisonBookings.length

  // Summary stats
  const totalBookings = bookings.length
  const totalActive = activeBookings.filter(b => !["completed", "cancelled", "refunded"].includes(b.status)).length
  const totalCompleted = bookings.filter(b => b.status === "completed").length

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
            {allServices.map(svc => (
              <SelectItem key={svc} value={svc}>{svc}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const renderBookingCard = (booking: Booking, colorAccent: string, opts?: { selectable?: boolean; selected?: boolean; onToggle?: () => void }) => {
    const accent = ACCENT_CLASSES[(colorAccent as AccentKey)] ?? ACCENT_CLASSES.indigo
    const isProject = isProjectBooking(booking)
    const title = getBookingTitle(booking)
    const { label: statusLabel, className: statusClasses } = getBookingStatusMeta(booking.status)
    const createdAt = booking.createdAt ? new Date(booking.createdAt) : null
    const preferredStart = booking.rfqData?.preferredStartDate
      ? new Date(booking.rfqData.preferredStartDate)
      : booking.scheduledStartDate
      ? new Date(booking.scheduledStartDate)
      : null
    const budgetLabel = formatBudget(booking)
    const warrantyDurationValue = Number(booking.warrantyCoverage?.duration?.value || 0)
    const warrantyEndsAtDate = booking.warrantyCoverage?.endsAt
      ? new Date(booking.warrantyCoverage.endsAt)
      : null
    const hasWarrantyCoverage = warrantyDurationValue > 0 && !!warrantyEndsAtDate
    const canOpenWarrantyClaim =
      booking.status === "completed" &&
      hasWarrantyCoverage &&
      !!warrantyEndsAtDate &&
      warrantyEndsAtDate.getTime() > Date.now()
    const warrantyButtonTitle = !hasWarrantyCoverage
      ? "No warranty coverage for this booking"
      : canOpenWarrantyClaim
      ? "Open warranty claim"
      : "Warranty period expired"

    return (
      <Card key={booking._id} className="bg-white/90 backdrop-blur shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {opts?.selectable && (
                <Checkbox
                  checked={opts.selected}
                  onCheckedChange={() => opts.onToggle?.()}
                  className="mt-1 shrink-0"
                  aria-label={`Select ${title} for comparison`}
                />
              )}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {isProject ? (
                    <Package className={`h-4 w-4 ${accent.icon}`} />
                  ) : (
                    <Briefcase className={`h-4 w-4 ${accent.icon}`} />
                  )}
                  <CardTitle className="text-base font-semibold text-gray-900">
                    {title}
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-gray-500">
                  {isProject ? "Project booking" : "Professional booking"}
                  {booking.rfqData?.serviceType && ` • ${booking.rfqData.serviceType}`}
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`text-xs font-medium capitalize rounded-full px-2.5 py-1 ${statusClasses}`}
            >
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2 text-xs text-gray-700">
          {preferredStart && (
            <div className="flex items-center gap-2">
              <Calendar className={`h-3 w-3 ${accent.icon}`} />
              <span>
                Start: <span className="font-medium">{preferredStart.toLocaleDateString()}</span>
              </span>
            </div>
          )}
          {createdAt && (
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-gray-400" />
              <span>
                Requested on <span className="font-medium">{createdAt.toLocaleDateString()}</span>
              </span>
            </div>
          )}
          {budgetLabel && (
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
                €
              </span>
              <span>
                Budget: <span className="font-medium">{budgetLabel}</span>
              </span>
            </div>
          )}
          {booking.status === "completed" && hasWarrantyCoverage && warrantyEndsAtDate && (
            <div className="text-[11px] text-slate-600">
              Warranty active until <span className="font-medium">{warrantyEndsAtDate.toLocaleDateString()}</span>
            </div>
          )}
          <div className="pt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/bookings/${booking._id}`)}
              className={`text-xs bg-white/80 ${accent.border} ${accent.hoverBorder}`}
            >
              View details
            </Button>
            {booking.professional?._id && (
              <StartChatButton
                professionalId={booking.professional._id}
                label="Chat"
                size="sm"
                className={`text-xs bg-white/80 ${accent.border} ${accent.hoverBorder}`}
              />
            )}
            {(booking.status === 'quote_accepted' || booking.status === 'payment_pending') && (
              <Button
                size="sm"
                onClick={() => router.push(`/bookings/${booking._id}/payment`)}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                <CreditCard className="h-3 w-3 mr-1" />
                Pay Now
              </Button>
            )}
            {booking.status === "completed" && hasWarrantyCoverage && (
              <Button
                variant="outline"
                size="sm"
                title={warrantyButtonTitle}
                disabled={!canOpenWarrantyClaim}
                onClick={() => router.push(`/bookings/${booking._id}?openWarrantyClaim=true`)}
                className="text-xs"
              >
                Open Warranty Claim
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderActionItem = (item: ActionItem) => {
    const booking = item.booking
    const title = getBookingTitle(booking)
    const { label: statusLabel, className: statusClasses } = getBookingStatusMeta(booking.status)
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
            <div className="flex items-center gap-2 mb-1">
              {isProjectBooking(booking) ? (
                <Package className="h-4 w-4 text-indigo-500" />
              ) : (
                <Briefcase className="h-4 w-4 text-indigo-500" />
              )}
              <h3 className="font-semibold text-sm">{title}</h3>
            </div>
            <div className="text-xs text-gray-600 mb-2">
              {booking.rfqData?.serviceType && <span>{booking.rfqData.serviceType} • </span>}
              {booking.createdAt && <span>{new Date(booking.createdAt).toLocaleDateString()}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs capitalize ${statusClasses}`}>
                {statusLabel}
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs ${item.severity === "urgent" ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}
              >
                {item.label}
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
              View
            </Button>
            {(booking.status === 'quote_accepted' || booking.status === 'payment_pending') && (
              <Button
                size="sm"
                onClick={() => router.push(`/bookings/${booking._id}/payment`)}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                <CreditCard className="h-3 w-3 mr-1" />
                Pay Now
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
              Welcome back, {user?.name}!
            </h1>
            <p className="text-gray-600">
              Track your quotes, bookings and project requests.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="bg-white/70 backdrop-blur border border-pink-100 hover:border-pink-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              Book another project
            </Button>
          </div>
        </div>

        <Tabs defaultValue="my_bookings" className="space-y-6">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex h-auto min-w-full w-max p-1 bg-muted rounded-md">
              <TabsTrigger value="my_bookings" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                My Bookings {activeBookings.length > 0 && `(${activeBookings.length})`}
              </TabsTrigger>
              <TabsTrigger value="my_quotes" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                My Quotes {quoteBookings.length > 0 && `(${quoteBookings.length})`}
              </TabsTrigger>
              <TabsTrigger value="action_needed" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Action Needed {(actionItems.length + warrantyActionItems.length) > 0 && `(${actionItems.length + warrantyActionItems.length})`}
              </TabsTrigger>
              <TabsTrigger value="quick_actions" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Quick Actions
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="my_bookings" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="bg-white/80 backdrop-blur border border-indigo-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-indigo-900">
                    <Package className="h-5 w-5 text-indigo-500" />
                    Total
                  </CardTitle>
                  <CardDescription>All quotes & bookings</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-indigo-900">{totalBookings}</p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur border border-emerald-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-emerald-900">
                    <Clock className="h-5 w-5 text-emerald-500" />
                    Active
                  </CardTitle>
                  <CardDescription>In progress or awaiting action</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-emerald-900">{totalActive}</p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur border border-teal-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-teal-900">
                    <CheckCircle className="h-5 w-5 text-teal-500" />
                    Completed
                  </CardTitle>
                  <CardDescription>Finished bookings</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold text-teal-900">{totalCompleted}</p>
                </CardContent>
              </Card>
            </div>

            {bookingsLoading && renderLoadingSkeleton()}
            {!bookingsLoading && bookingsError && (
              <Card className="bg-rose-50 border border-rose-100">
                <CardContent className="py-4 text-sm text-rose-700">{bookingsError}</CardContent>
              </Card>
            )}
            {!bookingsLoading && !bookingsError && (
              <>
                {renderSearchFilters(
                  bookingSearch, setBookingSearch, debouncedBookingSearch,
                  bookingStatusFilter, setBookingStatusFilter, CUSTOMER_BOOKING_STATUS_FILTERS,
                  bookingServiceFilter, setBookingServiceFilter,
                  "Search bookings..."
                )}
                {filteredActiveBookings.length > 0 && (
                  <BookingTimelineBoard bookings={filteredActiveBookings} viewerRole="customer" />
                )}
                {filteredActiveBookings.length === 0 && (
                  renderEmptyState("No bookings match your filters.")
                )}
                {filteredActiveBookings.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-4">
                    {filteredActiveBookings.map(b => renderBookingCard(b, "emerald"))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="my_quotes" className="space-y-6">
            {bookingsLoading && renderLoadingSkeleton()}
            {!bookingsLoading && bookingsError && (
              <Card className="bg-rose-50 border border-rose-100">
                <CardContent className="py-4 text-sm text-rose-700">{bookingsError}</CardContent>
              </Card>
            )}
            {!bookingsLoading && !bookingsError && (
              <>
                {renderSearchFilters(
                  quoteSearch, setQuoteSearch, debouncedQuoteSearch,
                  quoteStatusFilter, setQuoteStatusFilter, CUSTOMER_QUOTE_STATUS_FILTERS,
                  quoteServiceFilter, setQuoteServiceFilter,
                  "Search quotes..."
                )}
                {visibleSelectedCount >= 2 && (
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={() => setShowComparison(true)}
                      className="text-xs"
                    >
                      <GitCompareArrows className="h-3 w-3 mr-1" />
                      Compare {visibleSelectedCount} quotes
                    </Button>
                  </div>
                )}
                {filteredQuotes.length === 0 && (
                  renderEmptyState("No quotes match your filters.")
                )}
                {filteredQuotes.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-4">
                    {filteredQuotes.map(b => renderBookingCard(b, "indigo", {
                      selectable: true,
                      selected: selectedQuoteIds.has(b._id),
                      onToggle: () => toggleQuoteSelection(b._id),
                    }))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="quick_actions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Open the pages you use most without cluttering the main dashboard.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <Button onClick={() => router.push("/")} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Book Another Project
                  </Button>
                  <Button variant="outline" onClick={() => router.push("/dashboard/benefits")} className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Benefits Program
                  </Button>
                  <Button variant="outline" onClick={() => router.push("/profile")} className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Profile
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Action Needed Tab */}
          <TabsContent value="action_needed" className="space-y-4">
            {bookingsLoading && renderLoadingSkeleton()}
            {!bookingsLoading && bookingsError && (
              <Card className="bg-rose-50 border border-rose-100">
                <CardContent className="py-4 text-sm text-rose-700">{bookingsError}</CardContent>
              </Card>
            )}
            {!bookingsLoading && !bookingsError && actionItems.length === 0 && warrantyActionItems.length === 0 && (
              renderEmptyState("No actions needed right now. You're all caught up!")
            )}
            {!bookingsLoading && !bookingsError && (actionItems.length > 0 || warrantyActionItems.length > 0) && (
              <div className="space-y-3">
                {actionItems.map(renderActionItem)}
                {warrantyActionItems.map((item) => (
                  <div key={item.id} className={`border rounded-lg p-4 ${item.severity === "urgent" ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{item.label}</p>
                        <p className="text-xs text-slate-600">Warranty flow for booking {item.bookingId}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/bookings/${item.bookingId}`)}>View</Button>
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
                comparisonCleanupRef.current = setTimeout(() => setSelectedQuoteIds(new Set()), 300)
              }
            }}
            bookings={comparisonBookings}
          />
        )}
      </div>
    </div>
  )
}
