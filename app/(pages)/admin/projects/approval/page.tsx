'use client'
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  MapPin,
  DollarSign,
  FileText,
  AlertTriangle,
  ImageIcon,
  Video,
  Award,
  Package,
  Paperclip,
  ExternalLink,
  Mail,
  Phone,
  Building
} from "lucide-react"
import Image from 'next/image'
import { toast } from 'sonner'
import ProjectDiffView from '@/components/admin/ProjectDiffView'

interface QualityCheck {
  category: string
  status: 'passed' | 'failed' | 'warning'
  message: string
  checkedAt: string
}

interface Professional {
  name: string
  email: string
  phone: string
  businessInfo?: {
    businessName?: string
    website?: string
    address?: string
  }
  professionalStatus?: string
}

// Media and attachment items can be either string URLs or objects with url
type MediaItem = string | { url: string }
type AttachmentItem = string | { url: string }

// Support both legacy and current certification shapes
interface CertificationItem {
  name?: string
  issuedBy?: string
  issuedDate?: string
  expiryDate?: string
  certificateUrl?: string
  fileUrl?: string
  uploadedAt?: string
  isRequired?: boolean
}

interface RFQQuestion {
  question: string
  answerType: string
  professionalAnswer?: string
  professionalAttachments?: AttachmentItem[]
}

interface PostBookingQuestion {
  question: string
  answerType: string
  professionalAnswer?: string
  professionalAttachments?: AttachmentItem[]
}

interface SubprojectIncludedItem {
  name: string
  isDynamicField?: boolean
}

interface SubprojectMaterial {
  name: string
  quantity?: string
  unit?: string
  description?: string
}

interface ProfessionalInputValue {
  fieldName: string
  value: string | number | { min: number; max: number }
}

interface Subproject {
  name: string
  description?: string
  projectType?: string[]
  included?: SubprojectIncludedItem[]
  materialsIncluded?: boolean
  materials?: SubprojectMaterial[]
  professionalInputs?: ProfessionalInputValue[]
  pricing?: {
    type?: string
    amount?: number
    priceRange?: { min?: number; max?: number }
    minOrderQuantity?: number
  }
  preparationDuration?: { value?: number; unit?: string }
  executionDuration?: {
    value?: number
    unit?: string
    range?: { min?: number; max?: number }
  }
  buffer?: { value?: number; unit?: string }
  intakeDuration?: { value?: number; unit?: string }
  warrantyPeriod?: { value?: number; unit?: string }
}

interface ExtraOption {
  name: string
  description?: string
  price: number
  isCustom: boolean
}

interface TermCondition {
  name: string
  description: string
  type?: 'condition' | 'warning'
  additionalCost?: number
  isCustom: boolean
}

interface FAQItem {
  question: string
  answer: string
  isGenerated: boolean
}

interface Project {
  _id: string
  title: string
  description: string
  category: string
  service: string
  priceModel: string
  professionalId: string
  distance: {
    address: string
    maxKmRange?: number
    noBorders: boolean
  }
  projectType: string[]
  keywords: string[]
  status: string
  submittedAt: string
  qualityChecks: QualityCheck[]
  extraOptions?: ExtraOption[]
  termsConditions?: TermCondition[]
  faq?: FAQItem[]
  customConfirmationMessage?: string
  // TODO: customerPresence is intentionally unused for now
  customerPresence?: string
  professional?: Professional
  media?: {
    images?: MediaItem[]
    video?: MediaItem
    captions?: MediaItem
  }
  certifications?: CertificationItem[]
  rfqQuestions?: RFQQuestion[]
  postBookingQuestions?: PostBookingQuestion[]
  subprojects?: Subproject[]
  isResubmission?: boolean
  reapprovalType?: "full" | "moderation_failed" | "none" | null
}

// Helpers to normalize media/attachment URLs and certification link
const getUrl = (item?: MediaItem | AttachmentItem | null): string => {
  if (!item) return ''
  return typeof item === 'string' ? item : (item.url || '')
}

const getCertUrl = (cert?: CertificationItem | null): string => {
  if (!cert) return ''
  return cert.certificateUrl || cert.fileUrl || ''
}

