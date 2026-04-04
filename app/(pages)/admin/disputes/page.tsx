'use client'

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, Scale, Shield, XCircle } from "lucide-react"
import { toast } from "sonner"

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
  dispute?: {
    raisedBy: string
    reason: string
    description: string
    raisedAt: string
    resolvedAt?: string
    resolution?: string
    resolvedBy?: string
    adminAdjustedAmount?: number
  }
  createdAt?: string
}

interface DisputeAnalytics {
  totalOpen: number
  totalResolved: number
  totalDisputes: number
}

export default function AdminDisputesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [disputes, setDisputes] = useState<DisputeBooking[]>([])
  const [analytics, setAnalytics] = useState<DisputeAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [selectedDispute, setSelectedDispute] = useState<DisputeBooking | null>(null)
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [resolveAction, setResolveAction] = useState<'accept_professional' | 'reject_extra_costs' | 'adjust'>('accept_professional')
  const [resolveAdjustedAmount, setResolveAdjustedAmount] = useState('')
  const [resolveResolution, setResolveResolution] = useState('')
  const [resolving, setResolving] = useState(false)

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
        setDisputes(json.data.disputes)
        setTotalPages(json.data.pagination.pages)
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

  const handleResolve = async () => {
    if (!selectedDispute || !resolveResolution.trim()) return
    setResolving(true)
    try {
      const body: any = { action: resolveAction, resolution: resolveResolution }
      if (resolveAction === 'adjust') {
        body.adjustedAmount = parseFloat(resolveAdjustedAmount)
      }
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/disputes/${selectedDispute._id}/resolve`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const json = await res.json()
      if (json.success) {
        toast.success('Dispute resolved successfully')
        setShowResolveDialog(false)
        setSelectedDispute(null)
        setResolveResolution('')
        setResolveAdjustedAmount('')
        fetchDisputes()
        fetchAnalytics()
      } else {
        toast.error(json.error?.message || 'Failed to resolve dispute')
      }
    } catch {
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
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1) }}>
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
            {disputes.map((d) => (
              <Card key={d._id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{d.bookingNumber}</span>
                        <Badge variant={d.dispute?.resolvedAt ? "default" : "destructive"} className="text-xs">
                          {d.dispute?.resolvedAt ? 'Resolved' : 'Open'}
                        </Badge>
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
                    </div>
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      <p className="text-xs text-gray-400">
                        {d.dispute?.raisedAt ? new Date(d.dispute.raisedAt).toLocaleDateString() : ''}
                      </p>
                      {!d.dispute?.resolvedAt && (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setSelectedDispute(d)
                            setShowResolveDialog(true)
                          }}
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
            ))}

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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Resolve Dispute — {selectedDispute?.bookingNumber}</DialogTitle>
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
                    <p className="text-xs text-red-600">{selectedDispute.dispute.description}</p>
                  )}
                </div>

                {selectedDispute.extraCosts && selectedDispute.extraCosts.length > 0 && (
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

                <div className="space-y-2">
                  <Label>Resolution Action</Label>
                  <Select value={resolveAction} onValueChange={(v) => setResolveAction(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accept_professional">
                        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Accept professional&apos;s extra costs</span>
                      </SelectItem>
                      <SelectItem value="reject_extra_costs">
                        <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Reject extra costs (customer wins)</span>
                      </SelectItem>
                      <SelectItem value="adjust">
                        <span className="flex items-center gap-1"><Scale className="h-3 w-3 text-amber-500" /> Adjust amount</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {resolveAction === 'adjust' && (
                  <div className="space-y-2">
                    <Label>Adjusted Extra Cost Amount</Label>
                    <Input
                      type="number"
                      value={resolveAdjustedAmount}
                      onChange={(e) => setResolveAdjustedAmount(e.target.value)}
                      placeholder="Enter adjusted amount"
                    />
                  </div>
                )}

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
                  <Button variant="outline" onClick={() => setShowResolveDialog(false)}>Cancel</Button>
                  <Button
                    onClick={handleResolve}
                    disabled={resolving || !resolveResolution.trim() || (resolveAction === 'adjust' && !resolveAdjustedAmount)}
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
