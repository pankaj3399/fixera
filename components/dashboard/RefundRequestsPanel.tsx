'use client'

import { useCallback, useEffect, useState } from "react"
import { authFetch } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, RotateCcw, CheckCircle, XCircle, Scale } from "lucide-react"
import { toast } from "sonner"

interface RefundRequest {
  _id: string
  reason: string
  status: string
  counterOfferAmount?: number
  responseDeadline?: string
  evidence?: string[]
  booking?: {
    _id: string
    bookingNumber?: string
    payment?: { amount?: number; currency?: string }
    project?: { title?: string }
  }
  requestedBy?: { name?: string; email?: string }
}

const fmtDate = (v?: string) => (v ? new Date(v).toLocaleDateString() : '—')

export default function RefundRequestsPanel() {
  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [counterFor, setCounterFor] = useState<string | null>(null)
  const [counterAmount, setCounterAmount] = useState("")
  const [note, setNote] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/refund-requests`)
      const json = await res.json()
      if (res.ok && json?.success) {
        setRequests(Array.isArray(json.data?.requests) ? json.data.requests : [])
      } else {
        setLoadError(json?.msg || 'Failed to load refund requests')
      }
    } catch {
      setLoadError('Failed to load refund requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const respond = async (req: RefundRequest, decision: 'approve' | 'counter' | 'reject') => {
    const bookingId = req.booking?._id
    if (!bookingId) return
    if (decision === 'approve' && !window.confirm('Approve a full refund (including the Fixera fee) for this booking?')) return
    if (decision === 'reject' && !window.confirm('Reject this refund request? It will be escalated to Fixera.')) return

    let amount: number | undefined
    if (decision === 'counter') {
      amount = Number(counterAmount)
      const max = req.booking?.payment?.amount ?? 0
      if (!Number.isFinite(amount) || amount < 1 || amount > max) {
        toast.error(`Counter-offer must be between 1 and the booking price (${max.toFixed(2)})`)
        return
      }
    }

    setBusyId(req._id)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/cancellation/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, amount, note: decision === 'counter' ? (note.trim() || undefined) : undefined }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.msg || 'Failed to respond')
        return
      }
      toast.success(
        decision === 'approve' ? 'Refund approved and issued.'
        : decision === 'counter' ? 'Counter-offer sent to the customer.'
        : 'Refund request rejected and escalated to Fixera.'
      )
      setCounterFor(null)
      setCounterAmount("")
      setNote("")
      await load()
    } catch {
      toast.error('Failed to respond')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></CardContent>
      </Card>
    )
  }

  if (loadError) {
    return (
      <Card className="border-rose-200">
        <CardContent className="py-4 flex items-center justify-between gap-3">
          <p className="text-sm text-rose-700">{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (requests.length === 0) return null

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-amber-600" />
          Refund requests ({requests.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((req) => {
          const busy = busyId === req._id
          const price = req.booking?.payment?.amount ?? 0
          const currency = req.booking?.payment?.currency || 'EUR'
          return (
            <div key={req._id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm font-medium">
                  {req.booking?.bookingNumber || req.booking?._id?.slice(-6)}
                  {req.booking?.project?.title ? <span className="text-gray-500 font-normal"> · {req.booking.project.title}</span> : null}
                </div>
                <Badge variant={req.status === 'negotiating' ? 'secondary' : 'destructive'} className="text-xs">
                  {req.status === 'negotiating' ? 'Awaiting customer' : 'New request'}
                </Badge>
              </div>
              <p className="text-xs text-gray-600"><span className="text-gray-400">Customer:</span> {req.requestedBy?.name || req.requestedBy?.email || 'Customer'}</p>
              <p className="text-xs text-gray-600"><span className="text-gray-400">Reason:</span> {req.reason}</p>
              <p className="text-xs text-gray-600"><span className="text-gray-400">Booking price:</span> {currency} {price.toFixed(2)}{req.responseDeadline ? ` · respond by ${fmtDate(req.responseDeadline)}` : ''}</p>
              {req.evidence && req.evidence.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {req.evidence.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline text-blue-700 break-all">evidence</a>
                  ))}
                </div>
              )}
              {req.status === 'negotiating' ? (
                <p className="text-xs text-amber-700">Counter-offer of {currency} {(req.counterOfferAmount ?? 0).toFixed(2)} sent — waiting for the customer to accept or refuse.</p>
              ) : counterFor === req._id ? (
                <div className="space-y-2">
                  <Input type="number" placeholder={`Counter-offer (max ${price.toFixed(2)})`} value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} />
                  <Textarea placeholder="Optional message to the customer" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[60px]" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => respond(req, 'counter')}>
                      {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Scale className="h-3 w-3 mr-1" />}Send offer
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { setCounterFor(null); setCounterAmount(""); setNote("") }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => respond(req, 'approve')}>
                    <CheckCircle className="h-3 w-3 mr-1" />Approve full refund
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => { setCounterFor(req._id); setCounterAmount(""); setNote("") }}>
                    <Scale className="h-3 w-3 mr-1" />Negotiate
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-rose-200 text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => respond(req, 'reject')}>
                    <XCircle className="h-3 w-3 mr-1" />Reject
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
