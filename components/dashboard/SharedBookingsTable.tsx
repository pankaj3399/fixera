'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import StartChatButton from "@/components/chat/StartChatButton"
import ProfessionalTableTags from "./ProfessionalTableTags"
import { useSharedTableText } from "./sharedTableText"
import { getBookingStatusMeta } from "@/lib/dashboardBookingHelpers"
import {
  bookingHref,
  DASH,
  formatOverviewMoney,
  formatUnknownDate,
  isPayNowEligible,
  isWarrantyActionEligible,
  joinServiceAddress,
  professionalHref,
  projectHref,
  resolveSnapshotTitles,
  type OverviewMoney,
} from "@/lib/dashboardOverview"

export interface SharedBookingRow {
  _id: string
  bookingNumber?: string | null
  status: string
  createdAt?: string | null
  scheduledStartDate?: string | null
  scheduledExecutionEndDate?: string | null
  actualStartDate?: string | null
  actualEndDate?: string | null
  priceModel?: string | null
  location?: { address?: string; city?: string; postalCode?: string; country?: string } | null
  project?: { _id: string; title?: string } | null
  bookingSnapshot?: {
    project?: { id?: string; title?: string }
    selectedSubproject?: Record<string, unknown> | null
  } | null
  customer?: { _id: string; name?: string } | null
  professional?: {
    _id: string
    name?: string
    username?: string
    professionalLevel?: string | null
    adminTags?: string[]
    businessInfo?: { companyName?: string }
  } | null
  payment?: {
    status?: string
    currency?: string
    totalWithVat?: number | null
    amount?: number | null
    discountTotal?: number | null
    professionalPayout?: number | null
    refundAmount?: number | null
    /** Separate extra-cost PaymentIntent: VAT-inclusive customer charge and its status. */
    extraCostAmount?: number | null
    extraCostStatus?: "pending" | "succeeded" | "failed" | "refunded" | string | null
    /**
     * Refund ledger rows (`IPaymentRefund`) when a payload carries them.
     * `kind: "extra_cost"` rows return unused negative extra-cost work;
     * a missing status is a legacy actual refund.
     */
    refunds?: Array<{
      amount?: number | null
      kind?: "booking" | "extra_cost" | string | null
      status?: "pending" | "requires_action" | "succeeded" | "failed" | "canceled" | string | null
    }> | null
    transferredAt?: string | null
    invoiceNumber?: string | null
    invoiceUrl?: string | null
    supplierInvoiceNumber?: string | null
    supplierInvoiceUrl?: string | null
  } | null
  /**
   * Professional-declared extra costs (`IExtraCost`). Entries carry no status
   * and their `amount` is pre-commission, pre-VAT, so they are never shown as
   * money the customer paid.
   */
  extraCosts?: Array<{ type?: string; name?: string; amount?: number }> | null
  /**
   * Server-derived overview money (`SharedBookingsRow` in the backend's
   * overviewRows.ts). When a field is present it is authoritative, including
   * an intentional `not_recorded`.
   */
  overview?: {
    paidPrice?: OverviewMoney | null
    completionAddition?: OverviewMoney | null
  } | null
  warrantyCoverage?: {
    duration?: { value?: number; unit?: "months" | "years" }
    endsAt?: string
  } | null
  quote?: {
    quotationNumber?: string | null
    currentVersion?: number | null
  } | null
}

interface Props {
  bookings: SharedBookingRow[]
  viewerRole: "customer" | "professional"
  formatMoney: (amount: number, currency?: string | null) => string
  intl: string
  statusLabel: (status: string) => string
  invoiceLabel: string
  downloadLabel: string
  chatLabel: string
  warrantyLabel: string
  payNowLabel: string
  viewLabel: string
}

const UNPAID_BOOKING_STATUSES = new Set(["quote_accepted", "payment_pending"])
const UNPAID_PAYMENT_STATUSES = new Set(["pending", "failed"])

const NOT_RECORDED: OverviewMoney = { amount: null, currency: null, source: "not_recorded" }

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

