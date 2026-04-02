'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowDown, ArrowUp, Minus, Clock, Shield, Package, CreditCard, Calendar } from 'lucide-react'
import { getAuthToken } from '@/lib/utils'
import type { QuoteVersion } from '@/types/quotation'

interface QuoteBookingSummary {
  _id: string
  professional?: { _id: string; name?: string; businessInfo?: { companyName?: string } }
  rfqData?: { serviceType?: string }
  quotationNumber?: string
  status?: string
}

interface QuoteComparisonModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookings: QuoteBookingSummary[]
}

interface FetchedQuote {
  booking: QuoteBookingSummary
  version: QuoteVersion | null
  loading: boolean
  error: string | null
}

const formatDuration = (d?: { value: number; unit: string }) => {
  if (!d || !d.value) return '-'
  return `${d.value} ${d.unit}`
}

const formatCurrency = (amount: number, currency = 'EUR') => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString()
}

export default function QuoteComparisonModal({ open, onOpenChange, bookings }: QuoteComparisonModalProps) {
  const [quotes, setQuotes] = useState<FetchedQuote[]>([])
  const requestSeqRef = useRef(0)

  useEffect(() => {
    if (!open || bookings.length === 0) {
      setQuotes([])
      return
    }

    const runSeq = requestSeqRef.current + 1
    requestSeqRef.current = runSeq
    const controller = new AbortController()

    const initial = bookings.map(b => ({
      booking: b,
      version: null as QuoteVersion | null,
      loading: true,
      error: null as string | null,
    }))
    setQuotes(initial)

    bookings.forEach((booking) => {
      const fetchVersion = async () => {
        try {
          const token = getAuthToken()
          const headers: Record<string, string> = {}
          if (token) headers.Authorization = `Bearer ${token}`

          const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${booking._id}/versions`,
            { credentials: 'include', headers, signal: controller.signal }
          )
          if (controller.signal.aborted || requestSeqRef.current !== runSeq) return
          const data = await res.json()
          if (controller.signal.aborted || requestSeqRef.current !== runSeq) return

          if (res.ok && data?.success && data.data?.versions?.length > 0) {
            const versions: QuoteVersion[] = data.data.versions
            const current = versions[versions.length - 1]
            setQuotes(prev => prev.map((q) => q.booking._id === booking._id ? { ...q, version: current, loading: false } : q))
          } else {
            setQuotes(prev => prev.map((q) => q.booking._id === booking._id ? { ...q, loading: false, error: 'No quotation data' } : q))
          }
        } catch {
          if (controller.signal.aborted || requestSeqRef.current !== runSeq) return
          setQuotes(prev => prev.map((q) => q.booking._id === booking._id ? { ...q, loading: false, error: 'Failed to load' } : q))
        }
      }
      fetchVersion()
    })

    return () => {
      controller.abort()
      if (!open || bookings.length === 0) {
        setQuotes([])
      }
    }
  }, [open, bookings])

  const allLoaded = quotes.length > 0 && quotes.every(q => !q.loading)
  const loadedQuotes = quotes.filter(q => q.version)

  const lowestPrice = allLoaded && loadedQuotes.length > 1
    ? Math.min(...loadedQuotes.map(q => q.version!.totalAmount))
    : null

  const longestWarranty = allLoaded && loadedQuotes.length > 1
    ? Math.max(...loadedQuotes.map(q => {
        const w = q.version!.warrantyDuration
        return w.unit === 'years' ? w.value * 12 : w.value
      }))
    : null

  const getWarrantyMonths = (v: QuoteVersion) =>
    v.warrantyDuration.unit === 'years' ? v.warrantyDuration.value * 12 : v.warrantyDuration.value

  const getProfName = (b: QuoteBookingSummary) =>
    b.professional?.businessInfo?.companyName || b.professional?.name || 'Professional'

  const rows: { label: string; icon: React.ReactNode; render: (v: QuoteVersion, b: QuoteBookingSummary) => React.ReactNode }[] = [
    {
      label: 'Scope',
      icon: <Package className="h-4 w-4" />,
      render: (v) => <span className="text-sm">{v.scope}</span>,
    },
    {
      label: 'Total Price',
      icon: <CreditCard className="h-4 w-4" />,
      render: (v) => {
        const isBest = lowestPrice !== null && v.totalAmount === lowestPrice
        return (
          <div className="flex items-center gap-1">
            <span className={`text-sm font-semibold ${isBest ? 'text-green-700' : ''}`}>
              {formatCurrency(v.totalAmount, v.currency)}
            </span>
            {isBest && <ArrowDown className="h-3 w-3 text-green-600" />}
          </div>
        )
      },
    },
    {
      label: 'Milestones',
      icon: <Minus className="h-4 w-4" />,
      render: (v) => (
        <span className="text-sm">
          {v.milestones && v.milestones.length > 0
            ? `${v.milestones.length} payment milestone${v.milestones.length > 1 ? 's' : ''}`
            : 'Single payment'}
        </span>
      ),
    },
    {
      label: 'Warranty',
      icon: <Shield className="h-4 w-4" />,
      render: (v) => {
        const months = getWarrantyMonths(v)
        const isBest = longestWarranty !== null && months === longestWarranty
        return (
          <div className="flex items-center gap-1">
            <span className={`text-sm ${isBest ? 'text-green-700 font-semibold' : ''}`}>
              {v.warrantyDuration.value} {v.warrantyDuration.unit}
            </span>
            {isBest && <ArrowUp className="h-3 w-3 text-green-600" />}
          </div>
        )
      },
    },
    {
      label: 'Materials Included',
      icon: <Package className="h-4 w-4" />,
      render: (v) => (
        <span className="text-sm">
          {v.materialsIncluded ? 'Yes' : 'No'}
          {v.materialsIncluded && v.materials && v.materials.length > 0 && (
            <span className="text-xs text-gray-500 block">
              {v.materials.map(m => m.name).join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      label: 'Description',
      icon: null,
      render: (v) => <p className="text-sm text-gray-700 line-clamp-3">{v.description}</p>,
    },
    {
      label: 'Preparation Time',
      icon: <Clock className="h-4 w-4" />,
      render: (v) => <span className="text-sm">{formatDuration(v.preparationDuration)}</span>,
    },
    {
      label: 'Execution Time',
      icon: <Clock className="h-4 w-4" />,
      render: (v) => <span className="text-sm">{formatDuration(v.executionDuration)}</span>,
    },
    {
      label: 'Buffer Time',
      icon: <Clock className="h-4 w-4" />,
      render: (v) => <span className="text-sm">{formatDuration(v.bufferDuration)}</span>,
    },
    {
      label: 'Valid Until',
      icon: <Calendar className="h-4 w-4" />,
      render: (v) => <span className="text-sm">{formatDate(v.validUntil)}</span>,
    },
    {
      label: 'Version',
      icon: null,
      render: (v) => <Badge variant="outline" className="text-xs">v{v.version}</Badge>,
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare Quotations ({bookings.length})</DialogTitle>
        </DialogHeader>

        {quotes.some(q => q.loading) && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading quotation details...</span>
          </div>
        )}

        {allLoaded && loadedQuotes.length === 0 && (
          <p className="text-center text-sm text-gray-500 py-8">
            No quotation data available for the selected items.
          </p>
        )}

        {allLoaded && loadedQuotes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-3 min-w-[140px]">
                    Field
                  </th>
                  {loadedQuotes.map(q => (
                    <th key={q.booking._id} className="text-left text-xs font-medium text-gray-900 py-3 px-3 min-w-[180px]">
                      <div>{getProfName(q.booking)}</div>
                      {q.booking.rfqData?.serviceType && (
                        <span className="text-xs text-gray-500 font-normal">{q.booking.rfqData.serviceType}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-gray-50/50' : ''}>
                    <td className="py-3 px-3 text-sm font-medium text-gray-600 align-top">
                      <div className="flex items-center gap-1.5">
                        {row.icon}
                        {row.label}
                      </div>
                    </td>
                    {loadedQuotes.map(q => (
                      <td key={q.booking._id} className="py-3 px-3 align-top">
                        {row.render(q.version!, q.booking)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {loadedQuotes.some(q => q.version!.milestones && q.version!.milestones.length > 0) && (
              <div className="mt-6 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Payment Milestones Breakdown</h4>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${loadedQuotes.length}, 1fr)` }}>
                  {loadedQuotes.map(q => (
                    <div key={q.booking._id} className="space-y-2">
                      <p className="text-xs font-medium text-gray-500">{getProfName(q.booking)}</p>
                      {q.version!.milestones && q.version!.milestones.length > 0 ? (
                        q.version!.milestones.map((m, mi) => (
                          <div key={mi} className="bg-gray-50 rounded p-2 text-xs">
                            <div className="flex justify-between">
                              <span className="font-medium">{m.title}</span>
                              <span>{formatCurrency(m.amount, q.version!.currency)}</span>
                            </div>
                            {m.description && <p className="text-gray-500 mt-0.5">{m.description}</p>}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400">No milestones</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {quotes.some(q => q.error) && (
          <div className="mt-2 space-y-1">
            {quotes.filter(q => q.error).map(q => (
              <p key={q.booking._id} className="text-xs text-amber-600">
                {getProfName(q.booking)}: {q.error}
              </p>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
