'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
  Calendar,
  AlertCircle,
  Copy,
  Trash2,
  Pause,
  Play,
  MoreVertical,
  Search,
  Filter,
  BookOpen,
  CheckCheck,
  Ban,
  ChevronLeft,
  ChevronRight,
  Loader2
} from "lucide-react"

interface Project {
  _id: string
  title: string
  description: string
  status: 'draft' | 'pending_approval' | 'published' | 'rejected' | 'booked' | 'on_hold' | 'completed' | 'cancelled'
  category: string
  subprojects: Array<{
    name: string
    description: string
    basePrice: number
    pricingModel: 'fixed' | 'hour' | 'm2' | 'meter'
  }>
  autoSaveTimestamp?: string
  submittedAt?: string
  approvedAt?: string
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

export default function ManageProjectsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [drafts, setDrafts] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)
  const [editWarningDialogOpen, setEditWarningDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalProjects, setTotalProjects] = useState(0)
  const [projectCounts, setProjectCounts] = useState({
    drafts: 0,
    pending: 0,
    published: 0,
    booked: 0,
    on_hold: 0,
    completed: 0,
    rejected: 0,
    cancelled: 0
  })

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login?redirect=/professional/projects/manage')
    } else if (!loading && user?.role !== 'professional') {
      router.push('/dashboard')
    }
  }, [isAuthenticated, loading, router, user])

  // Debouncing effect for search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 500) // 500ms delay

    return () => clearTimeout(timer)
  }, [searchTerm])

  // Fetch projects when filters change
  useEffect(() => {
    if (user?.role === 'professional') {
      setCurrentPage(1) // Reset to first page when filters change
      fetchProjects()
    }
  }, [user, debouncedSearchTerm, statusFilter, categoryFilter])

  // Fetch projects when page changes
  useEffect(() => {
    if (user?.role === 'professional' && currentPage > 1) {
      fetchProjects()
    }
  }, [currentPage])

  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Build query parameters
      const queryParams = new URLSearchParams()

      if (debouncedSearchTerm.trim()) {
        queryParams.append('search', debouncedSearchTerm.trim())
      }

      if (statusFilter && statusFilter !== 'all') {
        queryParams.append('status', statusFilter)
      }

      if (categoryFilter && categoryFilter !== 'all') {
        queryParams.append('category', categoryFilter)
      }

      queryParams.append('page', currentPage.toString())
      queryParams.append('limit', '20')

      const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/master${queryParams.toString() ? '?' + queryParams.toString() : ''}`

      const projectsResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })

      if (projectsResponse.ok) {
        const responseData = await projectsResponse.json()

        // Handle the new API response structure
        if (responseData.items && responseData.meta) {
          // New API response format
          setProjects(responseData.items)
          setTotalPages(responseData.meta.pages || 1)
          setTotalProjects(responseData.meta.total || responseData.items.length)
          setCurrentPage(responseData.meta.page || 1)

          // Set project counts from the counts object
          if (responseData.counts) {
            setProjectCounts({
              drafts: responseData.counts.drafts || 0,
              pending: responseData.counts.pending || 0,
              published: responseData.counts.published || 0,
              booked: responseData.counts.booked || 0,
              on_hold: responseData.counts.on_hold || 0,
              completed: responseData.counts.completed || 0,
              rejected: responseData.counts.rejected || 0,
              cancelled: responseData.counts.cancelled || 0
            })
          }

          // Set drafts for backwards compatibility
          setDrafts(responseData.items.filter((p: Project) => p.status === 'draft'))
        } else if (responseData.projects) {
          // Legacy paginated response
          setProjects(responseData.projects)
          setTotalPages(responseData.totalPages || 1)
          setTotalProjects(responseData.totalProjects || responseData.projects.length)
          setCurrentPage(responseData.currentPage || 1)
          setDrafts(responseData.projects.filter((p: Project) => p.status === 'draft'))
        } else if (Array.isArray(responseData)) {
          // Direct array response
          setProjects(responseData)
          setTotalPages(1)
          setTotalProjects(responseData.length)
          setCurrentPage(1)
          setDrafts(responseData.filter((p: Project) => p.status === 'draft'))
        } else {
          // Fallback
          setProjects([])
          setTotalPages(1)
          setTotalProjects(0)
          setCurrentPage(1)
          setDrafts([])
        }
      } else {
        const errorData = await projectsResponse.json().catch(() => ({}))
        setError(errorData.message || 'Failed to fetch projects')
        setProjects([])
        setTotalPages(1)
        setTotalProjects(0)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
      setError('Failed to fetch projects. Please check your connection.')
      setProjects([])
      setTotalPages(1)
      setTotalProjects(0)
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearchTerm, statusFilter, categoryFilter, currentPage])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'published':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'booked':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'on_hold':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300'
      case 'cancelled':
        return 'bg-slate-100 text-slate-800 border-slate-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <FileText className="h-4 w-4" />
      case 'pending_approval':
        return <Clock className="h-4 w-4" />
      case 'published':
        return <CheckCircle className="h-4 w-4" />
      case 'rejected':
        return <XCircle className="h-4 w-4" />
      case 'booked':
        return <BookOpen className="h-4 w-4" />
      case 'on_hold':
        return <Pause className="h-4 w-4" />
      case 'completed':
        return <CheckCheck className="h-4 w-4" />
      case 'cancelled':
        return <Ban className="h-4 w-4" />
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
        alert(errorData.error || 'Failed to submit project')
      }
    } catch (error) {
      console.error('Failed to submit project:', error)
      alert('Failed to submit project')
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
        alert(errorData.error || 'Failed to duplicate project')
      }
    } catch (error) {
      console.error('Failed to duplicate project:', error)
      alert('Failed to duplicate project')
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
        alert(errorData.error || 'Failed to delete project')
      }
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Failed to delete project')
    }
  }

  const toggleProjectHold = async (projectId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'published' ? 'on_hold' : 'published'
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
        alert(errorData.error || 'Failed to update project status')
      }
    } catch (error) {
      console.error('Failed to update project status:', error)
      alert('Failed to update project status')
    }
  }

  const editProjectWithWarning = (projectId: string) => {
    // Close dialog and redirect to edit page
    // The backend will automatically handle status change to pending_approval on save
    setEditWarningDialogOpen(false)
    setSelectedProject(null)
    router.push(`/projects/create?id=${projectId}`)
  }

  // Since filtering is now handled server-side, we use projects directly
  const filteredProjects = projects

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your projects...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || user?.role !== 'professional') {
    return null
  }

  const draftProjects = filteredProjects.filter(p => p.status === 'draft')
  const pendingProjects = filteredProjects.filter(p => p.status === 'pending_approval')
  const publishedProjects = filteredProjects.filter(p => p.status === 'published')
  const rejectedProjects = filteredProjects.filter(p => p.status === 'rejected')
  const bookedProjects = filteredProjects.filter(p => p.status === 'booked')
  const onHoldProjects = filteredProjects.filter(p => p.status === 'on_hold')
  const completedProjects = filteredProjects.filter(p => p.status === 'completed')
  const cancelledProjects = filteredProjects.filter(p => p.status === 'cancelled')

  // Get unique categories for filter dropdown
  const uniqueCategories = Array.from(new Set(projects.map(p => p.category))).filter(Boolean)

  // Project Action Menu Component
  const ProjectActionMenu = ({ project }: { project: Project }) => {
    const canEdit = ['draft', 'rejected'].includes(project.status)
    const canEditWithWarning = ['published', 'on_hold'].includes(project.status)
    const canSubmit = project.status === 'draft'
    const canHold = ['published', 'on_hold'].includes(project.status)
    const canDelete = ['draft', 'rejected'].includes(project.status)

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
            View Details
          </DropdownMenuItem>

          {canEdit && (
            <DropdownMenuItem onClick={() => router.push(`/projects/create?id=${project._id}`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Project
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
              Edit Project
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => {
              setSelectedProject(project)
              setDuplicateDialogOpen(true)
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Duplicate Project
          </DropdownMenuItem>

          {canSubmit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => submitProject(project._id)}>
                <Send className="h-4 w-4 mr-2" />
                Submit for Review
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
                {project.status === 'published' ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Put On Hold
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Resume Publishing
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
                Delete Project
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
              <span className="truncate">Manage Projects</span>
            </h1>
            <p className="text-sm md:text-base text-gray-600">Manage your service offerings and project submissions</p>
          </div>
          <Button
            onClick={() => router.push('/projects/create')}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto flex-shrink-0"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Create New Project</span>
            <span className="sm:hidden">New Project</span>
          </Button>
        </div>

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
                placeholder="Search projects..."
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
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-6 md:mb-8">
          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <FileText className="h-3 w-3 text-gray-500 flex-shrink-0" />
                <span className="truncate">Drafts</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{projectCounts.drafts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                <span className="truncate">Pending</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{projectCounts.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                <span className="truncate">Published</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{projectCounts.published}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <BookOpen className="h-3 w-3 text-blue-500 flex-shrink-0" />
                <span className="truncate">Booked</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{projectCounts.booked}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <Pause className="h-3 w-3 text-orange-500 flex-shrink-0" />
                <span className="truncate">On Hold</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{projectCounts.on_hold}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <CheckCheck className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                <span className="truncate">Completed</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{projectCounts.completed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                <span className="truncate">Rejected</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{projectCounts.rejected}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3">
              <CardTitle className="flex items-center gap-1 text-xs">
                <Ban className="h-3 w-3 text-slate-500 flex-shrink-0" />
                <span className="truncate">Cancelled</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3">
              <div className="text-base sm:text-lg md:text-xl font-bold">{projectCounts.cancelled}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="all" className="space-y-6">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex h-auto min-w-full w-max p-1 bg-muted rounded-md">
              <TabsTrigger value="all" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                All ({filteredProjects.length})
              </TabsTrigger>
              <TabsTrigger value="drafts" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Drafts ({draftProjects.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Pending ({pendingProjects.length})
              </TabsTrigger>
              <TabsTrigger value="published" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Published ({publishedProjects.length})
              </TabsTrigger>
              <TabsTrigger value="booked" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Booked ({bookedProjects.length})
              </TabsTrigger>
              <TabsTrigger value="on_hold" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                On Hold ({onHoldProjects.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Completed ({completedProjects.length})
              </TabsTrigger>
              <TabsTrigger value="rejected" className="whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5">
                Rejected ({rejectedProjects.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="space-y-6">
            {filteredProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No projects found</h3>
                  <p className="text-gray-600 mb-4">
                    {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'Create your first project to get started'
                    }
                  </p>
                  {!searchTerm && statusFilter === 'all' && categoryFilter === 'all' && (
                    <Button onClick={() => router.push('/projects/create')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Project
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {filteredProjects.map((project) => (
                  <Card key={project._id} className="hover:shadow-md transition-shadow flex flex-col h-full w-full overflow-hidden">
                    <CardHeader className="pb-3 px-3 md:px-6">
                      <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                        <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-words">{project.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                            {getStatusIcon(project.status)}
                            <span className="ml-1 capitalize hidden sm:inline">{project.status.replace('_', ' ')}</span>
                          </Badge>
                          <ProjectActionMenu project={project} />
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3 text-xs md:text-sm break-words">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                          <span className="truncate text-xs">
                            {project.status === 'pending_approval' && project.submittedAt && `Submitted: ${new Date(project.submittedAt).toLocaleDateString()}`}
                            {project.status === 'published' && project.approvedAt && `Published: ${new Date(project.approvedAt).toLocaleDateString()}`}
                            {!project.submittedAt && !project.approvedAt && `Updated: ${new Date(project.autoSaveTimestamp || project.updatedAt).toLocaleDateString()}`}
                          </span>
                        </div>
                        <div className="truncate text-xs">{project.subprojects.length} pricing option{project.subprojects.length !== 1 ? 's' : ''}</div>
                        {project.category && <div className="truncate text-xs">Category: {project.category}</div>}
                      </div>

                      {project.adminFeedback && project.status === 'rejected' && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-2 md:p-3">
                          <h4 className="font-medium text-red-800 mb-1 text-xs">Admin Feedback:</h4>
                          <p className="text-xs text-red-700 line-clamp-3 break-words">{project.adminFeedback}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="drafts" className="space-y-6">
            {draftProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No draft projects</h3>
                  <p className="text-gray-600 mb-4">Create your first project to get started</p>
                  <Button onClick={() => router.push('/projects/create')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {draftProjects.map((project) => (
                  <Card key={project._id} className="hover:shadow-md transition-shadow flex flex-col h-full w-full overflow-hidden">
                    <CardHeader className="pb-3 px-3 md:px-6">
                      <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                        <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-words">{project.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                            {getStatusIcon(project.status)}
                            <span className="ml-1 capitalize hidden sm:inline">{project.status.replace('_', ' ')}</span>
                          </Badge>
                          <ProjectActionMenu project={project} />
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3 text-xs md:text-sm break-words">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                          <span className="truncate text-xs">
                            {new Date(project.autoSaveTimestamp || project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="truncate text-xs">{project.subprojects.length} pricing option{project.subprojects.length !== 1 ? 's' : ''}</div>
                        {project.category && <div className="truncate text-xs">Category: {project.category}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-6">
            {pendingProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No pending projects</h3>
                  <p className="text-gray-600">Projects you submit will appear here for admin review</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {pendingProjects.map((project) => (
                  <Card key={project._id} className="hover:shadow-md transition-shadow flex flex-col h-full w-full overflow-hidden">
                    <CardHeader className="pb-3 px-3 md:px-6">
                      <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                        <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-words">{project.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                            {getStatusIcon(project.status)}
                            <span className="ml-1 capitalize hidden sm:inline">{project.status.replace('_', ' ')}</span>
                          </Badge>
                          <ProjectActionMenu project={project} />
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3 text-xs md:text-sm break-words">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                          <span className="truncate text-xs">
                            Submitted: {new Date(project.submittedAt!).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="truncate text-xs">{project.subprojects.length} pricing option{project.subprojects.length !== 1 ? 's' : ''}</div>
                        {project.category && <div className="truncate text-xs">Category: {project.category}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="published" className="space-y-6">
            {publishedProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No published projects</h3>
                  <p className="text-gray-600">Approved projects will appear here and be visible to customers</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {publishedProjects.map((project) => (
                  <Card key={project._id} className="hover:shadow-md transition-shadow flex flex-col h-full w-full overflow-hidden">
                    <CardHeader className="pb-3 px-3 md:px-6">
                      <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                        <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-words">{project.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                            {getStatusIcon(project.status)}
                            <span className="ml-1 capitalize hidden sm:inline">{project.status}</span>
                          </Badge>
                          <ProjectActionMenu project={project} />
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3 text-xs md:text-sm break-words">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                          <span className="truncate text-xs">
                            Published: {new Date(project.approvedAt!).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="truncate text-xs">{project.subprojects.length} pricing option{project.subprojects.length !== 1 ? 's' : ''}</div>
                        {project.category && <div className="truncate text-xs">Category: {project.category}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-6">
            {rejectedProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No rejected projects</h3>
                  <p className="text-gray-600">Projects that need revisions will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {rejectedProjects.map((project) => (
                  <Card key={project._id} className="hover:shadow-md transition-shadow border-red-200 flex flex-col h-full w-full overflow-hidden">
                    <CardHeader className="pb-3 px-3 md:px-6">
                      <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                        <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-words">{project.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                            {getStatusIcon(project.status)}
                            <span className="ml-1 capitalize hidden sm:inline">{project.status}</span>
                          </Badge>
                          <ProjectActionMenu project={project} />
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3 text-xs md:text-sm break-words">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
                      {project.adminFeedback && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-2 md:p-3">
                          <h4 className="font-medium text-red-800 mb-1 text-xs">Admin Feedback:</h4>
                          <p className="text-xs text-red-700 line-clamp-3 break-words">{project.adminFeedback}</p>
                        </div>
                      )}

                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                          <span className="truncate text-xs">
                            Last updated: {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="truncate text-xs">{project.subprojects.length} pricing option{project.subprojects.length !== 1 ? 's' : ''}</div>
                        {project.category && <div className="truncate text-xs">Category: {project.category}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="booked" className="space-y-6">
            {bookedProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No booked projects</h3>
                  <p className="text-gray-600">Projects that have been booked by customers will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {bookedProjects.map((project) => (
                  <Card key={project._id} className="hover:shadow-md transition-shadow border-blue-200 flex flex-col h-full w-full overflow-hidden">
                    <CardHeader className="pb-3 px-3 md:px-6">
                      <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                        <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-words">{project.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                            {getStatusIcon(project.status)}
                            <span className="ml-1 capitalize hidden sm:inline">{project.status}</span>
                          </Badge>
                          <ProjectActionMenu project={project} />
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3 text-xs md:text-sm break-words">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                          <span className="truncate text-xs">
                            Booked: {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="truncate text-xs">{project.subprojects.length} pricing option{project.subprojects.length !== 1 ? 's' : ''}</div>
                        {project.category && <div className="truncate text-xs">Category: {project.category}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="on_hold" className="space-y-6">
            {onHoldProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Pause className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No projects on hold</h3>
                  <p className="text-gray-600">Projects you&apos;ve put on hold will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {onHoldProjects.map((project) => (
                  <Card key={project._id} className="hover:shadow-md transition-shadow border-orange-200 flex flex-col h-full w-full overflow-hidden">
                    <CardHeader className="pb-3 px-3 md:px-6">
                      <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                        <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-words">{project.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                            {getStatusIcon(project.status)}
                            <span className="ml-1 capitalize hidden sm:inline">{project.status.replace('_', ' ')}</span>
                          </Badge>
                          <ProjectActionMenu project={project} />
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3 text-xs md:text-sm break-words">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                          <span className="truncate text-xs">
                            Put on hold: {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="truncate text-xs">{project.subprojects.length} pricing option{project.subprojects.length !== 1 ? 's' : ''}</div>
                        {project.category && <div className="truncate text-xs">Category: {project.category}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-6">
            {completedProjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <CheckCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No completed projects</h3>
                  <p className="text-gray-600">Projects you&apos;ve completed will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-6">
                {completedProjects.map((project) => (
                  <Card key={project._id} className="hover:shadow-md transition-shadow border-emerald-200 flex flex-col h-full w-full overflow-hidden">
                    <CardHeader className="pb-3 px-3 md:px-6">
                      <div className="flex items-start justify-between gap-2 md:gap-3 mb-2">
                        <CardTitle className="text-sm md:text-lg leading-tight line-clamp-2 min-w-0 flex-1 break-words">{project.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(project.status)} border text-xs`}>
                            {getStatusIcon(project.status)}
                            <span className="ml-1 capitalize hidden sm:inline">{project.status}</span>
                          </Badge>
                          <ProjectActionMenu project={project} />
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3 text-xs md:text-sm break-words">
                        {project.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4 pt-0 px-3 md:px-6 flex-1 flex flex-col">
                      <div className="text-xs md:text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                          <span className="truncate text-xs">
                            Completed: {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="truncate text-xs">{project.subprojects.length} pricing option{project.subprojects.length !== 1 ? 's' : ''}</div>
                        {project.category && <div className="truncate text-xs">Category: {project.category}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between mt-6 px-4 gap-3">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * 20) + 1} to {Math.min(currentPage * 20, totalProjects)} of {totalProjects} projects
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
                Previous
              </Button>

              <div className="flex items-center gap-1 overflow-x-auto max-w-full">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
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
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Duplicate Confirmation Dialog */}
        <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Duplicate Project</DialogTitle>
              <DialogDescription>
                Are you sure you want to duplicate &quot;{selectedProject?.title}&quot;? This will create a new draft copy of the project that you can edit.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedProject && duplicateProject(selectedProject._id)}
              >
                Duplicate Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{selectedProject?.title}&quot;? This action cannot be undone and all project data will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedProject && deleteProject(selectedProject._id)}
              >
                Delete Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Hold/Resume Confirmation Dialog */}
        <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedProject?.status === 'published' ? 'Put Project On Hold' : 'Resume Project Publishing'}
              </DialogTitle>
              <DialogDescription>
                {selectedProject?.status === 'published'
                  ? `Are you sure you want to put &quot;${selectedProject?.title}&quot; on hold? It will no longer be visible to customers.`
                  : `Are you sure you want to resume publishing &quot;${selectedProject?.title}&quot;? It will become visible to customers again.`
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHoldDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedProject && toggleProjectHold(selectedProject._id, selectedProject.status)}
              >
                {selectedProject?.status === 'published' ? 'Put On Hold' : 'Resume Publishing'}
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
                Edit Published Project
              </DialogTitle>
              <DialogDescription className="space-y-3">
                <p>
                  You are about to edit &quot;{selectedProject?.title}&quot; which is currently {selectedProject?.status === 'published' ? 'published and visible to customers' : 'on hold'}.
                </p>
                <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-orange-800">
                      <p className="font-medium mb-1">Important Notice:</p>
                      <ul className="space-y-1 text-xs">
                        <li>• When you save any changes, the project will automatically move to &quot;Pending Approval&quot; status</li>
                        <li>• Every change will need to be re-approved by our admin team</li>
                        <li>• The approval process typically takes up to 48 hours</li>
                        <li>• The project will not be visible to customers until re-approved</li>
                        <li>• Previous approval fields will be cleared and submittedAt will be updated</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <p className="text-sm">
                  Do you want to proceed with editing this project?
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditWarningDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedProject && editProjectWithWarning(selectedProject._id)}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Yes, Edit Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}