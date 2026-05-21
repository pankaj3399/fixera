'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch, getAuthToken } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, CheckCircle, Loader2, MessageSquare, Paperclip, RefreshCw, Scale, Shield, Upload, XCircle } from "lucide-react"
import { toast } from "sonner"

type DisputeType =
  | 'extra_costs'
  | 'reschedule'
  | 'completion_request'
  | 'warranty_claim'
  | 'warranty_resolve'
  | 'refund_request'
  | 'in_progress'

interface DisputeBooking {
  _id: string
  bookingNumber: string
  status: string
  customer?: { _id: string; name?: string; email?: string }
  professional?: { _id: string; name?: string; email?: string; username?: string }
  project?: { _id: string; title?: string; category?: string; service?: string }
  payment?: { amount?: number; currency?: string; totalWithVat?: number }
  extraCosts?: Array<{
    type: string
    name: string
    justification: string
    amount: number
    estimatedUnits?: number
    actualUnits?: number
    unitPrice?: number
  }>
  extraCostTotal?: number
  extraCostStatus?: string
  completionAttestation?: {
    confirmedAt?: string
    notes?: string
    attachments?: string[]
  }
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  rescheduleRequest?: {
    status?: string
    requestedAt?: string
    reason?: string
    note?: string
    proposedSchedule?: {
      scheduledStartDate?: string
      scheduledExecutionEndDate?: string
    }
  }
  warrantyCoverage?: {
    duration?: { value?: number; unit?: 'months' | 'years' }
    startsAt?: string
    endsAt?: string
  }
  cancellation?: {
    reason?: string
    cancelledAt?: string
  }
  dispute?: {
    raisedBy: string
    reason: string
    description: string
    raisedAt: string
    resolvedAt?: string
    resolution?: string
    resolvedBy?: string
    adminAdjustedAmount?: number
    slaDeadline?: string
    slaBreachNotifiedAt?: string
    type?: DisputeType
    attachments?: string[]
    resolutionAttachments?: string[]
    proposedResolveDate?: string
    negotiationDate?: string
    negotiationAmount?: number
  }
  createdAt?: string
}

interface DisputeAnalytics {
  totalOpen: number
  totalResolved: number
  totalDisputes: number
}

type DisputeFilter = 'all' | 'open' | 'resolved'
type ResolveAction = 'accept_professional' | 'reject_extra_costs' | 'adjust'
type ForceStatus = 'keep' | 'completed' | 'cancelled' | 'refunded' | 'in_progress'

interface ResolveDisputeRequest {
  action: ResolveAction
  resolution: string
  adjustedAmount?: number
  forceStatus?: Exclude<ForceStatus, 'keep'>
  resolutionAttachments?: string[]
}

const DISPUTE_TYPE_LABEL: Record<DisputeType, string> = {
  extra_costs: 'Extra costs',
  reschedule: 'Reschedule',
  completion_request: 'Completion request',
  warranty_claim: 'Warranty claim',
  warranty_resolve: 'Warranty resolve',
  refund_request: 'Refund request',
  in_progress: 'In-progress',
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

const formatDateOnly = (value?: string | null) => {
  if (!value) return '—'
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1])
    const month = Number(isoDateOnly[2])
    const day = Number(isoDateOnly[3])
    const utc = new Date(Date.UTC(year, month - 1, day))
    if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day) return '—'
    return utc.toLocaleDateString(undefined, { timeZone: 'UTC' })
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

const fileNameFromUrl = (url: string) => {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    return decodeURIComponent(parts[parts.length - 1] || url)
  } catch {
    return url
  }
}

