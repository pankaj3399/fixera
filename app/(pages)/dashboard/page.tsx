'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { User, Mail, Phone, Shield, Calendar, Crown, Settings, TrendingUp, Users, Award, CheckCircle, XCircle, Clock, AlertTriangle, Plus, Briefcase, Package, CreditCard, FileText } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { getAuthToken } from "@/lib/utils"
import StartChatButton from "@/components/chat/StartChatButton"

interface LoyaltyStats {
  tierDistribution: Array<{
    _id: string;
    count: number;
    totalSpent: number;
    totalPoints: number;
  }>;
  overallStats: {
    totalCustomers: number;
    totalRevenue: number;
    totalPointsIssued: number;
  };
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
  total: number;
}

interface ProjectStats {
  pendingProjects: number;
}

type BookingStatus =
  | "rfq"
  | "quoted"
  | "quote_accepted"
  | "quote_rejected"
  | "payment_pending"
  | "booked"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "dispute"
  | "refunded"
  | string

interface Booking {
  _id: string
  bookingType: "professional" | "project"
  status: BookingStatus
  customer?: {
    _id: string
    name?: string
    email?: string
    phone?: string
    customerType?: string
  }
  rfqData?: {
    serviceType?: string
    description?: string
    preferredStartDate?: string
    budget?: {
      min?: number
      max?: number
      currency?: string
    }
  }
  scheduledStartDate?: string
  scheduledEndDate?: string
  createdAt?: string
  project?: {
    _id: string
    title?: string
    category?: string
    service?: string
  }
  professional?: {
    _id: string
    name?: string
    businessInfo?: {
      companyName?: string
    }
  }
}

const BOOKING_STATUS_STYLES: Record<string, string> = {
  rfq: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  quoted: "bg-blue-50 text-blue-700 border border-blue-100",
  quote_accepted: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  quote_rejected: "bg-rose-50 text-rose-700 border border-rose-100",
  payment_pending: "bg-amber-50 text-amber-700 border border-amber-100",
  booked: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  in_progress: "bg-sky-50 text-sky-700 border border-sky-100",
  completed: "bg-teal-50 text-teal-700 border border-teal-100",
  cancelled: "bg-rose-50 text-rose-700 border border-rose-100",
  refunded: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100",
  dispute: "bg-red-50 text-red-700 border border-red-100",
  unknown: "bg-slate-50 text-slate-700 border border-slate-100",
}

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "rfq", label: "RFQ" },
  { id: "quoted", label: "Quoted" },
  { id: "quote_accepted", label: "Quote accepted" },
  { id: "quote_rejected", label: "Quote rejected" },
  { id: "payment_pending", label: "Payment pending" },
  { id: "booked", label: "Booked" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "dispute", label: "Dispute" },
  { id: "refunded", label: "Refunded" },
]

const isPastBooking = (booking: Booking): boolean => {
  const pastStatuses = new Set<BookingStatus>([
    "completed",
    "cancelled",
    "refunded",
    "quote_rejected",
    "dispute",
  ])
  return pastStatuses.has(booking.status)
}

