'use client'

import { getErrorMessage, messageFromApiBody } from '@/lib/apiErrors'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, RefreshCw, Search, ShieldCheck, CalendarClock, ArrowRightLeft, Undo2, FileText, FileMinus } from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

type PaymentStatus = "pending" | "authorized" | "completed" | "failed" | "refunded" | "partially_refunded" | "expired"
type OversightStatus = PaymentStatus | "transfer_pending" | "transfer_failed"

interface PopulatedUser {
  _id: string
  name?: string
  email?: string
  username?: string
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
  netAmount?: number
  vatAmount?: number
  vatRate?: number
  vatLabel?: string
  reverseCharge?: boolean
  platformCommission?: number
  professionalPayout?: number
  extraCostAmount?: number
  extraCostNetAmount?: number
  extraCostVatAmount?: number
  extraCostPlatformFee?: number
  extraCostProfessionalPayout?: number
  extraCostStatus?: "pending" | "succeeded" | "failed" | "refunded"
  extraCostTransferStatus?: "pending" | "succeeded" | "failed"
  extraCostTransferFailureReason?: string
  stripePaymentIntentId?: string
  stripeTransferId?: string
  stripeChargeId?: string
  transferStatus?: "pending" | "succeeded" | "failed"
  transferFailureReason?: string
  transferAttemptedAt?: string
  metadata?: { transferFailed?: boolean; transferError?: string }
  createdAt?: string
  authorizedAt?: string
  capturedAt?: string
  transferredAt?: string
  invoiceNumber?: string
  invoiceUrl?: string
  invoiceUblUrl?: string
  supplierInvoiceNumber?: string
  supplierInvoiceUrl?: string
  supplierInvoiceUblUrl?: string
  creditNoteNumber?: string
  creditNoteUrl?: string
  creditNoteUblUrl?: string
  supplierCreditNoteNumber?: string
  supplierCreditNoteUrl?: string
  supplierCreditNoteUblUrl?: string
  peppolDispatchStatus?: string
  peppolDispatchReason?: string
  supplierPeppolDispatchStatus?: string
  supplierPeppolDispatchReason?: string
  refunds?: Array<{
    amount: number
    reason?: string
    refundedAt: string
    source: string
  }>
}

