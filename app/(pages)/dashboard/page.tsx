'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { User, Mail, Phone, Shield, Calendar, Crown, Settings, TrendingUp, Users, Award, CheckCircle, XCircle, Clock, AlertTriangle, Plus, Briefcase, Package, CreditCard, FileText, Star, Gift } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { getAuthToken } from "@/lib/utils"
import ReferralCard from "@/components/dashboard/ReferralCard"
import CustomerDashboard from "@/components/dashboard/CustomerDashboard"
import { type BookingStatus, getBookingStatusMeta, getBookingTitle } from "@/lib/dashboardBookingHelpers"
import { getProfessionalActionItems } from "@/lib/actionNeededHelpers"
import { Skeleton } from "@/components/ui/skeleton"

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

interface WarrantyAnalytics {
  window?: {
    lastDays?: number
  }
  summary?: {
    totalClaims?: number
    totalEscalated?: number
    totalClosed?: number
    avgResolutionHours?: number
  }
  flaggedProfessionals?: Array<{
    professionalId: string
    claimsCount: number
    escalatedCount: number
    completedBookings: number
    claimRate: number
  }>
}


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
  scheduledExecutionEndDate?: string
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


export default function DashboardPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const [loyaltyStats, setLoyaltyStats] = useState<LoyaltyStats | null>(null)
  const [approvalStats, setApprovalStats] = useState<ApprovalStats | null>(null)
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null)
  const [warrantyAnalytics, setWarrantyAnalytics] = useState<WarrantyAnalytics | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState<string | null>(null)

  const actionItems = useMemo(() => getProfessionalActionItems(bookings), [bookings])

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

  // Fetch bookings for professional dashboard only (CustomerDashboard fetches its own)
  useEffect(() => {
    if (!user || !isAuthenticated) return
    if (user.role !== "professional") return

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

        const allBookings: typeof bookings = []
        let page = 1
        const limit = 50

        while (true) {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings?page=${page}&limit=${limit}`,
            {
              credentials: "include",
              headers
            }
          )
          const data = await response.json()

          if (!response.ok || !data.success) {
            if (allBookings.length === 0) {
              setBookingsError(data.msg || "Failed to load your bookings.")
            }
            break
          }

          const incoming = Array.isArray(data.bookings) ? data.bookings : []
          allBookings.push(...incoming)

          const totalPages = data.pagination?.totalPages ?? 1
          if (page >= totalPages || incoming.length < limit) break
          page++
        }

        setBookings(allBookings)
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

      // Fetch warranty analytics separately so its failure doesn't block other cards
      try {
        const warrantyResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/admin/analytics`,
          fetchOptions
        )
        if (warrantyResponse.ok) {
          const warrantyData = await warrantyResponse.json()
          if (warrantyData.success) {
            setWarrantyAnalytics(warrantyData.data || null)
          } else {
            console.error('[Dashboard] Warranty analytics returned success: false', warrantyData.msg)
          }
        }
      } catch (warrantyErr) {
        console.error('[Dashboard] Failed to fetch warranty analytics:', warrantyErr)
      }

    } catch (error) {
      console.error('Failed to fetch admin data:', error)
    } finally {
      setIsLoadingStats(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
        <div className="max-w-6xl mx-auto pt-20 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-10 w-32 rounded-lg" />
              <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
          </div>
          {/* Stats Cards Skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
          {/* Content Cards Skeleton */}
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2].map(i => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-60" />
                {[1, 2, 3].map(j => (
                  <div key={j} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  // Customer dashboard - delegated to CustomerDashboard component
  if (user?.role === "customer") {
    return <CustomerDashboard />
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
              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
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

                <Card
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => window.open('/admin/warranty-claims', '_blank')}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                      Warranty Claims
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-rose-600">
                      {isLoadingStats ? '...' : warrantyAnalytics?.summary?.totalClaims || 0}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Escalated: {isLoadingStats ? '...' : warrantyAnalytics?.summary?.totalEscalated || 0}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-purple-500" />
                    Referral Program
                  </CardTitle>
                  <CardDescription>Configure rewards, view analytics, and manage referrals</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => window.open('/admin/referral', '_blank')}
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900"
                  >
                    <Gift className="h-4 w-4 mr-2" />
                    Manage Referral Program
                  </Button>
                </CardContent>
              </Card>

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

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                    Warranty Claims Oversight
                  </CardTitle>
                  <CardDescription>Track claim volume, escalations, and flagged professionals</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Claims (window)</p>
                      <p className="text-lg font-semibold">{warrantyAnalytics?.summary?.totalClaims || 0}</p>
                    </div>
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Avg resolution</p>
                      <p className="text-lg font-semibold">
                        {Number(warrantyAnalytics?.summary?.avgResolutionHours || 0).toFixed(1)}h
                      </p>
                    </div>
                    <div className="rounded-lg border bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Flagged professionals</p>
                      <p className="text-lg font-semibold">{warrantyAnalytics?.flaggedProfessionals?.length || 0}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => window.open('/admin/warranty-claims', '_blank')}
                    className="w-full bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-700 hover:to-orange-700"
                  >
                    Open Warranty Claims Dashboard
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
                      <div className="space-y-3 py-4">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="flex items-center gap-3">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-3 flex-1 rounded-full" />
                            <Skeleton className="h-4 w-8" />
                          </div>
                        ))}
                      </div>
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
              <p className="text-gray-600">Manage your profile, projects, bookings, and quotes, {user?.name}.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">

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
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
                  onClick={() => router.push('/dashboard/bookings')}
                  className="flex items-center gap-2"
                >
                  <Package className="h-4 w-4" />
                  Manage Bookings
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/dashboard/quotes')}
                  className="flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Manage Quotes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/dashboard/payments')}
                  className="flex items-center gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  Payments & Stripe
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/professional/${user?._id}`)}
                  className="flex items-center gap-2"
                >
                  <Star className="h-4 w-4" />
                  My Reviews
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/dashboard/warranty-claims')}
                  className="flex items-center gap-2"
                >
                  <Shield className="h-4 w-4" />
                  Warranty Claims
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Referral Card */}
          <ReferralCard />

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

          {/* Action Needed Section */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Action Needed
              </CardTitle>
              <CardDescription>Quotations and bookings that are overdue or need your attention</CardDescription>
            </CardHeader>
            <CardContent>
              {bookingsLoading && (
                <div className="space-y-3 py-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-4 py-2">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              )}

              {!bookingsLoading && bookingsError && (
                <div className="text-center py-4 text-red-600">
                  {bookingsError}
                </div>
              )}

              {!bookingsLoading && !bookingsError && actionItems.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No actions needed right now. You&apos;re all caught up!
                </div>
              )}

              {!bookingsLoading && !bookingsError && actionItems.length > 0 && (
                <div className="space-y-3">
                  {actionItems.map((item) => {
                    const isProject = item.booking.bookingType === "project"
                    const title = getBookingTitle(item.booking)
                    const { label: statusLabel, className: statusClasses } = getBookingStatusMeta(item.booking.status)
                    const severityClasses = item.severity === "urgent"
                      ? "border-red-200 bg-red-50/50"
                      : "border-amber-200 bg-amber-50/50"

                    return (
                      <div
                        key={item.booking._id}
                        className={`border rounded-lg p-4 transition-colors ${severityClasses}`}
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
                              <span>Customer: {item.booking.customer?.name || "Unknown"}</span>
                              {item.booking.createdAt && (
                                <span>• {new Date(item.booking.createdAt).toLocaleDateString()}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-xs capitalize ${statusClasses}`}
                              >
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
                              onClick={() => router.push(`/bookings/${item.booking._id}`)}
                              className="text-xs"
                            >
                              View
                            </Button>
                            {item.booking.status === 'rfq' && (
                              <Button
                                size="sm"
                                onClick={() => router.push(`/bookings/${item.booking._id}?action=quote`)}
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
