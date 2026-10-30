'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  Send,
  Plus,
  Briefcase,
  AlertCircle,
  Copy,
  Trash2,
  Pause,
  Play,
  MoreVertical,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2
} from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrency } from "@/contexts/CurrencyContext"
import ProjectCard from "@/components/dashboard/ProjectCard"

interface Project {
  _id: string
  title: string
  description: string
  status: string
  category: string
  service: string
  areaOfWork?: string | null
  resources?: string[] | null
  teamMembers?: Array<{ id: string; name: string | null }> | null
  minResources?: number | null
  minOverlapPercentage?: number | null
  priceModel?: string | null
  subprojects: Array<{
    name: string
    description: string
    basePrice: number
    pricingModel: 'fixed' | 'hour' | 'm2' | 'meter'
    pricing?: { type?: string; amount?: number | null; priceRange?: { min?: number } | null; unit?: string | null } | null
    unit?: string | null
  }>
  extraOptions?: Array<unknown> | null
  termsConditions?: Array<unknown> | null
  repeatBuyerDiscount?: { enabled?: boolean; percentage?: number | null } | null
  autoSaveTimestamp?: string
  submittedAt?: string
  approvedAt?: string
  archivedAt?: string | null
  statusBeforeArchive?: string | null
  adminFeedback?: string
  qualityChecks?: Array<{
    category: string
    status: 'passed' | 'failed'
    message: string
    checkedAt: string
  }>
  createdAt: string
  updatedAt: string
}

type NormalizedProjectStatus = 'draft' | 'pending' | 'published' | 'on_hold' | 'rejected' | 'archived'
type TabValue = 'all' | 'drafts' | 'pending' | 'published' | 'on_hold' | 'rejected' | 'archived'

const DEFAULT_PROJECT_COUNTS = {
  drafts: 0,
  pending: 0,
  published: 0,
  on_hold: 0,
  rejected: 0,
  archived: 0
}

const normalizeProjectStatus = (status: Project['status']): NormalizedProjectStatus => {
  const value = (status || '').toString().trim().toLowerCase()

  if (value === 'archived') {
    return 'archived'
  }

  if (value === 'pending' || value === 'pending_approval' || value === 'pending approval' || value === 'pendingapproval' || value === 'awaiting_approval' || value === 'awaiting approval' || value === 'awaitingapproval') {
    return 'pending'
  }

  if (value === 'published' || value === 'active' || value === 'live') {
    return 'published'
  }

  if (value === 'on_hold' || value === 'on hold' || value === 'hold' || value === 'suspended' || value === 'paused' || value === 'pause') {
    return 'on_hold'
  }

  if (value === 'rejected') {
    return 'rejected'
  }

  return 'draft'
}

const formatProjectStatusKey = (status: Project['status']) => {
  const normalized = normalizeProjectStatus(status)
  switch (normalized) {
    case 'pending':
      return 'pending'
    case 'published':
      return 'published'
    case 'on_hold':
      return 'onHold'
    case 'rejected':
      return 'rejected'
    case 'archived':
      return 'archived'
    default:
      return 'draft'
  }
}

const deriveCountsFromProjects = (projects: Project[]) => {
  const counts = { ...DEFAULT_PROJECT_COUNTS }

  projects.forEach((project) => {
    const normalized = normalizeProjectStatus(project.status)
    switch (normalized) {
      case 'draft':
        counts.drafts += 1
        break
      case 'pending':
        counts.pending += 1
        break
      case 'published':
        counts.published += 1
        break
      case 'on_hold':
        counts.on_hold += 1
        break
      case 'rejected':
        counts.rejected += 1
        break
      case 'archived':
        counts.archived += 1
        break
      default:
        break
    }
  })

  return counts
}

const mapCountsFromApi = (counts: Record<string, number> | undefined | null) => {
  if (!counts) {
    return null
  }

  return {
    drafts: counts.drafts ?? counts.draft ?? 0,
    pending: counts.pending ?? counts.pending_approval ?? 0,
    published: counts.published ?? 0,
    on_hold: counts.on_hold ?? counts.onHold ?? 0,
    rejected: counts.rejected ?? 0,
    archived: counts.archived ?? 0
  }
}

