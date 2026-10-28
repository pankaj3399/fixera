'use client'

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { authFetch } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { useCurrency } from "@/contexts/CurrencyContext"

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
  const t = useTranslations('checkout')
  const { formatMoney } = useCurrency()
  const [request, setRequest] = useState<CancellationRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/cancellation`)
      const json = await res.json()
      if (res.ok && json?.success) {
        setLoadError(false)
        setRequest(json.data?.request || null)
      } else {
        setLoadError(true)
      }
    } catch {
      setLoadError(true)
    }
  }, [bookingId])

  useEffect(() => { load() }, [load])

  const respond = async (decision: 'accept' | 'refuse') => {
    if (decision === 'refuse' && !window.confirm(t('refundOffer.confirmRefuse'))) return
    setBusy(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/cancellation/counter-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.msg || t('refundOffer.respondFailed'))
        return
      }
      toast.success(decision === 'accept' ? t('refundOffer.acceptSuccess') : t('refundOffer.refuseSuccess'))
      await load()
      onResolved?.()
    } catch {
      toast.error(t('refundOffer.respondFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (loadError && !request) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex items-center justify-between gap-3">
        <span>{t('refundOffer.loadFailed')}</span>
        <Button size="sm" variant="outline" onClick={load}>{t('refundOffer.retry')}</Button>
      </div>
    )
  }

  if (!request) return null

  if (request.status === 'pending') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold flex items-center gap-1"><RotateCcw className="h-4 w-4" /> {t('refundOffer.requestSentTitle')}</p>
        <p className="mt-1">{t('refundOffer.requestSentBody')}</p>
      </div>
    )
  }

  if (request.status === 'escalated') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-semibold flex items-center gap-1"><RotateCcw className="h-4 w-4" /> {t('refundOffer.escalatedTitle')}</p>
        <p className="mt-1">{t('refundOffer.escalatedBody')}</p>
      </div>
    )
  }

  if (request.status === 'negotiating' && request.counterOfferAmount != null) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-indigo-900 flex items-center gap-1">
          <RotateCcw className="h-4 w-4" /> {t('refundOffer.counterOfferTitle')}
        </p>
        <p className="text-sm text-indigo-800">
          {t.rich('refundOffer.counterOfferBody', {
            amount: formatMoney(request.counterOfferAmount, currency),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        {request.professionalNote && <p className="text-xs text-indigo-700 italic">{request.professionalNote}</p>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => respond('accept')}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}{t('refundOffer.accept')}
          </Button>
          <Button size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => respond('refuse')}>
            {t('refundOffer.refuseEscalate')}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