export default function ProjectApprovalPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [approvedProjects, setApprovedProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [feedback, setFeedback] = useState('')
  const [suspendReason, setSuspendReason] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending')
  const [approvedFilter, setApprovedFilter] = useState<'all' | 'published' | 'on_hold' | 'suspended'>('all')
  const [approvedSearch, setApprovedSearch] = useState('')
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectChanges, setProjectChanges] = useState<{
    isResubmission: boolean
    reapprovalType: "full" | "moderation_failed" | "none" | null
    changes: { field: string; category: "A" | "B" | "none"; oldValue: unknown; newValue: unknown; moderationResult?: { passed: boolean; reasons?: string[] } }[]
  } | null>(null)
  const [changesLoading, setChangesLoading] = useState(false)
  const [changesError, setChangesError] = useState<string | null>(null)
  const [showFullDetails, setShowFullDetails] = useState(false)
  const changesAbortRef = useRef<AbortController | null>(null)

  // Abort in-flight changes request on unmount
  useEffect(() => {
    return () => {
      changesAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPendingProjects()
    } else {
      fetchApprovedProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'approved') {
      fetchApprovedProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedFilter])

  const fetchPendingProjects = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/pending`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        setProjects(data)
      } else {
        toast.error('Failed to fetch pending projects')
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
      toast.error('Failed to fetch pending projects')
    }
    setIsLoading(false)
  }

  const fetchApprovedProjects = async () => {
    setIsLoading(true)
    try {
      const statusParam = approvedFilter !== 'all' ? `?status=${approvedFilter}` : ''
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/approved${statusParam}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        setApprovedProjects(data)
      } else {
        toast.error('Failed to fetch approved projects')
      }
    } catch (error) {
      console.error('Error fetching approved projects:', error)
      toast.error('Failed to fetch approved projects')
    }
    setIsLoading(false)
  }

  const fetchProjectChanges = async (projectId: string) => {
    // Abort any in-flight request to prevent stale responses
    if (changesAbortRef.current) {
      changesAbortRef.current.abort()
    }
    const controller = new AbortController()
    changesAbortRef.current = controller

    setChangesLoading(true)
    setProjectChanges(null)
    setChangesError(null)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/${projectId}/changes`,
        { credentials: 'include', signal: controller.signal }
      )
      if (controller.signal.aborted) return
      if (response.ok) {
        const data = await response.json()
        if (!controller.signal.aborted) {
          setProjectChanges(data)
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch project changes' }))
        if (!controller.signal.aborted) {
          const msg = errorData?.error || `Failed to fetch changes (${response.status})`
          setChangesError(msg)
          toast.error(msg)
        }
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Error fetching project changes:', error)
      if (!controller.signal.aborted) {
        setChangesError('Failed to fetch project changes')
        toast.error('Failed to fetch project changes')
      }
    } finally {
      if (!controller.signal.aborted) {
        setChangesLoading(false)
      }
    }
  }

  const handleSelectProject = (project: Project) => {
    // Abort any in-flight changes request for the previous project
    if (changesAbortRef.current) {
      changesAbortRef.current.abort()
    }
    setSelectedProject(project)
    setShowFullDetails(false)
    setProjectChanges(null)
    setChangesError(null)
    // Fetch changes for pending projects
    if (activeTab === 'pending') {
      fetchProjectChanges(project._id)
    }
  }

  const handleApprove = async (projectId: string) => {
    setActionLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/${projectId}/approve`, {
        method: 'PUT',
        credentials: 'include'
      })

      if (response.ok) {
        toast.success('Project approved successfully!')
        setProjects(projects.filter(p => p._id !== projectId))
        setSelectedProject(null)
      } else {
        toast.error('Failed to approve project')
      }
    } catch (error) {
      console.error('Error approving project:', error)
      toast.error('Failed to approve project')
    }
    setActionLoading(false)
  }

  const handleReject = async (projectId: string) => {
    if (!feedback.trim()) {
      toast.error('Please provide feedback before rejecting')
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/${projectId}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feedback }),
        credentials: 'include'
      })

      if (response.ok) {
        toast.success('Project rejected with feedback')
        setProjects(projects.filter(p => p._id !== projectId))
        setSelectedProject(null)
        setFeedback('')
      } else {
        toast.error('Failed to reject project')
      }
    } catch (error) {
      console.error('Error rejecting project:', error)
      toast.error('Failed to reject project')
    }
    setActionLoading(false)
  }

  // Admin actions on approved projects
  const handleDeactivate = async (projectId: string) => {
    if (!suspendReason.trim()) {
      toast.error('Please provide a suspension reason')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/${projectId}/deactivate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: suspendReason })
      })
      if (res.ok) {
        toast.success('Project suspended and email sent')
        setApprovedProjects(prev => prev.map(p => p._id === projectId ? { ...p, status: 'on_hold' } : p))
        if (selectedProject?._id === projectId) setSelectedProject({ ...selectedProject, status: 'on_hold' } as Project)
        setSuspendReason('')
        setSuspendDialogOpen(false)
      } else {
        toast.error('Failed to suspend project')
      }
    } catch (e) {
      console.error('Error deactivating project:', e)
      toast.error('Failed to suspend project')
    }
    setActionLoading(false)
  }

  const handleReactivate = async (projectId: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/${projectId}/reactivate`, {
        method: 'PUT',
        credentials: 'include'
      })
      if (res.ok) {
        toast.success('Project reactivated and email sent')
        setApprovedProjects(prev => prev.map(p => p._id === projectId ? { ...p, status: 'published' } : p))
        if (selectedProject?._id === projectId) setSelectedProject({ ...selectedProject, status: 'published' } as Project)
      } else {
        toast.error('Failed to reactivate project')
      }
    } catch (e) {
      console.error('Error reactivating project:', e)
      toast.error('Failed to reactivate project')
    }
    setActionLoading(false)
  }

  const handleDelete = async (projectId: string) => {
    if (!deleteReason.trim()) {
      toast.error('Please provide a deletion reason')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/admin/${projectId}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: deleteReason })
      })
      if (res.ok) {
        toast.success('Project deleted and email sent')
        setApprovedProjects(prev => prev.filter(p => p._id !== projectId))
        if (selectedProject?._id === projectId) setSelectedProject(null)
        setDeleteReason('')
        setDeleteDialogOpen(false)
      } else {
        toast.error('Failed to delete project')
      }
    } catch (e) {
      console.error('Error deleting project:', e)
      toast.error('Failed to delete project')
    }
    setActionLoading(false)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending Review</Badge>
      case 'published':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Published</Badge>
      case 'on_hold':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800">Suspended / On Hold</Badge>
      case 'suspended':
        return <Badge variant="secondary" className="bg-red-100 text-red-800">Suspended</Badge>
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-100 text-red-800">Rejected</Badge>
      case 'draft':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800">Draft</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getQualityCheckIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen p-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading pending projects...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Project Approval Queue
          </h1>
          <p className="text-gray-600">
            Review and approve professional service project submissions
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex items-center space-x-2">
          <Button variant={activeTab === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => { setActiveTab('pending'); setSelectedProject(null) }}>
            Pending
          </Button>
          <Button variant={activeTab === 'approved' ? 'default' : 'outline'} size="sm" onClick={() => { setActiveTab('approved'); setSelectedProject(null) }}>
            Approved
          </Button>
          {activeTab === 'approved' && (
            <div className="ml-auto flex items-center gap-2 w-full sm:w-auto">
              <div className="hidden sm:flex items-center gap-2">
                <Label className="text-xs">Filter:</Label>
                <Button size="sm" variant={approvedFilter === 'all' ? 'default' : 'outline'} onClick={() => setApprovedFilter('all')}>All</Button>
                <Button size="sm" variant={approvedFilter === 'published' ? 'default' : 'outline'} onClick={() => setApprovedFilter('published')}>Published</Button>
                <Button size="sm" variant={approvedFilter === 'on_hold' ? 'default' : 'outline'} onClick={() => setApprovedFilter('on_hold')}>Suspended / On Hold</Button>
                <Button size="sm" variant={approvedFilter === 'suspended' ? 'default' : 'outline'} onClick={() => setApprovedFilter('suspended')}>Suspended</Button>
              </div>
              <div className="flex-1 sm:flex-none">
                <Input
                  placeholder="Search approved by title..."
                  value={approvedSearch}
                  onChange={(e) => setApprovedSearch(e.target.value)}
                  className="h-8 w-full sm:w-72"
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects List */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{activeTab === 'pending' ? `Pending Projects (${projects.length})` : `Approved Projects (${approvedProjects.filter(p => approvedFilter === 'all' ? true : p.status === approvedFilter).length})`}</span>
                  <Button variant="outline" size="sm" onClick={activeTab === 'pending' ? fetchPendingProjects : fetchApprovedProjects}>
                    Refresh
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(activeTab === 'pending' ? projects.length === 0 : approvedProjects.filter(p => approvedFilter === 'all' ? true : p.status === approvedFilter).length === 0) ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600">{activeTab === 'pending' ? 'No projects pending approval' : 'No approved projects found'}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(activeTab === 'pending'
                      ? projects
                      : approvedProjects
                        .filter(p => approvedFilter === 'all' ? true : p.status === approvedFilter)
                        .filter(p => p.title.toLowerCase().includes(approvedSearch.trim().toLowerCase()))
                    ).map((project) => (
                      <Card
                        key={project._id}
                        className={`cursor-pointer transition-colors ${selectedProject?._id === project._id
                          ? 'border-blue-500 bg-blue-50'
                          : 'hover:bg-gray-50'
                          }`}
                        onClick={() => handleSelectProject(project)}
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-sm line-clamp-2">
                              {project.title}
                              {activeTab === 'approved' && (
                                <span className="ml-2 align-middle">{getStatusBadge(project.status)}</span>
                              )}
                            </h4>
                            {activeTab === 'pending' && getStatusBadge(project.status)}
                          </div>

                          <div className="space-y-2 text-sm text-gray-600">
                            <div className="flex items-center space-x-2">
                              <User className="w-4 h-4" />
                              <span>{project.category} - {project.service}</span>
                            </div>

                            <div className="flex items-center space-x-2">
                              <MapPin className="w-4 h-4" />
                              <span>{project.distance.maxKmRange}km range</span>
                            </div>

                            <div className="flex items-center space-x-2">
                              <DollarSign className="w-4 h-4" />
                              <span>{project.priceModel} pricing</span>
                            </div>

                            <div className="flex items-center space-x-2">
                              <Clock className="w-4 h-4" />
                              <span>
                                Submitted {new Date(project.submittedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          {/* Quality Check Summary */}
                          {project.qualityChecks && project.qualityChecks.length > 0 && (
                            <div className="mt-3 flex items-center space-x-1">
                              {project.qualityChecks.slice(0, 3).map((check, index) => (
                                <div key={index} className="flex items-center">
                                  {getQualityCheckIcon(check.status)}
                                </div>
                              ))}
                              {project.qualityChecks.length > 3 && (
                                <span className="text-xs text-gray-500">
                                  +{project.qualityChecks.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Project Details */}
          <div>
            {selectedProject ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <FileText className="w-5 h-5" />
                    <span>{activeTab === 'pending' ? 'Project Review' : 'Approved Project'}</span>
                  </CardTitle>
                  <CardDescription>
                    {activeTab === 'pending' ? 'Review project details and make approval decision' : 'Manage approved project (suspend, reactivate, or delete)'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Loading indicator for changes */}
                  {activeTab === 'pending' && changesLoading && (
                    <div className="text-sm text-gray-500 py-2">Loading changes...</div>
                  )}

                  {/* Error indicator for changes */}
                  {activeTab === 'pending' && changesError && !changesLoading && (
                    <div className="text-sm text-red-500 py-2">{changesError}</div>
                  )}

                  {/* Diff View for Resubmissions */}
                  {activeTab === 'pending' && !changesLoading && projectChanges?.isResubmission && (
                    <div className="space-y-3">
                      <ProjectDiffView
                        changes={projectChanges.changes || []}
                        reapprovalType={projectChanges.reapprovalType}
                      />
                      <button
                        type="button"
                        onClick={() => setShowFullDetails(!showFullDetails)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {showFullDetails ? 'Hide full project details' : 'Show full project details'}
                      </button>
                    </div>
                  )}

                  {/* Project Info - always show for non-resubmissions, collapsible for resubmissions */}
                  {(!projectChanges?.isResubmission || activeTab !== 'pending' || showFullDetails) && (<>
                    <div>
                      <h4 className="font-semibold mb-3">Project Information</h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-sm font-medium">Title</Label>
                          <p className="text-sm text-gray-700">{selectedProject.title}</p>
                        </div>

                        <div>
                          <Label className="text-sm font-medium">Description</Label>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {selectedProject.description}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-medium">Category</Label>
                            <p className="text-sm text-gray-700">{selectedProject.category}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Service</Label>
                            <p className="text-sm text-gray-700">{selectedProject.service}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-medium">Price Model</Label>
                            <p className="text-sm text-gray-700">{selectedProject.priceModel}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Service Range</Label>
                            <p className="text-sm text-gray-700">
                              {selectedProject.distance.noBorders
                                ? 'No borders'
                                : selectedProject.distance.maxKmRange != null
                                  ? `${selectedProject.distance.maxKmRange}km`
                                  : 'Not specified'}
                            </p>
                          </div>
                        </div>

                        {selectedProject.projectType && selectedProject.projectType.length > 0 && (
                          <div>
                            <Label className="text-sm font-medium">Project Types</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedProject.projectType.map((type, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {type}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedProject.keywords && selectedProject.keywords.length > 0 && (
                          <div>
                            <Label className="text-sm font-medium">Keywords</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedProject.keywords.map((keyword, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Professional Information */}
                    {selectedProject.professional && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <Building className="w-4 h-4" />
                          <span>Professional Information</span>
                        </h4>
                        <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-sm font-medium flex items-center space-x-1">
                                <User className="w-3 h-3" />
                                <span>Name</span>
                              </Label>
                              <p className="text-sm text-gray-700">{selectedProject.professional.name}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium flex items-center space-x-1">
                                <Mail className="w-3 h-3" />
                                <span>Email</span>
                              </Label>
                              <p className="text-sm text-gray-700">{selectedProject.professional.email}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-sm font-medium flex items-center space-x-1">
                                <Phone className="w-3 h-3" />
                                <span>Phone</span>
                              </Label>
                              <p className="text-sm text-gray-700">{selectedProject.professional.phone}</p>
                            </div>
                            {selectedProject.professional.professionalStatus && (
                              <div>
                                <Label className="text-sm font-medium">Status</Label>
                                <Badge variant="outline" className="mt-1">
                                  {selectedProject.professional.professionalStatus}
                                </Badge>
                              </div>
                            )}
                          </div>
                          {selectedProject.professional.businessInfo && (
                            <div>
                              <Label className="text-sm font-medium">Business Information</Label>
                              <div className="mt-2 space-y-2 text-sm text-gray-700">
                                {selectedProject.professional.businessInfo.businessName && (
                                  <p><strong>Business:</strong> {selectedProject.professional.businessInfo.businessName}</p>
                                )}
                                {selectedProject.professional.businessInfo.website && (
                                  <p>
                                    <strong>Website:</strong>{' '}
                                    <a
                                      href={selectedProject.professional.businessInfo.website}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline items-center inline-flex space-x-1"
                                    >
                                      <span>{selectedProject.professional.businessInfo.website}</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </p>
                                )}
                                {selectedProject.professional.businessInfo.address && (
                                  <p><strong>Address:</strong> {selectedProject.professional.businessInfo.address}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Project Images */}
                    {selectedProject.media?.images && selectedProject.media.images.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <ImageIcon className="w-4 h-4" />
                          <span>Project Images ({selectedProject.media.images.length})</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          {selectedProject.media.images.map((image, index) => (
                            <div key={index} className="relative aspect-video border rounded-lg overflow-hidden bg-gray-100">
                              <Image
                                src={getUrl(image)}
                                alt={`Project image ${index + 1}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 50vw"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Project Video */}
                    {selectedProject.media?.video && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <Video className="w-4 h-4" />
                          <span>Project Video</span>
                        </h4>
                        <div className="relative aspect-video border rounded-lg overflow-hidden bg-gray-100">
                          <video
                            src={getUrl(selectedProject.media.video)}
                            controls
                            className="w-full h-full"
                          >
                            <track
                              kind="captions"
                              src={selectedProject.media.captions ? getUrl(selectedProject.media.captions) : ''}
                              srcLang="en"
                              label={selectedProject.media.captions ? 'English captions' : 'No captions available'}
                              default
                              {...(!selectedProject.media.captions ? { 'aria-hidden': true } : {})}
                            />
                            Your browser does not support the video tag.
                          </video>
                        </div>
                      </div>
                    )}

                    {/* Subprojects */}
                    {selectedProject && selectedProject.subprojects && selectedProject.subprojects.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <Package className="w-4 h-4" />
                          <span>Subprojects ({selectedProject.subprojects.length})</span>
                        </h4>
                        <div className="space-y-3">
                          {selectedProject.subprojects.map((sp: Subproject, idx: number) => {
                            const preparationValue = sp.preparationDuration?.value
                            const preparationUnit = sp.preparationDuration?.unit ?? sp.executionDuration?.unit ?? 'days'
                            return (
                              <div key={idx} className="p-3 rounded-lg border bg-gray-50">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium">{sp.name}</div>
                                  <div>
                                    {sp.pricing?.type && (
                                      <Badge variant="outline" className="text-xs">
                                        {sp.pricing.type}{sp.pricing?.amount !== null && sp.pricing?.amount !== undefined ? ` • €${sp.pricing.amount}` : ''}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {sp.description && (
                                  <p className="text-sm text-gray-700 mt-1">{sp.description}</p>
                                )}
                                {Array.isArray(sp.projectType) && sp.projectType.length > 0 && (
                                  <div className="mt-2 text-xs text-gray-700">Types: {sp.projectType.join(', ')}</div>
                                )}

                                {/* MOQ for unit pricing */}
                                {sp.pricing?.type === 'unit' && sp.pricing.minOrderQuantity != null && (
                                  <div className="mt-2 text-xs text-gray-700">
                                    <strong>Min Order Quantity:</strong> {sp.pricing.minOrderQuantity}
                                  </div>
                                )}

                                {/* Price Range for RFQ */}
                                {sp.pricing?.type === 'rfq' && sp.pricing.priceRange?.min != null && sp.pricing.priceRange?.max != null && (
                                  <div className="mt-2 text-xs text-gray-700">
                                    <strong>Price Range:</strong> €{sp.pricing.priceRange.min} - €{sp.pricing.priceRange.max}
                                  </div>
                                )}

                                {/* Service Parameters / Professional Inputs */}
                                {Array.isArray(sp.professionalInputs) && sp.professionalInputs.length > 0 && (
                                  <div className="mt-2">
                                    <Label className="text-xs font-medium">Service Parameters</Label>
                                    <div className="mt-1 space-y-1">
                                      {sp.professionalInputs.map((input: ProfessionalInputValue, i: number) => (
                                        <div key={i} className="flex items-center justify-between text-xs text-gray-700 bg-white px-2 py-1 rounded border">
                                          <span className="font-medium">{input.fieldName}</span>
                                          <span>
                                            {typeof input.value === 'object' && input.value !== null && 'min' in (input.value as Record<string, unknown>) && 'max' in (input.value as Record<string, unknown>)
                                              ? `${(input.value as { min: number; max: number }).min} - ${(input.value as { min: number; max: number }).max}`
                                              : String(input.value ?? '')}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {Array.isArray(sp.included) && sp.included.length > 0 && (
                                  <div className="mt-2">
                                    <Label className="text-xs font-medium">Included Items</Label>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {sp.included.map((it: SubprojectIncludedItem, i: number) => (
                                        <Badge key={i} variant="outline" className={`text-[10px] ${it.isDynamicField ? 'bg-purple-100' : ''}`}>
                                          {it.name}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {sp.materialsIncluded && Array.isArray(sp.materials) && sp.materials.length > 0 && (
                                  <div className="mt-2">
                                    <Label className="text-xs font-medium">Materials</Label>
                                    <div className="mt-1 space-y-1">
                                      {sp.materials.map((m: SubprojectMaterial, i: number) => (
                                        <div key={i} className="text-xs text-gray-700 bg-white px-2 py-1 rounded border flex items-center justify-between">
                                          <span className="font-medium">{m.name}</span>
                                          <span className="text-gray-500">
                                            {m.quantity ? `${m.quantity}` : ''}{m.unit ? ` ${m.unit}` : ''}{m.description ? ` — ${m.description}` : ''}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
                                  {preparationValue != null && (
                                    <div>
                                      Preparation: {preparationValue} {preparationUnit}
                                    </div>
                                  )}
                                  {sp.executionDuration?.value != null && (<div>Execution: {sp.executionDuration.value} {sp.executionDuration.unit}</div>)}
                                  {sp.executionDuration?.range && (sp.executionDuration.range.min != null || sp.executionDuration.range.max != null) && (
                                    <div>
                                      Range: {sp.executionDuration.range.min != null ? sp.executionDuration.range.min : ''}
                                      {sp.executionDuration.range.min != null && sp.executionDuration.range.max != null ? ' - ' : ''}
                                      {sp.executionDuration.range.max != null ? sp.executionDuration.range.max : ''}
                                    </div>
                                  )}
                                  {sp.buffer?.value != null && (<div>Buffer: {sp.buffer.value} {sp.buffer.unit}</div>)}
                                  {sp.intakeDuration?.value != null && (<div>Intake: {sp.intakeDuration.value} {sp.intakeDuration.unit}</div>)}
                                </div>
                                {sp.warrantyPeriod && (
                                  <div className="mt-2 text-xs text-gray-700">Warranty: {sp.warrantyPeriod.value} {sp.warrantyPeriod.unit}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Certifications */}
                    {selectedProject.certifications && selectedProject.certifications.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <Award className="w-4 h-4" />
                          <span>Certifications ({selectedProject.certifications.length})</span>
                        </h4>
                        <div className="space-y-3">
                          {selectedProject.certifications.map((cert, index) => (
                            <div key={index} className="p-4 border rounded-lg bg-gray-50">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h5 className="font-medium text-sm">{cert.name || 'Certification'}</h5>
                                  {(cert.issuedBy || cert.uploadedAt) && (
                                    <p className="text-sm text-gray-600 mt-1">
                                      {cert.issuedBy ? (
                                        <>Issued by: {cert.issuedBy}</>
                                      ) : (
                                        <>Uploaded: {cert.uploadedAt ? new Date(cert.uploadedAt).toLocaleDateString() : ''}</>
                                      )}
                                    </p>
                                  )}
                                  <div className="flex items-center space-x-4 text-xs text-gray-500 mt-2">
                                    {cert.issuedDate && (
                                      <span>Issued: {new Date(cert.issuedDate).toLocaleDateString()}</span>
                                    )}
                                    {cert.expiryDate && (
                                      <span>Expires: {new Date(cert.expiryDate).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                </div>
                                {getCertUrl(cert) && (
                                  <a
                                    href={getCertUrl(cert)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-4 text-blue-600 hover:text-blue-800"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RFQ Questions & Attachments */}
                    {selectedProject.rfqQuestions && selectedProject.rfqQuestions.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <FileText className="w-4 h-4" />
                          <span>RFQ Questions & Answers</span>
                        </h4>
                        <div className="space-y-3">
                          {selectedProject.rfqQuestions.map((rfq, index) => (
                            <div key={index} className="p-4 border rounded-lg">
                              <div className="mb-2">
                                <Label className="text-sm font-medium">Q{index + 1}: {rfq.question}</Label>
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {rfq.answerType}
                                </Badge>
                              </div>
                              {rfq.professionalAnswer && (
                                <p className="text-sm text-gray-700 mb-2">
                                  <strong>Answer:</strong> {rfq.professionalAnswer}
                                </p>
                              )}
                              {rfq.professionalAttachments && rfq.professionalAttachments.length > 0 && (
                                <div className="mt-3">
                                  <Label className="text-xs font-medium text-gray-500 flex items-center space-x-1">
                                    <Paperclip className="w-3 h-3" />
                                    <span>Attachments ({rfq.professionalAttachments.length})</span>
                                  </Label>
                                  <div className="mt-2 space-y-2">
                                    {rfq.professionalAttachments.map((attachment, attIndex) => (
                                      <a
                                        key={attIndex}
                                        href={getUrl(attachment)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                                      >
                                        <Paperclip className="w-3 h-3" />
                                        <span>Attachment {attIndex + 1}</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Post-Booking Questions & Attachments */}
                    {selectedProject.postBookingQuestions && selectedProject.postBookingQuestions.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <FileText className="w-4 h-4" />
                          <span>Post-Booking Questions & Answers</span>
                        </h4>
                        <div className="space-y-3">
                          {selectedProject.postBookingQuestions.map((pbq, index) => (
                            <div key={index} className="p-4 border rounded-lg bg-blue-50">
                              <div className="mb-2">
                                <Label className="text-sm font-medium">Q{index + 1}: {pbq.question}</Label>
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {pbq.answerType}
                                </Badge>
                              </div>
                              {pbq.professionalAnswer && (
                                <p className="text-sm text-gray-700 mb-2">
                                  <strong>Answer:</strong> {pbq.professionalAnswer}
                                </p>
                              )}
                              {pbq.professionalAttachments && pbq.professionalAttachments.length > 0 && (
                                <div className="mt-3">
                                  <Label className="text-xs font-medium text-gray-500 flex items-center space-x-1">
                                    <Paperclip className="w-3 h-3" />
                                    <span>Attachments ({pbq.professionalAttachments.length})</span>
                                  </Label>
                                  <div className="mt-2 space-y-2">
                                    {pbq.professionalAttachments.map((attachment, attIndex) => (
                                      <a
                                        key={attIndex}
                                        href={getUrl(attachment)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                                      >
                                        <Paperclip className="w-3 h-3" />
                                        <span>Attachment {attIndex + 1}</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Extra Options */}
                    {selectedProject.extraOptions && selectedProject.extraOptions.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <Package className="w-4 h-4" />
                          <span>Extra Options ({selectedProject.extraOptions.length})</span>
                        </h4>
                        <div className="space-y-2">
                          {selectedProject.extraOptions.map((opt: ExtraOption, index: number) => (
                            <div key={index} className="p-3 border rounded-lg bg-gray-50 flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm">{opt.name}</div>
                                {opt.description && <p className="text-xs text-gray-600 mt-0.5">{opt.description}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">€{(opt.price ?? 0).toFixed(2)}</Badge>
                                {opt.isCustom && <Badge className="text-[10px] bg-purple-100 text-purple-800">Custom</Badge>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Terms & Conditions */}
                    {selectedProject.termsConditions && selectedProject.termsConditions.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <FileText className="w-4 h-4" />
                          <span>Terms & Conditions ({selectedProject.termsConditions.length})</span>
                        </h4>
                        <div className="space-y-2">
                          {selectedProject.termsConditions.map((term: TermCondition, index: number) => (
                            <div key={index} className="p-3 border rounded-lg bg-gray-50">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">{term.name}</div>
                                <div className="flex items-center gap-2">
                                  {term.type === 'warning' && <Badge className="text-[10px] bg-yellow-100 text-yellow-800">Warning</Badge>}
                                  {term.type !== 'warning' && term.additionalCost != null && term.additionalCost > 0 && (
                                    <Badge variant="outline" className="text-xs text-red-600 border-red-200">+€{(term.additionalCost ?? 0).toFixed(2)}</Badge>
                                  )}
                                  {term.isCustom && <Badge className="text-[10px] bg-purple-100 text-purple-800">Custom</Badge>}
                                </div>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">{term.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* FAQ */}
                    {selectedProject.faq && selectedProject.faq.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <FileText className="w-4 h-4" />
                          <span>FAQ ({selectedProject.faq.length})</span>
                        </h4>
                        <div className="space-y-2">
                          {selectedProject.faq.map((item: FAQItem, index: number) => (
                            <div key={index} className="p-3 border rounded-lg bg-gray-50">
                              <div className="flex items-start justify-between">
                                <div className="font-medium text-sm">Q: {item.question}</div>
                                {item.isGenerated && <Badge className="text-[10px] bg-blue-100 text-blue-800">AI Generated</Badge>}
                              </div>
                              <p className="text-sm text-gray-700 mt-1">A: {item.answer}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Custom Confirmation Message */}
                    {selectedProject.customConfirmationMessage && (
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center space-x-2">
                          <Mail className="w-4 h-4" />
                          <span>Custom Confirmation Message</span>
                        </h4>
                        <div className="p-3 border rounded-lg bg-gray-50">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedProject.customConfirmationMessage}</p>
                        </div>
                      </div>
                    )}

                    {/* Quality Checks */}
                    {selectedProject.qualityChecks && selectedProject.qualityChecks.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3">Quality Checks</h4>
                        <div className="space-y-2">
                          {selectedProject.qualityChecks.map((check, index) => (
                            <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                              {getQualityCheckIcon(check.status)}
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium">{check.category}</span>
                                  <Badge
                                    variant={check.status === 'passed' ? 'default' : 'destructive'}
                                    className="text-xs"
                                  >
                                    {check.status}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">{check.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* End of collapsible full details for resubmissions */}
                  </>)}

                  {activeTab === 'pending' ? (
                    <>
                      {/* Feedback */}
                      <div>
                        <Label htmlFor="feedback">Admin Feedback (Required for rejection)</Label>
                        <Textarea
                          id="feedback"
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="Provide feedback for the professional..."
                          className="mt-1"
                          rows={4}
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex space-x-3 pt-4 border-t">
                        <Button
                          onClick={() => handleApprove(selectedProject._id)}
                          disabled={actionLoading}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve Project
                        </Button>
                        <Button
                          onClick={() => handleReject(selectedProject._id)}
                          disabled={actionLoading || !feedback.trim()}
                          variant="destructive"
                          className="flex-1"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject Project
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Suspension Reason */}
                      {selectedProject.status === 'published' && (
                        <div>
                          <Label htmlFor="suspend-reason">Suspension Reason (Required)</Label>
                          <Textarea
                            id="suspend-reason"
                            value={suspendReason}
                            onChange={(e) => setSuspendReason(e.target.value)}
                            placeholder="Provide reason for suspending this project..."
                            className="mt-1"
                            rows={3}
                          />
                        </div>
                      )}

                      {/* Deletion Reason */}
                      <div>
                        <Label htmlFor="delete-reason">Deletion Reason (Required)</Label>
                        <Textarea
                          id="delete-reason"
                          value={deleteReason}
                          onChange={(e) => setDeleteReason(e.target.value)}
                          placeholder="Provide reason for deleting this project..."
                          className="mt-1"
                          rows={3}
                        />
                      </div>

                      {/* Actions for approved */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t">
                        {selectedProject.status === 'published' && (
                          <Button
                            onClick={() => setSuspendDialogOpen(true)}
                            disabled={actionLoading || !suspendReason.trim()}
                            variant="destructive"
                            className="w-full"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Suspend Project
                          </Button>
                        )}
                        {selectedProject.status === 'on_hold' && (
                          <Button
                            onClick={() => handleReactivate(selectedProject._id)}
                            disabled={actionLoading}
                            className="w-full bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Reactivate Project
                          </Button>
                        )}
                        <Button
                          onClick={() => setDeleteDialogOpen(true)}
                          disabled={actionLoading || !deleteReason.trim()}
                          variant="outline"
                          className="w-full border-red-300 text-red-600 hover:bg-red-50"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Delete Project
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">
                    Select a project from the list to review details
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Suspend Confirmation Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to suspend &quot;{selectedProject?.title}&quot;? It will be put on hold and an email will be sent to the professional.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedProject && handleDeactivate(selectedProject._id)} disabled={!suspendReason.trim() || actionLoading}>
              Suspend
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
              This will permanently delete &quot;{selectedProject?.title}&quot; and notify the professional. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedProject && handleDelete(selectedProject._id)} disabled={!deleteReason.trim() || actionLoading}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