export default function ManageProjectsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const t = useTranslations("proProjects")
  const getErrorText = useErrorMessage()
  const { intl } = useFormatLocale()
  const { formatMoney } = useCurrency()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)
  const [editWarningDialogOpen, setEditWarningDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalProjects, setTotalProjects] = useState(0)
  const [projectCounts, setProjectCounts] = useState(() => ({ ...DEFAULT_PROJECT_COUNTS }))
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [allServices, setAllServices] = useState<string[]>([])
  const canCreateProjects = user?.professionalStatus === 'approved'

  const formatProjectStatusLabel = (status: Project['status']) =>
    t(`manage.statusLabels.${formatProjectStatusKey(status)}`)

  const cardLabels = {
    service: (value: string) => t('manage.card.service', { value }),
    areaOfWork: (value: string) => t('manage.card.areaOfWork', { value }),
    team: (value: string) => t('manage.card.team', { value }),
    minMembers: (count: number, overlap: string) => t('manage.card.minMembers', { count, overlap }),
    priceModel: (value: string) => t('manage.card.priceModel', { value }),
    startingFrom: (model: string, unit: string | null, price: string) =>
      t('manage.card.startingFrom', { model, unit: unit ? `/${unit}` : '', price }),
    noRecordedPrice: t('manage.card.noRecordedPrice'),
    repeatDiscount: (percent: number) => t('manage.card.repeatDiscount', { percent }),
    counts: (subprojects: number, options: number, conditions: number) =>
      t('manage.card.counts', { subprojects, options, conditions }),
    publishDate: (date: string) => t('manage.card.publishDate', { date }),
    onHoldDays: (days: number | string) => t('manage.card.onHoldDays', { days }),
    submittedOn: (date: string) => t('manage.card.submittedOn', { date }),
    archivedOn: (date: string) => t('manage.card.archivedOn', { date }),
    updatedOn: (date: string) => t('manage.card.updatedOn', { date }),
    adminFeedback: t('manage.card.adminFeedback'),
  }

  const mapTabToStatus = (tab: TabValue): string => {
    switch (tab) {
      case 'drafts':
        return 'draft'
      case 'pending':
        return 'pending'
      case 'published':
        return 'published'
      case 'on_hold':
        return 'on_hold'
      case 'rejected':
        return 'rejected'
      case 'archived':
        return 'archived'
      default:
        return 'all'
    }
  }

  const mapStatusToTab = (status: string): TabValue => {
    switch (status) {
      case 'draft':
        return 'drafts'
      case 'pending':
        return 'pending'
      case 'published':
        return 'published'
      case 'on_hold':
        return 'on_hold'
      case 'rejected':
        return 'rejected'
      case 'archived':
        return 'archived'
      default:
        return 'all'
    }
  }

  const handleStatusFilterChange = (status: string) => {
    console.log('[ManageProjects] Status filter changed', { status })
    setStatusFilter(status)
    setActiveTab(mapStatusToTab(status))
    setCurrentPage(1)
  }

  const handleServiceFilterChange = (service: string) => {
    setServiceFilter(service)
    setCurrentPage(1)
  }

  const handleTabChange = (tabValue: TabValue) => {
    console.log('[ManageProjects] Tab changed', { tabValue })
    setActiveTab(tabValue)
    const mappedStatus = mapTabToStatus(tabValue)
    if (statusFilter !== mappedStatus) {
      setStatusFilter(mappedStatus)
      setCurrentPage(1)
    }
  }

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login?redirect=/professional/projects/manage')
    } else if (!loading && user?.role !== 'professional') {
      router.push('/dashboard')
    }
  }, [isAuthenticated, loading, router, user])

  // Debouncing effect for search term (also resets page)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
      setCurrentPage(1)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchTerm])

  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      console.log('[ManageProjects] Fetching projects', {
        search: debouncedSearchTerm,
        statusFilter,
        serviceFilter,
        currentPage
      })
      // Build query parameters
      const queryParams = new URLSearchParams()

      if (debouncedSearchTerm.trim()) {
        queryParams.append('search', debouncedSearchTerm.trim())
      }

      if (statusFilter && statusFilter !== 'all') {
        queryParams.append('status', statusFilter)
      }

      if (serviceFilter && serviceFilter !== 'all') {
        queryParams.append('service', serviceFilter)
      }

      queryParams.append('page', currentPage.toString())
      queryParams.append('limit', '20')

      const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/master${queryParams.toString() ? '?' + queryParams.toString() : ''}`
      console.log('[ManageProjects] Request URL', url)

      const projectsResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })

      if (projectsResponse.ok) {
        const responseData = await projectsResponse.json()
        let fetchedProjects: Project[] = []
        let responseCounts: Record<string, number> | undefined

        if (responseData.items && responseData.meta) {
          console.log('[ManageProjects] Using paginated items format', {
            meta: responseData.meta,
            itemCount: responseData.items.length,
            counts: responseData.counts
          })
          if (Array.isArray(responseData.distinctServices)) {
            setAllServices(responseData.distinctServices)
          }
          fetchedProjects = responseData.items
          responseCounts = responseData.counts
          setTotalPages(responseData.meta.pages || 1)
          setTotalProjects(responseData.meta.total || responseData.items.length)
          setCurrentPage(responseData.meta.page || 1)
        } else if (responseData.projects) {
          console.log('[ManageProjects] Using legacy projects format', {
            totalPages: responseData.totalPages,
            totalProjects: responseData.totalProjects,
            counts: responseData.counts
          })
          if (Array.isArray(responseData.distinctServices)) {
            setAllServices(responseData.distinctServices)
          }
          fetchedProjects = responseData.projects
          responseCounts = responseData.counts
          setTotalPages(responseData.totalPages || 1)
          setTotalProjects(responseData.totalProjects || responseData.projects.length)
          setCurrentPage(responseData.currentPage || 1)
        } else if (Array.isArray(responseData)) {
          console.log('[ManageProjects] Using array response format', {
            itemCount: responseData.length
          })
          fetchedProjects = responseData
          setTotalPages(1)
          setTotalProjects(responseData.length)
          setCurrentPage(1)
        } else {
          console.warn('[ManageProjects] Unexpected response payload, resetting lists', responseData)
          setProjects([])
          setTotalPages(1)
          setTotalProjects(0)
          setProjectCounts({ ...DEFAULT_PROJECT_COUNTS })
          return
        }

        setProjects(fetchedProjects)
        console.log('[ManageProjects] Received projects', {
          length: fetchedProjects.length,
          statuses: fetchedProjects.reduce<Record<string, number>>((acc, project) => {
            const status = normalizeProjectStatus(project.status)
            acc[status] = (acc[status] || 0) + 1
            return acc
          }, {})
        })
        console.log('[ManageProjects] Raw status values', fetchedProjects.map(project => project.status))

        const mappedCounts = mapCountsFromApi(responseCounts)
        if (mappedCounts) {
          console.log('[ManageProjects] Using API counts', mappedCounts)
          setProjectCounts(mappedCounts)
        } else if (!statusFilter || statusFilter === 'all') {
          const derived = deriveCountsFromProjects(fetchedProjects)
          console.log('[ManageProjects] Derived counts from fetched data', derived)
          setProjectCounts(derived)
        }
      } else {
        const errorData = await projectsResponse.json().catch(() => ({}))
        console.error('[ManageProjects] Failed to fetch projects', {
          status: projectsResponse.status,
          errorData
        })
        setError(getErrorText(errorData, t('manage.errors.fetchFailed')))
        setProjects([])
        setTotalPages(1)
        setTotalProjects(0)
        setProjectCounts({ ...DEFAULT_PROJECT_COUNTS })
      }
    } catch (error) {
      console.error('[ManageProjects] Exception while fetching projects', error)
      setError(getErrorText(error, t('manage.errors.fetchFailedConnection')))
      setProjects([])
      setTotalPages(1)
      setTotalProjects(0)
      setProjectCounts({ ...DEFAULT_PROJECT_COUNTS })
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearchTerm, statusFilter, serviceFilter, currentPage, getErrorText, t])

  // Single effect to fetch projects — fetchProjects changes when filters/page change
  useEffect(() => {
    if (user?.role === 'professional') {
      fetchProjects()
    }
  }, [user?.role, fetchProjects])

  const getStatusColor = (status: Project['status']) => {
    const normalized = normalizeProjectStatus(status)
    switch (normalized) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'published':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'on_hold':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'archived':
        return 'bg-slate-200 text-slate-700 border-slate-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: Project['status']) => {
    const normalized = normalizeProjectStatus(status)
    switch (normalized) {
      case 'draft':
        return <FileText className="h-4 w-4" />
      case 'pending':
        return <Clock className="h-4 w-4" />
      case 'published':
        return <CheckCircle className="h-4 w-4" />
      case 'rejected':
        return <XCircle className="h-4 w-4" />
      case 'on_hold':
        return <Pause className="h-4 w-4" />
      case 'archived':
        return <Eye className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const submitProject = async (projectId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}/submit`, {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        // Refresh projects after submission
        fetchProjects()
      } else {
        const errorData = await response.json()
        toast.error(getErrorText(errorData, t('errors.submitProject')))
      }
    } catch (error) {
      console.error('Failed to submit project:', error)
      toast.error(getErrorText(error, t('errors.submitProject')))
    }
  }

  const duplicateProject = async (projectId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}/duplicate`, {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        const duplicatedProject = await response.json()
        // Refresh projects after duplication
        fetchProjects()
        setDuplicateDialogOpen(false)
        setSelectedProject(null)
        // Optionally redirect to edit the duplicated project
        router.push(`/projects/create?id=${duplicatedProject._id}`)
      } else {
        const errorData = await response.json()
        toast.error(getErrorText(errorData, t('manage.errors.duplicateFailed')))
      }
    } catch (error) {
      console.error('Failed to duplicate project:', error)
      toast.error(getErrorText(error, t('manage.errors.duplicateFailed')))
    }
  }

  const deleteProject = async (projectId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok) {
        // Refresh projects after deletion
        fetchProjects()
        setDeleteDialogOpen(false)
        setSelectedProject(null)
      } else {
        const errorData = await response.json()
        toast.error(getErrorText(errorData, t('manage.errors.deleteFailed')))
      }
    } catch (error) {
      console.error('Failed to delete project:', error)
      toast.error(getErrorText(error, t('manage.errors.deleteFailed')))
    }
  }

  const toggleProjectHold = async (projectId: string, currentStatus: Project['status']) => {
    try {
      const normalizedStatus = normalizeProjectStatus(currentStatus)
      const newStatus = normalizedStatus === 'published' ? 'on_hold' : 'published'
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        // Refresh projects after status change
        fetchProjects()
        setHoldDialogOpen(false)
        setSelectedProject(null)
      } else {
        const errorData = await response.json()
        toast.error(getErrorText(errorData, t('manage.errors.statusUpdateFailed')))
      }
    } catch (error) {
      console.error('Failed to update project status:', error)
      toast.error(getErrorText(error, t('manage.errors.statusUpdateFailed')))
    }
  }

  const archiveProject = async (projectId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}/archive`, {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        fetchProjects()
        setArchiveDialogOpen(false)
        setSelectedProject(null)
      } else {
        const errorData = await response.json()
        toast.error(getErrorText(errorData, t('manage.errors.archiveFailed')))
      }
    } catch (error) {
      console.error('Failed to archive project:', error)
      toast.error(getErrorText(error, t('manage.errors.archiveFailed')))
    }
  }

  const restoreProject = async (projectId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}/restore`, {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        fetchProjects()
        setRestoreDialogOpen(false)
        setSelectedProject(null)
      } else {
        const errorData = await response.json()
        toast.error(getErrorText(errorData, t('manage.errors.restoreFailed')))
      }
    } catch (error) {
      console.error('Failed to restore project:', error)
      toast.error(getErrorText(error, t('manage.errors.restoreFailed')))
    }
  }

  const editProjectWithWarning = (projectId: string) => {
    if (!canCreateProjects) {
      toast.error(t('manage.adminApprovalManaging'))
      return
    }
    // Close dialog and redirect to edit page
    // The backend will automatically handle status change to pending_approval on save
    console.log('[ManageProjects] Editing project with warning:', projectId)
    setEditWarningDialogOpen(false)
    setSelectedProject(null)

    router.push(`/projects/create?id=${projectId}`)
  }

  // Since filtering is now handled server-side, we use projects directly
  const filteredProjects = projects

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4 px-3 sm:px-0">
        <div className="max-w-7xl mx-auto pt-16 md:pt-20">
          <div className="mb-6 md:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="h-4 w-80" />
            </div>
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
          {/* Search & Filter Skeleton */}
          <div className="flex gap-3 mb-6">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
          {/* Tabs Skeleton */}
          <div className="flex gap-2 mb-6">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-9 w-24 rounded-lg" />)}
          </div>
          {/* Project Cards Skeleton */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-5 rounded" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== 'professional') {
    return null
  }

  const draftProjects = filteredProjects.filter(p => normalizeProjectStatus(p.status) === 'draft')
  const pendingProjects = filteredProjects.filter(p => normalizeProjectStatus(p.status) === 'pending')
  const publishedProjects = filteredProjects.filter(p => normalizeProjectStatus(p.status) === 'published')
  const rejectedProjects = filteredProjects.filter(p => normalizeProjectStatus(p.status) === 'rejected')
  const onHoldProjects = filteredProjects.filter(p => normalizeProjectStatus(p.status) === 'on_hold')
  const archivedProjects = filteredProjects.filter(p => normalizeProjectStatus(p.status) === 'archived')

  const tabCounts = {
    drafts: projectCounts.drafts,
    pending: projectCounts.pending,
    published: projectCounts.published,
    on_hold: projectCounts.on_hold,
    rejected: projectCounts.rejected,
    archived: projectCounts.archived
  }

  // Get unique services for filter dropdown (from API, falls back to current page)
  const uniqueServices = allServices.length > 0 ? allServices : Array.from(new Set(projects.map(p => p.service))).filter(Boolean)

  const selectedProjectStatus = selectedProject ? normalizeProjectStatus(selectedProject.status) : null

  // Project Action Menu Component
  const ProjectActionMenu = ({ project }: { project: Project }) => {
    const normalizedStatus = normalizeProjectStatus(project.status)
    const isArchived = normalizedStatus === 'archived'
    const canEdit = canCreateProjects && (normalizedStatus === 'draft' || normalizedStatus === 'rejected')
    const canEditWithWarning = canCreateProjects && (normalizedStatus === 'published' || normalizedStatus === 'on_hold')
    const canSubmit = canCreateProjects && normalizedStatus === 'draft'
    const canHold = normalizedStatus === 'published' || normalizedStatus === 'on_hold'
    const canDelete = normalizedStatus === 'draft' || normalizedStatus === 'rejected'
    const canArchive = canCreateProjects && !isArchived
    const canRestore = canCreateProjects && isArchived

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => router.push(`/professional/projects/${project._id}`)}>
            <Eye className="h-4 w-4 mr-2" />
            {t('manage.actions.viewDetails')}
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem onClick={() => {
              console.log('[ManageProjects] Editing project:', project._id)
              router.push(`/projects/create?id=${project._id}`);
            }}>
              <Edit className="h-4 w-4 mr-2" />
              {t('common.editProject')}
            </DropdownMenuItem>
          )}

          {canEditWithWarning && (
            <DropdownMenuItem 
              onClick={() => {
                setSelectedProject(project)
                setEditWarningDialogOpen(true)
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              {t('common.editProject')}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            disabled={!canCreateProjects}
            onClick={() => {
              if (!canCreateProjects) {
                toast.error(t('manage.adminApprovalManaging'))
                return
              }
              setSelectedProject(project)
              setDuplicateDialogOpen(true)
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            {t('manage.actions.duplicateProject')}
          </DropdownMenuItem>

          {canSubmit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => submitProject(project._id)}>
                <Send className="h-4 w-4 mr-2" />
                {t('manage.actions.submitForReview')}
              </DropdownMenuItem>
            </>
          )}

          {canHold && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSelectedProject(project)
                  setHoldDialogOpen(true)
                }}
              >
                {normalizeProjectStatus(project.status) === 'published' ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    {t('manage.actions.putOnHold')}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {t('manage.actions.resumePublishing')}
                  </>
                )}
              </DropdownMenuItem>
            </>
          )}

          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSelectedProject(project)
                  setDeleteDialogOpen(true)
                }}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('manage.actions.deleteProject')}
              </DropdownMenuItem>
            </>
          )}

          {canArchive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSelectedProject(project)
                  setArchiveDialogOpen(true)
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                {t('manage.actions.archiveProject')}
              </DropdownMenuItem>
            </>
          )}

          {canRestore && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSelectedProject(project)
                  setRestoreDialogOpen(true)
                }}
              >
                <Play className="h-4 w-4 mr-2" />
                {t('manage.actions.restoreProject')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4 px-3 sm:px-0">
      <div className="max-w-7xl mx-auto pt-16 md:pt-20">
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2 md:gap-3">
              <Briefcase className="h-6 w-6 md:h-8 md:w-8 text-blue-600 flex-shrink-0" />
              <span className="truncate">{t('manage.title')}</span>
            </h1>
            <p className="text-sm md:text-base text-gray-600">{t('manage.subtitle')}</p>
          </div>
          <Button
            onClick={() => {
              if (!canCreateProjects) {
                toast.error(t('manage.adminApprovalCreating'))
                return
              }
              router.push('/projects/create')
            }}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto flex-shrink-0"
            size="sm"
            disabled={!canCreateProjects}
          >
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{t('manage.createNewProject')}</span>
            <span className="sm:hidden">{t('manage.newProject')}</span>
          </Button>
        </div>

        {!canCreateProjects && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-amber-800">
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{t('manage.lockedTitle')}</p>
                  <p className="text-sm text-amber-700">
                    {t('manage.lockedDescription')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search and Filter Controls */}
        <div className="mb-6 md:mb-8 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              {isLoading && searchTerm !== debouncedSearchTerm && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 animate-spin" />
              )}
              <Input
                placeholder={t('manage.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder={t('manage.filterByStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('manage.allStatuses')}</SelectItem>
                  <SelectItem value="draft">{t('manage.statusOptions.draft')}</SelectItem>
                  <SelectItem value="pending">{t('manage.statusOptions.pending')}</SelectItem>
                  <SelectItem value="published">{t('manage.statusOptions.published')}</SelectItem>
                  <SelectItem value="on_hold">{t('manage.statusOptions.onHold')}</SelectItem>
                  <SelectItem value="rejected">{t('manage.statusOptions.rejected')}</SelectItem>
                  <SelectItem value="archived">{t('manage.statusOptions.archived')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={serviceFilter} onValueChange={handleServiceFilterChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder={t('manage.filterByService')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('manage.allServices')}</SelectItem>
                  {uniqueServices.map(svc => (
                    <SelectItem key={svc} value={svc}>{svc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-6 md:mb-8">
          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <FileText className="h-3 w-3 text-gray-500 flex-shrink-0" />
                <span className="truncate">{t('manage.stats.drafts')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{tabCounts.drafts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                <span className="truncate">{t('manage.statusOptions.pending')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{tabCounts.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                <span className="truncate">{t('manage.statusOptions.published')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{tabCounts.published}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <Pause className="h-3 w-3 text-orange-500 flex-shrink-0" />
                <span className="truncate">{t('manage.statusOptions.onHold')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{tabCounts.on_hold}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                <span className="truncate">{t('manage.statusOptions.rejected')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{tabCounts.rejected}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <Eye className="h-3 w-3 text-slate-500 flex-shrink-0" />
                <span className="truncate">{t('manage.stats.archived')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{tabCounts.archived}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as TabValue)} className="space-y-6">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex h-auto min-w-full w-max p-1 bg-muted rounded-md">
              <TabsTrigger value="all" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t('manage.tabs.all', { count: tabCounts.drafts + tabCounts.pending + tabCounts.published + tabCounts.on_hold + tabCounts.rejected })}
              </TabsTrigger>
              <TabsTrigger value="drafts" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t('manage.tabs.drafts', { count: tabCounts.drafts })}
              </TabsTrigger>
              <TabsTrigger value="pending" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t('manage.tabs.pending', { count: tabCounts.pending })}
              </TabsTrigger>
              <TabsTrigger value="published" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t('manage.tabs.published', { count: tabCounts.published })}
              </TabsTrigger>
              <TabsTrigger value="on_hold" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t('manage.tabs.onHold', { count: tabCounts.on_hold })}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t('manage.tabs.rejected', { count: tabCounts.rejected })}
              </TabsTrigger>
              <TabsTrigger value="archived" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                {t('manage.tabs.archived', { count: tabCounts.archived })}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="space-y-6">
            {filteredProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('manage.empty.noProjects')}</h3>
                  <p className="text-gray-600 mb-4">
                    {searchTerm || statusFilter !== 'all' || serviceFilter !== 'all'
                      ? t('manage.empty.adjustFilters')
                      : t('manage.empty.createFirst')
                    }
                  </p>
                  {!searchTerm && statusFilter === 'all' && serviceFilter === 'all' && (
                    <Button
                      onClick={() => {
                        if (!canCreateProjects) {
                          toast.error(t('manage.adminApprovalCreating'))
                          return
                        }
                        router.push('/projects/create')
                      }}
                      disabled={!canCreateProjects}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('manage.empty.createProject')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    formatMoney={formatMoney}
                    intl={intl}
                    statusBadge={(
                      <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                        {getStatusIcon(project.status)}
                        <span className="ml-1 hidden sm:inline">{formatProjectStatusLabel(project.status)}</span>
                      </Badge>
                    )}
                    actionMenu={<ProjectActionMenu project={project} />}
                    labels={cardLabels}
                    adminFeedback={normalizeProjectStatus(project.status) === 'rejected' ? project.adminFeedback : undefined}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="drafts" className="space-y-6">
            {draftProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('manage.empty.noDrafts')}</h3>
                  <p className="text-gray-600 mb-4">{t('manage.empty.createFirst')}</p>
                  <Button
                    onClick={() => {
                      if (!canCreateProjects) {
                        toast.error(t('manage.adminApprovalCreating'))
                        return
                      }
                      router.push('/projects/create')
                    }}
                    disabled={!canCreateProjects}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('manage.empty.createProject')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {draftProjects.map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    formatMoney={formatMoney}
                    intl={intl}
                    statusBadge={(
                      <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                        {getStatusIcon(project.status)}
                        <span className="ml-1 hidden sm:inline">{formatProjectStatusLabel(project.status)}</span>
                      </Badge>
                    )}
                    actionMenu={<ProjectActionMenu project={project} />}
                    labels={cardLabels}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-6">
            {pendingProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('manage.empty.noPending')}</h3>
                  <p className="text-gray-600">{t('manage.empty.pendingHint')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {pendingProjects.map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    formatMoney={formatMoney}
                    intl={intl}
                    statusBadge={(
                      <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                        {getStatusIcon(project.status)}
                        <span className="ml-1 hidden sm:inline">{formatProjectStatusLabel(project.status)}</span>
                      </Badge>
                    )}
                    actionMenu={<ProjectActionMenu project={project} />}
                    labels={cardLabels}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="published" className="space-y-6">
            {publishedProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('manage.empty.noPublished')}</h3>
                  <p className="text-gray-600">{t('manage.empty.publishedHint')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {publishedProjects.map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    formatMoney={formatMoney}
                    intl={intl}
                    statusBadge={(
                      <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                        {getStatusIcon(project.status)}
                        <span className="ml-1 hidden sm:inline">{formatProjectStatusLabel(project.status)}</span>
                      </Badge>
                    )}
                    actionMenu={<ProjectActionMenu project={project} />}
                    labels={cardLabels}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-6">
            {rejectedProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('manage.empty.noRejected')}</h3>
                  <p className="text-gray-600">{t('manage.empty.rejectedHint')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {rejectedProjects.map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    formatMoney={formatMoney}
                    intl={intl}
                    statusBadge={(
                      <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                        {getStatusIcon(project.status)}
                        <span className="ml-1 hidden sm:inline">{formatProjectStatusLabel(project.status)}</span>
                      </Badge>
                    )}
                    actionMenu={<ProjectActionMenu project={project} />}
                    labels={cardLabels}
                    adminFeedback={project.adminFeedback}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="on_hold" className="space-y-6">
            {onHoldProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Pause className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('manage.empty.noOnHold')}</h3>
                  <p className="text-gray-600">{t('manage.empty.onHoldHint')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {onHoldProjects.map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    formatMoney={formatMoney}
                    intl={intl}
                    statusBadge={(
                      <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                        {getStatusIcon(project.status)}
                        <span className="ml-1 hidden sm:inline">{formatProjectStatusLabel(project.status)}</span>
                      </Badge>
                    )}
                    actionMenu={<ProjectActionMenu project={project} />}
                    labels={cardLabels}
                  />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="archived" className="space-y-6">
            {archivedProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Eye className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('manage.empty.noArchived')}</h3>
                  <p className="text-gray-600">{t('manage.empty.archivedHint')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {archivedProjects.map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    formatMoney={formatMoney}
                    intl={intl}
                    statusBadge={(
                      <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                        {getStatusIcon(project.status)}
                        <span className="ml-1 hidden sm:inline">{formatProjectStatusLabel(project.status)}</span>
                      </Badge>
                    )}
                    actionMenu={<ProjectActionMenu project={project} />}
                    labels={cardLabels}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between mt-6 px-4 gap-3">
            <div className="text-sm text-gray-600">
              {t('manage.pagination.showing', { from: ((currentPage - 1) * 20) + 1, to: Math.min(currentPage * 20, totalProjects), total: totalProjects })}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1 || isLoading}
                className="w-full sm:w-auto"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('common.previous')}
              </Button>

              <div className="flex items-center gap-1 overflow-x-auto max-w-full">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      disabled={isLoading}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || isLoading}
                className="w-full sm:w-auto"
              >
                {t('common.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Duplicate Confirmation Dialog */}
        <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('manage.dialogs.duplicateTitle')}</DialogTitle>
              <DialogDescription>
                {t('manage.dialogs.duplicateDescription', { title: selectedProject?.title ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => selectedProject && duplicateProject(selectedProject._id)}
              >
                {t('manage.actions.duplicateProject')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('manage.dialogs.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {t('manage.dialogs.deleteDescription', { title: selectedProject?.title ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedProject && deleteProject(selectedProject._id)}
              >
                {t('manage.actions.deleteProject')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Archive Confirmation Dialog */}
        <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('manage.dialogs.archiveTitle')}</DialogTitle>
              <DialogDescription>
                {t('manage.dialogs.archiveDescription')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedProject && archiveProject(selectedProject._id)}
              >
                {t('manage.dialogs.archiveConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Restore Confirmation Dialog */}
        <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('manage.dialogs.restoreTitle')}</DialogTitle>
              <DialogDescription>
                {t('manage.dialogs.restoreDescription')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => selectedProject && restoreProject(selectedProject._id)}
              >
                {t('manage.dialogs.restoreConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Hold/Resume Confirmation Dialog */}
        <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedProjectStatus === 'published' ? t('manage.dialogs.holdTitle') : t('manage.dialogs.resumeTitle')}
              </DialogTitle>
              <DialogDescription>
                {selectedProjectStatus === 'published'
                  ? t('manage.dialogs.holdDescription', { title: selectedProject?.title ?? '' })
                  : t('manage.dialogs.resumeDescription', { title: selectedProject?.title ?? '' })
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHoldDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => selectedProject && toggleProjectHold(selectedProject._id, selectedProject.status)}
              >
                {selectedProjectStatus === 'published' ? t('manage.actions.putOnHold') : t('manage.actions.resumePublishing')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Warning Dialog */}
        <Dialog open={editWarningDialogOpen} onOpenChange={setEditWarningDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                {t('manage.dialogs.editWarningTitle')}
              </DialogTitle>
              <DialogDescription>
                {selectedProjectStatus === 'published'
                  ? t('manage.dialogs.editWarningPublished', { title: selectedProject?.title ?? '' })
                  : t('manage.dialogs.editWarningOnHold', { title: selectedProject?.title ?? '' })}
              </DialogDescription>
              <div className="space-y-3 mt-3">
                <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-orange-800">
                      <p className="font-medium mb-1">{t('manage.dialogs.importantNotice')}</p>
                      <ul className="space-y-1 text-xs list-disc pl-4">
                        {selectedProjectStatus === 'published' && (
                          <>
                            <li>{t('manage.dialogs.reapproval')}</li>
                            <li>{t('manage.dialogs.approvalDelay')}</li>
                            <li>{t('manage.dialogs.hiddenUntilApproved')}</li>
                            <li>{t('manage.dialogs.approvalDataCleared')}</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
                <p className="text-sm">
                  {t('manage.dialogs.proceed')}
                </p>
              </div>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditWarningDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => selectedProject && editProjectWithWarning(selectedProject._id)}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {t('manage.dialogs.yesEdit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
