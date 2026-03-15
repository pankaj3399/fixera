'use client'

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertTriangle, Briefcase, Calendar, CheckCircle, Clock, CreditCard,
  Loader2, Package, Plus, Search,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { getAuthToken } from "@/lib/utils"
import StartChatButton from "@/components/chat/StartChatButton"
import ReferralCard from "@/components/dashboard/ReferralCard"
import {
  type BookingStatus,
  getBookingStatusMeta,
  getBookingTitle,
  CUSTOMER_QUOTE_STATUSES,
  CUSTOMER_BOOKING_STATUSES,
  CUSTOMER_QUOTE_STATUS_FILTERS,
  CUSTOMER_BOOKING_STATUS_FILTERS,
} from "@/lib/dashboardBookingHelpers"
import { getCustomerActionItems, type ActionItem } from "@/lib/actionNeededHelpers"

interface Booking {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  customer?: { _id: string; name?: string; email?: string; phone?: string; customerType?: string }
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
    budget?: { min?: number; max?: number; currency?: string }
  }
  scheduledStartDate?: string
  scheduledEndDate?: string
  scheduledExecutionEndDate?: string
  createdAt?: string
  project?: { _id: string; title?: string; category?: string; service?: string }
  professional?: { _id: string; name?: string; businessInfo?: { companyName?: string } }
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