const getBookingStatusMeta = (status?: BookingStatus) => {
  const rawStatus = status || "unknown"
  return {
    rawStatus,
    label: rawStatus.replace(/_/g, " "),
    className:
      BOOKING_STATUS_STYLES[rawStatus] ||
      "bg-slate-50 text-slate-700 border border-slate-100"
  }
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

export default function DashboardPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const [loyaltyStats, setLoyaltyStats] = useState<LoyaltyStats | null>(null)
  const [approvalStats, setApprovalStats] = useState<ApprovalStats | null>(null)
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login?redirect=/dashboard')
    }
  }, [isAuthenticated, loading, router])

  // Fetch admin-specific data
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAdminData()
    }
  }, [user])

  // Fetch bookings for customer and professional dashboard
  useEffect(() => {
    if (!user || !isAuthenticated) return
    if (user.role !== "customer" && user.role !== "professional") return

    const fetchBookings = async () => {
      setBookingsLoading(true)
      setBookingsError(null)
      try {
        // Get token for Authorization header fallback
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?limit=50`,
          {
            credentials: "include",
            headers
          }
        )
        const data = await response.json()

        if (response.ok && data.success) {
          setBookings(data.bookings || [])
        } else {
          setBookingsError(data.msg || "Failed to load your bookings.")
        }
      } catch (error) {
        console.error("Failed to fetch bookings:", error)
        setBookingsError("Failed to load your bookings.")
      } finally {
        setBookingsLoading(false)
      }
    }

    fetchBookings()
  }, [user, isAuthenticated])

  const fetchAdminData = async () => {
    setIsLoadingStats(true)
    try {
      // Get token for Authorization header fallback
      const token = getAuthToken()
      const fetchOptions: RequestInit = {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      }

      const [loyaltyResponse, approvalResponse, projectsResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/loyalty/analytics`, fetchOptions),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/stats/approvals`, fetchOptions),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/pending`, fetchOptions),
      ])

      if (loyaltyResponse.ok) {
        const loyaltyData = await loyaltyResponse.json()
        setLoyaltyStats(loyaltyData.data)
      }

      if (approvalResponse.ok) {
        const approvalData = await approvalResponse.json()
        setApprovalStats(approvalData.data.stats)
      }

      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json()
        setProjectStats({ pendingProjects: projectsData.length })
      }

    } catch (error) {
      console.error('Failed to fetch admin data:', error)
    } finally {
      setIsLoadingStats(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  // Customer dashboard with bookings overview
  if (user?.role === "customer") {
    const upcomingBookings = bookings.filter(b => !isPastBooking(b))
    const pastBookings = bookings.filter(isPastBooking)

    const filteredUpcoming = upcomingBookings.filter(b =>
      statusFilter === "all" ? true : b.status === statusFilter
    )
    const filteredPast = pastBookings.filter(b =>
      statusFilter === "all" ? true : b.status === statusFilter
    )

    const totalBookings = bookings.length
    const totalUpcoming = upcomingBookings.length
    const totalCompleted = bookings.filter(b => b.status === "completed").length

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
        <div className="max-w-6xl mx-auto pt-20 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome back, {user?.name}!
              </h1>
              <p className="text-gray-600">
                Here you can track all your bookings and project requests.
              </p>
            </div>
            {user?.role === 'customer' && (
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
            )}
          </div>

          {/* Summary cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="bg-white/80 backdrop-blur border border-indigo-100 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <Package className="h-5 w-5 text-indigo-500" />
                  Total bookings
                </CardTitle>
                <CardDescription>Your overall activity</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-indigo-900">
                  {totalBookings}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur border border-emerald-100 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-900">
                  <Clock className="h-5 w-5 text-emerald-500" />
                  Active / upcoming
                </CardTitle>
                <CardDescription>Requests that are in progress</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-emerald-900">
                  {totalUpcoming}
                </p>
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
                <p className="text-3xl font-semibold text-teal-900">
                  {totalCompleted}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Status filter chips */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(filter => {
              const isActive = statusFilter === filter.id
              return (
                <Button
                  key={filter.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStatusFilter(filter.id)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    isActive
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white/80 text-gray-700 border-indigo-100 hover:border-indigo-300"
                  }`}
                >
                  {filter.label}
                </Button>
              )
            })}
          </div>

          {/* Bookings lists */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-500" />
                Upcoming & active bookings
              </h2>

              {bookingsLoading && (
                <Card className="bg-white/70 backdrop-blur border border-indigo-100">
                  <CardContent className="py-8 text-center text-gray-500">
                    Loading your bookings...
                  </CardContent>
                </Card>
              )}

              {!bookingsLoading && bookingsError && (
                <Card className="bg-rose-50 border border-rose-100">
                  <CardContent className="py-4 text-sm text-rose-700">
                    {bookingsError}
                  </CardContent>
                </Card>
              )}

              {!bookingsLoading && !bookingsError && upcomingBookings.length === 0 && (
                <Card className="bg-white/80 backdrop-blur border border-dashed border-indigo-200">
                  <CardContent className="py-8 text-center space-y-2">
                    <p className="text-sm text-gray-600">
                      You don&apos;t have any active or upcoming bookings yet.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/")}
                      className="bg-white/80 border-pink-200 hover:border-pink-300"
                    >
                      Browse projects
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!bookingsLoading && !bookingsError && filteredUpcoming.map(booking => {
                const isProject = booking.bookingType === "project"
                const title =
                  (isProject ? booking.project?.title : booking.professional?.businessInfo?.companyName) ||
                  booking.rfqData?.serviceType ||
                  "Booking"

                const { label: statusLabel, className: statusClasses } = getBookingStatusMeta(booking.status)

                const createdAt = booking.createdAt ? new Date(booking.createdAt) : null
                const preferredStart = booking.rfqData?.preferredStartDate
                  ? new Date(booking.rfqData.preferredStartDate)
                  : booking.scheduledStartDate
                  ? new Date(booking.scheduledStartDate)
                  : null

                const budgetLabel = formatBudget(booking)

                return (
                  <div
                    key={booking._id}
                    className="bg-gradient-to-r from-pink-100 via-purple-100 to-blue-100 rounded-2xl p-[1px]"
                  >
                    <Card className="bg-white/90 backdrop-blur rounded-[1rem] shadow-sm">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {isProject ? (
                                <Package className="h-4 w-4 text-indigo-500" />
                              ) : (
                                <Briefcase className="h-4 w-4 text-indigo-500" />
                              )}
                              <CardTitle className="text-base font-semibold text-gray-900">
                                {title}
                              </CardTitle>
                            </div>
                            <CardDescription className="text-xs text-gray-500">
                              {isProject ? "Project booking" : "Professional booking"}
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
                            <Calendar className="h-3 w-3 text-indigo-500" />
                            <span>
                              Preferred start:{" "}
                              <span className="font-medium">
                                {preferredStart.toLocaleDateString()}
                              </span>
                            </span>
                          </div>
                        )}

                        {createdAt && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span>
                              Requested on{" "}
                              <span className="font-medium">
                                {createdAt.toLocaleDateString()}
                              </span>
                            </span>
                          </div>
                        )}

                        {budgetLabel && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
                              €
                            </span>
                            <span>
                              Estimated budget:{" "}
                              <span className="font-medium">{budgetLabel}</span>
                            </span>
                          </div>
                        )}

                        <div className="pt-2 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/bookings/${booking._id}`)}
                            className="text-xs bg-white/80 border-indigo-200 hover:border-indigo-300"
                          >
                            View details
                          </Button>
                          {booking.professional?._id && (
                            <StartChatButton
                              professionalId={booking.professional._id}
                              bookingId={booking._id}
                              label="Chat"
                              size="sm"
                              className="text-xs bg-white/80 border-indigo-200 hover:border-indigo-300"
                            />
                          )}
                          {/* Customer: Pay Now button */}
                          {user?.role === 'customer' && (booking.status === 'quote_accepted' || booking.status === 'payment_pending') && (
                            <Button
                              size="sm"
                              onClick={() => router.push(`/bookings/${booking._id}/payment`)}
                              className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              <CreditCard className="h-3 w-3 mr-1" />
                              Pay Now
                            </Button>
                          )}
                          {/* Professional: Submit Quote button */}
                          {user?.role === 'professional' && booking.status === 'rfq' && (
                            <Button
                              size="sm"
                              onClick={() => router.push(`/bookings/${booking._id}`)}
                              className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Submit Quote
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>

            {/* Past bookings */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-teal-500" />
                Past bookings
              </h2>

              {!bookingsLoading && !bookingsError && pastBookings.length === 0 && (
                <Card className="bg-white/80 backdrop-blur border border-dashed border-teal-200">
                  <CardContent className="py-8 text-center text-sm text-gray-600">
                    Past bookings will appear here once your projects are completed or cancelled.
                  </CardContent>
                </Card>
              )}

              {!bookingsLoading && !bookingsError && filteredPast.map(booking => {
                const isProject = booking.bookingType === "project"
                const title =
                  (isProject ? booking.project?.title : booking.professional?.businessInfo?.companyName) ||
                  booking.rfqData?.serviceType ||
                  "Booking"

                const { label: statusLabel, className: statusClasses } = getBookingStatusMeta(booking.status)

                const createdAt = booking.createdAt ? new Date(booking.createdAt) : null
                const preferredStart = booking.rfqData?.preferredStartDate
                  ? new Date(booking.rfqData.preferredStartDate)
                  : booking.scheduledStartDate
                  ? new Date(booking.scheduledStartDate)
                  : null

                const budgetLabel = formatBudget(booking)

                return (
                  <div
                    key={booking._id}
                    className="bg-gradient-to-r from-teal-50 via-sky-50 to-indigo-50 rounded-2xl p-[1px]"
                  >
                    <Card className="bg-white/90 backdrop-blur rounded-[1rem] shadow-sm">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {isProject ? (
                                <Package className="h-4 w-4 text-teal-500" />
                              ) : (
                                <Briefcase className="h-4 w-4 text-teal-500" />
                              )}
                              <CardTitle className="text-base font-semibold text-gray-900">
                                {title}
                              </CardTitle>
                            </div>
                            <CardDescription className="text-xs text-gray-500">
                              {isProject ? "Project booking" : "Professional booking"}
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
                            <Calendar className="h-3 w-3 text-teal-500" />
                            <span>
                              Start date:{" "}
                              <span className="font-medium">
                                {preferredStart.toLocaleDateString()}
                              </span>
                            </span>
                          </div>
                        )}

                        {createdAt && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span>
                              Requested on{" "}
                              <span className="font-medium">
                                {createdAt.toLocaleDateString()}
                              </span>
                            </span>
                          </div>
                        )}

                        {budgetLabel && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
                              €
                            </span>
                            <span>
                              Budget:{" "}
                              <span className="font-medium">{budgetLabel}</span>
                            </span>
                          </div>
                        )}

                        <div className="pt-2">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/bookings/${booking._id}`)}
                              className="text-xs bg-white/80 border-teal-200 hover:border-teal-300"
                            >
                              View details
                            </Button>
                            {booking.professional?._id && (
                              <StartChatButton
                                professionalId={booking.professional._id}
                                bookingId={booking._id}
                                label="Chat"
                                size="sm"
                                className="text-xs bg-white/80 border-teal-200 hover:border-teal-300"
                              />
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (user?.role === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto pt-20">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Crown className="h-8 w-8 text-yellow-500" />
                Admin Dashboard
              </h1>
              <p className="text-gray-600">Welcome back, {user?.name}! Manage your platform here.</p>
            </div>
            <Link
              className="text-pink-800 underline flex items-center gap-2"
              href='/admin/projects/approval'
            >
              Approve Projects
              {projectStats && projectStats.pendingProjects > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                  {projectStats.pendingProjects}
                </span>
              )}
            </Link>
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="loyalty">Loyalty System</TabsTrigger>
              <TabsTrigger value="approvals">Professional Approvals</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Quick Stats */}
                <Card
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => window.open('/admin/projects/approval', '_blank')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Briefcase className="h-4 w-4 text-blue-500" />
                      Pending Projects
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {isLoadingStats ? '...' : projectStats?.pendingProjects || 0}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Click to review</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-green-500" />
                      Total Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isLoadingStats ? '...' : loyaltyStats?.overallStats.totalCustomers || 0}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      Total Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${isLoadingStats ? '...' : (loyaltyStats?.overallStats.totalRevenue || 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-orange-500" />
                      Pending Professionals
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isLoadingStats ? '...' : approvalStats?.pending || 0}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-gray-500" />
                    Platform Settings
                  </CardTitle>
                  <CardDescription>Manage commission and platform-wide configuration</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => window.open('/admin/settings', '_blank')}
                    className="w-full bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Manage Platform Settings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="services" className="space-y-6">
              {/* Service Configuration Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-purple-500" />
                    Service Configuration Management
                  </CardTitle>
                  <CardDescription>Manage service offerings, pricing models, and requirements</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Configure and manage all service types, pricing models, project types, included items, and professional requirements for your platform.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button
                      onClick={() => window.open('/admin/services', '_blank')}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      <Package className="h-4 w-4 mr-2" />
                      Manage Service Configurations
                    </Button>
                    <Button
                      onClick={() => window.open('/admin/services', '_blank')}
                      variant="outline"
                      className="w-full border-purple-200 hover:bg-purple-50"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add New Service
                    </Button>
                  </div>

                  <div className="mt-6 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-100">
                    <h4 className="font-semibold mb-2 text-purple-900">What you can manage:</h4>
                    <ul className="text-sm space-y-1 text-purple-800">
                      <li>• Service categories and types</li>
                      <li>• Pricing models and certification requirements</li>
                      <li>• Project types (New Built, Extension, Refurbishment, etc.)</li>
                      <li>• Included items and professional input fields</li>
                      <li>• Extra options and conditions/warnings</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="loyalty" className="space-y-6">
              {/* Loyalty System Management */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-purple-500" />
                      Loyalty Tier Distribution
                    </CardTitle>
                    <CardDescription>Customer distribution across loyalty tiers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingStats ? (
                      <div className="text-center py-8">Loading...</div>
                    ) : (
                      <div className="space-y-3">
                        {loyaltyStats?.tierDistribution.map((tier) => (
                          <div key={tier._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <span className="font-medium">{tier._id || 'Bronze'}</span>
                              <p className="text-sm text-gray-600">{tier.count} customers</p>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">${tier.totalSpent.toLocaleString()}</div>
                              <div className="text-sm text-gray-600">{tier.totalPoints} points</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5 text-gray-500" />
                      Loyalty Configuration
                    </CardTitle>
                    <CardDescription>Manage loyalty system settings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={() => window.open('/admin/loyalty/config', '_blank')} className="w-full">
                      Configure Loyalty Tiers
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const token = getAuthToken()
                        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/loyalty/recalculate`, {
                          method: 'POST',
                          credentials: 'include',
                          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                        }).then(() => fetchAdminData())
                      }}
                      className="w-full"
                    >
                      Recalculate All Tiers
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="approvals" className="space-y-6">
              {/* Professional Approvals */}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-orange-500" />
                      Pending
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.pending || 0}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Approved
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.approved || 0}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Rejected
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.rejected || 0}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Suspended
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.suspended || 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Professional Management
                  </CardTitle>
                  <CardDescription>Review and approve professional applications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button 
                      onClick={() => window.open('/admin/professionals?status=pending', '_blank')}
                      className="w-full"
                      variant={approvalStats?.pending ? 'default' : 'outline'}
                    >
                      Review Pending ({approvalStats?.pending || 0})
                    </Button>
                    <Button 
                      onClick={() => window.open('/admin/professionals?status=approved', '_blank')}
                      variant="outline"
                      className="w-full"
                    >
                      View Approved ({approvalStats?.approved || 0})
                    </Button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button 
                      onClick={() => window.open('/admin/professionals?status=rejected', '_blank')}
                      variant="outline"
                      className="w-full"
                    >
                      View Rejected ({approvalStats?.rejected || 0})
                    </Button>
                    <Button 
                      onClick={() => window.open('/admin/professionals?status=suspended', '_blank')}
                      variant="outline"
                      className="w-full"
                    >
                      View Suspended ({approvalStats?.suspended || 0})
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payments" className="space-y-6">
              {/* Payment Oversight */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-blue-500" />
                    Payment Oversight
                  </CardTitle>
                  <CardDescription>Monitor and manage all platform payments</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    View all payment transactions, track escrow status, monitor transfers to professionals, and handle refunds.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button
                      onClick={() => window.open('/admin/payments', '_blank')}
                      className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      View All Payments
                    </Button>
                    <Button
                      onClick={() => window.open('/admin/payments?status=authorized', '_blank')}
                      variant="outline"
                      className="w-full border-amber-200 hover:bg-amber-50"
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      View Authorized (Escrow)
                    </Button>
                  </div>

                  <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-100">
                    <h4 className="font-semibold mb-2 text-blue-900">Payment Features:</h4>
                    <ul className="text-sm space-y-1 text-blue-800">
                      <li>• View all payment transactions and statuses</li>
                      <li>• Monitor funds held in escrow (authorized)</li>
                      <li>• Track completed payouts to professionals</li>
                      <li>• Review refunds and partial refunds</li>
                      <li>• Search by booking number or Stripe ID</li>
                      <li>• Filter by payment status</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </div>
      </div>
    )
  }

  // Professional dashboard
  if (user?.role === 'professional') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-6xl mx-auto pt-20">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Briefcase className="h-8 w-8 text-blue-600" />
                Professional Dashboard
              </h1>
              <p className="text-gray-600">Manage your services and projects, {user?.name}!</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Create New Project Card */}
            <Card className="border-2 border-dashed border-blue-300 hover:border-blue-500 transition-colors">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 text-blue-600">
                  <Plus className="h-6 w-6" />
                  Create New Project
                </CardTitle>
                <CardDescription>Start offering a new service to customers</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button
                  onClick={() => router.push('/projects/create')}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  Create Project
                </Button>
              </CardContent>
            </Card>

            {/* Profile Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>Your professional account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{user?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{user?.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-gray-500" />
                  <span className="text-sm capitalize">{user?.role}</span>
                </div>
              </CardContent>
            </Card>

            {/* Verification Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Verification Status
                </CardTitle>
                <CardDescription>Professional verification progress</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Email Verification</span>
                  <span className={`text-sm font-medium ${user?.isEmailVerified ? 'text-green-600' : 'text-red-600'}`}>
                    {user?.isEmailVerified ? 'Verified' : 'Not Verified'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Phone Verification</span>
                  <span className={`text-sm font-medium ${user?.isPhoneVerified ? 'text-green-600' : 'text-red-600'}`}>
                    {user?.isPhoneVerified ? 'Verified' : 'Not Verified'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks for professionals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  onClick={() => router.push('/projects/create')}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/profile')}
                  className="flex items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/professional/projects/manage')}
                  className="flex items-center gap-2"
                >
                  <Briefcase className="h-4 w-4" />
                  Manage Projects
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/dashboard/payments')}
                  className="flex items-center gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  Payments & Stripe
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Account Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Account Stats
              </CardTitle>
              <CardDescription>Your professional account activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Professional Since</span>
                <span className="text-sm font-medium">
                  {new Date(user?.createdAt || '').toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Last Updated</span>
                <span className="text-sm font-medium">
                  {new Date(user?.updatedAt || '').toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Bookings Section */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Client Bookings & Quotes
              </CardTitle>
              <CardDescription>Manage bookings from customers who booked your projects</CardDescription>
            </CardHeader>
            <CardContent>
              {bookingsLoading && (
                <div className="text-center py-8 text-gray-500">
                  Loading bookings...
                </div>
              )}

              {!bookingsLoading && bookingsError && (
                <div className="text-center py-4 text-red-600">
                  {bookingsError}
                </div>
              )}

              {!bookingsLoading && !bookingsError && bookings.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No bookings yet. When customers book your projects, they&apos;ll appear here.
                </div>
              )}

              {!bookingsLoading && !bookingsError && bookings.length > 0 && (
                <div className="space-y-3">
                  {bookings.slice(0, 5).map((booking) => {
                    const isProject = booking.bookingType === "project"
                    const title =
                      (isProject ? booking.project?.title : booking.professional?.businessInfo?.companyName) ||
                      booking.rfqData?.serviceType ||
                      "Booking"

                    const statusLabel = booking.status.replace(/_/g, " ")
                    const statusClasses =
                      BOOKING_STATUS_STYLES[booking.status] ||
                      "bg-slate-50 text-slate-700 border border-slate-100"

                    return (
                      <div
                        key={booking._id}
                        className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {isProject ? (
                                <Package className="h-4 w-4 text-indigo-500" />
                              ) : (
                                <Briefcase className="h-4 w-4 text-indigo-500" />
                              )}
                              <h3 className="font-semibold text-sm">{title}</h3>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                              <span>Customer: {booking.customer?.name}</span>
                              {booking.createdAt && (
                                <span>• {new Date(booking.createdAt).toLocaleDateString()}</span>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize ${statusClasses}`}
                            >
                              {statusLabel}
                            </Badge>
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
                            {booking.status === 'rfq' && (
                              <Button
                                size="sm"
                                onClick={() => router.push(`/bookings/${booking._id}`)}
                                className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                Quote
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {bookings.length > 5 && (
                    <div className="text-center pt-2">
                      <p className="text-xs text-gray-500">
                        Showing 5 of {bookings.length} bookings
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="mt-8 flex gap-4">
            {(!user?.isEmailVerified || !user?.isPhoneVerified) && (
              <Button onClick={() => router.push('/verify-phone')}>
                Complete Verification
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Regular user dashboard (fallback)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto pt-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user?.name}!</h1>
          <p className="text-gray-600">Here&apos;s your dashboard overview</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* User Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>Your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500" />
                <span className="text-sm">{user?.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-500" />
                <span className="text-sm">{user?.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-500" />
                <span className="text-sm capitalize">{user?.role}</span>
              </div>
            </CardContent>
          </Card>

          {/* Verification Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Verification Status
              </CardTitle>
              <CardDescription>Account verification progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Email Verification</span>
                <span className={`text-sm font-medium ${user?.isEmailVerified ? "text-green-600" : "text-red-600"}`}>
                  {user?.isEmailVerified ? "Verified" : "Not Verified"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Phone Verification</span>
                <span className={`text-sm font-medium ${user?.isPhoneVerified ? "text-green-600" : "text-red-600"}`}>
                  {user?.isPhoneVerified ? "Verified" : "Not Verified"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Account Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Account Stats
              </CardTitle>
              <CardDescription>Your account activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Member Since</span>
                <span className="text-sm font-medium">
                  {new Date(user?.createdAt || "").toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Last Updated</span>
                <span className="text-sm font-medium">
                  {new Date(user?.updatedAt || "").toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4">
          {(!user?.isEmailVerified || !user?.isPhoneVerified) && (
            <Button onClick={() => router.push("/verify-phone")}>
              Complete Verification
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
