'use client'

import { useCallback, useEffect, useState } from "react"
import { authFetch } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"

interface CustomerRefundOfferProps {
  bookingId: string
  currency?: string
  onResolved?: () => void
}

interface CancellationRequest {
  status: string
  counterOfferAmount?: number
  professionalNote?: string
  escalationReason?: string
}

export default function CustomerRefundOffer({ bookingId, currency = 'EUR', onResolved }: CustomerRefundOfferProps) {
  const [request, setRequest] = useState<CancellationRequest | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/cancellation`)
      const json = await res.json()
      if (res.ok && json?.success) {
        setRequest(json.data?.request || null)
      } else {
        setRequest(null)
      }
    } catch {
      setRequest(null)
    }
  }, [bookingId])

  useEffect(() => { load() }, [load])

  const respond = async (decision: 'accept' | 'refuse') => {
    if (decision === 'refuse' && !window.confirm('Refuse the counter-offer? Your refund request will be escalated to Fixera.')) return
    setBusy(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/cancellation/counter-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.msg || 'Failed to respond')
        return
      }
      toast.success(decision === 'accept' ? 'Refund accepted and issued.' : 'Counter-offer refused — escalated to Fixera.')
      await load()
      onResolved?.()
    } catch {
      toast.error('Failed to respond')
    } finally {
      setBusy(false)
    }
  }

  if (!request) return null

  if (request.status === 'pending') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold flex items-center gap-1"><RotateCcw className="h-4 w-4" /> Refund request sent</p>
        <p className="mt-1">The professional has up to 5 business days to respond. If they don&apos;t, it escalates to Fixera automatically.</p>
      </div>
    )
  }

  if (request.status === 'escalated') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-semibold flex items-center gap-1"><RotateCcw className="h-4 w-4" /> Refund escalated to Fixera</p>
        <p className="mt-1">Fixera is reviewing your refund request and will be in touch.</p>
      </div>
    )
  }

  if (request.status === 'negotiating' && request.counterOfferAmount != null) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-indigo-900 flex items-center gap-1">
          <RotateCcw className="h-4 w-4" /> Refund counter-offer
        </p>
        <p className="text-sm text-indigo-800">
          The professional has offered a refund of <strong>{currency} {request.counterOfferAmount.toFixed(2)}</strong>.
        </p>
        {request.professionalNote && <p className="text-xs text-indigo-700 italic">{request.professionalNote}</p>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => respond('accept')}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Accept
          </Button>
          <Button size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => respond('refuse')}>
            Refuse &amp; escalate
          </Button>
        </div>
      </div>
    )
  }

  return null
}
