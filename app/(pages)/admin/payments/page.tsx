'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Loader2, RefreshCw, Search, ShieldCheck, CalendarClock, ArrowRightLeft, Undo2 } from "lucide-react"
import { toast } from "sonner"

type PaymentStatus = "pending" | "authorized" | "completed" | "failed" | "refunded" | "partially_refunded" | "expired"

interface PopulatedUser {
  _id: string
  name?: string
  email?: string
  businessInfo?: {
    companyName?: string
  }
}

interface PopulatedBooking {
  _id: string
  bookingNumber?: string
  bookingType?: string
  status?: string
  createdAt?: string
}

interface PaymentRecord {
  _id: string
  bookingNumber?: string
  booking?: PopulatedBooking
  customer?: PopulatedUser
  professional?: PopulatedUser
  status: PaymentStatus
  method?: string
  currency: string
  amount: number
  totalWithVat?: number
  platformCommission?: number
  professionalPayout?: number
  stripePaymentIntentId?: string
  stripeTransferId?: string
  stripeChargeId?: string
  createdAt?: string
  authorizedAt?: string
  capturedAt?: string
  transferredAt?: string
  refunds?: Array<{
    amount: number
    reason?: string
    refundedAt: string
    source: string
  }>
}

const STATUS_OPTIONS: { label: string; value: "all" | PaymentStatus }[] = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Authorized", value: "authorized" },
  { label: "Completed", value: "completed" },
  { label: "Refunded", value: "refunded" },
  { label: "Partially Refunded", value: "partially_refunded" },
  { label: "Failed", value: "failed" },
  { label: "Expired", value: "expired" }
]

const STATUS_STYLES: Record<PaymentStatus, string> = {
  pending: "bg-slate-50 text-slate-700 border border-slate-200",
  authorized: "bg-amber-50 text-amber-700 border border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border border-rose-200",
  refunded: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  partially_refunded: "bg-blue-50 text-blue-700 border border-blue-200",
  expired: "bg-gray-100 text-gray-700 border border-gray-200"
}

interface ApiResponse {
  payments: PaymentRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  stats: Array<{ status: PaymentStatus; count: number; totalVolume?: number }>
}

const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge variant="outline" className={`text-xs capitalize ${STATUS_STYLES[status] || "bg-slate-100"}`}>
    {status.replace(/_/g, " ")}
  </Badge>
)

