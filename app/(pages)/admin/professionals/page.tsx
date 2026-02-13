'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { User, Phone, Calendar, CheckCircle, XCircle, Eye, LucideChartNoAxesColumn, ClosedCaption, AlertTriangle, FileText, Shield, X } from "lucide-react"
import { Label } from "@/components/ui/label"

interface Professional {
  _id: string;
  name: string;
  email: string;
  phone: string;
  professionalStatus: 'pending' | 'approved' | 'rejected' | 'suspended';
  hourlyRate?: number;
  currency?: string;
  serviceCategories?: string[];
  businessInfo?: {
    companyName?: string;
    description?: string;
    website?: string;
    address?: string;
    city?: string;
    country?: string;
  };
  idProofUrl?: string;
  idProofFileName?: string;
  isIdVerified?: boolean;
  idCountryOfIssue?: string;
  idExpirationDate?: string;
  pendingIdChanges?: {
    field: string;
    oldValue: string;
    newValue: string;
  }[];
  vatNumber?: string;
  isVatVerified?: boolean;
  createdAt: string;
  approvedAt?: string;
  rejectionReason?: string;
}

export default function ProfessionalsAdminPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') || 'pending'

  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [approvalError, setApprovalError] = useState<{ professionalId: string, message: string, missingRequirements: string[] } | null>(null)
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    professionalId: string;
    professionalName: string;
    reason: string;
    error: string | null;
  }>({
    isOpen: false,
    professionalId: '',
    professionalName: '',
    reason: '',
    error: null
  })

  const [suspensionModal, setSuspensionModal] = useState<{
    isOpen: boolean;
    professionalId: string;
    professionalName: string;
    reason: string;
    error: string | null;
  }>({
    isOpen: false,
    professionalId: '',
    professionalName: '',
    reason: '',
    error: null
  })

  const [idChangeReviewModal, setIdChangeReviewModal] = useState<{
    isOpen: boolean;
    professional: Professional | null;
    rejectionReason: string;
    error: string | null;
  }>({
    isOpen: false,
    professional: null,
    rejectionReason: '',
    error: null
  })
  const [idChangeLoading, setIdChangeLoading] = useState(false)

  useEffect(() => {
    if (!loading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/login')
    }
  }, [isAuthenticated, loading, user, router])

  const fetchProfessionals = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professionals?status=${status}`, {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setProfessionals(data.data.professionals)
      }
    } catch (error) {
      console.error('Failed to fetch professionals:', error)
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchProfessionals()
    }
  }, [user, status, fetchProfessionals])

  const handleVerifyIdProof = async (professionalId: string) => {
    setActionLoading(professionalId)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professionals/${professionalId}/verify-id`, {
        method: 'PUT',
        credentials: 'include',
      })

      if (response.ok) {
        fetchProfessionals()
        // Update the selected professional if it's the same one
        if (selectedProfessional?._id === professionalId) {
          setSelectedProfessional(prev => prev ? { ...prev, isIdVerified: true } : null)
        }
      }
    } catch (error) {
      console.error('Failed to verify ID proof:', error)
    } finally {
      setActionLoading(null)
    }
  }

  // Handle rejection modal
  const openRejectionModal = (professionalId: string, professionalName: string) => {
    console.log('Opening rejection modal for:', professionalName);
    setRejectionModal({
      isOpen: true,
      professionalId,
      professionalName,
      reason: '',
      error: null
    })
  }

  const closeRejectionModal = () => {
    setRejectionModal({
      isOpen: false,
      professionalId: '',
      professionalName: '',
      reason: '',
      error: null
    })
  }

  // Handle suspension modal
  const openSuspensionModal = (professionalId: string, professionalName: string) => {
    console.log('Opening suspension modal for:', professionalName);
    setSuspensionModal({
      isOpen: true,
      professionalId,
      professionalName,
      reason: '',
      error: null
    })
  }

  const closeSuspensionModal = () => {
    setSuspensionModal({
      isOpen: false,
      professionalId: '',
      professionalName: '',
      reason: '',
      error: null
    })
  }

  const handleSuspensionSubmit = () => {
    const { reason, professionalId } = suspensionModal

    if (!reason || reason.trim().length < 10) {
      setSuspensionModal(prev => ({
        ...prev,
        error: 'Suspension reason must be at least 10 characters long'
      }))
      return
    }

    handleAction(professionalId, 'suspend', reason.trim())
    closeSuspensionModal()
  }

  const handleRejectionSubmit = () => {
    const { reason, professionalId } = rejectionModal

    if (!reason || reason.trim().length < 10) {
      setRejectionModal(prev => ({
        ...prev,
        error: 'Rejection reason must be at least 10 characters long'
      }))
      return
    }

    handleAction(professionalId, 'reject', reason.trim())
    closeRejectionModal()
  }

  const handleAction = async (professionalId: string, action: 'approve' | 'reject' | 'suspend' | 'reactivate', reason?: string) => {
    setActionLoading(professionalId)
    setApprovalError(null)
    try {
      const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professionals/${professionalId}/${action}`
      const body = reason ? { reason } : undefined

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      })

      if (response.ok) {
        fetchProfessionals()
        setSelectedProfessional(null)
      } else {
        const errorData = await response.json()
        if (action === 'approve' && errorData.data?.missingRequirements) {
          setApprovalError({
            professionalId,
            message: errorData.msg,
            missingRequirements: errorData.data.missingRequirements
          })
        }
      }
    } catch (error) {
      console.error(`Failed to ${action} professional:`, error)
    } finally {
      setActionLoading(null)
    }
  }

  const openIdChangeReview = (professional: Professional) => {
    setIdChangeReviewModal({
      isOpen: true,
      professional,
      rejectionReason: '',
      error: null
    })
  }

  const handleIdChangeAction = async (action: 'approve' | 'reject') => {
    if (!idChangeReviewModal.professional) return

    if (action === 'reject' && idChangeReviewModal.rejectionReason.trim().length < 10) {
      setIdChangeReviewModal(prev => ({
        ...prev,
        error: 'Rejection reason must be at least 10 characters'
      }))
      return
    }

    setIdChangeLoading(true)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professionals/${idChangeReviewModal.professional._id}/id-changes`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action,
            reason: action === 'reject' ? idChangeReviewModal.rejectionReason.trim() : undefined
          })
        }
      )

      if (response.ok) {
        fetchProfessionals()
        setSelectedProfessional(null)
        setIdChangeReviewModal({ isOpen: false, professional: null, rejectionReason: '', error: null })
      } else {
        const errorData = await response.json()
        setIdChangeReviewModal(prev => ({
          ...prev,
          error: errorData.msg || `Failed to ${action} ID changes`
        }))
      }
    } catch (error) {
      console.error(`Failed to ${action} ID changes:`, error)
      setIdChangeReviewModal(prev => ({
        ...prev,
        error: `Failed to ${action} ID changes`
      }))
    } finally {
      setIdChangeLoading(false)
    }
  }

  const getFieldLabel = (field: string): string => {
    switch (field) {
      case 'idCountryOfIssue': return 'Country of Issue'
      case 'idExpirationDate': return 'Expiration Date'
      case 'idProofDocument': return 'ID Document'
      default: return field
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      case 'suspended': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-orange-100 text-orange-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4" />
      case 'rejected': return <XCircle className="h-4 w-4" />
      case 'suspended': return <LucideChartNoAxesColumn className="h-4 w-4" />
      default: return <Eye className="h-4 w-4" />
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

  if (!isAuthenticated || user?.role !== 'admin') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto pt-20">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Professional Management
            </h1>
            <p className="text-gray-600">Review and manage professional applications</p>
          </div>
          <Button onClick={() => router.push('/dashboard')} variant="outline">
            Back to Dashboard
          </Button>
        </div>

        {/* Status Filter Tabs */}
        <div className="mb-6 flex space-x-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'pending', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'suspended', label: 'Suspended' }
          ].map((tab) => (
            <Button
              key={tab.key}
              onClick={() => router.push(`/admin/professionals?status=${tab.key}`)}
              variant={status === tab.key ? 'default' : 'ghost'}
              className="flex-1"
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Professionals List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading professionals...</p>
          </div>
        ) : professionals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">No professionals found with status: {status}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {professionals.map((professional) => (
              <Card key={professional._id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {professional.name}
                      </CardTitle>
                      <CardDescription>{professional.email}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(professional.professionalStatus)}>
                      {getStatusIcon(professional.professionalStatus)}
                      <span className="ml-1 capitalize">{professional.professionalStatus}</span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-gray-500" />
                        {professional.phone}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        Applied: {new Date(professional.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {professional.hourlyRate && (
                        <div className="text-sm">
                          <span className="font-medium">Rate:</span> {professional.currency}{professional.hourlyRate}/hr
                        </div>
                      )}
                      {professional.businessInfo?.companyName && (
                        <div className="text-sm">
                          <span className="font-medium">Company:</span> {professional.businessInfo.companyName}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {professional.serviceCategories && professional.serviceCategories.length > 0 && (
                        <div className="text-sm">
                          <span className="font-medium">Services:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {professional.serviceCategories.slice(0, 3).map((category, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {category}
                              </Badge>
                            ))}
                            {professional.serviceCategories.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{professional.serviceCategories.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {professional.rejectionReason && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-sm font-medium text-red-800 mb-1">Rejection Reason:</div>
                      <div className="text-sm text-red-700">{professional.rejectionReason}</div>
                    </div>
                  )}

                  {/* Verification Requirements Status */}
                  {professional.professionalStatus === 'pending' && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Verification Requirements:
                      </div>
                      <div className="space-y-1">
                        <div className={`text-xs flex items-center gap-2 ${professional.vatNumber && professional.isVatVerified ? 'text-green-700' : 'text-orange-700'}`}>
                          {professional.vatNumber && professional.isVatVerified ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          VAT Number & Verification {professional.vatNumber && professional.isVatVerified ? '✓' : '(Missing)'}
                        </div>
                        <div className={`text-xs flex items-center gap-2 ${professional.idProofUrl && professional.isIdVerified ? 'text-green-700' : professional.idProofUrl ? 'text-orange-700' : 'text-red-700'}`}>
                          {professional.idProofUrl && professional.isIdVerified ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          ID Proof {professional.idProofUrl && professional.isIdVerified ? '✓ Verified' : professional.idProofUrl ? 'Uploaded - Needs Verification' : '(Not Uploaded)'}
                        </div>
                        <div className={`text-xs flex items-center gap-2 ${professional.businessInfo?.companyName ? 'text-green-700' : 'text-orange-700'}`}>
                          {professional.businessInfo?.companyName ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          Company Name {professional.businessInfo?.companyName ? '✓' : '(Missing)'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Approval Error Display */}
                  {approvalError?.professionalId === professional._id && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-sm font-medium text-red-800 mb-2 flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Cannot Approve - Missing Requirements:
                      </div>
                      <ul className="text-xs text-red-700 space-y-1">
                        {approvalError.missingRequirements.map((requirement, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3" />
                            {requirement}
                          </li>
                        ))}
                      </ul>
                      <Button
                        onClick={() => setApprovalError(null)}
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-xs"
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}

                  {/* Pending ID Changes Indicator */}
                  {professional.pendingIdChanges && professional.pendingIdChanges.length > 0 && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Pending ID Changes (Re-verification Required)
                      </div>
                      <div className="space-y-1">
                        {professional.pendingIdChanges.map((change, idx) => (
                          <div key={idx} className="text-xs text-amber-700">
                            <span className="font-medium mr-2">{getFieldLabel(change.field)}:</span>
                            {change.field === 'idProofDocument' ? (
                              <div className="inline-flex items-center gap-2">
                                {change.oldValue && (
                                  <a
                                    href={change.oldValue.startsWith('http') ? change.oldValue : '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-red-600 underline hover:text-red-800"
                                    title="View Old Document"
                                  >
                                    View Old
                                  </a>
                                )}
                                {!change.oldValue && <span className="text-red-600 italic">(none)</span>}
                                <span className="text-gray-400">→</span>
                                {(() => {
                                  const newUrl = change.newValue || professional.idProofUrl
                                  const isValid = newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))
                                  return isValid ? (
                                    <a
                                      href={newUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-green-700 underline hover:text-green-900"
                                      title="View New Document"
                                    >
                                      View New
                                    </a>
                                  ) : (
                                    <span className="text-gray-400 italic">(none)</span>
                                  )
                                })()}
                              </div>
                            ) : (
                              <>
                                <span className="text-red-600 line-through">{change.oldValue || '(empty)'}</span>
                                {' → '}
                                <span className="font-medium">{change.newValue || '(empty)'}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() => openIdChangeReview(professional)}
                        size="sm"
                        className="mt-2 bg-amber-600 hover:bg-amber-700"
                      >
                        Review ID Changes
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setSelectedProfessional(professional)}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>

                    {professional.professionalStatus === 'pending' && (
                      <>
                        <Button
                          onClick={() => handleAction(professional._id, 'approve')}
                          disabled={actionLoading === professional._id}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          onClick={() => openRejectionModal(professional._id, professional.name)}
                          disabled={actionLoading === professional._id}
                          size="sm"
                          variant="destructive"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}

                    {professional.professionalStatus === 'approved' && (
                      <Button
                        onClick={() => openSuspensionModal(professional._id, professional.name)}
                        disabled={actionLoading === professional._id}
                        size="sm"
                        variant="destructive"
                      >
                        <ClosedCaption className="h-4 w-4 mr-1" />
                        Suspend
                      </Button>
                    )}

                    {professional.professionalStatus === 'suspended' && (
                      <Button
                        onClick={() => handleAction(professional._id, 'reactivate')}
                        disabled={actionLoading === professional._id}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Reactivate
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Professional Details Modal */}
        {selectedProfessional && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">Professional Details</h3>
                  <Button onClick={() => setSelectedProfessional(null)} variant="ghost">
                    ×
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Personal Information</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Name:</span> {selectedProfessional.name}</div>
                      <div><span className="font-medium">Email:</span> {selectedProfessional.email}</div>
                      <div><span className="font-medium">Phone:</span> {selectedProfessional.phone}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">VAT Number:</span>
                        {selectedProfessional.vatNumber ? (
                          <span className="flex items-center gap-1">
                            {selectedProfessional.vatNumber}
                            {selectedProfessional.isVatVerified ? (
                              <Badge variant="outline" className="text-green-700 bg-green-50 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />Verified
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-700 bg-orange-50 text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />Unverified
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-red-700 bg-red-50 text-xs">
                            <XCircle className="h-3 w-3 mr-1" />Not provided
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Business Information</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Company:</span> {selectedProfessional.businessInfo?.companyName || 'Not provided'}</div>
                      <div><span className="font-medium">Rate:</span> {selectedProfessional.currency}{selectedProfessional.hourlyRate}/hr</div>
                      <div><span className="font-medium">Website:</span> {selectedProfessional.businessInfo?.website || 'Not provided'}</div>
                      <div><span className="font-medium">Location:</span> {selectedProfessional.businessInfo?.city}, {selectedProfessional.businessInfo?.country}</div>
                    </div>
                  </div>
                </div>

                {selectedProfessional.businessInfo?.description && (
                  <div>
                    <h4 className="font-medium mb-3">Business Description</h4>
                    <p className="text-sm text-gray-700">{selectedProfessional.businessInfo.description}</p>
                  </div>
                )}

                {selectedProfessional.serviceCategories && selectedProfessional.serviceCategories.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Service Categories</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedProfessional.serviceCategories.map((category, index) => (
                        <Badge key={index} variant="outline">{category}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    ID Proof Document
                  </h4>
                  {selectedProfessional.idProofUrl ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={selectedProfessional.isIdVerified ? "text-green-700 bg-green-50 text-xs" : "text-orange-700 bg-orange-50 text-xs"}>
                          {selectedProfessional.isIdVerified ? (
                            <><CheckCircle className="h-3 w-3 mr-1" />Verified</>
                          ) : (
                            <><AlertTriangle className="h-3 w-3 mr-1" />Needs Verification</>
                          )}
                        </Badge>
                        <a
                          href={selectedProfessional.idProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {selectedProfessional.idProofFileName || 'View ID Document'}
                        </a>
                      </div>
                      {!selectedProfessional.isIdVerified && (
                        <Button
                          onClick={() => handleVerifyIdProof(selectedProfessional._id)}
                          size="sm"
                          variant="outline"
                          className="text-xs"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Mark as Verified
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-red-700 bg-red-50 text-xs">
                      <XCircle className="h-3 w-3 mr-1" />Not uploaded
                    </Badge>
                  )}
                </div>

                {/* Pending ID Changes in Detail Modal */}
                {selectedProfessional.pendingIdChanges && selectedProfessional.pendingIdChanges.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <h4 className="font-medium mb-3 flex items-center gap-2 text-amber-800">
                      <AlertTriangle className="h-4 w-4" />
                      Pending ID Changes
                    </h4>
                    <div className="space-y-2 mb-4">
                      {selectedProfessional.pendingIdChanges.map((change, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-2 bg-white rounded border">
                          <span className="text-sm font-medium w-36">{getFieldLabel(change.field)}</span>
                          {change.field === 'idProofDocument' ? (
                            <div className="flex items-center gap-2 text-sm">
                              {change.oldValue && (
                                <a
                                  href={change.oldValue.startsWith('http') ? change.oldValue : '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-red-600 underline hover:text-red-800"
                                >
                                  View Old Document
                                </a>
                              )}
                              {!change.oldValue && <span className="text-red-600 italic">(none)</span>}
                              <span className="text-gray-400">→</span>
                              {(() => {
                                const newUrl = change.newValue || selectedProfessional.idProofUrl
                                const isValid = newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))
                                return isValid ? (
                                  <a
                                    href={newUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-700 underline hover:text-green-900 font-medium"
                                  >
                                    View New Document
                                  </a>
                                ) : (
                                  <span className="text-gray-400 italic">(none)</span>
                                )
                              })()}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-red-600 line-through">{change.oldValue || '(empty)'}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-green-700 font-medium">{change.newValue || '(empty)'}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => openIdChangeReview(selectedProfessional)}
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        Review Changes
                      </Button>
                    </div>
                  </div>
                )}

                {/* ID Metadata Display */}
                {(selectedProfessional.idCountryOfIssue || selectedProfessional.idExpirationDate) && (
                  <div>
                    <h4 className="font-medium mb-3">ID Document Details</h4>
                    <div className="space-y-1 text-sm">
                      {selectedProfessional.idCountryOfIssue && (
                        <div><span className="font-medium">Country of Issue:</span> {selectedProfessional.idCountryOfIssue}</div>
                      )}
                      {selectedProfessional.idExpirationDate && (
                        <div><span className="font-medium">Expiration Date:</span> {new Date(selectedProfessional.idExpirationDate).toLocaleDateString()}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rejection Modal */}
      {rejectionModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-700">
                Reject Professional
              </h3>
              <Button
                onClick={closeRejectionModal}
                variant="ghost"
                size="sm"
                className="p-1"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                You are about to reject <strong>{rejectionModal.professionalName}</strong>
              </p>
              <p className="text-xs text-gray-500 mb-4">
                They will receive an email with your rejection reason and can resubmit after making corrections.
              </p>

              <Label htmlFor="rejectionReason" className="text-sm font-medium">
                Reason for Rejection *
              </Label>
              <textarea
                id="rejectionReason"
                placeholder="Please provide a detailed reason (minimum 10 characters)..."
                value={rejectionModal.reason}
                onChange={(e) => {
                  console.log('Textarea onChange:', e.target.value);
                  setRejectionModal(prev => ({
                    ...prev,
                    reason: e.target.value,
                    error: null
                  }));
                }}
                className="mt-1 flex min-h-[100px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                rows={4}
              />

              {rejectionModal.error && (
                <p className="text-red-600 text-xs mt-1">
                  {rejectionModal.error}
                </p>
              )}

              <p className="text-xs text-gray-400 mt-1">
                {rejectionModal.reason.length}/10 characters minimum
              </p>

              {/* Debug info */}
              <div className="text-xs text-gray-500 mt-1 p-2 bg-gray-50 rounded">
                <strong>Debug:</strong> Reason length: {rejectionModal.reason.length}, Value: &quot;{rejectionModal.reason}&quot;
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={closeRejectionModal}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRejectionSubmit}
                disabled={actionLoading === rejectionModal.professionalId}
                variant="destructive"
                size="sm"
                className="flex-1"
              >
                {actionLoading === rejectionModal.professionalId ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                    Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Send Rejection
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Suspension Modal */}
      {suspensionModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-yellow-700">
                Suspend Professional
              </h3>
              <Button
                onClick={closeSuspensionModal}
                variant="ghost"
                size="sm"
                className="p-1"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                You are about to suspend <strong>{suspensionModal.professionalName}</strong>
              </p>
              <p className="text-xs text-gray-500 mb-4">
                They will receive an email notification about the suspension and will not be able to accept new bookings until reactivated.
              </p>

              <Label htmlFor="suspensionReason" className="text-sm font-medium">
                Reason for Suspension *
              </Label>
              <textarea
                id="suspensionReason"
                placeholder="Please provide a detailed reason (minimum 10 characters)..."
                value={suspensionModal.reason}
                onChange={(e) => {
                  setSuspensionModal(prev => ({
                    ...prev,
                    reason: e.target.value,
                    error: null
                  }));
                }}
                className="mt-1 flex min-h-[100px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-offset-2"
                rows={4}
              />

              {suspensionModal.error && (
                <p className="text-red-600 text-xs mt-1">
                  {suspensionModal.error}
                </p>
              )}

              <p className="text-xs text-gray-400 mt-1">
                {suspensionModal.reason.length}/10 characters minimum
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={closeSuspensionModal}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSuspensionSubmit}
                disabled={actionLoading === suspensionModal.professionalId}
                variant="destructive"
                size="sm"
                className="flex-1 bg-yellow-600 hover:bg-yellow-700"
              >
                {actionLoading === suspensionModal.professionalId ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                    Suspending...
                  </>
                ) : (
                  <>
                    <ClosedCaption className="h-3 w-3 mr-1" />
                    Suspend Professional
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ID Change Review Modal */}
      {idChangeReviewModal.isOpen && idChangeReviewModal.professional && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-amber-700">
                Review ID Changes
              </h3>
              <Button
                onClick={() => setIdChangeReviewModal({ isOpen: false, professional: null, rejectionReason: '', error: null })}
                variant="ghost"
                size="sm"
                className="p-1"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-3">
                <strong>{idChangeReviewModal.professional.name}</strong> has made changes to their ID information:
              </p>

              <div className="space-y-2 mb-4">
                {idChangeReviewModal.professional.pendingIdChanges?.map((change, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-lg border">
                    <div className="text-xs font-medium text-gray-500 mb-1">{getFieldLabel(change.field)}</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-xs text-gray-400">Previous</div>
                        <div className="text-sm text-red-700 font-medium">{change.oldValue || '(not set)'}</div>
                      </div>
                      <span className="text-gray-300">→</span>
                      <div className="flex-1">
                        <div className="text-xs text-gray-400">New</div>
                        <div className="text-sm text-green-700 font-medium">{change.newValue || '(not set)'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {idChangeReviewModal.professional.idProofUrl && (
                <div className="mb-4">
                  <a
                    href={idChangeReviewModal.professional.idProofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    View ID Document
                  </a>
                </div>
              )}

              <div className="border-t pt-3">
                <Label htmlFor="idChangeRejectionReason" className="text-sm font-medium">
                  Rejection Reason (required if rejecting)
                </Label>
                <textarea
                  id="idChangeRejectionReason"
                  placeholder="Provide reason for rejection (min 10 characters)..."
                  value={idChangeReviewModal.rejectionReason}
                  onChange={(e) => setIdChangeReviewModal(prev => ({
                    ...prev,
                    rejectionReason: e.target.value,
                    error: null
                  }))}
                  className="mt-1 flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                  rows={3}
                />
              </div>

              {idChangeReviewModal.error && (
                <p className="text-red-600 text-xs mt-2">{idChangeReviewModal.error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => handleIdChangeAction('approve')}
                disabled={idChangeLoading}
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {idChangeLoading ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                ) : (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                Re-approve
              </Button>
              <Button
                onClick={() => handleIdChangeAction('reject')}
                disabled={idChangeLoading}
                variant="destructive"
                size="sm"
                className="flex-1"
              >
                {idChangeLoading ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                ) : (
                  <XCircle className="h-3 w-3 mr-1" />
                )}
                Reject Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}