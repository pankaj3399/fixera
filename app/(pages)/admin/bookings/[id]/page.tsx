'use client'

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, RefreshCw, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { FORCEABLE_BOOKING_STATUSES } from "@/lib/constants/adminBookingStatus"

interface Refund {
  amount: number
  reason?: string
  refundedAt?: string
  source?: string
  notes?: string
}

interface RescheduleHistoryEntry {
  requestedAt: string
  reason?: string
  note?: string
  status: 'accepted' | 'declined' | 'auto_cancelled'
  respondedAt?: string
  responseNote?: string
  requestedBy?: { name?: string; email?: string }
  respondedBy?: { name?: string; email?: string }
  previousSchedule?: { scheduledStartDate?: string }
  proposedSchedule?: { scheduledStartDate?: string }
}

interface Dispute {
  reason?: string
  description?: string
  raisedAt?: string
  resolvedAt?: string
  resolution?: string
  adminAdjustedAmount?: number
  slaDeadline?: string
  slaBreachNotifiedAt?: string
  raisedBy?: { name?: string; email?: string }
  resolvedBy?: { name?: string; email?: string }
}

interface BookingDoc {
  _id: string
  bookingNumber?: string
  status: string
  scheduledStartDate?: string
  scheduledExecutionEndDate?: string
  customer?: { _id: string; name?: string; email?: string }
  professional?: { _id: string; name?: string; email?: string }
  project?: { _id: string; title?: string; service?: string }
  payment?: { totalWithVat?: number; currency?: string; status?: string; refundedAt?: string; refundReason?: string }
  rescheduleHistory?: RescheduleHistoryEntry[]
  dispute?: Dispute
  cancellation?: { reason?: string; cancelledAt?: string; refundAmount?: number }
}

interface CancellationRequestDoc {
  _id: string
  status: 'pending' | 'approved' | 'denied'
  reason: string
  denyReason?: string
  refundAmount?: number
  refundedAt?: string
  resolvedAt?: string
  createdAt: string
  requestedRole: string
  requestedBy?: { name?: string; email?: string }
  resolvedBy?: { name?: string; email?: string }
}

interface BookingDetailPayload {
  booking: BookingDoc
  payment: { refunds?: Refund[]; status?: string; totalWithVat?: number; currency?: string } | null
  cancellationRequests: CancellationRequestDoc[]
}

const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString() : '-'
const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString() : '-'
const formatMoney = (amount?: number, currency?: string) =>
  typeof amount === 'number' ? `${currency || 'EUR'} ${amount.toFixed(2)}` : '-'