const recordedMoney = (amount: number, currency: string | null | undefined): OverviewMoney => ({
  amount,
  currency: typeof currency === "string" && currency ? currency : "EUR",
  source: "recorded",
})

/**
 * Authoritative server overview money for one field. `undefined` means the
 * payload has no overview for it, so the caller derives it from the booking.
 * A present but unusable value (or `null`) is an intentional unknown.
 */
function authoritativeOverviewMoney(value: OverviewMoney | null | undefined): OverviewMoney | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || value.source !== "recorded" || !isFiniteNumber(value.amount)) {
    return NOT_RECORDED
  }
  return recordedMoney(value.amount, value.currency)
}

/**
 * Refund rows that actually returned money: legacy rows without a status, or
 * `succeeded`. Failed/canceled rows returned nothing and pending or
 * requires_action rows have not returned money yet.
 */
const isReturnedRefund = (refund: unknown): refund is { amount: number; kind?: string | null } => {
  if (!refund || typeof refund !== "object") return false
  const row = refund as { amount?: unknown; status?: unknown }
  return (row.status == null || row.status === "succeeded") && isFiniteNumber(row.amount) && row.amount > 0
}

/**
 * Paid price of a booking row, VAT-inclusive from the recorded
 * `payment.totalWithVat` only (mirrors the backend overview row).
 * `payment.amount` is the pre-VAT net and is never shown as the paid price.
 * Awaiting-payment bookings and pending/failed payments (including a later
 * milestone's open checkout) only carry the amount due, so they render as not
 * recorded, never as paid.
 */
export function paidPriceOf(booking: SharedBookingRow): OverviewMoney {
  const authoritative = authoritativeOverviewMoney(booking.overview?.paidPrice)
  if (authoritative) return authoritative
  if (UNPAID_BOOKING_STATUSES.has(booking.status) || UNPAID_PAYMENT_STATUSES.has(String(booking.payment?.status))) {
    return NOT_RECORDED
  }
  const payment = booking.payment
  if (!isFiniteNumber(payment?.totalWithVat)) return NOT_RECORDED
  return recordedMoney(payment.totalWithVat, payment.currency)
}

/**
 * Settled completion addition, VAT-inclusive as the customer was charged or
 * refunded. The authoritative server overview wins (an intentional unknown
 * included); this fallback derives it from the booking's recorded payment
 * facts for payloads without that overview:
 * - The separate extra-cost charge `payment.extraCostAmount` counts once it
 *   was actually charged: `extraCostStatus` `succeeded`, or `refunded` (a
 *   charge that succeeded and was then returned). Pending, failed or missing
 *   charges, or a charge without a recorded non-negative amount, add nothing
 *   (returned money is a refund row, never a negative charge).
 * - A charged amount is net only against a loaded refund ledger
 *   (`payment.refunds` an array; an empty array means no refunds). Without
 *   the ledger it is not recorded, as on the server when the ledger was not
 *   loaded: a partial refund absent from the payload would be hidden.
 * - `kind: "extra_cost"` refund rows that actually returned money are
 *   subtracted: refunds of that charge (a partial refund leaves the rest),
 *   or, without a charge, credits against the base charge (negative).
 * - A `refunded` charge whose returned rows do not cover it is not
 *   recorded: the refund that returned it is not in this payload (the
 *   ledger rows live on the payment records), so a net figure would be
 *   invented. A fully refunded charge nets to 0 (shown as no addition);
 *   returned rows beyond it remain a credit.
 * `extraCosts[]` entries are never summed. Not recorded when nothing settled
 * is recorded.
 */