export default function AdminPaymentsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [stats, setStats] = useState<ApiResponse["stats"]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentStatus>("all")
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Action states
  const [captureDialogPayment, setCaptureDialogPayment] = useState<PaymentRecord | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [refundDialogPayment, setRefundDialogPayment] = useState<PaymentRecord | null>(null)
  const [isRefunding, setIsRefunding] = useState(false)
  const [refundReason, setRefundReason] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [refundType, setRefundType] = useState<"full" | "partial">("full")

  const fetchPayments = useCallback(async () => {
    if (!isAuthenticated || user?.role !== "admin") return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (searchQuery.trim()) params.set("search", searchQuery.trim())

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/payments?${params.toString()}`, {
        credentials: "include"
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || "Failed to load payments")
      }

      const data: ApiResponse = payload.data
      setPayments(data.payments)
      setStats(data.stats || [])
      setTotalPages(data.pagination.totalPages || 1)
    } catch (err) {
      console.error("[ADMIN][PAYMENTS] fetch failed", err)
      setError(err instanceof Error ? err.message : "Failed to load payments")
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user?.role, page, statusFilter, searchQuery])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login?redirect=/admin/payments")
    }
  }, [isAuthenticated, loading, router])

  useEffect(() => {
    const timeout = setTimeout(() => setSearchQuery(searchInput), 400)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  const isAdmin = user?.role === "admin"

  const summary = useMemo(() => {
    const base: Record<string, { count: number; volume: number }> = {}
    stats.forEach(item => {
      base[item.status] = {
        count: item.count,
        volume: item.totalVolume || 0
      }
    })
    return base
  }, [stats])

  const handleManualRefresh = () => {
    fetchPayments()
  }

  // ─── Capture (Release Payment) ──────────────────────────────────────────

  const handleCapture = async () => {
    if (!captureDialogPayment) return
    setIsCapturing(true)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/payments/${captureDialogPayment._id}/capture`,
        { method: "POST", credentials: "include" }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || "Failed to capture payment")
      }
      toast.success("Payment captured and transferred successfully")
      setCaptureDialogPayment(null)
      fetchPayments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to capture payment")
    } finally {
      setIsCapturing(false)
    }
  }

  // ─── Refund ─────────────────────────────────────────────────────────────

  const openRefundDialog = (payment: PaymentRecord) => {
    setRefundDialogPayment(payment)
    setRefundReason("")
    setRefundAmount("")
    setRefundType("full")
  }

  const handleRefund = async () => {
    if (!refundDialogPayment?.booking?._id) return
    setIsRefunding(true)
    try {
      const body: { bookingId: string; reason: string; amount?: number } = {
        bookingId: refundDialogPayment.booking._id,
        reason: refundReason || "Admin initiated refund",
      }
      if (refundType === "partial" && refundAmount) {
        body.amount = parseFloat(refundAmount)
        if (isNaN(body.amount) || body.amount <= 0) {
          throw new Error("Invalid refund amount")
        }
        const maxRefundable = refundDialogPayment.totalWithVat ?? refundDialogPayment.amount
        if (body.amount > maxRefundable) {
          throw new Error(`Refund amount cannot exceed the original charge of ${maxRefundable.toFixed(2)}`)
        }
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stripe/payment/refund`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || "Failed to process refund")
      }
      toast.success(payload.msg || "Refund processed successfully")
      setRefundDialogPayment(null)
      fetchPayments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process refund")
    } finally {
      setIsRefunding(false)
    }
  }

  if (!loading && isAuthenticated && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Restricted</CardTitle>
            <CardDescription>Only Fixera admins can access payment oversight tools.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const canCapture = (p: PaymentRecord) => p.status === "authorized"
  const canRefund = (p: PaymentRecord) => p.status === "authorized" || p.status === "completed"

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-10 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Payment Oversight</h1>
              <p className="text-sm text-gray-600">
                Monitor escrow status, releases, and refunds. Use this view to resolve disputes or audit payouts.
              </p>
            </div>
            <Button variant="outline" onClick={handleManualRefresh} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Refreshing
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                </>
              )}
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completed payouts</CardDescription>
                <CardTitle className="text-2xl">
                  EUR {(summary.completed?.volume || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-500">
                {summary.completed?.count || 0} bookings fully paid out
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Authorized funds</CardDescription>
                <CardTitle className="text-2xl">
                  EUR {(summary.authorized?.volume || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-500">
                {summary.authorized?.count || 0} bookings ready for completion
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Refunds processed</CardDescription>
                <CardTitle className="text-2xl">
                  EUR {(summary.refunded?.volume || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-500">
                {summary.refunded?.count || 0} refund cases
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Payments</CardTitle>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val as "all" | PaymentStatus); setPage(1) }}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative w-full md:w-72">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Search booking, intent, or transfer"
                    className="pl-9"
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading payments...
              </div>
            ) : payments.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                No payments found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-gray-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Booking</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-left">Professional</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Timeline</th>
                      <th className="px-4 py-3 text-left">Stripe IDs</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment) => (
                      <tr key={payment._id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900">
                            {payment.bookingNumber || payment.booking?.bookingNumber || "\u2014"}
                          </div>
                          <div className="text-xs text-gray-500 capitalize">
                            {payment.booking?.bookingType || "n/a"} &bull; {payment.booking?.status || "unknown"}
                          </div>
                          {payment.booking?._id && (
                            <Button
                              variant="link"
                              size="sm"
                              className="px-0 text-xs text-indigo-600"
                              onClick={() => router.push(`/bookings/${payment.booking!._id}`)}
                            >
                              View booking
                            </Button>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <div className="font-medium text-gray-900">{payment.customer?.name || "\u2014"}</div>
                          <div className="text-xs text-gray-500">{payment.customer?.email}</div>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <div className="font-medium text-gray-900">
                            {payment.professional?.businessInfo?.companyName || payment.professional?.name || "\u2014"}
                          </div>
                          <div className="text-xs text-gray-500">{payment.professional?.email}</div>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <div className="font-semibold text-gray-900">
                            {payment.currency}{" "}
                            {(payment.totalWithVat ?? payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                          <p className="text-xs text-gray-500">
                            Platform fee: {payment.platformCommission?.toFixed(2) || "0.00"}
                            <br />
                            Payout: {payment.professionalPayout?.toFixed(2) || "0.00"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <PaymentStatusBadge status={payment.status} />
                          {payment.status === "authorized" && (
                            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" /> Held in escrow
                            </p>
                          )}
                          {payment.status === "completed" && (
                            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" /> Captured & transferred
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-600">
                          {payment.authorizedAt && (
                            <div className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3 text-amber-500" />
                              Authorized {new Date(payment.authorizedAt).toLocaleDateString()}
                            </div>
                          )}
                          {payment.capturedAt && (
                            <div>Captured {new Date(payment.capturedAt).toLocaleDateString()}</div>
                          )}
                          {payment.transferredAt && (
                            <div>Transferred {new Date(payment.transferredAt).toLocaleDateString()}</div>
                          )}
                          {payment.refunds?.length ? (
                            <div className="text-rose-600 mt-1">
                              {payment.refunds.length} refund{payment.refunds.length > 1 ? "s" : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-600">
                          <div>PI: {payment.stripePaymentIntentId || "\u2014"}</div>
                          <div>Charge: {payment.stripeChargeId || "\u2014"}</div>
                          <div>Transfer: {payment.stripeTransferId || "\u2014"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            {canCapture(payment) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setCaptureDialogPayment(payment)}
                              >
                                <ArrowRightLeft className="h-3 w-3 mr-1" />
                                Release Payment
                              </Button>
                            )}
                            {canRefund(payment) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
                                onClick={() => openRefundDialog(payment)}
                              >
                                <Undo2 className="h-3 w-3 mr-1" />
                                Refund
                              </Button>
                            )}
                            {!canCapture(payment) && !canRefund(payment) && (
                              <span className="text-xs text-gray-400">No actions</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-gray-600">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1 || isLoading}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Capture Confirmation Dialog ─────────────────────────────────── */}
      <Dialog open={!!captureDialogPayment} onOpenChange={(open) => { if (!open) setCaptureDialogPayment(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Payment</DialogTitle>
            <DialogDescription>
              This will capture the authorized funds and transfer the payout to the professional.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {captureDialogPayment && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Booking</span>
                <span className="font-medium">{captureDialogPayment.bookingNumber || captureDialogPayment.booking?.bookingNumber || "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-medium">
                  {captureDialogPayment.currency} {(captureDialogPayment.totalWithVat ?? captureDialogPayment.amount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Professional payout</span>
                <span className="font-medium">{captureDialogPayment.professionalPayout?.toFixed(2) || "0.00"}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaptureDialogPayment(null)} disabled={isCapturing}>
              Cancel
            </Button>
            <Button onClick={handleCapture} disabled={isCapturing} className="bg-emerald-600 hover:bg-emerald-700">
              {isCapturing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Capturing...</> : "Confirm Release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Refund Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!refundDialogPayment} onOpenChange={(open) => { if (!open) setRefundDialogPayment(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Payment</DialogTitle>
            <DialogDescription>
              {refundDialogPayment?.status === "authorized"
                ? "This will cancel the authorized payment intent. The hold on the customer\u2019s card will be released."
                : "This will create a Stripe refund and reverse the transfer to the professional."
              }
            </DialogDescription>
          </DialogHeader>
          {refundDialogPayment && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Booking</span>
                  <span className="font-medium">{refundDialogPayment.bookingNumber || refundDialogPayment.booking?.bookingNumber || "\u2014"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total charged</span>
                  <span className="font-medium">
                    {refundDialogPayment.currency} {(refundDialogPayment.totalWithVat ?? refundDialogPayment.amount).toFixed(2)}
                  </span>
                </div>
              </div>

              {refundDialogPayment.status === "completed" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Refund type</Label>
                    <Select value={refundType} onValueChange={(val) => setRefundType(val as "full" | "partial")}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full refund</SelectItem>
                        <SelectItem value="partial">Partial refund</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {refundType === "partial" && (
                    <div>
                      <Label className="text-sm font-medium">Refund amount ({refundDialogPayment.currency})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={refundDialogPayment.totalWithVat ?? refundDialogPayment.amount}
                        placeholder="0.00"
                        className="mt-1"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label className="text-sm font-medium">Reason</Label>
                <Input
                  placeholder="Reason for refund"
                  className="mt-1"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogPayment(null)} disabled={isRefunding}>
              Cancel
            </Button>
            <Button
              onClick={handleRefund}
              disabled={isRefunding || (refundType === "partial" && !refundAmount)}
              variant="destructive"
            >
              {isRefunding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : "Confirm Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
