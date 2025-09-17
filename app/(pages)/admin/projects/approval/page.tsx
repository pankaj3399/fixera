'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  MapPin,
  DollarSign,
  FileText,
  AlertTriangle
} from "lucide-react"
import { toast } from 'sonner'

interface QualityCheck {
  category: string
  status: 'passed' | 'failed' | 'warning'
  message: string
  checkedAt: string
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
    maxKmRange: number
    noBorders: boolean
  }
  projectType: string[]
  keywords: string[]
  status: string
  submittedAt: string
  qualityChecks: QualityCheck[]
}

export default function ProjectApprovalPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [feedback, setFeedback] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchPendingProjects()
  }, [])

  const fetchPendingProjects = async () => {
    try {
      const response = await fetch('/api/projects/admin/pending', {
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

  const handleApprove = async (projectId: string) => {
    setActionLoading(true)
    try {
      const response = await fetch(`/api/projects/admin/${projectId}/approve`, {
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
      const response = await fetch(`/api/projects/admin/${projectId}/reject`, {
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_approval':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending Review</Badge>
      case 'published':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Published</Badge>
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Project Approval Queue
          </h1>
          <p className="text-gray-600">
            Review and approve professional service project submissions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects List */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Pending Projects ({projects.length})</span>
                  <Button variant="outline" size="sm" onClick={fetchPendingProjects}>
                    Refresh
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600">No projects pending approval</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {projects.map((project) => (
                      <Card
                        key={project._id}
                        className={`cursor-pointer transition-colors ${
                          selectedProject?._id === project._id
                            ? 'border-blue-500 bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedProject(project)}
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-sm line-clamp-2">
                              {project.title}
                            </h4>
                            {getStatusBadge(project.status)}
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
                    <span>Project Review</span>
                  </CardTitle>
                  <CardDescription>
                    Review project details and make approval decision
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Project Info */}
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
                          <p className="text-sm text-gray-700">{selectedProject.distance.maxKmRange}km</p>
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
    </div>
  )
}