export default function AdminDisputesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [disputes, setDisputes] = useState<DisputeBooking[]>([])
  const [analytics, setAnalytics] = useState<DisputeAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<DisputeFilter>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [selectedDispute, setSelectedDispute] = useState<DisputeBooking | null>(null)
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [resolveAction, setResolveAction] = useState<ResolveAction>('accept_professional')
  const [resolveAdjustedAmount, setResolveAdjustedAmount] = useState('')
  const [resolveResolution, setResolveResolution] = useState('')
  const [resolving, setResolving] = useState(false)
  const [forceStatus, setForceStatus] = useState<ForceStatus>('keep')
  const [resolutionAttachments, setResolutionAttachments] = useState<string[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [startingChatFor, setStartingChatFor] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedDisputeType: DisputeType = useMemo(() => {
    return (selectedDispute?.dispute?.type as DisputeType | undefined) ?? 'extra_costs'
  }, [selectedDispute])

  useEffect(() => {
    if (!showResolveDialog) return
    setResolveAction('accept_professional')
    setResolveAdjustedAmount('')
  }, [selectedDisputeType, showResolveDialog])

  const resetResolveForm = useCallback(() => {
    setResolveAction('accept_professional')
    setResolveAdjustedAmount('')
    setResolveResolution('')
    setForceStatus('keep')
    setResolutionAttachments([])
  }, [])

  const openResolveDialog = useCallback((dispute: DisputeBooking) => {
    resetResolveForm()
    setSelectedDispute(dispute)
    setShowResolveDialog(true)
  }, [resetResolveForm])

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const fetchDisputes = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' })
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/disputes?${params}`)
      const json = await res.json()
      if (json.success) {
        setDisputes(Array.isArray(json.data?.disputes) ? json.data.disputes : [])
        setTotalPages(Number(json.data?.pagination?.pages) || 1)
      }
    } catch {
      toast.error('Failed to load disputes')
    } finally {
      setIsLoading(false)
    }
  }, [page, statusFilter])

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/disputes/analytics`)
      const json = await res.json()
      if (json.success) setAnalytics(json.data)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchDisputes()
      fetchAnalytics()
    }
  }, [user, fetchDisputes, fetchAnalytics])

  const startSupportChat = useCallback(async (dispute: DisputeBooking, target: 'customer' | 'professional') => {
    const targetUser = target === 'customer' ? dispute.customer : dispute.professional
    const targetUserId = targetUser?._id
    if (!targetUserId) {
      toast.error(`Booking has no linked ${target}`)
      return
    }
    const key = `${dispute._id}:${target}`
    setStartingChatFor(key)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/chat/start-support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          initialMessage: `Hello — I'm reaching out about dispute on booking ${dispute.bookingNumber}.`,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.msg || json?.error?.message || 'Failed to start support chat')
        return
      }
      const conversationId = json?.data?.conversationId
      if (!conversationId) {
        toast.error('Support chat created but no conversation id returned')
        return
      }
      toast.success(`Support conversation ready (id: ${conversationId})`)
      window.open(`/chat?conversationId=${conversationId}`, '_blank', 'noopener')
    } catch (e) {
      console.error('start support chat failed', e)
      toast.error('Failed to start support chat')
    } finally {
      setStartingChatFor(null)
    }
  }, [])

  const handleUploadAttachment = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploadingAttachment(true)
    try {
      const formData = new FormData()
      Array.from(fileList).forEach((file) => formData.append('files', file))

      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/disputes/upload-attachment`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.error?.message || 'Failed to upload attachment(s)')
        return
      }
      const urls: string[] = (json.data?.files || []).map((f: { url: string }) => f.url)
      setResolutionAttachments((prev) => [...prev, ...urls])
      toast.success(`Uploaded ${urls.length} file${urls.length === 1 ? '' : 's'}`)
    } catch (e) {
      console.error('attachment upload failed', e)
      toast.error('Failed to upload attachment(s)')
    } finally {
      setUploadingAttachment(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [])

  const handleResolve = async () => {
    if (!selectedDispute || !resolveResolution.trim()) return
    if (uploadingAttachment) {
      toast.error('Please wait for the attachment upload to finish before resolving')
      return
    }

    let parsedAdjustedAmount: number | undefined
    if (resolveAction === 'adjust') {
      parsedAdjustedAmount = Number(resolveAdjustedAmount)
      const maxAdjustedAmount = selectedDispute.extraCostTotal
      const isExtraCosts = selectedDisputeType === 'extra_costs'
      const isOutOfRange = isExtraCosts && typeof maxAdjustedAmount === 'number' && parsedAdjustedAmount > maxAdjustedAmount

      if (!Number.isFinite(parsedAdjustedAmount) || parsedAdjustedAmount < 0 || isOutOfRange) {
        toast.error(
          isExtraCosts && typeof maxAdjustedAmount === 'number'
            ? `Adjusted amount must be a valid number between 0 and ${maxAdjustedAmount.toFixed(2)}`
            : 'Adjusted amount must be a valid number greater than or equal to 0'
        )
        return
      }
    }

    setResolving(true)
    try {
      const body: ResolveDisputeRequest = { action: resolveAction, resolution: resolveResolution.trim() }
      if (resolveAction === 'adjust' && parsedAdjustedAmount != null) {
        body.adjustedAmount = parsedAdjustedAmount
      }
      if (forceStatus !== 'keep') {
        body.forceStatus = forceStatus
      }
      if (resolutionAttachments.length > 0) {
        body.resolutionAttachments = resolutionAttachments
      }
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/disputes/${selectedDispute._id}/resolve`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const json = await res.json()
      if (!res.ok || !json?.success) {
        console.error(json?.error)
        const code = json?.error?.code ? ` [${json.error.code}]` : ''
        toast.error(`${json?.error?.message || 'Failed to resolve dispute'}${code}`)
        return
      }
      toast.success('Dispute resolved successfully')
      setShowResolveDialog(false)
      setSelectedDispute(null)
      resetResolveForm()
      fetchDisputes()
      fetchAnalytics()
    } catch (e) {
      console.error('resolve dispute failed', e)
      toast.error('Failed to resolve dispute')
    } finally {
      setResolving(false)
    }
  }

  if (loading || !user) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Scale className="h-6 w-6" />
              Dispute Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">Review and resolve booking disputes</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchDisputes(); fetchAnalytics() }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {analytics && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-600">{analytics.totalOpen}</div>
                <p className="text-sm text-gray-500">Open Disputes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{analytics.totalResolved}</div>
                <p className="text-sm text-gray-500">Resolved</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-gray-800">{analytics.totalDisputes}</div>
                <p className="text-sm text-gray-500">Total Disputes</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(value: DisputeFilter) => { setStatusFilter(value); setPage(1) }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : disputes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No disputes found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {disputes.map((d) => {
              const dType: DisputeType = (d.dispute?.type as DisputeType | undefined) ?? 'extra_costs'
              const startingCustomer = startingChatFor === `${d._id}:customer`
              const startingPro = startingChatFor === `${d._id}:professional`
              return (
                <Card key={d._id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-semibold text-sm">{d.bookingNumber}</span>
                          <Badge variant="outline" className="text-xs">
                            Type: {DISPUTE_TYPE_LABEL[dType] || 'Extra costs'}
                          </Badge>
                          <Badge variant={d.dispute?.resolvedAt ? "default" : "destructive"} className="text-xs">
                            {d.dispute?.resolvedAt ? 'Resolved' : 'Open'}
                          </Badge>
                          {!d.dispute?.resolvedAt && d.dispute?.slaDeadline && new Date(d.dispute.slaDeadline) < new Date() && (
                            <Badge variant="destructive" className="text-xs bg-red-700">
                              SLA breached
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          Customer: {d.customer?.name || d.customer?.email || 'Unknown'}
                          {' | '}
                          Professional: {d.professional?.name || d.professional?.username || 'Unknown'}
                        </p>
                        {d.project?.title && (
                          <p className="text-xs text-gray-400">{d.project.title}</p>
                        )}
                        <p className="text-xs text-red-600 font-medium mt-1">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          {d.dispute?.reason}
                        </p>
                        {d.extraCostTotal != null && (
                          <p className="text-xs text-gray-600">
                            Extra costs claimed: {d.payment?.currency || 'EUR'} {d.extraCostTotal.toFixed(2)}
                            {' | '}
                            Original: {d.payment?.currency || 'EUR'} {(d.payment?.amount || 0).toFixed(2)}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs"
                            onClick={() => window.open(`/bookings/${d._id}`, '_blank', 'noopener')}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            View customer↔pro chat
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs"
                            disabled={startingCustomer || !d.customer?._id}
                            onClick={() => startSupportChat(d, 'customer')}
                          >
                            {startingCustomer ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                            Open dispute chat with customer
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs"
                            disabled={startingPro || !d.professional?._id}
                            onClick={() => startSupportChat(d, 'professional')}
                          >
                            {startingPro ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                            Open dispute chat with professional
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-end shrink-0">
                        <p className="text-xs text-gray-400">
                          {d.dispute?.raisedAt ? new Date(d.dispute.raisedAt).toLocaleDateString() : ''}
                        </p>
                        {!d.dispute?.resolvedAt && (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openResolveDialog(d)}
                          >
                            Resolve
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => router.push(`/bookings/${d._id}`)}
                        >
                          View Booking
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-sm text-gray-500 self-center">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}

        <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Resolve Dispute — {selectedDispute?.bookingNumber}
                {selectedDispute && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {DISPUTE_TYPE_LABEL[selectedDisputeType] || 'Extra costs'}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Review the dispute details and choose a resolution.
              </DialogDescription>
            </DialogHeader>

            {selectedDispute && (
              <div className="space-y-4">
                <div className="bg-red-50 rounded p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-800">Customer&apos;s dispute reason:</p>
                  <p className="text-sm text-red-700">{selectedDispute.dispute?.reason}</p>
                  {selectedDispute.dispute?.description && (
                    <p className="text-xs text-red-600 whitespace-pre-wrap">{selectedDispute.dispute.description}</p>
                  )}
                  {selectedDispute.dispute?.attachments && selectedDispute.dispute.attachments.length > 0 && (
                    <div className="pt-2 flex flex-wrap gap-2">
                      {selectedDispute.dispute.attachments.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline text-red-700 break-all">
                          <Paperclip className="h-3 w-3 inline mr-1" />
                          {fileNameFromUrl(url)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {selectedDisputeType === 'extra_costs' && selectedDispute.extraCosts && selectedDispute.extraCosts.length > 0 && (
                  <div className="bg-gray-50 rounded p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-gray-700">Extra costs declared by professional:</p>
                    {selectedDispute.extraCosts.map((cost, i) => (
                      <div key={i} className="flex justify-between text-xs border-b border-gray-100 pb-1 last:border-0">
                        <div>
                          <span className="font-medium">{cost.name}</span>
                          <span className="text-gray-500 ml-1 capitalize">({cost.type.replace('_', ' ')})</span>
                          <p className="text-gray-400 italic">{cost.justification}</p>
                        </div>
                        <span className="font-semibold shrink-0 ml-2">{cost.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold pt-1 border-t">
                      <span>Total</span>
                      <span>{(selectedDispute.extraCostTotal || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {selectedDisputeType === 'completion_request' && (
                  <div className="bg-gray-50 rounded p-3 space-y-1.5 text-xs">
                    <p className="font-semibold text-gray-700">Completion request</p>
                    <p><span className="text-gray-500">Date requested:</span> {formatDate(selectedDispute.completionAttestation?.confirmedAt || selectedDispute.dispute?.raisedAt)}</p>
                    <p><span className="text-gray-500">Expected completion date:</span> {formatDateOnly(selectedDispute.scheduledExecutionEndDate)}</p>
                    {selectedDispute.completionAttestation?.notes && (
                      <p><span className="text-gray-500">Completion description:</span> {selectedDispute.completionAttestation.notes}</p>
                    )}
                    {selectedDispute.completionAttestation?.attachments && selectedDispute.completionAttestation.attachments.length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-2">
                        {selectedDispute.completionAttestation.attachments.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline text-blue-700 break-all">
                            <Paperclip className="h-3 w-3 inline mr-1" />
                            {fileNameFromUrl(url)}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(selectedDisputeType === 'warranty_claim' || selectedDisputeType === 'warranty_resolve') && (
                  <div className="bg-gray-50 rounded p-3 space-y-1.5 text-xs">
                    <p className="font-semibold text-gray-700">Warranty {selectedDisputeType === 'warranty_resolve' ? 'resolve proposal' : 'claim'}</p>
                    <p>
                      <span className="text-gray-500">Project warranty duration:</span>{' '}
                      {selectedDispute.warrantyCoverage?.duration?.value != null && selectedDispute.warrantyCoverage?.duration?.unit
                        ? `${selectedDispute.warrantyCoverage.duration.value} ${selectedDispute.warrantyCoverage.duration.unit}`
                        : '—'}
                    </p>
                    <p><span className="text-gray-500">Booking completion date:</span> {formatDateOnly(selectedDispute.actualEndDate)}</p>
                    <p><span className="text-gray-500">Claim date:</span> {formatDateOnly(selectedDispute.dispute?.raisedAt)}</p>
                    <p><span className="text-gray-500">Claim description:</span> {selectedDispute.dispute?.description || '—'}</p>
                    {selectedDispute.dispute?.attachments && selectedDispute.dispute.attachments.length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-2">
                        {selectedDispute.dispute.attachments.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline text-blue-700 break-all">
                            <Paperclip className="h-3 w-3 inline mr-1" />
                            {fileNameFromUrl(url)}
                          </a>
                        ))}
                      </div>
                    )}
                    <p><span className="text-gray-500">Proposed resolve date:</span> {formatDateOnly(selectedDispute.dispute?.proposedResolveDate)}</p>
                    {selectedDisputeType === 'warranty_resolve' && (
                      <p><span className="text-gray-500">Resolution proposed:</span> {selectedDispute.dispute?.resolution || '—'}</p>
                    )}
                  </div>
                )}

                {selectedDisputeType === 'refund_request' && (
                  <div className="bg-gray-50 rounded p-3 space-y-1.5 text-xs">
                    <p className="font-semibold text-gray-700">Refund request</p>
                    <p><span className="text-gray-500">Request date:</span> {formatDateOnly(selectedDispute.dispute?.raisedAt)}</p>
                    <p><span className="text-gray-500">Start date:</span> {formatDateOnly(selectedDispute.actualStartDate || selectedDispute.scheduledStartDate)}</p>
                    <p><span className="text-gray-500">Booking status:</span> {selectedDispute.status}</p>
                    <p><span className="text-gray-500">Cancel reason:</span> {selectedDispute.cancellation?.reason || selectedDispute.dispute?.description || '—'}</p>
                    {selectedDispute.dispute?.attachments && selectedDispute.dispute.attachments.length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-2">
                        {selectedDispute.dispute.attachments.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline text-blue-700 break-all">
                            <Paperclip className="h-3 w-3 inline mr-1" />
                            {fileNameFromUrl(url)}
                          </a>
                        ))}
                      </div>
                    )}
                    <p><span className="text-gray-500">Negotiation date:</span> {formatDateOnly(selectedDispute.dispute?.negotiationDate)}</p>
                    <p>
                      <span className="text-gray-500">Negotiation amount:</span>{' '}
                      {typeof selectedDispute.dispute?.negotiationAmount === 'number'
                        ? `${selectedDispute.payment?.currency || 'EUR'} ${selectedDispute.dispute.negotiationAmount.toFixed(2)}`
                        : '—'}
                    </p>
                  </div>
                )}

                {selectedDisputeType === 'reschedule' && (
                  <div className="bg-gray-50 rounded p-3 space-y-1.5 text-xs">
                    <p className="font-semibold text-gray-700">Reschedule request</p>
                    <p><span className="text-gray-500">Reason for reschedule:</span> {selectedDispute.rescheduleRequest?.reason || '—'}</p>
                    <p>
                      <span className="text-gray-500">Proposed new date:</span>{' '}
                      {formatDateOnly(selectedDispute.rescheduleRequest?.proposedSchedule?.scheduledStartDate)}
                    </p>
                    <p><span className="text-gray-500">Customer&apos;s dispute reason:</span> {selectedDispute.dispute?.description || '—'}</p>
                  </div>
                )}

                {selectedDisputeType === 'in_progress' && (
                  <div className="bg-gray-50 rounded p-3 text-xs">
                    <p className="font-semibold text-gray-700">In-progress dispute</p>
                    <p className="text-gray-600">No type-specific data; close the dispute or issue a custom refund.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Resolution Action</Label>
                  <Select value={resolveAction} onValueChange={(value: ResolveAction) => setResolveAction(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedDisputeType === 'extra_costs' && (
                        <>
                          <SelectItem value="accept_professional">
                            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Accept professional&apos;s extra costs</span>
                          </SelectItem>
                          <SelectItem value="reject_extra_costs">
                            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Reject extra costs (customer wins)</span>
                          </SelectItem>
                          <SelectItem value="adjust">
                            <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-amber-500" /> Adjust amount</span>
                          </SelectItem>
                        </>
                      )}
                      {selectedDisputeType === 'completion_request' && (
                        <>
                          <SelectItem value="accept_professional">
                            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Approve completion</span>
                          </SelectItem>
                          <SelectItem value="reject_extra_costs">
                            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Decline completion</span>
                          </SelectItem>
                          <SelectItem value="adjust">
                            <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-amber-500" /> Custom refund amount</span>
                          </SelectItem>
                        </>
                      )}
                      {selectedDisputeType === 'warranty_claim' && (
                        <>
                          <SelectItem value="accept_professional">
                            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Approve claim</span>
                          </SelectItem>
                          <SelectItem value="reject_extra_costs">
                            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Decline claim</span>
                          </SelectItem>
                          <SelectItem value="adjust">
                            <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-amber-500" /> Adjust resolve text</span>
                          </SelectItem>
                        </>
                      )}
                      {selectedDisputeType === 'warranty_resolve' && (
                        <>
                          <SelectItem value="accept_professional">
                            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Approve resolution</span>
                          </SelectItem>
                          <SelectItem value="adjust">
                            <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-amber-500" /> Adjust resolution</span>
                          </SelectItem>
                        </>
                      )}
                      {selectedDisputeType === 'refund_request' && (
                        <>
                          <SelectItem value="accept_professional">
                            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Approve refund</span>
                          </SelectItem>
                          <SelectItem value="reject_extra_costs">
                            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Decline refund</span>
                          </SelectItem>
                          <SelectItem value="adjust">
                            <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-amber-500" /> Counter-offer (negotiation)</span>
                          </SelectItem>
                        </>
                      )}
                      {selectedDisputeType === 'reschedule' && (
                        <>
                          <SelectItem value="accept_professional">
                            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Approve new date</span>
                          </SelectItem>
                          <SelectItem value="reject_extra_costs">
                            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Decline (refund)</span>
                          </SelectItem>
                          <SelectItem value="adjust">
                            <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-amber-500" /> Dispute approve</span>
                          </SelectItem>
                        </>
                      )}
                      {selectedDisputeType === 'in_progress' && (
                        <>
                          <SelectItem value="accept_professional">
                            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Close dispute</span>
                          </SelectItem>
                          <SelectItem value="adjust">
                            <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-amber-500" /> Custom refund amount</span>
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {resolveAction === 'adjust' && (
                  <div className="space-y-2">
                    <Label>
                      {selectedDisputeType === 'refund_request'
                        ? 'Counter-offer amount'
                        : selectedDisputeType === 'completion_request' || selectedDisputeType === 'in_progress'
                        ? 'Refund amount'
                        : selectedDisputeType === 'warranty_claim' || selectedDisputeType === 'warranty_resolve'
                        ? 'Adjusted amount (optional)'
                        : 'Adjusted Extra Cost Amount'}
                    </Label>
                    <Input
                      type="number"
                      value={resolveAdjustedAmount}
                      onChange={(e) => setResolveAdjustedAmount(e.target.value)}
                      placeholder="Enter amount"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Force booking status after resolve</Label>
                  <Select value={forceStatus} onValueChange={(value: ForceStatus) => setForceStatus(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Keep (default: completed)</SelectItem>
                      <SelectItem value="completed">completed</SelectItem>
                      <SelectItem value="cancelled">cancelled</SelectItem>
                      <SelectItem value="refunded">refunded</SelectItem>
                      <SelectItem value="in_progress">in_progress</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Resolution attachments (optional)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleUploadAttachment(e.target.files)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingAttachment}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingAttachment ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Upload files
                    </Button>
                    {resolutionAttachments.length > 0 && (
                      <span className="text-xs text-gray-500">{resolutionAttachments.length} attached</span>
                    )}
                  </div>
                  {resolutionAttachments.length > 0 && (
                    <div className="flex flex-col gap-1 pt-1">
                      {resolutionAttachments.map((url) => (
                        <div key={url} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                          <a href={url} target="_blank" rel="noopener noreferrer" className="underline text-blue-700 break-all truncate">
                            <Paperclip className="h-3 w-3 inline mr-1" />
                            {fileNameFromUrl(url)}
                          </a>
                          <button
                            type="button"
                            className="text-gray-400 hover:text-red-600 shrink-0"
                            onClick={() => setResolutionAttachments((prev) => prev.filter((u) => u !== url))}
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Resolution Notes (required)</Label>
                  <Textarea
                    value={resolveResolution}
                    onChange={(e) => setResolveResolution(e.target.value)}
                    placeholder="Explain the resolution decision..."
                    className="min-h-[80px]"
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetResolveForm()
                      setSelectedDispute(null)
                      setShowResolveDialog(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleResolve}
                    disabled={resolving || uploadingAttachment || !resolveResolution.trim() || (resolveAction === 'adjust' && !resolveAdjustedAmount)}
                  >
                    {resolving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Resolve Dispute
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
