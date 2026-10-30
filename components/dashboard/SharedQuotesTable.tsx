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
  joinServiceAddress,
  professionalHref,
  projectHref,
  quoteVersionHref,
  resolvePinnedQuoteVersion,
  resolveSnapshotTitles,
} from "@/lib/dashboardOverview"
import type { SharedBookingRow } from "./SharedBookingsTable"

interface QuoteVersionEntry {
  version: number
  totalAmount?: number | null
  totalWithVat?: number | null
  customerTotals?: { totalWithVat?: number | null } | null
  amount?: number | null
  currency?: string | null
  submittedAt?: string | null
  createdAt?: string | null
  validUntil?: string | null
  firstPossibleStart?: string | null
  executionDuration?: { value?: number; unit?: string } | string | null
}

interface QuoteRowBooking extends SharedBookingRow {
  quotationNumber?: string | null
  currentQuoteVersion?: number | null
  acceptedQuoteVersion?: number | null
  quoteVersions?: Array<QuoteVersionEntry> | null
  quote?: {
    quotationNumber?: string | null
    currentVersion?: number | null
    acceptedVersion?: number | null
    submittedAt?: string | null
    validUntil?: string | null
    totalAmount?: number | null
    amount?: number | null
    currency?: string | null
  } | null
  scheduleSnapshot?: {
    firstPossibleStart?: string | null
    executionDuration?: { value?: number; unit?: string } | null
  } | null
}

interface Props {
  bookings: QuoteRowBooking[]
  viewerRole: "customer" | "professional"
  formatMoney: (amount: number, currency?: string | null) => string
  intl: string
  statusLabel: (status: string) => string
  chatLabel: string
  acceptPayLabel: string
  viewLabel: string
}

function pinnedVersionDoc(booking: QuoteRowBooking): QuoteVersionEntry | null {
  const { pinnedVersion } = resolvePinnedQuoteVersion(booking)
  if (pinnedVersion == null || !Array.isArray(booking.quoteVersions)) return null
  return booking.quoteVersions.find((entry) => entry?.version === pinnedVersion) ?? null
}

function quotePriceOf(booking: QuoteRowBooking) {
  const pinned = pinnedVersionDoc(booking)
  if (pinned) {
    const amount = pinned.customerTotals?.totalWithVat ?? pinned.totalWithVat ?? pinned.totalAmount ?? pinned.amount ?? null
    if (typeof amount === "number" && Number.isFinite(amount)) {
      return { amount, currency: pinned.currency || booking.quote?.currency || "EUR", source: "recorded" as const }
    }
    return { amount: null, currency: null, source: "not_recorded" as const }
  }
  if (!Array.isArray(booking.quoteVersions) || booking.quoteVersions.length === 0) {
    const amount = booking.quote?.totalAmount ?? booking.quote?.amount ?? null
    if (typeof amount === "number" && Number.isFinite(amount)) {
      return { amount, currency: booking.quote?.currency || "EUR", source: "recorded" as const }
    }
  }
  return { amount: null, currency: null, source: "not_recorded" as const }
}

function durationLabel(value: { value?: number; unit?: string } | string | null | undefined): string {
  if (!value) return DASH
  if (typeof value === "string") return value || DASH
  if (typeof value.value === "number") return `${value.value} ${value.unit || ""}`.trim()
  return DASH
}

export default function SharedQuotesTable({
  bookings,
  viewerRole,
  formatMoney,
  intl,
  statusLabel,
  chatLabel,
  acceptPayLabel,
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
            <th className="px-3 py-2.5 text-left">{th.quotation}</th>
            <th className="px-3 py-2.5 text-left">{th.address}</th>
            {isCustomer ? (
              <th className="px-3 py-2.5 text-left">{th.professional}</th>
            ) : (
              <th className="px-3 py-2.5 text-left">{th.customer}</th>
            )}
            <th className="px-3 py-2.5 text-left">{th.requested}</th>
            <th className="px-3 py-2.5 text-left">{th.quoteDate}</th>
            <th className="px-3 py-2.5 text-left">{th.firstStart}</th>
            <th className="px-3 py-2.5 text-left">{th.duration}</th>
            <th className="px-3 py-2.5 text-left">{th.price}</th>
            <th className="px-3 py-2.5 text-left">{th.status}</th>
            <th className="px-3 py-2.5 text-left">{isCustomer ? th.actions : th.details}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bookings.map((booking) => {
            const titles = resolveSnapshotTitles(booking)
            const { className: statusClasses } = getBookingStatusMeta(booking.status)
            const address = joinServiceAddress(booking.location)
            const { pinnedVersion } = resolvePinnedQuoteVersion(booking)
            const pinned = pinnedVersionDoc(booking)
            const quotationNumber = booking.quotationNumber ?? booking.quote?.quotationNumber ?? null
            const firstStart = pinned?.firstPossibleStart ?? booking.scheduleSnapshot?.firstPossibleStart ?? null
            const duration = pinned?.executionDuration ?? booking.scheduleSnapshot?.executionDuration ?? null
            const canAcceptPay = booking.status === "quoted"
            // Accept runs on the booking detail route (existing version,
            // expiry, and idempotency authority). Already-accepted quotes go
            // straight to the existing checkout entry.
            const acceptPayHref = booking.status === "quote_accepted" || booking.status === "payment_pending"
              ? `${bookingHref(booking._id)}/payment`
              : bookingHref(booking._id)
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
                  <Link href={quoteVersionHref(booking._id, booking)} className="font-medium text-indigo-700 hover:underline">
                    {quotationNumber || DASH}{pinnedVersion != null ? ` v${pinnedVersion}` : ""}
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
                  {formatUnknownDate(pinned?.submittedAt ?? pinned?.createdAt ?? booking.quote?.submittedAt, intl)} /{" "}
                  {formatUnknownDate(pinned?.validUntil ?? booking.quote?.validUntil, intl)}
                </td>
                <td className="px-3 py-3 text-gray-700">
                  {formatUnknownDate(firstStart, intl)}
                </td>
                <td className="px-3 py-3 text-gray-700">{durationLabel(duration)}</td>
                <td className="px-3 py-3">
                  <span className="font-semibold text-gray-900">{formatOverviewMoney(quotePriceOf(booking), formatMoney)}</span>
                </td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className={`text-[11px] capitalize ${statusClasses}`}>
                    {statusLabel(booking.status)}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => router.push(bookingHref(booking._id))}>
                      {viewLabel}
                    </Button>
                    {isCustomer && booking.professional?._id && (
                      <StartChatButton professionalId={booking.professional._id} label={chatLabel} size="sm" className="h-7 text-[11px]" />
                    )}
                    {isCustomer && (canAcceptPay || booking.status === "quote_accepted" || booking.status === "payment_pending") && (
                      <Button
                        size="sm"
                        className="h-7 bg-blue-600 text-[11px] text-white hover:bg-blue-700"
                        onClick={() => router.push(acceptPayHref)}
                      >
                        {acceptPayLabel}
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
