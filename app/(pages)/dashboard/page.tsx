'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { User, Mail, Phone, Shield, Calendar, Crown, Settings, TrendingUp, Users, Award, CheckCircle, XCircle, Clock, AlertTriangle, Plus, Briefcase, Package, CreditCard, FileText, Star, Gift, Play, Loader2, Info, MessageSquareWarning, EyeOff, Heart, LifeBuoy, Ticket, BarChart3, Ban, AlertOctagon, Link2, MessageSquare, Megaphone } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { getAuthToken } from "@/lib/utils"
import CustomerDashboard from "@/components/dashboard/CustomerDashboard"
import FavoritesWidget from "@/components/dashboard/FavoritesWidget"
import { type BookingStatus, getBookingStatusMeta, getBookingTitle, isProjectBooking } from "@/lib/dashboardBookingHelpers"
import { getProfessionalActionItems, type ProfessionalActionItemKey } from "@/lib/actionNeededHelpers"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useAdminAccess } from "@/hooks/useAdminAccess"
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/adminRbac"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { useTranslations } from "next-intl"

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
    username?: string
  }
}

interface WarrantyClaimAction {
  _id: string
  status: string
  claimNumber: string
  booking?: {
    _id?: string
    bookingNumber?: string
  } | null
  proposal?: {
    resolveByDate?: string
    proposedScheduleAt?: string
  }
}

type WarrantyActionLabelKey =
  | "actionNeeded.acceptWarranty"
  | "actionNeeded.confirmWarrantyResolve"
  | "actionNeeded.trackWarrantyResolve"

interface WarrantyDashboardAction {
  id: string
  bookingId: string
  labelKey: WarrantyActionLabelKey
  severity: "warning" | "urgent"
}

const ADMIN_TOOL_LABELS = {
  emailCampaigns: "adminTools.emailCampaigns",
  cms: "adminTools.cmsContent",
  announcements: "adminTools.siteAnnouncements",
  supportChat: "adminTools.supportChat",
  customers: "adminTools.customers",
  bookings: "adminTools.bookings",
  disputes: "adminTools.disputes",
  cancellationRequests: "adminTools.cancellationRequests",
  warrantyClaims: "adminTools.warrantyClaims",
  supportTickets: "adminTools.supportTickets",
  discountCodes: "adminTools.discountCodes",
  referrals: "adminTools.referrals",
  backlinks: "adminTools.backlinks",
  favorites: "adminTools.favorites",
  kpi: "adminTools.kpiReports",
  auditLogs: "adminTools.auditLogs",
  emailLogs: "adminTools.emailLogs",
} as const


