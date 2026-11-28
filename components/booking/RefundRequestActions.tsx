'use client'

import { useState } from "react"
import { useTranslations } from "next-intl"
import { CheckCircle, Loader2, Scale, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useErrorMessage } from "@/lib/i18n/useErrorMessage"
import { authFetch } from "@/lib/utils"

export type RefundRequestDecision = 'approve' | 'counter' | 'reject'

interface RefundRequestActionsProps {
  bookingId: string
  /** Highest counter-offer the backend accepts (the booking price). */
  maxAmount: number
  currency?: string | null
  onResolved?: (decision: RefundRequestDecision) => void | Promise<void>
}

/**
 * The professional's answer to a pending customer refund request:
 * [Approve full refund] [Negotiate] [Reject], with the inline counter-offer
 * form behind Negotiate. Shared by the dashboard "Refund requests" panel and
 * the booking page's cancellation request card so both offer exactly the
 * same actions and copy (FT3 #3A).
 */
export default function RefundRequestActions({
  bookingId,
  maxAmount,
  currency,
  onResolved,
}: RefundRequestActionsProps) {
  const t = useTranslations("dashboardWidgets")
  const getErrorText = useErrorMessage()
  const { formatMoney } = useCurrency()
  const [busy, setBusy] = useState(false)
  const [negotiating, setNegotiating] = useState(false)
  const [counterAmount, setCounterAmount] = useState("")
  const [note, setNote] = useState("")
  const displayCurrency = currency || 'EUR'

  const closeNegotiation = () => {
    setNegotiating(false)
    setCounterAmount("")
    setNote("")
  }

  const respond = async (decision: RefundRequestDecision) => {
    if (busy) return
    if (decision === 'approve' && !window.confirm(t('refundRequests.confirmApprove'))) return
    if (decision === 'reject' && !window.confirm(t('refundRequests.confirmReject'))) return

    let amount: number | undefined
    if (decision === 'counter') {
      amount = Number(counterAmount)
      if (!Number.isFinite(amount) || amount < 1 || amount > maxAmount) {
        toast.error(t('refundRequests.counterRange', { max: formatMoney(maxAmount, displayCurrency) }))
        return
      }
    }

    setBusy(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${bookingId}/cancellation/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, amount, note: decision === 'counter' ? (note.trim() || undefined) : undefined }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        toast.error(getErrorText(json, t('refundRequests.respondFailed')))
        return
      }
      toast.success(
        decision === 'approve' ? t('refundRequests.approved')
        : decision === 'counter' ? t('refundRequests.counterSent')
        : t('refundRequests.rejected')
      )
      closeNegotiation()
      await onResolved?.(decision)
    } catch (error) {
      toast.error(getErrorText(error, t('refundRequests.respondFailed')))
    } finally {
      setBusy(false)
    }
  }

  if (negotiating) {
    return (
      <div className="space-y-2">
        <Input
          type="number"
          placeholder={t('refundRequests.counterPlaceholder', { amount: formatMoney(maxAmount, displayCurrency) })}
          value={counterAmount}
          onChange={(e) => setCounterAmount(e.target.value)}
        />
        <Textarea
          placeholder={t('refundRequests.notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[60px]"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void respond('counter')}>
            {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Scale className="h-3 w-3 mr-1" />}
            {t('refundRequests.sendOffer')}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={closeNegotiation}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        size="sm"
        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        disabled={busy}
        onClick={() => void respond('approve')}
      >
        {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
        {t('refundRequests.approveFull')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={busy}
        onClick={() => { setCounterAmount(""); setNote(""); setNegotiating(true) }}
      >
        <Scale className="h-3 w-3 mr-1" />{t('refundRequests.negotiate')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
        disabled={busy}
        onClick={() => void respond('reject')}
      >
        <XCircle className="h-3 w-3 mr-1" />{t('refundRequests.reject')}
      </Button>
    </div>
  )
}
