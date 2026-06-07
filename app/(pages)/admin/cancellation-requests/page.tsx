'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Ban, CheckCircle2, RefreshCw, XCircle } from "lucide-react"
import { toast } from "sonner"
import { CANCEL_REASONS } from "@/lib/constants/cancelReasons"

interface CancellationRequestItem {
  _id: string
  status: 'pending' | 'approved' | 'denied'
  reasonCategory?: string
  reason?: string
  evidence?: string[]
  denyReason?: string
  refundAmount?: number
  refundedAt?: string
  resolvedAt?: string
  requestedRole: 'customer' | 'professional'
  createdAt: string
  requestedBy?: { _id: string; name?: string; email?: string }
  resolvedBy?: { _id: string; name?: string; email?: string }
  booking?: {
    _id: string
    bookingNumber?: string
    status?: string
    payment?: { totalWithVat?: number; currency?: string; status?: string }
    customer?: { _id: string; name?: string; email?: string }
    professional?: { _id: string; name?: string; email?: string }
  }
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'denied'

export default function AdminCancellationRequestsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [items, setItems] = useState<CancellationRequestItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [page, setPage] = useState(1)
  const limit = 20

  const [denyTarget, setDenyTarget] = useState<CancellationRequestItem | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const [denying, setDenying] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const latestFetchIdRef = useRef(0)

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const fetchRequests = useCallback(async () => {
    const fetchId = latestFetchIdRef.current + 1
    latestFetchIdRef.current = fetchId
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/cancellation-requests?${params}`)
      const json = await res.json()
      if (latestFetchIdRef.current !== fetchId) return
      if (json.success) {
        setItems(json.data.items)
        setTotal(json.data.total)
      } else {
        toast.error('Failed to load cancellation requests')
      }
    } catch {
      if (latestFetchIdRef.current !== fetchId) return
      toast.error('Failed to load cancellation requests')
    } finally {
      if (latestFetchIdRef.current === fetchId) {
        setIsLoading(false)
      }
    }
  }, [page, statusFilter])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchRequests()
    }
  }, [user, fetchRequests])

  const handleApprove = async (item: CancellationRequestItem) => {
    if (!confirm(`Approve cancellation for booking ${item.booking?.bookingNumber || item.booking?._id}? This will cancel the booking and issue a full refund.`)) return
    setApprovingId(item._id)
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/cancellation-requests/${item._id}/approve`,
        { method: 'POST' }
      )
      const json = await res.json()
      if (json.success) {
        toast.success(`Cancellation approved. Refund: ${json.data?.refundAmount?.toFixed(2) || 0}`)
        fetchRequests()
      } else {
        toast.error(json.msg || 'Failed to approve cancellation')
      }
    } catch {
      toast.error('Failed to approve cancellation')
    } finally {
      setApprovingId(null)
    }
  }

  const submitDeny = async () => {
    if (!denyTarget) return
    if (!denyReason.trim()) {
      toast.error('Please provide a reason')
      return
    }
    setDenying(true)
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/cancellation-requests/${denyTarget._id}/deny`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ denyReason: denyReason.trim() }),
        }
      )
      const json = await res.json()
      if (json.success) {
        toast.success('Cancellation request denied')
        setDenyTarget(null)
        setDenyReason('')
        fetchRequests()
      } else {
        toast.error(json.msg || 'Failed to deny cancellation')
      }
    } catch {
      toast.error('Failed to deny cancellation')
    } finally {
      setDenying(false)
    }
  }

  if (loading || !user || user.role !== 'admin') return null
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Ban className="h-6 w-6" />
              Cancellation Requests
            </h1>
            <p className="text-sm text-gray-500 mt-1">Review and approve customer/professional cancellation requests</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRequests}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(value: StatusFilter) => { setStatusFilter(value); setPage(1) }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Ban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No cancellation requests found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const total = item.booking?.payment?.totalWithVat || 0
              const currency = item.booking?.payment?.currency || 'EUR'
              const categoryLabel = item.reasonCategory
                ? (CANCEL_REASONS.find((r) => r.value === item.reasonCategory)?.label || item.reasonCategory)
                : undefined
              const safeEvidence = (Array.isArray(item.evidence) ? item.evidence : []).filter((e) => {
                try {
                  return ['http:', 'https:'].includes(new URL(e).protocol)
                } catch {
                  return false
                }
              })
              return (
                <Card key={item._id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{item.booking?.bookingNumber || item.booking?._id}</span>
                          <Badge
                            variant={
                              item.status === 'pending' ? 'destructive' : item.status === 'approved' ? 'default' : 'secondary'
                            }
                            className="text-xs"
                          >
                            {item.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{item.requestedRole}</Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          Requested by: {item.requestedBy?.name || item.requestedBy?.email || 'Unknown'}
                          {' | '}
                          Customer: {item.booking?.customer?.name || '—'}
                          {' | '}
                          Professional: {item.booking?.professional?.name || '—'}
                        </p>
                        {categoryLabel && (
                          <p className="text-xs text-red-600 font-medium mt-1">
                            Category: {categoryLabel}
                          </p>
                        )}
                        {item.reason && item.reason !== categoryLabel && (
                          <p className="text-xs text-red-600 font-medium mt-1">Reason: {item.reason}</p>
                        )}
                        {safeEvidence.length > 0 && (
                          <p className="text-xs text-gray-600 mt-0.5 flex flex-wrap gap-2">
                            <span>Attachments:</span>
                            {safeEvidence.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                File {i + 1}
                              </a>
                            ))}
                          </p>
                        )}
                        {item.booking?.payment && (
                          <p className="text-xs text-gray-600">
                            Payment: {currency} {total.toFixed(2)} ({item.booking.payment.status})
                          </p>
                        )}
                        {item.refundAmount != null && (
                          <p className="text-xs text-green-700 font-medium">
                            Refunded: {currency} {item.refundAmount.toFixed(2)}{' '}
                            {item.refundedAt ? `on ${new Date(item.refundedAt).toLocaleDateString()}` : ''}
                          </p>
                        )}
                        {item.denyReason && (
                          <p className="text-xs text-gray-600">Denied: {item.denyReason}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 items-end shrink-0">
                        <p className="text-xs text-gray-400">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                        {item.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleApprove(item)}
                              disabled={approvingId === item._id}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {approvingId === item._id ? 'Approving…' : 'Approve'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => { setDenyTarget(item); setDenyReason('') }}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Deny
                            </Button>
                          </>
                        )}
                        {item.booking?._id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => router.push(`/admin/bookings/${item.booking?._id}`)}
                          >
                            View Booking
                          </Button>
                        )}
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
      </div>

      <Dialog open={!!denyTarget} onOpenChange={(open) => { if (!open) { setDenyTarget(null); setDenyReason('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Cancellation Request</DialogTitle>
            <DialogDescription>
              The booking will remain active. The requester will receive an email with your reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="deny-reason">Reason</Label>
            <Textarea
              id="deny-reason"
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Explain why this cancellation request is denied"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setDenyTarget(null); setDenyReason('') }}>Cancel</Button>
              <Button onClick={submitDeny} disabled={denying || !denyReason.trim()}>
                {denying ? 'Denying…' : 'Deny Request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