export default function CustomerDashboard() {
  const { user } = useAuth()
  const router = useRouter()

  const [bookings, setBookings] = useState<Booking[]>([])
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

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuoteSearch(quoteSearch), 500)
    return () => clearTimeout(t)
  }, [quoteSearch])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBookingSearch(bookingSearch), 500)
    return () => clearTimeout(t)
  }, [bookingSearch])

  // Fetch bookings
  useEffect(() => {
    const fetchBookings = async () => {
      setBookingsLoading(true)
      setBookingsError(null)
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?limit=50`,
          { credentials: "include", headers }
        )
        const data = await response.json()
        if (response.ok && data.success) {
          setBookings(data.bookings || [])
        } else {
          setBookingsError(data.msg || "Failed to load your bookings.")
        }
      } catch {
        setBookingsError("Failed to load your bookings.")
      } finally {
        setBookingsLoading(false)
      }
    }
    fetchBookings()
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

  // Unique services across all bookings
  const allServices = useMemo(() => {
    return Array.from(new Set(bookings.map(b => b.rfqData?.serviceType).filter(Boolean))) as string[]
  }, [bookings])

  // Filtered quotes
  const filteredQuotes = useMemo(() => {
    return quoteBookings.filter(b => {
      if (quoteStatusFilter !== "all" && b.status !== quoteStatusFilter) return false
      if (quoteServiceFilter !== "all" && b.rfqData?.serviceType !== quoteServiceFilter) return false
      if (debouncedQuoteSearch) {
        const term = debouncedQuoteSearch.toLowerCase()
        const title = getBookingTitle(b).toLowerCase()
        const svc = (b.rfqData?.serviceType || "").toLowerCase()
        if (!title.includes(term) && !svc.includes(term)) return false
      }
      return true
    })
  }, [quoteBookings, quoteStatusFilter, quoteServiceFilter, debouncedQuoteSearch])

  // Filtered bookings
  const filteredActiveBookings = useMemo(() => {
    return activeBookings.filter(b => {
      if (bookingStatusFilter !== "all" && b.status !== bookingStatusFilter) return false
      if (bookingServiceFilter !== "all" && b.rfqData?.serviceType !== bookingServiceFilter) return false
      if (debouncedBookingSearch) {
        const term = debouncedBookingSearch.toLowerCase()
        const title = getBookingTitle(b).toLowerCase()
        const svc = (b.rfqData?.serviceType || "").toLowerCase()
        if (!title.includes(term) && !svc.includes(term)) return false
      }
      return true
    })
  }, [activeBookings, bookingStatusFilter, bookingServiceFilter, debouncedBookingSearch])

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

  const renderBookingCard = (booking: Booking, colorAccent: string) => {
    const isProject = booking.bookingType === "project"
    const title = getBookingTitle(booking)
    const { label: statusLabel, className: statusClasses } = getBookingStatusMeta(booking.status)
    const createdAt = booking.createdAt ? new Date(booking.createdAt) : null
    const preferredStart = booking.rfqData?.preferredStartDate
      ? new Date(booking.rfqData.preferredStartDate)
      : booking.scheduledStartDate
      ? new Date(booking.scheduledStartDate)
      : null
    const budgetLabel = formatBudget(booking)

    return (
      <Card key={booking._id} className="bg-white/90 backdrop-blur shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {isProject ? (
                  <Package className={`h-4 w-4 text-${colorAccent}-500`} />
                ) : (
                  <Briefcase className={`h-4 w-4 text-${colorAccent}-500`} />
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
              <Calendar className={`h-3 w-3 text-${colorAccent}-500`} />
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
          <div className="pt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/bookings/${booking._id}`)}
              className={`text-xs bg-white/80 border-${colorAccent}-200 hover:border-${colorAccent}-300`}
            >
              View details
            </Button>
            {booking.professional?._id && (
              <StartChatButton
                professionalId={booking.professional._id}
                label="Chat"
                size="sm"
                className={`text-xs bg-white/80 border-${colorAccent}-200 hover:border-${colorAccent}-300`}
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
              {booking.bookingType === "project" ? (
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

        {/* Summary cards */}
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

        {/* Referral Card */}
        <ReferralCard />

        {/* Tabs: Action Needed / Quotes / Bookings */}
        <Tabs defaultValue="action_needed" className="space-y-6">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex h-auto min-w-full w-max p-1 bg-muted rounded-md">
              <TabsTrigger value="action_needed" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Action Needed {actionItems.length > 0 && `(${actionItems.length})`}
              </TabsTrigger>
              <TabsTrigger value="quotes" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Quotes ({quoteBookings.length})
              </TabsTrigger>
              <TabsTrigger value="bookings" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Bookings ({activeBookings.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Action Needed Tab */}
          <TabsContent value="action_needed" className="space-y-4">
            {bookingsLoading && renderLoadingSkeleton()}
            {!bookingsLoading && bookingsError && (
              <Card className="bg-rose-50 border border-rose-100">
                <CardContent className="py-4 text-sm text-rose-700">{bookingsError}</CardContent>
              </Card>
            )}
            {!bookingsLoading && !bookingsError && actionItems.length === 0 && (
              renderEmptyState("No actions needed right now. You're all caught up!")
            )}
            {!bookingsLoading && !bookingsError && actionItems.length > 0 && (
              <div className="space-y-3">
                {actionItems.map(renderActionItem)}
              </div>
            )}
          </TabsContent>

          {/* Quotes Tab */}
          <TabsContent value="quotes" className="space-y-4">
            {renderSearchFilters(
              quoteSearch, setQuoteSearch, debouncedQuoteSearch,
              quoteStatusFilter, setQuoteStatusFilter, CUSTOMER_QUOTE_STATUS_FILTERS,
              quoteServiceFilter, setQuoteServiceFilter,
              "Search quotes..."
            )}

            {bookingsLoading && renderLoadingSkeleton()}
            {!bookingsLoading && bookingsError && (
              <Card className="bg-rose-50 border border-rose-100">
                <CardContent className="py-4 text-sm text-rose-700">{bookingsError}</CardContent>
              </Card>
            )}
            {!bookingsLoading && !bookingsError && filteredQuotes.length === 0 && (
              renderEmptyState(
                quoteBookings.length === 0
                  ? "No quotes yet. When you request a quote, it will appear here."
                  : "No quotes match your filters."
              )
            )}
            {!bookingsLoading && !bookingsError && filteredQuotes.length > 0 && (
              <div className="space-y-4">
                {filteredQuotes.map(b => renderBookingCard(b, "indigo"))}
              </div>
            )}
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="space-y-4">
            {renderSearchFilters(
              bookingSearch, setBookingSearch, debouncedBookingSearch,
              bookingStatusFilter, setBookingStatusFilter, CUSTOMER_BOOKING_STATUS_FILTERS,
              bookingServiceFilter, setBookingServiceFilter,
              "Search bookings..."
            )}

            {bookingsLoading && renderLoadingSkeleton()}
            {!bookingsLoading && bookingsError && (
              <Card className="bg-rose-50 border border-rose-100">
                <CardContent className="py-4 text-sm text-rose-700">{bookingsError}</CardContent>
              </Card>
            )}
            {!bookingsLoading && !bookingsError && filteredActiveBookings.length === 0 && (
              renderEmptyState(
                activeBookings.length === 0
                  ? "No bookings yet. Once a quote is accepted, your booking will appear here."
                  : "No bookings match your filters."
              )
            )}
            {!bookingsLoading && !bookingsError && filteredActiveBookings.length > 0 && (
              <div className="space-y-4">
                {filteredActiveBookings.map(b => renderBookingCard(b, "indigo"))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