export default function AdminBookingDetailPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [data, setData] = useState<BookingDetailPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [forceStatusValue, setForceStatusValue] = useState("")
  const [forcingStatus, setForcingStatus] = useState(false)
  const [startingChat, setStartingChat] = useState<'customer' | 'professional' | null>(null)

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const fetch = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/bookings/${id}/full`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        toast.error(json.msg || 'Failed to load booking')
      }
    } catch {
      toast.error('Failed to load booking')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (user?.role === 'admin') fetch()
  }, [user, fetch])

  const handleForceStatus = useCallback(async () => {
    if (!id || !forceStatusValue) return
    setForcingStatus(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/bookings/${id}/force-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: forceStatusValue }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.msg || 'Failed to force status')
        return
      }
      toast.success(`Status changed to "${forceStatusValue}"`)
      setForceStatusValue("")
      await fetch()
    } catch {
      toast.error('Failed to force status')
    } finally {
      setForcingStatus(false)
    }
  }, [id, forceStatusValue, fetch])

  const handleStartSupportChat = useCallback(async (target: 'customer' | 'professional') => {
    const targetUserId = target === 'customer' ? data?.booking.customer?._id : data?.booking.professional?._id
    if (!targetUserId) {
      toast.error(`Booking has no linked ${target}`)
      return
    }
    const newWindow = window.open('about:blank', '_blank')
    setStartingChat(target)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/chat/start-support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          initialMessage: `Hello — I'm reaching out from Fixera about booking ${data?.booking.bookingNumber || ''}.`,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success || !json.data?.conversationId) {
        newWindow?.close()
        toast.error(json.msg || 'Failed to start support chat')
        return
      }
      const url = `/admin/chat?${new URLSearchParams({ conversationId: json.data.conversationId }).toString()}`
      if (newWindow) newWindow.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      newWindow?.close()
      toast.error('Failed to start support chat')
    } finally {
      setStartingChat(null)
    }
  }, [data])

  if (loading || !user) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-5xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="outline" size="sm" onClick={fetch}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
          </div>
        ) : !data ? (
          <Card><CardContent className="py-12 text-center text-gray-500">Booking not found</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>{data.booking.bookingNumber || data.booking._id}</span>
                  <Badge variant="outline">{data.booking.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>Customer: {data.booking.customer?.name || data.booking.customer?.email || '-'}</p>
                <p>Professional: {data.booking.professional?.name || data.booking.professional?.email || '-'}</p>
                <p>Project: {data.booking.project?.title || '-'}</p>
                <p>Scheduled: {formatDateTime(data.booking.scheduledStartDate)} → {formatDateTime(data.booking.scheduledExecutionEndDate)}</p>
                {data.booking.payment && (
                  <p>
                    Payment: {formatMoney(data.booking.payment.totalWithVat, data.booking.payment.currency)} ({data.booking.payment.status || 'n/a'})
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/bookings/${data.booking._id}`)}
                  >
                    Open customer view
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={startingChat === 'customer' || !data.booking.customer?._id}
                    onClick={() => handleStartSupportChat('customer')}
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    {startingChat === 'customer' ? 'Opening…' : 'Chat customer'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={startingChat === 'professional' || !data.booking.professional?._id}
                    onClick={() => handleStartSupportChat('professional')}
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    {startingChat === 'professional' ? 'Opening…' : 'Chat professional'}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t mt-3">
                  <span className="text-xs text-gray-500">Force status:</span>
                  <Select value={forceStatusValue} onValueChange={setForceStatusValue}>
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue placeholder="Select status…" />
                    </SelectTrigger>
                    <SelectContent>
                      {FORCEABLE_BOOKING_STATUSES.filter((s) => s !== data.booking.status).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!forceStatusValue || forcingStatus}
                    onClick={handleForceStatus}
                  >
                    {forcingStatus ? 'Applying…' : 'Apply'}
                  </Button>
                  <span className="text-[11px] text-gray-400">Status override only — does not trigger payments/refunds.</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reschedule History ({(data.booking.rescheduleHistory || []).length})</CardTitle>
              </CardHeader>
              <CardContent>
                {(data.booking.rescheduleHistory || []).length === 0 ? (
                  <p className="text-sm text-gray-500">No reschedules.</p>
                ) : (
                  <div className="space-y-2">
                    {(data.booking.rescheduleHistory || []).map((r, idx) => (
                      <div key={idx} className="text-xs border rounded p-3 bg-white space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={r.status === 'accepted' ? 'default' : 'secondary'} className="text-xs">{r.status}</Badge>
                          <span className="text-gray-500">{formatDateTime(r.requestedAt)}</span>
                        </div>
                        <p>By: {r.requestedBy?.name || r.requestedBy?.email || '-'}</p>
                        <p>Reason: {r.reason || '-'}</p>
                        <p>Previous: {formatDate(r.previousSchedule?.scheduledStartDate)} → Proposed: {formatDate(r.proposedSchedule?.scheduledStartDate)}</p>
                        {r.respondedAt && <p>Responded: {formatDateTime(r.respondedAt)} by {r.respondedBy?.name || r.respondedBy?.email || '-'}</p>}
                        {r.responseNote && <p>Note: {r.responseNote}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cancellation Requests ({data.cancellationRequests.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {data.cancellationRequests.length === 0 ? (
                  <p className="text-sm text-gray-500">No cancellation requests.</p>
                ) : (
                  <div className="space-y-2">
                    {data.cancellationRequests.map((cr) => (
                      <div key={cr._id} className="text-xs border rounded p-3 bg-white space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={cr.status === 'pending' ? 'destructive' : cr.status === 'approved' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {cr.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{cr.requestedRole}</Badge>
                          <span className="text-gray-500">{formatDateTime(cr.createdAt)}</span>
                        </div>
                        <p>By: {cr.requestedBy?.name || cr.requestedBy?.email || '-'}</p>
                        <p>Reason: {cr.reason}</p>
                        {cr.denyReason && <p>Deny reason: {cr.denyReason}</p>}
                        {cr.refundAmount != null && (
                          <p className="text-green-700">
                            Refunded: {formatMoney(cr.refundAmount, data.booking.payment?.currency)} on {formatDate(cr.refundedAt)}
                          </p>
                        )}
                        {cr.resolvedBy && <p>Resolved by: {cr.resolvedBy.name || cr.resolvedBy.email}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Refund History ({(data.payment?.refunds || []).length})</CardTitle>
              </CardHeader>
              <CardContent>
                {(data.payment?.refunds || []).length === 0 ? (
                  <p className="text-sm text-gray-500">No refunds issued.</p>
                ) : (
                  <div className="space-y-2">
                    {(data.payment?.refunds || []).map((r, idx) => (
                      <div key={idx} className="text-xs border rounded p-3 bg-white space-y-1">
                        <p className="font-medium">{formatMoney(r.amount, data.payment?.currency)} ({r.source || 'platform'})</p>
                        <p>{formatDateTime(r.refundedAt)}</p>
                        {r.reason && <p>Reason: {r.reason}</p>}
                        {r.notes && <p>Notes: {r.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dispute</CardTitle>
              </CardHeader>
              <CardContent>
                {!data.booking.dispute?.raisedAt ? (
                  <p className="text-sm text-gray-500">No dispute on this booking.</p>
                ) : (
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={data.booking.dispute.resolvedAt ? 'default' : 'destructive'} className="text-xs">
                        {data.booking.dispute.resolvedAt ? 'Resolved' : 'Open'}
                      </Badge>
                      {!data.booking.dispute.resolvedAt && data.booking.dispute.slaDeadline && new Date(data.booking.dispute.slaDeadline) < new Date() && (
                        <Badge variant="destructive" className="text-xs bg-red-700">SLA breached</Badge>
                      )}
                    </div>
                    <p>Raised: {formatDateTime(data.booking.dispute.raisedAt)} by {data.booking.dispute.raisedBy?.name || data.booking.dispute.raisedBy?.email}</p>
                    <p>Reason: {data.booking.dispute.reason}</p>
                    <p>Description: {data.booking.dispute.description}</p>
                    {data.booking.dispute.slaDeadline && <p>SLA deadline: {formatDateTime(data.booking.dispute.slaDeadline)}</p>}
                    {data.booking.dispute.resolvedAt && (
                      <>
                        <p>Resolved: {formatDateTime(data.booking.dispute.resolvedAt)} by {data.booking.dispute.resolvedBy?.name || data.booking.dispute.resolvedBy?.email}</p>
                        <p>Resolution: {data.booking.dispute.resolution}</p>
                        {data.booking.dispute.adminAdjustedAmount != null && (
                          <p>Admin-adjusted amount: {formatMoney(data.booking.dispute.adminAdjustedAmount, data.booking.payment?.currency)}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