export default function DashboardPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const { can, canAccessPath, adminRole } = useAdminAccess()
  const t = useTranslations("dashboard")
  const { intl } = useFormatLocale()
  const { formatMoney } = useCurrency()

  const bookingStatusLabel = (status?: string) => {
    switch (status) {
      case "rfq": return t("status.rfq")
      case "rfq_accepted": return t("status.rfqAccepted")
      case "draft_quote": return t("status.draftQuote")
      case "quoted": return t("status.quoted")
      case "quote_accepted": return t("status.quoteAccepted")
      case "quote_rejected": return t("status.quoteRejected")
      case "payment_pending": return t("status.paymentPending")
      case "booked": return t("status.booked")
      case "rescheduling_requested": return t("status.reschedulingRequested")
      case "in_progress": return t("status.inProgress")
      case "professional_completed": return t("status.professionalCompleted")
      case "completed": return t("status.completed")
      case "cancelled": return t("status.cancelled")
      case "refunded": return t("status.refunded")
      case "dispute": return t("status.dispute")
      default: return status ? status.replace(/_/g, " ") : t("status.unknown")
    }
  }

  const actionItemLabel = (key: ProfessionalActionItemKey) => {
    switch (key) {
      case "acceptOrDeclineRfq": return t("actionNeeded.acceptOrDeclineRfq")
      case "confirmStart": return t("actionNeeded.confirmStart")
      case "rescheduleDecision": return t("actionNeeded.rescheduleDecision")
      case "confirmCompletion": return t("actionNeeded.confirmCompletion")
      case "disputeResponse": return t("actionNeeded.disputeResponse")
    }
  }

  const openAdmin = (path: string) => {
    const pathOnly = path.split('?')[0]
    if (!canAccessPath(pathOnly)) {
      toast.error(t('errors.adminAreaForbidden'))
      return
    }
    window.open(path, '_blank', 'noopener,noreferrer')
  }
  const [loyaltyStats, setLoyaltyStats] = useState<LoyaltyStats | null>(null)
  const [approvalStats, setApprovalStats] = useState<ApprovalStats | null>(null)
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null)
  const [warrantyAnalytics, setWarrantyAnalytics] = useState<WarrantyAnalytics | null>(null)
  const [isRunningWarrantyCheck, setIsRunningWarrantyCheck] = useState(false)
  const [isRunningRfqCheck, setIsRunningRfqCheck] = useState(false)
  const [isRunningNotifReminders, setIsRunningNotifReminders] = useState(false)
  const [isRunningAutoAccept, setIsRunningAutoAccept] = useState(false)
  const [isRecalculatingProfessionalLevels, setIsRecalculatingProfessionalLevels] = useState(false)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaimAction[]>([])
  const [warrantyClaimsLoading, setWarrantyClaimsLoading] = useState(false)
  const [warrantyClaimsError, setWarrantyClaimsError] = useState<string | null>(null)
  const canViewAdminOverview = can('dashboard.overview')
  const canManageLoyalty = can('loyalty.manage')
  const canApproveProfessionals = can('professionals.approve')
  const canApproveProjects = can('projects.approve')
  const canManageWarranty = can('warranty.manage')
  const canManageServices = can('services.manage')
  const canManagePayments = can('payments.manage')
  const canRunMaintenance = can('maintenance.run')
  const adminToolLinks = ([
    { path: '/admin/campaigns', key: 'emailCampaigns' },
    { path: '/admin/cms', key: 'cms' },
    { path: '/admin/site-announcements', key: 'announcements' },
    { path: '/admin/chat', key: 'supportChat' },
    { path: '/admin/customers', key: 'customers' },
    { path: '/admin/bookings', key: 'bookings' },
    { path: '/admin/disputes', key: 'disputes' },
    { path: '/admin/cancellation-requests', key: 'cancellationRequests' },
    { path: '/admin/warranty-claims', key: 'warrantyClaims' },
    { path: '/admin/support', key: 'supportTickets' },
    { path: '/admin/discount-codes', key: 'discountCodes' },
    { path: '/admin/referral', key: 'referrals' },
    { path: '/admin/backlinks', key: 'backlinks' },
    { path: '/admin/favorites', key: 'favorites' },
    { path: '/admin/kpi', key: 'kpi' },
    { path: '/admin/audit-logs', key: 'auditLogs' },
    { path: '/admin/email-logs', key: 'emailLogs' },
  ] as const).filter(({ path }) => canAccessPath(path))
  const defaultAdminTab = canViewAdminOverview
    ? 'overview'
    : canManageServices
      ? 'services'
      : canManageLoyalty
        ? 'loyalty'
        : canApproveProfessionals
          ? 'approvals'
          : canManagePayments
            ? 'payments'
            : adminToolLinks.length > 0
              ? 'tools'
              : undefined

  const actionItems = useMemo(() => getProfessionalActionItems(bookings), [bookings])
  const warrantyActionItems = useMemo<WarrantyDashboardAction[]>(() => {
    if (warrantyClaimsLoading || warrantyClaimsError) return []
    return warrantyClaims.flatMap<WarrantyDashboardAction>((claim) => {
      if (!claim.booking?._id) return []
      if (claim.status === "open") {
        return [{ id: claim._id, bookingId: claim.booking._id, labelKey: "actionNeeded.acceptWarranty" as const, severity: "urgent" as const }]
      }
      if (claim.status === "proposal_accepted") {
        const resolveAt = claim.proposal?.resolveByDate || claim.proposal?.proposedScheduleAt
        const overdue = resolveAt ? new Date(resolveAt).getTime() <= Date.now() : false
        return [{ id: claim._id, bookingId: claim.booking._id, labelKey: overdue ? "actionNeeded.confirmWarrantyResolve" as const : "actionNeeded.trackWarrantyResolve" as const, severity: overdue ? "urgent" as const : "warning" as const }]
      }
      return []
    })
  }, [warrantyClaims, warrantyClaimsError, warrantyClaimsLoading])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login?redirect=/dashboard')
    }
  }, [isAuthenticated, loading, router])

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
              setBookingsError(data.msg || t("errors.loadBookings"))
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
        setBookingsError(t("errors.loadBookings"))
      } finally {
        setBookingsLoading(false)
      }
    }

    fetchBookings()
  }, [user, isAuthenticated, t])

  useEffect(() => {
    if (!user || !isAuthenticated || user.role !== "professional") return
    const loadClaims = async () => {
      setWarrantyClaimsLoading(true)
      setWarrantyClaimsError(null)
      try {
        const token = getAuthToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/warranty-claims/my?limit=50`, {
          credentials: "include",
          headers,
        })
        const payload = await response.json()
        if (response.ok && payload.success) {
          setWarrantyClaims(payload.data?.claims || [])
          return
        }
        setWarrantyClaimsError(payload?.msg || t("errors.loadWarrantyClaims"))
      } catch (error) {
        console.error("Failed to load warranty claims:", error)
        setWarrantyClaimsError(t("errors.loadWarrantyClaims"))
      } finally {
        setWarrantyClaimsLoading(false)
      }
    }
    void loadClaims()
  }, [user, isAuthenticated, t])

  const fetchAdminData = useCallback(async () => {
    setIsLoadingStats(true)
    if (!canManageLoyalty) setLoyaltyStats(null)
    if (!canApproveProfessionals) setApprovalStats(null)
    if (!canApproveProjects) setProjectStats(null)
    if (!canManageWarranty) setWarrantyAnalytics(null)

    try {
      // Get token for Authorization header fallback
      const token = getAuthToken()
      const fetchOptions: RequestInit = {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      }

      const [loyaltyResponse, approvalResponse, projectsResponse] = await Promise.all([
        canManageLoyalty
          ? fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/loyalty/analytics`, fetchOptions)
          : Promise.resolve(null),
        canApproveProfessionals
          ? fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/stats/approvals`, fetchOptions)
          : Promise.resolve(null),
        canApproveProjects
          ? fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/pending`, fetchOptions)
          : Promise.resolve(null),
      ])

      if (loyaltyResponse?.ok) {
        const loyaltyData = await loyaltyResponse.json()
        setLoyaltyStats(loyaltyData.data)
      }

      if (approvalResponse?.ok) {
        const approvalData = await approvalResponse.json()
        setApprovalStats(approvalData.data.stats)
      }

      if (projectsResponse?.ok) {
        const projectsData = await projectsResponse.json()
        setProjectStats({ pendingProjects: projectsData.length })
      }

      // Fetch warranty analytics separately so its failure doesn't block other cards
      if (canManageWarranty) {
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
      }

    } catch (error) {
      console.error('Failed to fetch admin data:', error)
    } finally {
      setIsLoadingStats(false)
    }
  }, [canApproveProfessionals, canApproveProjects, canManageLoyalty, canManageWarranty])

  // Fetch only the admin data represented by the current permission pack.
  useEffect(() => {
    if (user?.role === 'admin') {
      void fetchAdminData()
    }
  }, [fetchAdminData, user?.role])

  const runSchedulerCheck = async (type: 'warranty' | 'rfq' | 'notif' | 'autoaccept') => {
    if (!canRunMaintenance) {
      toast.error(t('errors.maintenanceForbidden'))
      return
    }
    const loadingMap = {
      warranty: setIsRunningWarrantyCheck,
      rfq: setIsRunningRfqCheck,
      notif: setIsRunningNotifReminders,
      autoaccept: setIsRunningAutoAccept,
    } as const
    const endpointMap = {
      warranty: 'run-warranty-checks',
      rfq: 'run-rfq-checks',
      notif: 'run-notification-reminders',
      autoaccept: 'run-completion-auto-accept',
    } as const
    const jobLabel = t(`maintenance.jobs.${type}`)
    const setLoading = loadingMap[type]
    const endpoint = endpointMap[type]
    setLoading(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/${endpoint}`,
        { method: 'POST', credentials: 'include', headers }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || t('errors.runChecksFailed', { job: jobLabel }))
      }
      const d = payload.data || {}
      if (type === 'warranty') {
        const parts: string[] = []
        if (d.escalated) parts.push(t('maintenance.toast.escalated', { count: d.escalated }))
        if (d.closed) parts.push(t('maintenance.toast.autoClosed', { count: d.closed }))
        if (d.errors?.length) parts.push(t('maintenance.toast.errors', { count: d.errors.length }))
        toast.success(parts.length ? t('maintenance.toast.warrantySummary', { details: parts.join(', ') }) : t('maintenance.toast.warrantyNone'))
      } else if (type === 'rfq') {
        const parts: string[] = []
        if (d.cancelled) parts.push(t('maintenance.toast.cancelled', { count: d.cancelled }))
        if (d.remindersSent) parts.push(t('maintenance.toast.remindersSent', { count: d.remindersSent }))
        if (d.expiredQuotationsFound) parts.push(t('maintenance.toast.expiredQuotations', { count: d.expiredQuotationsFound }))
        if (d.errors?.length) parts.push(t('maintenance.toast.errors', { count: d.errors.length }))
        toast.success(parts.length ? t('maintenance.toast.rfqSummary', { details: parts.join(', ') }) : t('maintenance.toast.rfqNone'))
      } else if (type === 'notif') {
        const parts: string[] = []
        for (const [key, val] of Object.entries(d)) {
          if (key === 'errors') continue
          if (typeof val === 'number' && val > 0) parts.push(`${key}: ${val}`)
        }
        if (d.errors?.length) parts.push(t('maintenance.toast.errors', { count: d.errors.length }))
        toast.success(parts.length ? t('maintenance.toast.remindersSummary', { details: parts.join(', ') }) : t('maintenance.toast.remindersNone'))
      } else {
        const parts: string[] = []
        if (d.autoAccepted) parts.push(t('maintenance.toast.autoAccepted', { count: d.autoAccepted }))
        if (d.skipped) parts.push(t('maintenance.toast.skipped', { count: d.skipped }))
        if (d.errors?.length) parts.push(t('maintenance.toast.errors', { count: d.errors.length }))
        toast.success(parts.length ? t('maintenance.toast.autoAcceptSummary', { details: parts.join(', ') }) : t('maintenance.toast.autoAcceptNone'))
      }
      await fetchAdminData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.runChecksFailed', { job: jobLabel }))
    } finally {
      setLoading(false)
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.96),_rgba(238,242,255,0.92)_38%,_rgba(224,231,255,0.88)_100%)] p-4">
        <div className="max-w-7xl mx-auto pt-20">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Crown className="h-8 w-8 text-yellow-500" />
                {t("admin.title")}
              </h1>
              <p className="text-gray-600">{t("admin.welcome", { name: user?.name ?? "" })}</p>
              {adminRole && (
                <p className="mt-1 text-sm text-indigo-700">
                  {t("admin.role", { role: ADMIN_ROLE_LABELS[adminRole as AdminRole] || adminRole })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              {can('staff.manage') && (
                <Link
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  href="/admin/staff"
                >
                  <Users className="h-4 w-4" />
                  {t("admin.staffRoles")}
                </Link>
              )}
              {can('kpi.read') && (
                <Link
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                  href='/admin/kpi'
                >
                  <BarChart3 className="h-4 w-4" />
                  {t("admin.viewKpi")}
                </Link>
              )}
              {canApproveProjects && (
                <Link
                  className="text-pink-800 underline flex items-center gap-2"
                  href='/admin/projects/approval'
                >
                  {t("admin.approveProjects")}
                  {projectStats && projectStats.pendingProjects > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                      {projectStats.pendingProjects}
                    </span>
                  )}
                </Link>
              )}
            </div>
          </div>

          <Tabs defaultValue={defaultAdminTab} className="space-y-6">
            <TabsList className="grid h-auto w-full grid-cols-1 gap-3 bg-transparent p-0 sm:grid-cols-2 xl:grid-cols-5">
              {canViewAdminOverview && (
              <TabsTrigger
                value="overview"
                className="group min-h-[88px] justify-start rounded-2xl border-0 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 px-5 py-4 text-left text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl data-[state=active]:ring-4 data-[state=active]:ring-fuchsia-200/70 data-[state=active]:shadow-fuchsia-200/80 data-[state=active]:shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex rounded-xl bg-white/20 p-2.5 shadow-sm backdrop-blur-sm">
                    <Crown className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{t("admin.tabs.overview.title")}</div>
                    <div className="mt-0.5 text-xs leading-5 text-white/85">{t("admin.tabs.overview.description")}</div>
                  </div>
                </div>
              </TabsTrigger>
              )}
              {canManageServices && (
                <TabsTrigger
                  value="services"
                  className="group min-h-[88px] justify-start rounded-2xl border-0 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 px-5 py-4 text-left text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl data-[state=active]:ring-4 data-[state=active]:ring-violet-200/70 data-[state=active]:shadow-violet-200/80 data-[state=active]:shadow-2xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded-xl bg-white/20 p-2.5 shadow-sm backdrop-blur-sm">
                      <Package className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">{t("admin.tabs.services.title")}</div>
                      <div className="mt-0.5 text-xs leading-5 text-white/85">{t("admin.tabs.services.description")}</div>
                    </div>
                  </div>
                </TabsTrigger>
              )}
              {canManageLoyalty && (
                <TabsTrigger
                  value="loyalty"
                  className="group min-h-[88px] justify-start rounded-2xl border-0 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 px-5 py-4 text-left text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl data-[state=active]:ring-4 data-[state=active]:ring-amber-200/70 data-[state=active]:shadow-amber-200/80 data-[state=active]:shadow-2xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded-xl bg-white/20 p-2.5 shadow-sm backdrop-blur-sm">
                      <Award className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">{t("admin.tabs.loyalty.title")}</div>
                      <div className="mt-0.5 text-xs leading-5 text-white/85">{t("admin.tabs.loyalty.description")}</div>
                    </div>
                  </div>
                </TabsTrigger>
              )}
              {canApproveProfessionals && (
                <TabsTrigger
                  value="approvals"
                  className="group min-h-[88px] justify-start rounded-2xl border-0 bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-500 px-5 py-4 text-left text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl data-[state=active]:ring-4 data-[state=active]:ring-sky-200/70 data-[state=active]:shadow-sky-200/80 data-[state=active]:shadow-2xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded-xl bg-white/20 p-2.5 shadow-sm backdrop-blur-sm">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">{t("admin.tabs.approvals.title")}</div>
                      <div className="mt-0.5 text-xs leading-5 text-white/85">{t("admin.tabs.approvals.description")}</div>
                    </div>
                  </div>
                </TabsTrigger>
              )}
              {canManagePayments && (
                <TabsTrigger
                  value="payments"
                  className="group min-h-[88px] justify-start rounded-2xl border-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-4 text-left text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl data-[state=active]:ring-4 data-[state=active]:ring-emerald-200/70 data-[state=active]:shadow-emerald-200/80 data-[state=active]:shadow-2xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded-xl bg-white/20 p-2.5 shadow-sm backdrop-blur-sm">
                      <CreditCard className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">{t("admin.tabs.payments.title")}</div>
                      <div className="mt-0.5 text-xs leading-5 text-white/85">{t("admin.tabs.payments.description")}</div>
                    </div>
                  </div>
                </TabsTrigger>
              )}
              {adminToolLinks.length > 0 && (
                <TabsTrigger
                  value="tools"
                  className="group min-h-[88px] justify-start rounded-2xl border-0 bg-gradient-to-r from-slate-600 to-slate-800 px-5 py-4 text-left text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div>
                    <div className="font-semibold">{t("admin.tabs.tools.title")}</div>
                    <div className="mt-0.5 text-xs leading-5 text-white/85">{t("admin.tabs.tools.description")}</div>
                  </div>
                </TabsTrigger>
              )}
            </TabsList>

            {canViewAdminOverview && (
            <TabsContent value="overview" className="space-y-6">
              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
                {/* Quick Stats */}
                {canApproveProjects && (
                  <Card
                    className="cursor-pointer border-blue-100 bg-gradient-to-br from-white via-blue-50 to-indigo-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                    onClick={() => openAdmin('/admin/projects/approval')}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Briefcase className="h-4 w-4 text-blue-500" />
                        {t("admin.overview.pendingProjects")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-600">
                        {isLoadingStats ? '...' : projectStats?.pendingProjects || 0}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{t("admin.overview.clickToReview")}</p>
                    </CardContent>
                  </Card>
                )}

                {canManageLoyalty && (
                  <>
                    <Card className="border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-teal-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-green-500" />
                          {t("admin.overview.totalCustomers")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {isLoadingStats ? '...' : loyaltyStats?.overallStats.totalCustomers || 0}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-cyan-100 bg-gradient-to-br from-white via-cyan-50 to-sky-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                          {t("admin.overview.totalRevenue")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {isLoadingStats ? '...' : formatMoney(loyaltyStats?.overallStats.totalRevenue || 0)}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}

                {canApproveProfessionals && (
                  <Card className="border-amber-100 bg-gradient-to-br from-white via-amber-50 to-orange-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-orange-500" />
                        {t("admin.overview.pendingProfessionals")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {isLoadingStats ? '...' : approvalStats?.pending || 0}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {canManageWarranty && (
                  <Card
                    className="cursor-pointer border-rose-100 bg-gradient-to-br from-white via-rose-50 to-orange-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                    onClick={() => openAdmin('/admin/warranty-claims')}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-rose-500" />
                        {t("admin.overview.warrantyClaims")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-rose-600">
                        {isLoadingStats ? '...' : warrantyAnalytics?.summary?.totalClaims ?? '\u2014'}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("admin.overview.escalated", { value: String(isLoadingStats ? '...' : warrantyAnalytics?.summary?.totalEscalated ?? '\u2014') })}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {canAccessPath('/admin/referral') && (
              <Card className="border-purple-100 bg-gradient-to-br from-white via-purple-50 to-fuchsia-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-purple-500" />
                    {t("admin.overview.referral.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.referral.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-purple-100 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-purple-700">{t("admin.overview.referral.rewards")}</p>
                      <p className="text-sm font-semibold text-slate-900">{t("admin.overview.referral.rewardsValue")}</p>
                    </div>
                    <div className="rounded-xl border border-fuchsia-100 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-fuchsia-700">{t("admin.overview.referral.visibility")}</p>
                      <p className="text-sm font-semibold text-slate-900">{t("admin.overview.referral.visibilityValue")}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => openAdmin('/admin/referral')}
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900"
                  >
                    <Gift className="h-4 w-4 mr-2" />
                    {t("admin.overview.referral.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/backlinks') && (
              <Card className="border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-blue-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5 text-indigo-600" />
                    {t("admin.overview.backlinks.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.backlinks.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-indigo-100 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-indigo-700">{t("admin.overview.backlinks.rewards")}</p>
                      <p className="text-sm font-semibold text-slate-900">{t("admin.overview.backlinks.rewardsValue")}</p>
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-blue-700">{t("admin.overview.backlinks.moderation")}</p>
                      <p className="text-sm font-semibold text-slate-900">{t("admin.overview.backlinks.moderationValue")}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => openAdmin('/admin/backlinks')}
                    className="w-full bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-700 hover:to-blue-800"
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    {t("admin.overview.backlinks.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/reviews') && (
              <Card className="border-amber-100 bg-gradient-to-br from-white via-amber-50 to-rose-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquareWarning className="h-5 w-5 text-amber-600" />
                    {t("admin.overview.reviews.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.reviews.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-amber-200 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-amber-700">{t("admin.overview.reviews.moderation")}</p>
                      <p className="text-sm font-semibold text-slate-900">{t("admin.overview.reviews.moderationValue")}</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-rose-700">{t("admin.overview.reviews.impact")}</p>
                      <p className="text-sm font-semibold text-slate-900">{t("admin.overview.reviews.impactValue")}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {t("admin.overview.reviews.notice")}
                  </div>
                  <Button
                    onClick={() => openAdmin('/admin/reviews')}
                    className="w-full bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600"
                  >
                    <EyeOff className="h-4 w-4 mr-2" />
                    {t("admin.overview.reviews.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/favorites') && (
              <Card className="border-pink-100 bg-gradient-to-br from-white via-pink-50 to-purple-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5 text-pink-500" />
                    {t("admin.overview.favorites.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.favorites.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/favorites')}
                    className="w-full bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600"
                  >
                    <Heart className="h-4 w-4 mr-2" />
                    {t("admin.overview.favorites.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/settings') && (
              <Card className="border-slate-200 bg-gradient-to-br from-white via-slate-50 to-gray-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-gray-500" />
                    {t("admin.overview.settings.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.settings.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/settings')}
                    className="w-full bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {t("admin.overview.settings.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/cms') && (
              <Card className="border-rose-100 bg-gradient-to-br from-white via-rose-50 to-pink-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-rose-500" />
                    {t("admin.overview.cms.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.cms.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/cms')}
                    className="w-full bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 hover:from-rose-600 hover:via-pink-600 hover:to-orange-500"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {t("admin.overview.cms.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/support') && (
              <Card className="border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-blue-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LifeBuoy className="h-5 w-5 text-indigo-500" />
                    {t("admin.overview.supportTickets.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.supportTickets.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/support')}
                    className="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600"
                  >
                    <LifeBuoy className="h-4 w-4 mr-2" />
                    {t("admin.overview.supportTickets.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/chat') && (
              <Card className="border-sky-100 bg-gradient-to-br from-white via-sky-50 to-indigo-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-sky-600" />
                    {t("admin.overview.supportChat.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.supportChat.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/chat')}
                    className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {t("admin.overview.supportChat.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/discount-codes') && (
              <Card className="border-rose-100 bg-gradient-to-br from-white via-rose-50 to-orange-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ticket className="h-5 w-5 text-rose-500" />
                    {t("admin.overview.discountCodes.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.discountCodes.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/discount-codes')}
                    className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                  >
                    <Ticket className="h-4 w-4 mr-2" />
                    {t("admin.overview.discountCodes.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/campaigns') && (
              <Card className="border-violet-100 bg-gradient-to-br from-white via-violet-50 to-fuchsia-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-violet-500" />
                    {t("admin.overview.campaigns.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.campaigns.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/campaigns')}
                    className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {t("admin.overview.campaigns.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/site-announcements') && (
              <Card className="border-orange-100 bg-gradient-to-br from-white via-orange-50 to-amber-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-orange-500" />
                    {t("admin.overview.announcements.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.announcements.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/site-announcements')}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                  >
                    <Megaphone className="h-4 w-4 mr-2" />
                    {t("admin.overview.announcements.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/professionals/manage') && (
              <Card className="border-blue-100 bg-gradient-to-br from-white via-blue-50 to-cyan-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-blue-500" />
                    {t("admin.overview.professionals.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.professionals.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/professionals/manage')}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-700 hover:from-blue-700 hover:to-cyan-800"
                  >
                    <Briefcase className="h-4 w-4 mr-2" />
                    {t("admin.overview.professionals.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/customers') && (
              <Card className="border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-teal-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-emerald-500" />
                    {t("admin.overview.customers.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.customers.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/customers')}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {t("admin.overview.customers.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/warranty-claims') && (
              <Card className="border-rose-100 bg-gradient-to-br from-white via-rose-50 to-orange-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                    {t("admin.overview.warranty.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.warranty.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-rose-100 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-slate-500">{t("admin.overview.warranty.claimsWindow")}</p>
                      <p className="text-lg font-semibold">{warrantyAnalytics?.summary?.totalClaims ?? '\u2014'}</p>
                    </div>
                    <div className="rounded-xl border border-orange-100 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-slate-500">{t("admin.overview.warranty.avgResolution")}</p>
                      <p className="text-lg font-semibold">
                        {warrantyAnalytics?.summary?.avgResolutionHours != null
                          ? t("admin.overview.warranty.avgResolutionValue", { hours: Number(warrantyAnalytics.summary.avgResolutionHours).toFixed(1) })
                          : '\u2014'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-white/80 p-3 shadow-sm">
                      <p className="text-xs text-slate-500">{t("admin.overview.warranty.flagged")}</p>
                      <p className="text-lg font-semibold">{warrantyAnalytics?.flaggedProfessionals?.length ?? '\u2014'}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => openAdmin('/admin/warranty-claims')}
                    className="w-full bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-700 hover:to-orange-700"
                  >
                    {t("admin.overview.warranty.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/bookings') && (
              <Card className="border-blue-100 bg-gradient-to-br from-white via-blue-50 to-indigo-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    {t("admin.overview.bookings.title")}
                  </CardTitle>
                  <CardDescription>
                    {can('chat.support')
                      ? t(can('bookings.write') ? "admin.overview.bookings.descriptionBoth" : "admin.overview.bookings.descriptionChat")
                      : t(can('bookings.write') ? "admin.overview.bookings.descriptionWrite" : "admin.overview.bookings.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/bookings')}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800"
                  >
                    {t("admin.overview.bookings.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/disputes') && (
              <Card className="border-red-100 bg-gradient-to-br from-white via-red-50 to-amber-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    {t("admin.overview.disputes.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.disputes.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/disputes')}
                    className="w-full bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700"
                  >
                    {t("admin.overview.disputes.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/cancellation-requests') && (
              <Card className="border-amber-100 bg-gradient-to-br from-white via-amber-50 to-orange-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ban className="h-5 w-5 text-amber-600" />
                    {t("admin.overview.cancellations.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.cancellations.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/cancellation-requests')}
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                  >
                    {t("admin.overview.cancellations.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/chat-reports') && (
              <Card className="border-purple-100 bg-gradient-to-br from-white via-purple-50 to-pink-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertOctagon className="h-5 w-5 text-purple-600" />
                    {t("admin.overview.chatReports.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.chatReports.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/chat-reports')}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    {t("admin.overview.chatReports.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canAccessPath('/admin/audit-logs') && (
              <Card className="border-slate-200 bg-gradient-to-br from-white via-slate-50 to-zinc-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-slate-600" />
                    {t("admin.overview.auditLogs.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.overview.auditLogs.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => openAdmin('/admin/audit-logs')}
                    className="w-full bg-gradient-to-r from-slate-600 to-zinc-700 hover:from-slate-700 hover:to-zinc-800"
                  >
                    {t("admin.overview.auditLogs.manage")}
                  </Button>
                </CardContent>
              </Card>
              )}

              {canRunMaintenance && (
              <Card className="border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-blue-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5 text-indigo-500" />
                    {t("maintenance.title")}
                  </CardTitle>
                  <CardDescription>{t("maintenance.description")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      onClick={() => runSchedulerCheck('warranty')}
                      disabled={isRunningWarrantyCheck}
                      className="flex-1 border-rose-300 text-rose-700 hover:bg-rose-50"
                    >
                      {isRunningWarrantyCheck ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      {t("maintenance.warrantyButton")}
                    </Button>
                    <div className="relative group">
                      <Info className="h-4 w-4 text-slate-400 cursor-help" />
                      <div className="absolute left-1/2 -translate-x-1/2 top-6 z-50 hidden group-hover:block w-72 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-lg">
                        <p className="font-semibold text-slate-800 mb-1">{t("maintenance.whatDoesThisDo")}</p>
                        <ul className="space-y-1 list-disc pl-3">
                          <li>{t("maintenance.warrantyItem1")}</li>
                          <li>{t("maintenance.warrantyItem2")}</li>
                        </ul>
                        <p className="mt-2 text-slate-400">{t("maintenance.safeOverdue")}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      onClick={() => runSchedulerCheck('rfq')}
                      disabled={isRunningRfqCheck}
                      className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      {isRunningRfqCheck ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      {t("maintenance.rfqButton")}
                    </Button>
                    <div className="relative group">
                      <Info className="h-4 w-4 text-slate-400 cursor-help" />
                      <div className="absolute right-0 top-6 z-50 hidden group-hover:block w-72 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-lg">
                        <p className="font-semibold text-slate-800 mb-1">{t("maintenance.whatDoesThisDo")}</p>
                        <ul className="space-y-1 list-disc pl-3">
                          <li>{t("maintenance.rfqItem1")}</li>
                          <li>{t("maintenance.rfqItem2")}</li>
                          <li>{t("maintenance.rfqItem3")}</li>
                        </ul>
                        <p className="mt-2 text-slate-400">{t("maintenance.safeOverdue")}</p>
                      </div>
                    </div>
                  </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      onClick={() => runSchedulerCheck('notif')}
                      disabled={isRunningNotifReminders}
                      className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      {isRunningNotifReminders ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      {t("maintenance.notificationsButton")}
                    </Button>
                    <div className="relative group">
                      <button
                        type="button"
                        aria-label={t("maintenance.notificationsAria")}
                        aria-describedby="notif-reminders-help"
                        className="inline-flex rounded p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Info className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <div
                        id="notif-reminders-help"
                        role="tooltip"
                        className="absolute left-1/2 -translate-x-1/2 top-6 z-50 hidden group-hover:block group-focus-within:block w-72 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-lg"
                      >
                        <p className="font-semibold text-slate-800 mb-1">{t("maintenance.whatDoesThisDo")}</p>
                        <ul className="space-y-1 list-disc pl-3">
                          <li>{t("maintenance.notificationsItem1")}</li>
                          <li>{t("maintenance.notificationsItem2")}</li>
                          <li>{t("maintenance.notificationsItem3")}</li>
                        </ul>
                        <p className="mt-2 text-slate-400">{t("maintenance.safeTracking")}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      onClick={() => runSchedulerCheck('autoaccept')}
                      disabled={isRunningAutoAccept}
                      className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    >
                      {isRunningAutoAccept ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      {t("maintenance.autoAcceptButton")}
                    </Button>
                    <div className="relative group">
                      <button
                        type="button"
                        aria-label={t("maintenance.autoAcceptAria")}
                        aria-describedby="completion-autoaccept-help"
                        className="inline-flex rounded p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Info className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <div
                        id="completion-autoaccept-help"
                        role="tooltip"
                        className="absolute right-0 top-6 z-50 hidden group-hover:block group-focus-within:block w-72 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-lg"
                      >
                        <p className="font-semibold text-slate-800 mb-1">{t("maintenance.whatDoesThisDo")}</p>
                        <ul className="space-y-1 list-disc pl-3">
                          <li>{t("maintenance.autoAcceptItem1")}</li>
                          <li>{t("maintenance.autoAcceptItem2")}</li>
                        </ul>
                        <p className="mt-2 text-slate-400">{t("maintenance.safeEligible")}</p>
                      </div>
                    </div>
                  </div>
                  </div>
                </CardContent>
              </Card>
              )}
              </div>
            </TabsContent>
            )}

            {canManageServices && (
            <TabsContent value="services" className="space-y-6">
              {/* Service Configuration Management */}
              <Card className="border-purple-100 bg-gradient-to-br from-white via-purple-50 to-pink-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-purple-500" />
                    {t("admin.services.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.services.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("admin.services.intro")}
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button
                      onClick={() => openAdmin('/admin/services')}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      <Package className="h-4 w-4 mr-2" />
                      {t("admin.services.manage")}
                    </Button>
                    <Button
                      onClick={() => openAdmin('/admin/services')}
                      variant="outline"
                      className="w-full border-purple-200 hover:bg-purple-50"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t("admin.services.add")}
                    </Button>
                  </div>

                  <div className="mt-6 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-100">
                    <h4 className="font-semibold mb-2 text-purple-900">{t("admin.services.canManage")}</h4>
                    <ul className="text-sm space-y-1 text-purple-800">
                      <li>• {t("admin.services.item1")}</li>
                      <li>• {t("admin.services.item2")}</li>
                      <li>• {t("admin.services.item3")}</li>
                      <li>• {t("admin.services.item4")}</li>
                      <li>• {t("admin.services.item5")}</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            )}

            {canManageLoyalty && (
            <TabsContent value="loyalty" className="space-y-6">
              {/* Loyalty System Management */}
              <div className="grid md:grid-cols-3 gap-6">
                <Card className="border-violet-100 bg-gradient-to-br from-white via-violet-50 to-purple-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-purple-500" />
                      {t("admin.loyalty.tierDistribution")}
                    </CardTitle>
                    <CardDescription>{t("admin.loyalty.tierDistributionDescription")}</CardDescription>
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
                          <div key={tier._id} className="flex items-center justify-between rounded-xl border border-purple-100 bg-white/80 p-3 shadow-sm">
                            <div>
                              <span className="font-medium">{tier._id || 'Bronze'}</span>
                              <p className="text-sm text-gray-600">{t("admin.loyalty.customers", { count: tier.count })}</p>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">{formatMoney(tier.totalSpent)}</div>
                              <div className="text-sm text-gray-600">{t("admin.loyalty.points", { count: tier.totalPoints })}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5 text-gray-500" />
                      {t("admin.loyalty.manageTitle")}
                    </CardTitle>
                    <CardDescription>{t("admin.loyalty.manageDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={() => openAdmin('/admin/loyalty/config')} className="w-full">
                      {t("admin.loyalty.configure")}
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
                      {t("admin.loyalty.recalculateTiers")}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-blue-100 bg-gradient-to-br from-white via-blue-50 to-cyan-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-blue-600" />
                      {t("admin.loyalty.professionalLevels")}
                    </CardTitle>
                    <CardDescription>{t("admin.loyalty.professionalLevelsDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={() => openAdmin('/admin/professional-levels/config')} className="w-full">
                      {t("admin.loyalty.configureLevels")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        if (isRecalculatingProfessionalLevels) return
                        setIsRecalculatingProfessionalLevels(true)
                        try {
                          const token = getAuthToken()
                          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professional-levels/recalculate`, {
                            method: 'POST',
                            credentials: 'include',
                            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                          })
                          if (!response.ok) {
                            throw new Error(t("errors.requestFailedStatus", { status: response.status }))
                          }
                          await fetchAdminData()
                          toast.success(t("admin.loyalty.recalculated"))
                        } catch (error) {
                          console.error('Failed to recalculate professional levels:', error)
                          toast.error(t("admin.loyalty.recalculateFailed"))
                        } finally {
                          setIsRecalculatingProfessionalLevels(false)
                        }
                      }}
                      disabled={isRecalculatingProfessionalLevels}
                      className="w-full"
                    >
                      {isRecalculatingProfessionalLevels ? t("admin.loyalty.recalculating") : t("admin.loyalty.recalculateLevels")}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            )}

            {canApproveProfessionals && (
            <TabsContent value="approvals" className="space-y-6">
              {/* Professional Approvals */}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="border-amber-100 bg-gradient-to-br from-white via-amber-50 to-orange-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-orange-500" />
                      {t("admin.approvals.pending")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.pending || 0}</div>
                  </CardContent>
                </Card>

                <Card className="border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-green-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {t("admin.approvals.approved")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.approved || 0}</div>
                  </CardContent>
                </Card>

                <Card className="border-rose-100 bg-gradient-to-br from-white via-rose-50 to-red-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-red-500" />
                      {t("admin.approvals.rejected")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.rejected || 0}</div>
                  </CardContent>
                </Card>

                <Card className="border-yellow-100 bg-gradient-to-br from-white via-yellow-50 to-amber-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      {t("admin.approvals.suspended")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.suspended || 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-sky-100 bg-gradient-to-br from-white via-sky-50 to-blue-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    {t("admin.overview.professionals.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.approvals.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button 
                      onClick={() => openAdmin('/admin/professionals?status=pending')}
                      className="w-full"
                      variant={approvalStats?.pending ? 'default' : 'outline'}
                    >
                      {t("admin.approvals.reviewPending", { count: approvalStats?.pending || 0 })}
                    </Button>
                    <Button 
                      onClick={() => openAdmin('/admin/professionals?status=approved')}
                      variant="outline"
                      className="w-full"
                    >
                      {t("admin.approvals.viewApproved", { count: approvalStats?.approved || 0 })}
                    </Button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button 
                      onClick={() => openAdmin('/admin/professionals?status=rejected')}
                      variant="outline"
                      className="w-full"
                    >
                      {t("admin.approvals.viewRejected", { count: approvalStats?.rejected || 0 })}
                    </Button>
                    <Button 
                      onClick={() => openAdmin('/admin/professionals?status=suspended')}
                      variant="outline"
                      className="w-full"
                    >
                      {t("admin.approvals.viewSuspended", { count: approvalStats?.suspended || 0 })}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            )}

            {canManagePayments && (
            <TabsContent value="payments" className="space-y-6">
              {/* Payment Oversight */}
              <Card className="border-blue-100 bg-gradient-to-br from-white via-blue-50 to-indigo-100 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-blue-500" />
                    {t("admin.payments.title")}
                  </CardTitle>
                  <CardDescription>{t("admin.payments.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("admin.payments.intro")}
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button
                      onClick={() => openAdmin('/admin/payments')}
                      className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      {t("admin.payments.viewAll")}
                    </Button>
                    <Button
                      onClick={() => openAdmin('/admin/payments?status=authorized')}
                      variant="outline"
                      className="w-full border-amber-200 hover:bg-amber-50"
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      {t("admin.payments.viewAuthorized")}
                    </Button>
                  </div>

                  <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-100">
                    <h4 className="font-semibold mb-2 text-blue-900">{t("admin.payments.features")}</h4>
                    <ul className="text-sm space-y-1 text-blue-800">
                      <li>• {t("admin.payments.feature1")}</li>
                      <li>• {t("admin.payments.feature2")}</li>
                      <li>• {t("admin.payments.feature3")}</li>
                      <li>• {t("admin.payments.feature4")}</li>
                      <li>• {t("admin.payments.feature5")}</li>
                      <li>• {t("admin.payments.feature6")}</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            )}

            {adminToolLinks.length > 0 && (
              <TabsContent value="tools" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("admin.tools.title")}</CardTitle>
                    <CardDescription>{t("admin.tools.description")}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {adminToolLinks.map((tool) => (
                      <Button key={tool.path} variant="outline" onClick={() => openAdmin(tool.path)}>
                        {t(ADMIN_TOOL_LABELS[tool.key])}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

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
                {t("professional.title")}
              </h1>
              <p className="text-gray-600">{t("professional.welcome", { name: user?.name ?? "" })}</p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FavoritesWidget />
          </div>

          <Tabs defaultValue="quick_actions" className="space-y-6">
            <TabsList className="inline-flex h-auto min-w-full w-max rounded-md bg-muted p-1">
              <TabsTrigger value="quick_actions">{t("professional.tabs.quickActions")}</TabsTrigger>
              <TabsTrigger value="action_needed">
                {(actionItems.length + warrantyActionItems.length) > 0
                  ? t("professional.tabs.actionNeededWithCount", { count: actionItems.length + warrantyActionItems.length })
                  : t("professional.tabs.actionNeeded")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="quick_actions">
              <Card>
                <CardHeader>
                  <CardTitle>{t("professional.tabs.quickActions")}</CardTitle>
                  <CardDescription>{t("professional.quickActions.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <Button
                      variant="outline"
                      onClick={() => router.push('/profile')}
                      className="flex items-center gap-2"
                    >
                      <User className="h-4 w-4" />
                      {t("professional.quickActions.editProfile")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/dashboard/benefits')}
                      className="flex items-center gap-2"
                    >
                      <Gift className="h-4 w-4" />
                      {t("professional.quickActions.benefits")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/professional/projects/manage')}
                      className="flex items-center gap-2"
                    >
                      <Briefcase className="h-4 w-4" />
                      {t("professional.quickActions.manageProjects")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/dashboard/bookings')}
                      className="flex items-center gap-2"
                    >
                      <Package className="h-4 w-4" />
                      {t("professional.quickActions.manageBookings")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/dashboard/quotes')}
                      className="flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      {t("professional.quickActions.manageQuotes")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/dashboard/payments')}
                      className="flex items-center gap-2"
                    >
                      <TrendingUp className="h-4 w-4" />
                      {t("professional.quickActions.paymentsStripe")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/professional/earnings')}
                      className="flex items-center gap-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      {t("professional.quickActions.performance")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/professional/${user?._id}`)}
                      className="flex items-center gap-2"
                    >
                      <Star className="h-4 w-4" />
                      {t("professional.quickActions.myReviews")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/dashboard/warranty-claims')}
                      className="flex items-center gap-2"
                    >
                      <Shield className="h-4 w-4" />
                      {t("professional.quickActions.warrantyClaims")}
                    </Button>
                    {(!user?.isEmailVerified || !user?.isPhoneVerified) && (
                      <Button onClick={() => router.push('/verify-phone')} className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {t("professional.quickActions.completeVerification")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="action_needed">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    {t("professional.tabs.actionNeeded")}
                  </CardTitle>
                  <CardDescription>{t("professional.actionNeeded.description")}</CardDescription>
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

              {!bookingsLoading && !bookingsError && !warrantyClaimsLoading && !warrantyClaimsError && actionItems.length === 0 && warrantyActionItems.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {t("professional.actionNeeded.empty")}
                </div>
              )}

              {!bookingsLoading && !bookingsError && warrantyClaimsLoading && (
                <div className="text-center py-4 text-gray-500">
                  {t("professional.actionNeeded.loadingWarranty")}
                </div>
              )}

              {!bookingsLoading && !bookingsError && !warrantyClaimsLoading && warrantyClaimsError && (
                <div className="text-center py-4 text-amber-700">
                  {warrantyClaimsError}
                </div>
              )}

              {!bookingsLoading && !bookingsError && (actionItems.length > 0 || (!warrantyClaimsLoading && !warrantyClaimsError && warrantyActionItems.length > 0)) && (
                <div className="space-y-3">
                  {actionItems.map((item) => {
                    const isProject = isProjectBooking(item.booking)
                    const title = getBookingTitle(item.booking, t("common.bookingFallback"))
                    const { className: statusClasses } = getBookingStatusMeta(item.booking.status)
                    const statusLabel = bookingStatusLabel(item.booking.status)
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
                              <span>{t("professional.actionNeeded.customer", { name: item.booking.customer?.name || t("common.unknown") })}</span>
                              {item.booking.createdAt && (
                                <span>• {new Date(item.booking.createdAt).toLocaleDateString(intl)}</span>
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
                                {actionItemLabel(item.labelKey)}
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
                              {t("common.view")}
                            </Button>
                            {item.booking.status === 'rfq' && (
                              <Button
                                size="sm"
                                onClick={() => router.push(`/bookings/${item.booking._id}?action=quote`)}
                                className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                {t("professional.actionNeeded.quote")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {!warrantyClaimsLoading && !warrantyClaimsError && warrantyActionItems.map((item) => (
                    <div key={item.id} className={`border rounded-lg p-4 ${item.severity === "urgent" ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-sm">{t(item.labelKey)}</h3>
                          <p className="text-xs text-gray-600">{t("professional.actionNeeded.warrantyAction", { bookingId: item.bookingId })}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/bookings/${item.bookingId}`)}
                          className="text-xs"
                        >
                          {t("common.view")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    )
  }

  // Regular user dashboard (fallback)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto pt-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t("fallback.welcome", { name: user?.name ?? "" })}</h1>
          <p className="text-gray-600">{t("fallback.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* User Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {t("fallback.profile.title")}
              </CardTitle>
              <CardDescription>{t("fallback.profile.description")}</CardDescription>
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
                {t("fallback.verification.title")}
              </CardTitle>
              <CardDescription>{t("fallback.verification.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("fallback.verification.email")}</span>
                <span className={`text-sm font-medium ${user?.isEmailVerified ? "text-green-600" : "text-red-600"}`}>
                  {user?.isEmailVerified ? t("fallback.verification.verified") : t("fallback.verification.notVerified")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("fallback.verification.phone")}</span>
                <span className={`text-sm font-medium ${user?.isPhoneVerified ? "text-green-600" : "text-red-600"}`}>
                  {user?.isPhoneVerified ? t("fallback.verification.verified") : t("fallback.verification.notVerified")}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Account Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t("fallback.stats.title")}
              </CardTitle>
              <CardDescription>{t("fallback.stats.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("fallback.stats.memberSince")}</span>
                <span className="text-sm font-medium">
                  {new Date(user?.createdAt || "").toLocaleDateString(intl)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("fallback.stats.lastUpdated")}</span>
                <span className="text-sm font-medium">
                  {new Date(user?.updatedAt || "").toLocaleDateString(intl)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4">
          {(!user?.isEmailVerified || !user?.isPhoneVerified) && (
            <Button onClick={() => router.push("/verify-phone")}>
              {t("professional.quickActions.completeVerification")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
