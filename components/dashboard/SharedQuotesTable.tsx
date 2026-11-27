'use client'

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import StartChatButton from "@/components/chat/StartChatButton"
import ProfessionalTableTags from "./ProfessionalTableTags"
import ProfessionalLevelTag from "./ProfessionalLevelTag"
import { useSharedTableText } from "./sharedTableText"
import { getBookingStatusMeta } from "@/lib/dashboardBookingHelpers"
import {
  bookingHref,
  DASH,
  formatOverviewMoney,
  formatUnknownDate,
  quoteServiceAddress,
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
  pricingLines?: Array<{ price?: number | null; vatRate?: number | null }> | null
  /** Service address the professional recorded with this version. */
  serviceLocation?: { address?: string; city?: string; postalCode?: string; country?: string } | null
}

export interface QuoteRowBooking extends SharedBookingRow {
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

/** FT2-14: per-row comparison checkboxes (instead of a list above the table). */
export interface QuoteRowSelection {
  isSelected: (bookingId: string) => boolean
  onToggle: (booking: QuoteRowBooking) => void
  /** Accessible label of one row's checkbox. */
  label: (booking: QuoteRowBooking) => string
}

interface Props {
  bookings: QuoteRowBooking[]
  selection?: QuoteRowSelection
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

/**
 * VAT-inclusive price of the pinned quote version. `totalAmount` is the
 * pre-VAT net, so it only stands in for legacy versions without pricingLines
 * (treated as 0% VAT); a priced version without a recorded VAT-inclusive
 * total renders as not recorded.
 */
function quotePriceOf(booking: QuoteRowBooking) {
  const pinned = pinnedVersionDoc(booking)
  if (pinned) {
    const recordedGross = pinned.customerTotals?.totalWithVat ?? pinned.totalWithVat ?? null
    const isLegacyUnpriced = !Array.isArray(pinned.pricingLines) || pinned.pricingLines.length === 0
    const amount = recordedGross ?? (isLegacyUnpriced ? pinned.totalAmount ?? pinned.amount ?? null : null)
    if (typeof amount === "number" && Number.isFinite(amount)) {
      return { amount, currency: pinned.currency || null, source: "recorded" as const }
    }
    return { amount: null, currency: null, source: "not_recorded" as const }
  }
  if (!Array.isArray(booking.quoteVersions) || booking.quoteVersions.length === 0) {
    const amount = booking.quote?.totalAmount ?? booking.quote?.amount ?? null
    if (typeof amount === "number" && Number.isFinite(amount)) {
      return { amount, currency: booking.quote?.currency || null, source: "recorded" as const }
    }
  }
  return { amount: null, currency: null, source: "not_recorded" as const }
}

function durationLabel(
  value: { value?: number; unit?: string } | string | null | undefined,
  formatDuration: (value: number, unit: string | null | undefined) => string,
): string {
  if (!value) return DASH
  if (typeof value === "string") return value || DASH
  if (typeof value.value === "number") return formatDuration(value.value, value.unit)
  return DASH
}

/**
 * Shared quotations table for the customer and professional dashboards,
 * priced from the pinned (accepted or current) quote version only.
 */
export default function SharedQuotesTable({
  bookings,
  viewerRole,
  formatMoney,
  intl,
  statusLabel,
  chatLabel,
  acceptPayLabel,
  viewLabel,
  selection,
}: Props) {
  const router = useRouter()
  const isCustomer = viewerRole === "customer"
  const th = useSharedTableText()

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white/90">
      <table className="w-full min-w-full text-xs" aria-label={th.quotesTableLabel}>
        <thead className="bg-slate-50 text-gray-600 text-[10px] uppercase leading-tight">
          <tr>
            {selection && <th className="w-8 px-2 py-2 text-left align-bottom"><span className="sr-only">{th.compare}</span></th>}
            <th className="px-2 py-2 text-left align-bottom">{th.project}</th>
            <th className="px-2 py-2 text-left align-bottom">{th.quotation}</th>
            <th className="px-2 py-2 text-left align-bottom">{th.address}</th>
            {isCustomer ? (
              <th className="px-2 py-2 text-left align-bottom">{th.professional}</th>
            ) : (
              <th className="px-2 py-2 text-left align-bottom">{th.customer}</th>
            )}
            <th className="px-2 py-2 text-left align-bottom">{th.requested}</th>
            <th className="px-2 py-2 text-left align-bottom">{th.quoteDate}</th>
            <th className="px-2 py-2 text-left align-bottom">{th.firstStart}</th>
            <th className="px-2 py-2 text-left align-bottom">{th.duration}</th>
            <th className="px-2 py-2 text-left align-bottom">{th.price}</th>
            <th className="px-2 py-2 text-left align-bottom">{th.status}</th>
            <th className="sticky right-0 bg-slate-50 px-2 py-2 text-left align-bottom shadow-[-6px_0_6px_-6px_rgba(15,23,42,0.18)]">{isCustomer ? th.actions : th.details}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bookings.map((booking) => {
            const titles = resolveSnapshotTitles(booking)
            const { className: statusClasses } = getBookingStatusMeta(booking.status)
            const address = quoteServiceAddress(booking)
            const { pinnedVersion } = resolvePinnedQuoteVersion(booking)
            const pinned = pinnedVersionDoc(booking)
            const quotationNumber = booking.quotationNumber ?? booking.quote?.quotationNumber ?? null
            const hasVersions = Boolean(booking.quoteVersions?.length)
            const firstStart = pinned?.firstPossibleStart ?? (!hasVersions ? booking.scheduleSnapshot?.firstPossibleStart : null) ?? null
            const duration = pinned?.executionDuration ?? (!hasVersions ? booking.scheduleSnapshot?.executionDuration : null) ?? null
            const canAcceptPay = booking.status === "quoted"
            // Accept runs on the booking detail route (existing version,
            // expiry, and idempotency authority). Already-accepted quotes go
            // straight to the existing checkout entry.
            const acceptPayHref = booking.status === "quote_accepted" || booking.status === "payment_pending"
              ? `${bookingHref(booking._id)}/payment`
              : bookingHref(booking._id)
            return (
              <tr key={booking._id} className="group hover:bg-slate-50 align-top">
                {selection && (
                  <td className="w-8 px-2 py-2.5">
                    <Checkbox
                      checked={selection.isSelected(booking._id)}
                      onCheckedChange={() => selection.onToggle(booking)}
                      aria-label={selection.label(booking)}
                    />
                  </td>
                )}
                <td className="px-2 py-2.5">
                  {titles.projectId ? (
                    <Link href={projectHref(titles.projectId)} className="font-medium text-indigo-700 hover:underline">
                      {titles.projectTitle || DASH}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900">{titles.projectTitle || DASH}</span>
                  )}
                  <div className="mt-0.5 text-gray-500">
                    {titles.subprojectTitle && titles.projectId ? (
                      <Link href={projectHref(titles.projectId)} className="text-indigo-700 hover:underline">
                        {titles.subprojectTitle}
                      </Link>
                    ) : titles.subprojectTitle || DASH}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <Link href={quoteVersionHref(booking._id, booking)} className="font-medium text-indigo-700 hover:underline">
                    {quotationNumber || DASH}{pinnedVersion != null ? ` v${pinnedVersion}` : ""}
                  </Link>
                </td>
                <td className="min-w-[8rem] max-w-[11rem] break-words px-2 py-2.5 text-gray-700">{address || DASH}</td>
                {isCustomer ? (
                  <td className="px-2 py-2.5">
                    {booking.professional?._id ? (
                      <Link href={professionalHref(booking.professional._id)} className="font-medium text-indigo-700 hover:underline">
                        {booking.professional.businessInfo?.companyName || booking.professional.name || booking.professional.username || DASH}
                      </Link>
                    ) : (
                      <span className="text-gray-700">{DASH}</span>
                    )}
                    {booking.professional?.professionalLevel && (
                      <div className="mt-0.5"><ProfessionalLevelTag level={booking.professional.professionalLevel} className="text-[10px]" /></div>
                    )}
                    <ProfessionalTableTags tags={booking.professional?.adminTags} />
                  </td>
                ) : (
                  <td className="px-2 py-2.5 text-gray-700">{booking.customer?.name || DASH}</td>
                )}
                <td className="px-2 py-2.5 text-gray-700">{formatUnknownDate(booking.createdAt, intl)}</td>
                <td className="px-2 py-2.5 text-gray-700">
                  {formatUnknownDate(pinned?.submittedAt ?? pinned?.createdAt ?? (!hasVersions ? booking.quote?.submittedAt : null), intl)} /{" "}
                  {formatUnknownDate(pinned?.validUntil ?? (!hasVersions ? booking.quote?.validUntil : null), intl)}
                </td>
                <td className="px-2 py-2.5 text-gray-700">
                  {formatUnknownDate(firstStart, intl)}
                </td>
                <td className="px-2 py-2.5 text-gray-700">{durationLabel(duration, th.formatDuration)}</td>
                <td className="px-2 py-2.5">
                  <span className="font-semibold text-gray-900">{formatOverviewMoney(quotePriceOf(booking), formatMoney)}</span>
                </td>
                <td className="px-2 py-2.5">
                  <Badge variant="outline" className={`whitespace-normal text-left text-[11px] capitalize ${statusClasses}`}>
                    {statusLabel(booking.status)}
                  </Badge>
                </td>
                <td className="sticky right-0 bg-white px-2 py-2.5 shadow-[-6px_0_6px_-6px_rgba(15,23,42,0.18)] group-hover:bg-slate-50">
                  <div className="flex flex-col items-stretch gap-1">
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
