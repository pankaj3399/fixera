'use client'

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { authFetch } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, RotateCcw, CheckCircle, XCircle, Scale } from "lucide-react"
import { toast } from "sonner"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"

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

export default function RefundRequestsPanel() {
  const t = useTranslations("dashboardWidgets")
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()
  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [counterFor, setCounterFor] = useState<string | null>(null)
  const [counterAmount, setCounterAmount] = useState("")
  const [note, setNote] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  const fmtDate = useCallback(
    (v?: string) => (v ? new Date(v).toLocaleDateString(intl) : '—'),
    [intl]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/refund-requests`)
      const json = await res.json()
      if (res.ok && json?.success) {
        setRequests(Array.isArray(json.data?.requests) ? json.data.requests : [])
      } else {
        setLoadError(json?.msg || t('refundRequests.loadFailed'))
      }
    } catch {
      setLoadError(t('refundRequests.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const respond = async (req: RefundRequest, decision: 'approve' | 'counter' | 'reject') => {
    const bookingId = req.booking?._id
    if (!bookingId) return
    if (decision === 'approve' && !window.confirm(t('refundRequests.confirmApprove'))) return
    if (decision === 'reject' && !window.confirm(t('refundRequests.confirmReject'))) return

    let amount: number | undefined
    if (decision === 'counter') {
      amount = Number(counterAmount)
      const max = req.booking?.payment?.amount ?? 0
      if (!Number.isFinite(amount) || amount < 1 || amount > max) {
        toast.error(t('refundRequests.counterRange', {
          max: formatMoney(max, req.booking?.payment?.currency),
        }))
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
        toast.error(json?.msg || t('refundRequests.respondFailed'))
        return
      }
      toast.success(
        decision === 'approve' ? t('refundRequests.approved')
        : decision === 'counter' ? t('refundRequests.counterSent')
        : t('refundRequests.rejected')
      )
      setCounterFor(null)
      setCounterAmount("")
      setNote("")
      await load()
    } catch {
      toast.error(t('refundRequests.respondFailed'))
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
          <Button size="sm" variant="outline" onClick={load}>{t('common.retry')}</Button>
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
          {t('refundRequests.title', { count: requests.length })}
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
                  {req.status === 'negotiating' ? t('refundRequests.statusAwaitingCustomer') : t('refundRequests.statusNew')}
                </Badge>
              </div>
              <p className="text-xs text-gray-600"><span className="text-gray-400">{t('refundRequests.customerLabel')}</span> {req.requestedBy?.name || req.requestedBy?.email || t('common.customer')}</p>
              <p className="text-xs text-gray-600"><span className="text-gray-400">{t('refundRequests.reasonLabel')}</span> {req.reason}</p>
              <p className="text-xs text-gray-600"><span className="text-gray-400">{t('refundRequests.bookingPriceLabel')}</span> {formatMoney(price, currency)}{req.responseDeadline ? ` · ${t('refundRequests.respondBy', { date: fmtDate(req.responseDeadline) })}` : ''}</p>
              {req.evidence && req.evidence.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {req.evidence.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline text-blue-700 break-all">{t('refundRequests.evidence')}</a>
                  ))}
                </div>
              )}
              {req.status === 'negotiating' ? (
                <p className="text-xs text-amber-700">{t('refundRequests.counterOfferSent', { amount: formatMoney(req.counterOfferAmount ?? 0, currency) })}</p>
              ) : counterFor === req._id ? (
                <div className="space-y-2">
                  <Input type="number" placeholder={t('refundRequests.counterPlaceholder', { amount: formatMoney(price, currency) })} value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} />
                  <Textarea placeholder={t('refundRequests.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[60px]" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => respond(req, 'counter')}>
                      {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Scale className="h-3 w-3 mr-1" />}{t('refundRequests.sendOffer')}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { setCounterFor(null); setCounterAmount(""); setNote("") }}>{t('common.cancel')}</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => respond(req, 'approve')}>
                    <CheckCircle className="h-3 w-3 mr-1" />{t('refundRequests.approveFull')}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => { setCounterFor(req._id); setCounterAmount(""); setNote("") }}>
                    <Scale className="h-3 w-3 mr-1" />{t('refundRequests.negotiate')}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-rose-200 text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => respond(req, 'reject')}>
                    <XCircle className="h-3 w-3 mr-1" />{t('refundRequests.reject')}
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
