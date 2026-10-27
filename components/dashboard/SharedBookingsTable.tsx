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
    refunds?: Array<{ amount?: number }> | null
    transferredAt?: string | null
    invoiceNumber?: string | null
    invoiceUrl?: string | null
    supplierInvoiceNumber?: string | null
    supplierInvoiceUrl?: string | null
  } | null
  extraCosts?: Array<{ status?: string; total?: number; amount?: number }> | null
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

function paidPriceOf(booking: SharedBookingRow): { amount: number | null; currency: string | null; source: "recorded" | "not_recorded" } {
  const payment = booking.payment
  const amount = payment?.totalWithVat ?? payment?.amount ?? null
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { amount: null, currency: null, source: "not_recorded" }
  }
  return { amount, currency: payment?.currency || "EUR", source: "recorded" }
}

function completionAdditionOf(booking: SharedBookingRow): { amount: number | null; currency: string | null; source: "recorded" | "not_recorded" } {
  const entries = Array.isArray(booking.extraCosts) ? booking.extraCosts : []
  const completed = entries.filter((entry) =>
    entry && ["approved", "completed", "succeeded", "paid"].includes(String(entry.status)),
  )
  if (completed.length === 0) return { amount: null, currency: null, source: "not_recorded" }
  const total = completed.reduce(
    (sum, entry) => sum + (typeof entry.total === "number" ? entry.total : typeof entry.amount === "number" ? entry.amount : 0),
    0,
  )
  return { amount: total, currency: booking.payment?.currency || "EUR", source: "recorded" }
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
      <table className="min-w-full text-xs">
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
                  {addition.source === "recorded" && (
                    <div className="mt-0.5 text-gray-500">+ {formatOverviewMoney(addition, formatMoney)}</div>
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
