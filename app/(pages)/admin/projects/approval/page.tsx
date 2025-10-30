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
  AlertTriangle,
  ImageIcon,
  Video,
  Award,
  Paperclip,
  ExternalLink,
  Mail,
  Phone,
  Building
} from "lucide-react"
import Image from 'next/image'
import { toast } from 'sonner'

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

interface MediaFile {
  url: string
  key: string
  uploadedAt: string
}

interface Certification {
  name: string
  issuedBy: string
  issuedDate: string
  expiryDate?: string
  certificateUrl?: string
}

interface RFQQuestion {
  question: string
  answerType: string
  professionalAnswer?: string
  professionalAttachments?: MediaFile[]
}

interface PostBookingQuestion {
  question: string
  answerType: string
  professionalAnswer?: string
  professionalAttachments?: MediaFile[]
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
  professional?: Professional
  media?: {
    images?: MediaFile[]
    video?: MediaFile
  }
  certifications?: Certification[]
  rfqQuestions?: RFQQuestion[]
  postBookingQuestions?: PostBookingQuestion[]
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
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
                                    className="text-blue-600 hover:underline flex items-center inline-flex space-x-1"
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
                              src={image.url}
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
                          src={selectedProject.media.video.url}
                          controls
                          className="w-full h-full"
                        >
                          Your browser does not support the video tag.
                        </video>
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
                                <h5 className="font-medium text-sm">{cert.name}</h5>
                                <p className="text-sm text-gray-600 mt-1">
                                  Issued by: {cert.issuedBy}
                                </p>
                                <div className="flex items-center space-x-4 text-xs text-gray-500 mt-2">
                                  <span>Issued: {new Date(cert.issuedDate).toLocaleDateString()}</span>
                                  {cert.expiryDate && (
                                    <span>Expires: {new Date(cert.expiryDate).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                              {cert.certificateUrl && (
                                <a
                                  href={cert.certificateUrl}
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
                                      href={attachment.url}
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
                                      href={attachment.url}
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