export function completionAdditionOf(booking: SharedBookingRow): OverviewMoney {
  const authoritative = authoritativeOverviewMoney(booking.overview?.completionAddition)
  if (authoritative) return authoritative
  const payment = booking.payment
  if (!payment || typeof payment !== "object") return NOT_RECORDED
  const refunds = Array.isArray(payment.refunds) ? payment.refunds : null
  const returned = refunds
    ? refunds
      .filter((refund) => isReturnedRefund(refund) && refund.kind === "extra_cost")
      .reduce((sum, refund) => sum + (refund.amount as number), 0)
    : 0
  const charged = (payment.extraCostStatus === "succeeded" || payment.extraCostStatus === "refunded")
    && isFiniteNumber(payment.extraCostAmount) && payment.extraCostAmount >= 0
    ? payment.extraCostAmount
    : null
  if (charged == null) {
    return returned > 0 ? recordedMoney(roundMoney(-returned), payment.currency) : NOT_RECORDED
  }
  // A settled charge needs the refund ledger to be net: without it a refund of
  // that charge may simply be absent from this payload.
  if (!refunds) return NOT_RECORDED
  if (payment.extraCostStatus === "refunded" && roundMoney(returned) < roundMoney(charged)) return NOT_RECORDED
  return recordedMoney(roundMoney(charged - returned), payment.currency)
}

function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

/**
 * Shared bookings table for the customer and professional dashboards. Every
 * value comes from recorded booking data; unknown values render as a dash.
 */