const STATUS_OPTIONS: { label: string; value: "all" | OversightStatus }[] = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Authorized", value: "authorized" },
  { label: "Completed", value: "completed" },
  { label: "Refunded", value: "refunded" },
  { label: "Partially Refunded", value: "partially_refunded" },
  { label: "Failed", value: "failed" },
  { label: "Transfer pending", value: "transfer_pending" },
  { label: "Transfer failed", value: "transfer_failed" },
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
  stats: Array<{ status: OversightStatus; currency?: string; count: number; totalVolume?: number }>
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
  const [statusFilter, setStatusFilter] = useState<"all" | OversightStatus>("all")
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
  const [manualDialogPayment, setManualDialogPayment] = useState<PaymentRecord | null>(null)
  const [manualSide, setManualSide] = useState<"customer" | "supplier">("customer")
  const [manualDocumentType, setManualDocumentType] = useState<"invoice" | "credit_note">("invoice")
  const [manualRelatedInvoiceNumber, setManualRelatedInvoiceNumber] = useState("")
  const [manualServiceDescription, setManualServiceDescription] = useState("")
  const [manualLinesJson, setManualLinesJson] = useState("[]")
  const [manualNetAmount, setManualNetAmount] = useState("")
  const [manualVatAmount, setManualVatAmount] = useState("")
  const [manualTotalWithVat, setManualTotalWithVat] = useState("")
  const [manualVatRate, setManualVatRate] = useState("")
  const [manualReverseCharge, setManualReverseCharge] = useState<"yes" | "no">("no")
  const [isCreatingManualArtifact, setIsCreatingManualArtifact] = useState(false)

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
        throw new Error(messageFromApiBody(payload, "Failed to load payments"))
      }

      const data: ApiResponse = payload.data
      setPayments(data.payments)
      setStats(data.stats || [])
      setTotalPages(data.pagination.totalPages || 1)
    } catch (err) {
      console.error("[ADMIN][PAYMENTS] fetch failed", err)
      setError(getErrorMessage(err, "Failed to load payments"))
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
    const base: Record<string, Record<string, { count: number; volume: number }>> = {}
    stats.forEach(item => {
      const currency = item.currency || "UNKNOWN"
      base[item.status] = base[item.status] || {}
      base[item.status][currency] = {
        count: (base[item.status][currency]?.count || 0) + item.count,
        volume: (base[item.status][currency]?.volume || 0) + (item.totalVolume || 0)
      }
    })
    return base
  }, [stats])

  const summaryCount = (status: OversightStatus) =>
    Object.values(summary[status] || {}).reduce((total, item) => total + item.count, 0)

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
        throw new Error(messageFromApiBody(payload, "Failed to capture payment"))
      }
      const transferSucceeded = payload.data?.transferSucceeded === true
      if (!transferSucceeded) {
        toast.error(messageFromApiBody(payload, "Payment captured, but the professional transfer failed. Retry is available."))
        fetchPayments()
        return
      }
      toast.success(messageFromApiBody(payload, "Payment captured and transferred successfully"))
      setCaptureDialogPayment(null)
      fetchPayments()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to capture payment"))
    } finally {
      setIsCapturing(false)
    }
  }

  // ─── Invoice / Credit Note ──────────────────────────────────────────────

  const [invoiceActionPaymentIds, setInvoiceActionPaymentIds] = useState<Set<string>>(() => new Set())
  const invoiceActionPaymentIdsRef = useRef<Set<string>>(new Set())

  const startInvoiceAction = (paymentId: string) => {
    invoiceActionPaymentIdsRef.current.add(paymentId)
    setInvoiceActionPaymentIds((current) => new Set(current).add(paymentId))
  }

  const finishInvoiceAction = (paymentId: string) => {
    invoiceActionPaymentIdsRef.current.delete(paymentId)
    setInvoiceActionPaymentIds((current) => {
      const next = new Set(current)
      next.delete(paymentId)
      return next
    })
  }

  const runInvoiceArtifactAction = async (
    payment: PaymentRecord,
    action: "invoice" | "credit-note",
    successLabel: string,
    failureLabel: string
  ) => {
    if (invoiceActionPaymentIdsRef.current.has(payment._id)) return
    startInvoiceAction(payment._id)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/payments/${payment._id}/${action}`,
        { method: "POST", credentials: "include" }
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(messageFromApiBody(payload, failureLabel))
      }
      const artifactNumber =
        action === "invoice" ? payload.data?.invoiceNumber : payload.data?.creditNoteNumber
      toast.success(`${successLabel} ${artifactNumber || ""}`.trim())
      await fetchPayments()
    } catch (err) {
      toast.error(getErrorMessage(err, failureLabel))
    } finally {
      finishInvoiceAction(payment._id)
    }
  }

  const handleGenerateInvoice = (payment: PaymentRecord) =>
    runInvoiceArtifactAction(payment, "invoice", "Invoice", "Failed to generate invoice")

  const handleGenerateCreditNote = (payment: PaymentRecord) =>
    runInvoiceArtifactAction(payment, "credit-note", "Credit note", "Failed to generate credit note")

  const openManualArtifactDialog = (payment: PaymentRecord) => {
    const net = payment.netAmount ?? payment.amount ?? 0
    const vat = payment.vatAmount ?? 0
    const total = payment.totalWithVat ?? net + vat
    const rate = payment.vatRate ?? 0
    setManualDialogPayment(payment)
    setManualSide("customer")
    setManualDocumentType("invoice")
    setManualRelatedInvoiceNumber(payment.invoiceNumber || "")
    setManualServiceDescription("")
    setManualLinesJson(JSON.stringify([{ description: "Service correction", amount: net, vatRate: rate }], null, 2))
    setManualNetAmount(net.toFixed(2))
    setManualVatAmount(vat.toFixed(2))
    setManualTotalWithVat(total.toFixed(2))
    setManualVatRate(rate.toString())
    setManualReverseCharge(payment.reverseCharge ? "yes" : "no")
  }

  const handleCreateManualArtifact = async () => {
    if (!manualDialogPayment) return
    setIsCreatingManualArtifact(true)
    try {
      let lines: unknown
      try {
        lines = JSON.parse(manualLinesJson)
      } catch {
        throw new Error("Invoice lines must be valid JSON.")
      }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/payments/${manualDialogPayment._id}/manual-artifact`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            side: manualSide,
            documentType: manualDocumentType,
            relatedInvoiceNumber: manualRelatedInvoiceNumber || undefined,
            serviceDescription: manualServiceDescription || undefined,
            lines,
            payment: {
              netAmount: manualNetAmount,
              vatAmount: manualVatAmount,
              totalWithVat: manualTotalWithVat,
              vatRate: manualVatRate,
              reverseCharge: manualReverseCharge === "yes",
              currency: manualDialogPayment.currency,
            },
          }),
        },
      )
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(messageFromApiBody(payload, "Failed to create manual artifact"))
      toast.success(`${manualDocumentType === "invoice" ? "Invoice" : "Credit note"} ${payload.data?.invoiceNumber || "created"}`)
      setManualDialogPayment(null)
      await fetchPayments()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create manual artifact"))
    } finally {
      setIsCreatingManualArtifact(false)
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
        throw new Error(messageFromApiBody(payload, "Failed to process refund"))
      }
      toast.success(messageFromApiBody(payload, "Refund processed successfully"))
      setRefundDialogPayment(null)
      fetchPayments()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to process refund"))
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
            <CardDescription>Only Fixtract admins can access payment oversight tools.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const hasInvoiceArtifact = (p: PaymentRecord) =>
    Boolean(p.invoiceUrl || p.invoiceNumber || p.invoiceUblUrl)
  const hasCreditNoteArtifact = (p: PaymentRecord) =>
    Boolean(p.creditNoteUrl || p.creditNoteNumber || p.creditNoteUblUrl || p.supplierCreditNoteUrl || p.supplierCreditNoteNumber || p.supplierCreditNoteUblUrl)
  const hasArtifactLinks = (p: PaymentRecord) =>
    Boolean(p.invoiceUrl || p.invoiceUblUrl || p.creditNoteUrl || p.creditNoteUblUrl || p.supplierCreditNoteUrl || p.supplierCreditNoteUblUrl)

  const getTransferStatus = (p: PaymentRecord) =>
    p.transferStatus ||
    (p.stripeTransferId ? "succeeded" : p.metadata?.transferFailed ? "failed" : "pending")
  const canCapture = (p: PaymentRecord) =>
    p.status === "authorized" || (p.status === "completed" && getTransferStatus(p) === "failed")
  const canRefund = (p: PaymentRecord) => p.status === "authorized" || p.status === "completed"
  const canGenerateInvoice = (p: PaymentRecord) =>
    !hasInvoiceArtifact(p) && (p.status === "authorized" || p.status === "completed")
  const hasRefundForCreditNote = (p: PaymentRecord) =>
    p.status === "refunded" ||
    p.status === "partially_refunded" ||
    (p.refunds?.length ?? 0) > 0
  const canGenerateCreditNote = (p: PaymentRecord) =>
    hasInvoiceArtifact(p) &&
    !hasCreditNoteArtifact(p) &&
    hasRefundForCreditNote(p)

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-10 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Payment Oversight</h1>
              <p className="text-sm text-gray-600">
                Monitor captured payments, professional transfers, refunds, and invoice corrections.
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

          <div className="grid md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completed payouts</CardDescription>
                <CardTitle className="text-2xl">
                  {Object.entries(summary.completed || {}).map(([currency, value]) => `${currency} ${value.volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(" · ") || "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-500">
                {summaryCount("completed")} bookings fully paid out
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Transfer recovery</CardDescription>
                <CardTitle className="text-2xl text-rose-700">
                  {Object.entries(summary.transfer_failed || {}).map(([currency, value]) => `${currency} ${value.volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(" · ") || "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-500">
                {summaryCount("transfer_failed")} failed payouts need review
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Authorized funds</CardDescription>
                <CardTitle className="text-2xl">
                  {Object.entries(summary.authorized || {}).map(([currency, value]) => `${currency} ${value.volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(" · ") || "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-500">
                {summaryCount("authorized")} bookings ready for completion
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Refunds processed</CardDescription>
                <CardTitle className="text-2xl">
                  {Object.entries(summary.refunded || {}).map(([currency, value]) => `${currency} ${value.volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(" · ") || "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-500">
                {summaryCount("refunded")} refund cases
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
                  <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val as "all" | OversightStatus); setPage(1) }}>
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
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex gap-4 py-3 border-b border-gray-50 last:border-0">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
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
                          {payment.professional?.username && <div className="text-xs text-gray-500">@{payment.professional.username}</div>}
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
                          {(payment.extraCostAmount ?? 0) > 0 && (
                            <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-amber-700">
                              Added costs: {payment.currency} {payment.extraCostAmount!.toFixed(2)}
                              <br />
                              Extra payout: {payment.extraCostProfessionalPayout?.toFixed(2) || "0.00"}
                              <br />
                              Extra status: {payment.extraCostStatus || "pending"}
                              <br />
                              Extra transfer: {payment.extraCostTransferStatus || "pending"}
                              {payment.extraCostTransferFailureReason ? ` — ${payment.extraCostTransferFailureReason}` : ""}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <PaymentStatusBadge status={payment.status} />
                          {payment.status === "authorized" && (
                            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" /> Customer payment captured; payout pending
                            </p>
                          )}
                          {payment.status === "completed" && getTransferStatus(payment) === "succeeded" && (
                            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" /> Captured & transferred
                            </p>
                          )}
                          {payment.status === "completed" && getTransferStatus(payment) === "failed" && (
                            <p className="text-xs text-rose-600 mt-2 flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" /> Captured; transfer failed — retry available
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
                                {payment.status === "completed" ? "Retry Payout Transfer" : "Transfer Payout"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                              onClick={() => openManualArtifactDialog(payment)}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Manual Invoice / Credit
                            </Button>
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
                            {canGenerateInvoice(payment) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                                disabled={invoiceActionPaymentIds.has(payment._id)}
                                onClick={() => handleGenerateInvoice(payment)}
                              >
                                {invoiceActionPaymentIds.has(payment._id)
                                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  : <FileText className="h-3 w-3 mr-1" />}
                                Generate Invoice
                              </Button>
                            )}
                            {payment.invoiceUrl && (
                              <a
                                href={payment.invoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                <FileText className="h-3 w-3" />
                                {payment.invoiceNumber || "Invoice"} (PDF)
                              </a>
                            )}
                            {payment.invoiceUblUrl && (
                              <a
                                href={payment.invoiceUblUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                <FileText className="h-3 w-3" />
                                UBL (Peppol{payment.peppolDispatchStatus ? `: ${payment.peppolDispatchStatus}` : ""})
                              </a>
                            )}
                            {payment.peppolDispatchReason && (
                              <span className="text-xs text-amber-700">
                                Peppol note: {payment.peppolDispatchReason}
                              </span>
                            )}
                            {payment.supplierInvoiceUrl && (
                              <a
                                href={payment.supplierInvoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                <FileText className="h-3 w-3" />
                                {payment.supplierInvoiceNumber || "Self-bill"} (PDF)
                              </a>
                            )}
                            {payment.supplierInvoiceUblUrl && (
                              <a
                                href={payment.supplierInvoiceUblUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                <FileText className="h-3 w-3" />
                                Self-bill UBL (Peppol{payment.supplierPeppolDispatchStatus ? `: ${payment.supplierPeppolDispatchStatus}` : ""})
                              </a>
                            )}
                            {payment.supplierInvoiceUrl && payment.supplierPeppolDispatchStatus && (
                              <span className="text-xs text-gray-500">
                                Supplier Peppol: {payment.supplierPeppolDispatchStatus}
                                {payment.supplierPeppolDispatchReason ? ` — ${payment.supplierPeppolDispatchReason}` : ""}
                              </span>
                            )}
                            {canGenerateCreditNote(payment) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                                disabled={invoiceActionPaymentIds.has(payment._id)}
                                onClick={() => handleGenerateCreditNote(payment)}
                              >
                                {invoiceActionPaymentIds.has(payment._id)
                                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  : <FileMinus className="h-3 w-3 mr-1" />}
                                Credit Note
                              </Button>
                            )}
                            {payment.creditNoteUrl && (
                              <a
                                href={payment.creditNoteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-orange-600 hover:underline flex items-center gap-1"
                              >
                                <FileMinus className="h-3 w-3" />
                                {payment.creditNoteNumber || "Credit note"} (PDF)
                              </a>
                            )}
                            {payment.creditNoteUblUrl && (
                              <a
                                href={payment.creditNoteUblUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-orange-600 hover:underline flex items-center gap-1"
                              >
                                <FileMinus className="h-3 w-3" />
                                {payment.creditNoteNumber || "Credit note"} (UBL)
                              </a>
                            )}
                            {payment.supplierCreditNoteUrl && (
                              <a
                                href={payment.supplierCreditNoteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-orange-600 hover:underline flex items-center gap-1"
                              >
                                <FileMinus className="h-3 w-3" />
                                {payment.supplierCreditNoteNumber || "Supplier credit note"} (PDF)
                              </a>
                            )}
                            {payment.supplierCreditNoteUblUrl && (
                              <a
                                href={payment.supplierCreditNoteUblUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-orange-600 hover:underline flex items-center gap-1"
                              >
                                <FileMinus className="h-3 w-3" />
                                {payment.supplierCreditNoteNumber || "Supplier credit note"} (UBL)
                              </a>
                            )}
                            {!canCapture(payment) && !canRefund(payment) && !canGenerateInvoice(payment) && !canGenerateCreditNote(payment) && !hasArtifactLinks(payment) && (
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
            <DialogTitle>{captureDialogPayment?.status === "completed" ? "Retry Professional Payout" : "Transfer Professional Payout"}</DialogTitle>
            <DialogDescription>
              {captureDialogPayment?.status === "completed"
                ? "The customer payment is already captured. This retries only the failed professional transfer."
                : "The customer card payment is captured automatically. This transfers the approved payout to the professional and cannot be undone."}
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
              {isCapturing
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                : captureDialogPayment?.status === "completed" ? "Retry Transfer" : "Transfer Payout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Manual Invoice / Credit Note Dialog ─────────────────────────── */}
      <Dialog open={!!manualDialogPayment} onOpenChange={(open) => { if (!open) setManualDialogPayment(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create manual invoice artifact</DialogTitle>
            <DialogDescription>
              Use this for a corrected customer invoice or supplier self-bill. Amounts and VAT are validated against the lines; comma decimals are accepted.
            </DialogDescription>
          </DialogHeader>
          {manualDialogPayment && (
            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Document side</Label>
                  <Select value={manualSide} onValueChange={(value) => setManualSide(value as "customer" | "supplier")}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer invoice (FIX)</SelectItem>
                      <SelectItem value="supplier">Supplier self-bill (SUP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Document type</Label>
                  <Select value={manualDocumentType} onValueChange={(value) => setManualDocumentType(value as "invoice" | "credit_note")}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="credit_note">Credit note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Related invoice number (required for credit notes unless already stored)</Label>
                <Input className="mt-1" value={manualRelatedInvoiceNumber} onChange={(event) => setManualRelatedInvoiceNumber(event.target.value)} placeholder="FIX-2026-000001 or SUP-2026-000001" />
              </div>
              <div>
                <Label>Service description</Label>
                <Textarea className="mt-1" value={manualServiceDescription} onChange={(event) => setManualServiceDescription(event.target.value)} placeholder="Optional correction explanation or scope" />
              </div>
              <div>
                <Label>Invoice lines (JSON)</Label>
                <Textarea
                  className="mt-1 min-h-[150px] font-mono text-xs"
                  value={manualLinesJson}
                  onChange={(event) => setManualLinesJson(event.target.value)}
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-gray-500">Each line needs description, amount, and vatRate. Optional: quantity, unitPrice, unit, vatLabel.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div><Label>Net</Label><Input className="mt-1" value={manualNetAmount} onChange={(event) => setManualNetAmount(event.target.value)} /></div>
                <div><Label>VAT</Label><Input className="mt-1" value={manualVatAmount} onChange={(event) => setManualVatAmount(event.target.value)} /></div>
                <div><Label>Total</Label><Input className="mt-1" value={manualTotalWithVat} onChange={(event) => setManualTotalWithVat(event.target.value)} /></div>
                <div><Label>VAT rate</Label><Input className="mt-1" value={manualVatRate} onChange={(event) => setManualVatRate(event.target.value)} placeholder="6,5" /></div>
                <div>
                  <Label>Reverse charge</Label>
                  <Select value={manualReverseCharge} onValueChange={(value) => setManualReverseCharge(value as "yes" | "no")}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogPayment(null)} disabled={isCreatingManualArtifact}>Cancel</Button>
            <Button onClick={handleCreateManualArtifact} disabled={isCreatingManualArtifact}>
              {isCreatingManualArtifact ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : "Create artifact"}
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