export default function SharedBookingsTable({
  bookings,
  viewerRole,
  formatMoney,
  intl,
  statusLabel,
  invoiceLabel,
  downloadLabel,
  chatLabel,
  warrantyLabel,
  payNowLabel,
  viewLabel,
}: Props) {
  const router = useRouter()
  const isCustomer = viewerRole === "customer"
  const th = useSharedTableText()

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white/90">
      <table className="min-w-full text-xs" aria-label={th.bookingsTableLabel}>
        <thead className="bg-slate-50 text-gray-600 text-[11px] uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2.5 text-left">{th.project}</th>
            <th className="px-3 py-2.5 text-left">{th.booking}</th>
            <th className="px-3 py-2.5 text-left">{th.address}</th>
            {isCustomer ? (
              <th className="px-3 py-2.5 text-left">{th.professional}</th>
            ) : (
              <th className="px-3 py-2.5 text-left">{th.customer}</th>
            )}
            <th className="px-3 py-2.5 text-left">{th.orderDate}</th>
            <th className="px-3 py-2.5 text-left">{th.planned}</th>
            <th className="px-3 py-2.5 text-left">{th.real}</th>
            <th className="px-3 py-2.5 text-left">{th.priceModel}</th>
            <th className="px-3 py-2.5 text-left">{th.paidPrice}</th>
            <th className="px-3 py-2.5 text-left">{th.status}</th>
            <th className="px-3 py-2.5 text-left">{th.invoice}</th>
            {!isCustomer && <th className="px-3 py-2.5 text-left">{th.payoutDate}</th>}
            {!isCustomer && <th className="px-3 py-2.5 text-left">{th.payoutRefund}</th>}
            <th className="px-3 py-2.5 text-left">{isCustomer ? th.actions : th.details}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bookings.map((booking) => {
            const titles = resolveSnapshotTitles(booking)
            const { className: statusClasses } = getBookingStatusMeta(booking.status)
            const address = joinServiceAddress(booking.location)
            const addition = completionAdditionOf(booking)
            const invoiceNumber = isCustomer ? booking.payment?.invoiceNumber : booking.payment?.supplierInvoiceNumber
            const invoiceUrl = isCustomer ? booking.payment?.invoiceUrl : booking.payment?.supplierInvoiceUrl
            const payoutVisible = !isCustomer
            return (
              <tr key={booking._id} className="hover:bg-slate-50/60 align-top">
                <td className="px-3 py-3">
                  {titles.projectId ? (
                    <Link href={projectHref(titles.projectId)} className="font-medium text-indigo-700 hover:underline">
                      {titles.projectTitle || DASH}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900">{titles.projectTitle || DASH}</span>
                  )}
                  <div className="mt-0.5 text-gray-500">{titles.subprojectTitle || DASH}</div>
                </td>
                <td className="px-3 py-3">
                  <Link href={bookingHref(booking._id)} className="font-medium text-indigo-700 hover:underline">
                    {booking.bookingNumber || DASH}
                  </Link>
                </td>
                <td className="px-3 py-3 text-gray-700">{address || DASH}</td>
                {isCustomer ? (
                  <td className="px-3 py-3">
                    {booking.professional?._id ? (
                      <Link href={professionalHref(booking.professional._id)} className="font-medium text-indigo-700 hover:underline">
                        {booking.professional.businessInfo?.companyName || booking.professional.name || booking.professional.username || DASH}
                      </Link>
                    ) : (
                      <span className="text-gray-700">{DASH}</span>
                    )}
                    {booking.professional?.professionalLevel && (
                      <div className="mt-0.5 text-gray-500">{booking.professional.professionalLevel}</div>
                    )}
                    <ProfessionalTableTags tags={booking.professional?.adminTags} />
                  </td>
                ) : (
                  <td className="px-3 py-3 text-gray-700">{booking.customer?.name || DASH}</td>
                )}
                <td className="px-3 py-3 text-gray-700">{formatUnknownDate(booking.createdAt, intl)}</td>
                <td className="px-3 py-3 text-gray-700">
                  {formatUnknownDate(booking.scheduledStartDate, intl)} / {formatUnknownDate(booking.scheduledExecutionEndDate, intl)}
                </td>
                <td className="px-3 py-3 text-gray-700">
                  {formatUnknownDate(booking.actualStartDate, intl)} / {formatUnknownDate(booking.actualEndDate, intl)}
                </td>
                <td className="px-3 py-3 text-gray-700">{booking.priceModel || DASH}</td>
                <td className="px-3 py-3">
                  <span className="font-semibold text-gray-900">{formatOverviewMoney(paidPriceOf(booking), formatMoney)}</span>
                  {addition.source === "recorded" && addition.amount != null && addition.amount !== 0 && (
                    <div className="mt-0.5 text-gray-500">
                      {addition.amount < 0 ? "− " : "+ "}
                      {formatOverviewMoney({ ...addition, amount: Math.abs(addition.amount) }, formatMoney)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className={`text-[11px] capitalize ${statusClasses}`}>
                    {statusLabel(booking.status)}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  {invoiceNumber ? (
                    <div>
                      <div className="font-medium text-gray-900">{invoiceNumber}</div>
                      {isSafeHttpUrl(invoiceUrl) && (
                        <a href={invoiceUrl as string} target="_blank" rel="noreferrer noopener" className="text-indigo-700 hover:underline">
                          {downloadLabel}
                        </a>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">{invoiceLabel}: {DASH}</span>
                  )}
                </td>
                {payoutVisible && (
                  <td className="px-3 py-3 text-gray-700">{formatUnknownDate(booking.payment?.transferredAt, intl)}</td>
                )}
                {payoutVisible && (
                  <td className="px-3 py-3 text-gray-700">
                    {booking.payment?.professionalPayout != null
                      ? formatMoney(booking.payment.professionalPayout, booking.payment?.currency)
                      : DASH}
                    {booking.payment?.refundAmount != null && (
                      <div className="mt-0.5">− {formatMoney(booking.payment.refundAmount, booking.payment?.currency)}</div>
                    )}
                  </td>
                )}
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => router.push(bookingHref(booking._id))}>
                      {viewLabel}
                    </Button>
                    {isCustomer && booking.professional?._id && (
                      <StartChatButton professionalId={booking.professional._id} label={chatLabel} size="sm" className="h-7 text-[11px]" />
                    )}
                    {isCustomer && isWarrantyActionEligible(booking) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => router.push(`${bookingHref(booking._id)}?openWarrantyClaim=true`)}
                      >
                        {warrantyLabel}
                      </Button>
                    )}
                    {isCustomer && isPayNowEligible(booking.status) && (
                      <Button
                        size="sm"
                        className="h-7 bg-blue-600 text-[11px] text-white hover:bg-blue-700"
                        onClick={() => router.push(`${bookingHref(booking._id)}/payment`)}
                      >
                        {payNowLabel}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
