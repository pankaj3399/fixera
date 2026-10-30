"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { CreditCard, FileText, Package, ShieldCheck, User } from "lucide-react"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { useAdminAccess } from "@/hooks/useAdminAccess"
import {
  buildAdminDetailLinks,
  buildQuoteAnchors,
  durationLabel,
  formatCalendarDate,
  formatInstant,
  ownRecordedCurrency,
  recordedScheduleTimeZone,
} from "@/lib/bookingDetails"
import type { BookingDetailsDto, RawBookingRecord, DetailViewerRole } from "@/types/bookingDetails"
import { AdminReferencesCard } from "./AdminReferencesCard"
import {
  DetailCard,
  DetailField,
  DurationText,
  EnumText,
  MoneyText,
  NoticeList,
  PartyCard,
  ProvenanceBadge,
  StatusText,
  TimeZoneNote,
  useDetailDisplayTimeZone,
  useDetailT,
} from "./DetailPrimitives"

interface OverviewPanelProps {
  booking: RawBookingRecord
  details: BookingDetailsDto | null
  viewerRole: DetailViewerRole | null
  pathname: string
  search: string
  onSelectTab: (tab: "booking" | "quotation" | "payments" | "activity", hash?: string) => void
}

const DETAIL_STATUS_STYLES: Record<string, string> = {
  rfq: "bg-indigo-50 text-indigo-700 border-indigo-100",
  rfq_accepted: "bg-violet-50 text-violet-700 border-violet-100",
  draft_quote: "bg-slate-50 text-slate-700 border-slate-100",
  quoted: "bg-blue-50 text-blue-700 border-blue-100",
  quote_accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
  quote_rejected: "bg-rose-50 text-rose-700 border-rose-100",
  payment_pending: "bg-amber-50 text-amber-700 border-amber-100",
  booked: "bg-emerald-50 text-emerald-700 border-emerald-100",
  rescheduling_requested: "bg-amber-50 text-amber-700 border-amber-100",
  in_progress: "bg-sky-50 text-sky-700 border-sky-100",
  professional_completed: "bg-amber-50 text-amber-700 border-amber-100",
  completed: "bg-teal-50 text-teal-700 border-teal-100",
  cancelled: "bg-rose-50 text-rose-700 border-rose-100",
  refunded: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
  dispute: "bg-red-50 text-red-700 border-red-100",
}

export function OverviewPanel({
  booking,
  details,
  viewerRole,
  pathname,
  search,
  onSelectTab,
}: OverviewPanelProps) {
  const t = useTranslations("bookings")
  const dt = useDetailT()
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()
  const { can } = useAdminAccess()
  const displayTimeZone = useDetailDisplayTimeZone(
    recordedScheduleTimeZone(details, booking.scheduleTimeZone)
  )

  const overview = details?.booking
  const snapshot = details?.bookingSnapshot
  const parties = details?.parties
  const schedule = {
    preferredStartDate: overview?.schedule?.preferredStartDate ?? snapshot?.schedule?.preferredStartDate ?? null,
    preferredStartTime: overview?.schedule?.preferredStartTime ?? snapshot?.schedule?.preferredStartTime ?? null,
    scheduledStartDate: overview?.schedule?.scheduledStartDate ?? snapshot?.schedule?.scheduledStartDate ?? null,
    scheduledStartTime: overview?.schedule?.scheduledStartTime ?? snapshot?.schedule?.scheduledStartTime ?? null,
    scheduledExecutionEndDate:
      overview?.schedule?.scheduledExecutionEndDate ?? snapshot?.schedule?.scheduledExecutionEndDate ?? null,
    scheduledBufferStartDate:
      overview?.schedule?.scheduledBufferStartDate ?? snapshot?.schedule?.scheduledBufferStartDate ?? null,
    scheduledBufferEndDate:
      overview?.schedule?.scheduledBufferEndDate ?? snapshot?.schedule?.scheduledBufferEndDate ?? null,
    actualStartDate: overview?.schedule?.actualStartDate ?? null,
    actualEndDate: overview?.schedule?.actualEndDate ?? null,
    timeZone: overview?.schedule?.timeZone ?? snapshot?.schedule?.timeZone ?? null,
    timeZoneRecorded:
      overview?.schedule?.timeZoneRecorded ?? snapshot?.schedule?.timeZoneRecorded ?? false,
    reschedulePending: overview?.schedule?.reschedulePending ?? false,
  }
  const recordedScheduleZone = recordedScheduleTimeZone(details, booking.scheduleTimeZone)
  const quote = overview?.quote || details?.quotation
  const payment = overview?.payment
  const extraCosts = overview?.extraCosts || details?.extraCosts
  const extraCostsTotal =
    extraCosts && "total" in extraCosts
      ? (extraCosts.total as number | null | undefined)
      : (extraCosts as { totalProfessionalAmount?: number | null } | null | undefined)?.totalProfessionalAmount
  const warranty = overview?.warranty || booking.warrantyCoverage

  const snapshotRecorded = Boolean(snapshot?.immutable || snapshot?.capturedAt)
  const title =
    snapshot?.project?.title ||
    (snapshotRecorded ? overview?.title : null) ||
    booking.rfqData?.serviceType ||
    booking.professional?.username ||
    t("page.defaultTitle")
  const bookingNumber = overview?.bookingNumber || booking.bookingNumber
  const serviceType = overview?.serviceType || details?.wizard?.rfq?.serviceType || booking.rfqData?.serviceType
  const category = overview?.category || snapshot?.project?.category || booking.project?.category
  const service = overview?.service || snapshot?.project?.service || booking.project?.service
  const createdAt = overview?.createdAt || booking.createdAt
  const updatedAt = overview?.updatedAt || booking.updatedAt
  const location = overview?.location || snapshot?.location || booking.location
  const basePaymentRecord = details?.payments?.base || null
  const currency = basePaymentRecord
    ? ownRecordedCurrency(basePaymentRecord)
    : payment?.currency || booking.payment?.currency || null
  const extraCostsCurrency = details?.extraCosts
    ? ownRecordedCurrency(details.extraCosts)
    : overview?.extraCosts?.currencySource === "not_recorded"
      ? null
      : overview?.extraCosts?.currency || null

  const quoteNumber = quote && "quotationNumber" in quote ? quote.quotationNumber : details?.quotation?.quotationNumber
  const currentVersion =
    quote && "currentVersion" in quote ? quote.currentVersion : details?.quotation?.currentVersion ?? booking.currentQuoteVersion
  const acceptedVersion =
    details?.quotation?.acceptedVersion ||
    (quote && "acceptedVersion" in quote && typeof quote.acceptedVersion === "number"
      ? {
          version: quote.acceptedVersion,
          source: "acceptedVersionSource" in quote ? quote.acceptedVersionSource : undefined,
        }
      : null)
  const professionalTotal =
    (quote && "totalAmountProfessional" in quote ? quote.totalAmountProfessional : undefined) ??
    (quote && "totalAmount" in quote ? quote.totalAmount : undefined) ??
    details?.quotation?.totalAmountProfessional ??
    booking.quote?.amount
  const quoteCurrency =
    (quote && "currency" in quote ? quote.currency : undefined) || details?.quotation?.currency || booking.quote?.currency
  const quoteStatus =
    (quote && "status" in quote ? quote.status : undefined) ||
    details?.quotation?.status ||
    (booking.quote ? "legacy" : null)
  const validUntil =
    (quote && "validUntil" in quote ? quote.validUntil : undefined) ||
    booking.quoteVersions?.find((version) => version.version === currentVersion)?.validUntil ||
    booking.quote?.validUntil
  const quoteAnchors = buildQuoteAnchors(pathname, search, currentVersion)

  const notices = useMemo(
    () => [...(details?.meta?.notices || []), ...(snapshot?.notices || [])],
    [details?.meta?.notices, snapshot?.notices]
  )

  const adminLinks = useMemo(
    () =>
      buildAdminDetailLinks({
        viewerRole,
        bookingId: booking._id,
        permissions: {
          bookingsRead: can("bookings.read"),
          disputesManage: can("disputes.manage"),
          warrantyManage: can("warranty.manage"),
          paymentsManage: can("payments.manage"),
        },
        claimNumber: details?.warrantyClaims?.[0]?.claimNumber,
        hasDispute: Boolean(booking.dispute?.raisedAt || details?.extraCosts?.dispute),
        hasPayment: Boolean(booking.payment || details?.payments),
      }),
    [booking._id, booking.dispute?.raisedAt, booking.payment, can, details?.extraCosts?.dispute, details?.payments, details?.warrantyClaims, viewerRole]
  )

  const dtoAdminKeys = details?.adminLinks
    ? new Set(
        Object.entries(details.adminLinks)
          .filter(([, value]) => Boolean(value))
          .map(([key]) => (key === "warrantyClaims" ? "warranty" : key))
      )
    : null
  const visibleAdminLinks = dtoAdminKeys
    ? adminLinks.filter((link) => dtoAdminKeys.has(link.key))
    : adminLinks
  const liveProject = snapshot?.currentProjectReference?.project || (booking.project ? {
    id: booking.project._id,
    title: booking.project.title,
    category: booking.project.category,
    service: booking.project.service,
  } : null)

  return (
    <div className="space-y-4">
      <DetailCard
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Package className="h-4 w-4 text-indigo-500" />
            {title}
            <Badge
              variant="outline"
              className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${
                DETAIL_STATUS_STYLES[booking.status || ""] || "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {t.has(`status.${booking.status}` as never)
                ? t(`status.${booking.status}` as never)
                : booking.status?.replace(/_/g, " ") || dt("fields.unknown", "Unknown")}
            </Badge>
          </span>
        }
        description={t("page.subtitle")}
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label={dt("fields.bookingNumber", "Booking number")} empty={!bookingNumber}>
            <span className="font-mono text-xs">{bookingNumber}</span>
          </DetailField>
          <DetailField label={dt("fields.bookingType", "Booking type")} empty={!booking.bookingType}>
            {booking.bookingType === "project"
              ? dt("fields.typeProject", "Project booking")
              : booking.bookingType === "professional"
              ? dt("fields.typeProfessional", "Professional booking")
              : booking.bookingType}
          </DetailField>
          <DetailField label={dt("fields.serviceType", "Service type")} empty={!serviceType}>{serviceType}</DetailField>
          <DetailField label={dt("fields.category", "Category")} empty={!category}>{category}</DetailField>
          <DetailField label={dt("fields.service", "Service")} empty={!service}>{service}</DetailField>
          <DetailField label={dt("fields.createdAt", "Requested / created")} empty={!createdAt}>
            {formatInstant(createdAt, intl, displayTimeZone.timeZone)}
          </DetailField>
          <DetailField label={dt("fields.updatedAt", "Last updated")} empty={!updatedAt}>
            {formatInstant(updatedAt, intl, displayTimeZone.timeZone)}
          </DetailField>
          <DetailField label={dt("fields.requestedStart", "Requested start")} empty={!booking.rfqData?.preferredStartDate && !schedule?.preferredStartDate}>
            {formatCalendarDate(booking.rfqData?.preferredStartDate || schedule?.preferredStartDate, intl) ||
              booking.rfqData?.preferredStartDate ||
              schedule?.preferredStartDate}
          </DetailField>
          <DetailField label={dt("fields.urgency", "Urgency")} empty={!booking.rfqData?.urgency}>
            <EnumText prefix="urgency" value={booking.rfqData?.urgency} />
          </DetailField>
          <DetailField
            label={dt("fields.budget", "Budget")}
            empty={!booking.rfqData?.budget || (booking.rfqData.budget.min == null && booking.rfqData.budget.max == null)}
          >
            {booking.rfqData?.budget ? (
              <span className="tabular-nums">
                {booking.rfqData.budget.min != null && booking.rfqData.budget.max != null ? (
                  <>
                    <MoneyText
                      amount={booking.rfqData.budget.min}
                      currency={booking.rfqData.budget.currency}
                      formatMoney={formatMoney}
                    />{" "}
                    –{" "}
                    <MoneyText
                      amount={booking.rfqData.budget.max}
                      currency={booking.rfqData.budget.currency}
                      formatMoney={formatMoney}
                    />
                  </>
                ) : (
                  <MoneyText
                    amount={booking.rfqData.budget.min ?? booking.rfqData.budget.max}
                    currency={booking.rfqData.budget.currency}
                    formatMoney={formatMoney}
                  />
                )}
              </span>
            ) : null}
          </DetailField>
        </dl>
        <TimeZoneNote timeZone={displayTimeZone.timeZone} recorded={displayTimeZone.recorded} />
      </DetailCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard title={dt("overview.schedule", "Schedule")}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailField label={dt("fields.scheduledStart", "Scheduled start")} empty={!schedule?.scheduledStartDate && !booking.scheduledStartDate}>
              {formatCalendarDate(schedule?.scheduledStartDate || booking.scheduledStartDate, intl) ||
                schedule?.scheduledStartDate ||
                booking.scheduledStartDate}
              {schedule?.scheduledStartTime || booking.scheduledStartTime ? (
                <span className="ml-1 text-xs text-gray-500">{schedule?.scheduledStartTime || booking.scheduledStartTime}</span>
              ) : null}
            </DetailField>
            <DetailField
              label={dt("fields.scheduledExecutionEnd", "Scheduled execution end")}
              empty={!schedule?.scheduledExecutionEndDate && !booking.scheduledExecutionEndDate && !booking.scheduledEndDate}
            >
              {formatCalendarDate(schedule?.scheduledExecutionEndDate || booking.scheduledExecutionEndDate || booking.scheduledEndDate, intl) ||
                schedule?.scheduledExecutionEndDate ||
                booking.scheduledExecutionEndDate ||
                booking.scheduledEndDate}
            </DetailField>
            <DetailField label={dt("fields.bufferStart", "Buffer start")} empty={!schedule?.scheduledBufferStartDate && !booking.scheduledBufferStartDate}>
              {formatCalendarDate(schedule?.scheduledBufferStartDate || booking.scheduledBufferStartDate, intl) ||
                schedule?.scheduledBufferStartDate ||
                booking.scheduledBufferStartDate}
            </DetailField>
            <DetailField label={dt("fields.bufferEnd", "Buffer end")} empty={!schedule?.scheduledBufferEndDate && !booking.scheduledBufferEndDate}>
              {formatCalendarDate(schedule?.scheduledBufferEndDate || booking.scheduledBufferEndDate, intl) ||
                schedule?.scheduledBufferEndDate ||
                booking.scheduledBufferEndDate}
            </DetailField>
            <DetailField label={dt("fields.actualStart", "Actual start")} empty={!schedule?.actualStartDate && !booking.actualStartDate}>
              {formatCalendarDate(schedule?.actualStartDate || booking.actualStartDate, intl) || schedule?.actualStartDate || booking.actualStartDate}
            </DetailField>
            <DetailField label={dt("fields.actualEnd", "Actual end")} empty={!schedule?.actualEndDate && !booking.actualEndDate}>
              {formatCalendarDate(schedule?.actualEndDate || booking.actualEndDate, intl) || schedule?.actualEndDate || booking.actualEndDate}
            </DetailField>
            <DetailField label={dt("fields.timeZone", "Schedule time zone")} empty={!recordedScheduleZone}>
              {recordedScheduleZone}
            </DetailField>
            <DetailField label={dt("fields.reschedulePending", "Reschedule pending")}>
              {schedule?.reschedulePending || booking.rescheduleRequest?.status === "pending"
                ? t("common.yes")
                : t("common.no")}
            </DetailField>
          </dl>
          {!recordedScheduleZone ? (
            <NoticeList notices={[{ code: "SCHEDULE_TIMEZONE_NOT_RECORDED", severity: "info", entity: "schedule" }]} />
          ) : null}
        </DetailCard>

        <DetailCard title={dt("overview.location", "Service address")}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailField label={dt("fields.address", "Address")} empty={!location?.address}>{location?.address}</DetailField>
            <DetailField label={dt("fields.city", "City")} empty={!location?.city}>{location?.city}</DetailField>
            <DetailField label={dt("fields.postalCode", "Postal code")} empty={!location?.postalCode}>{location?.postalCode}</DetailField>
            <DetailField label={dt("fields.country", "Country")} empty={!location?.country}>{location?.country}</DetailField>
          </dl>
        </DetailCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DetailCard
          title={
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-500" />
              {dt("overview.quote", "Quotation")}
            </span>
          }
        >
          {!quoteNumber && currentVersion == null && professionalTotal == null ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-600">
              {dt("overview.noQuote", "No quotation recorded for this booking.")}
            </p>
          ) : null}
          <dl className="space-y-3">
            <DetailField label={dt("fields.quotationNumber", "Quotation number")} empty={!quoteNumber}>
              <a
                href={quoteAnchors.version}
                className="font-mono text-xs text-indigo-700 underline"
                onClick={(event) => {
                  event.preventDefault()
                  onSelectTab("quotation", quoteAnchors.version.includes("#") ? `#${quoteAnchors.version.split("#")[1]}` : "#quotation")
                }}
              >
                {quoteNumber}
              </a>
            </DetailField>
            <DetailField label={dt("fields.currentVersion", "Current version")} empty={currentVersion == null}>
              {currentVersion != null ? `v${currentVersion}` : null}
            </DetailField>
            <DetailField label={dt("fields.acceptedVersion", "Accepted version")} empty={acceptedVersion?.version == null}>
              {acceptedVersion?.version != null ? (
                <>
                  <span className="font-mono text-xs">v{acceptedVersion.version}</span>
                  {acceptedVersion.source === "inferred_current" ? (
                    <ProvenanceBadge tone="amber">{dt("fields.inferred", "inferred")}</ProvenanceBadge>
                  ) : null}
                </>
              ) : null}
            </DetailField>
            <DetailField label={dt("fields.quoteStatus", "Quote status")} empty={!quoteStatus}>
              <StatusText value={quoteStatus} />
            </DetailField>
            <DetailField label={dt("fields.professionalTotal", "Professional amount (excl. commission)")} empty={professionalTotal == null}>
              <MoneyText amount={professionalTotal} currency={quoteCurrency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.validUntil", "Valid until")} empty={!validUntil}>
              {formatCalendarDate(validUntil, intl) || validUntil}
            </DetailField>
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={quoteAnchors.version}
              className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              onClick={(event) => {
                event.preventDefault()
                onSelectTab("quotation", quoteAnchors.version.includes("#") ? `#${quoteAnchors.version.split("#")[1]}` : "#quotation")
              }}
            >
              {dt("overview.openQuotation", "Open quotation details")}
            </a>
          </div>
        </DetailCard>

        <DetailCard
          title={
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-indigo-500" />
              {dt("overview.payment", "Payment")}
            </span>
          }
        >
          <dl className="space-y-3">
            <DetailField label={dt("fields.paymentStatus", "Payment status")} empty={!payment?.status && !booking.payment?.status}>
              <StatusText value={payment?.status || booking.payment?.status} />
            </DetailField>
            <DetailField label={dt("fields.netAmount", "Net amount")} empty={(payment?.netAmount ?? booking.payment?.netAmount) == null}>
              <MoneyText amount={payment?.netAmount ?? booking.payment?.netAmount} currency={currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.vatAmount", "VAT amount")} empty={(payment?.vatAmount ?? booking.payment?.vatAmount) == null}>
              <MoneyText amount={payment?.vatAmount ?? booking.payment?.vatAmount} currency={currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.totalWithVat", "Total incl. VAT")} empty={(payment?.totalWithVat ?? booking.payment?.totalWithVat) == null}>
              <MoneyText amount={payment?.totalWithVat ?? booking.payment?.totalWithVat} currency={currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.discount", "Discount")} empty={(payment?.discountTotal ?? booking.payment?.discount?.totalDiscount) == null}>
              <MoneyText
                amount={payment?.discountTotal ?? booking.payment?.discount?.totalDiscount}
                currency={currency}
                formatMoney={formatMoney}
              />
            </DetailField>
            <DetailField label={dt("fields.refunded", "Refunded")} empty={(payment?.refundedTotal ?? booking.payment?.refundAmount) == null}>
              <MoneyText amount={payment?.refundedTotal ?? booking.payment?.refundAmount} currency={currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.currency", "Currency")} empty={!currency}>{currency}</DetailField>
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => onSelectTab("payments")}
              className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {dt("overview.openPayments", "Open payment records")}
            </button>
          </div>
        </DetailCard>

        <DetailCard
          title={
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
              {dt("overview.warranty", "Warranty & extras")}
            </span>
          }
        >
          <dl className="space-y-3">
            <DetailField
              label={dt("fields.warrantyDuration", "Warranty duration")}
              empty={!durationLabel(warranty?.duration)}
            >
              <DurationText duration={warranty?.duration} />
            </DetailField>
            <DetailField label={dt("fields.warrantyStart", "Warranty starts")} empty={!warranty?.startsAt}>
              {formatCalendarDate(warranty?.startsAt, intl) || warranty?.startsAt}
            </DetailField>
            <DetailField label={dt("fields.warrantyEnd", "Warranty ends")} empty={!warranty?.endsAt}>
              {formatCalendarDate(warranty?.endsAt, intl) || warranty?.endsAt}
            </DetailField>
            <DetailField label={dt("fields.warrantySource", "Warranty source")} empty={!warranty?.source}>
              <EnumText prefix="details.enums.warrantySource" value={warranty?.source} />
            </DetailField>
            <DetailField label={dt("fields.extraCostsProfessional", "Completion extras (professional amount)")} empty={(extraCostsTotal ?? booking.extraCostTotal) == null}>
              <MoneyText
                amount={(extraCostsTotal ?? booking.extraCostTotal) as number | null | undefined}
                currency={extraCostsCurrency}
                formatMoney={formatMoney}
              />
            </DetailField>
            <DetailField label={dt("fields.extraCostsStatus", "Completion extras status")} empty={!extraCosts?.status && !booking.extraCostStatus}>
              <StatusText value={extraCosts?.status || booking.extraCostStatus} />
            </DetailField>
          </dl>
        </DetailCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PartyCard
          title={
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-600" />
              {dt("parties.customer", "Customer")}
            </span>
          }
          party={parties?.customer || (booking.customer ? {
            id: booking.customer._id,
            name: booking.customer.name,
            username: booking.customer.username,
            customerType: booking.customer.customerType,
            businessName: booking.customer.businessName,
            email: booking.customer.email,
            phone: booking.customer.phone,
            vatNumber: viewerRole === "admin" ? booking.customer.vatNumber : null,
            address: booking.customer.location,
            timeZone: booking.customer.timezone,
          } : null)}
          role="customer"
          labels={{
            name: dt("parties.name", "Name"),
            username: dt("parties.username", "Username"),
            businessName: dt("parties.businessName", "Business name"),
            email: dt("parties.email", "Email"),
            phone: dt("parties.phone", "Phone"),
            vat: dt("parties.vat", "VAT number"),
            website: dt("parties.website", "Website"),
            city: dt("parties.city", "City"),
            postalCode: dt("parties.postalCode", "Postal code"),
            country: dt("parties.country", "Country"),
            timeZone: dt("parties.timeZone", "Time zone"),
            customerType: dt("parties.customerType", "Customer type"),
          }}
        />
        <PartyCard
          title={
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-600" />
              {dt("parties.professional", "Professional")}
            </span>
          }
          party={parties?.professional || (booking.professional ? {
            id: booking.professional._id,
            name: viewerRole === "customer" ? null : booking.professional.name,
            username: booking.professional.username,
            companyName: booking.professional.businessInfo?.companyName,
            email: viewerRole === "admin" ? booking.professional.email : null,
            phone: viewerRole === "admin" ? booking.professional.phone : null,
            vatNumber: viewerRole === "admin" ? booking.professional.businessInfo?.vatNumber : null,
            website: booking.professional.businessInfo?.website,
            address: booking.professional.location,
            timeZone: booking.professional.businessInfo?.timezone,
          } : null)}
          role="professional"
          labels={{
            name: dt("parties.name", "Name"),
            username: dt("parties.username", "Username"),
            businessName: dt("parties.businessName", "Business name"),
            email: dt("parties.email", "Email"),
            phone: dt("parties.phone", "Phone"),
            vat: dt("parties.vat", "VAT number"),
            website: dt("parties.website", "Website"),
            city: dt("parties.city", "City"),
            postalCode: dt("parties.postalCode", "Postal code"),
            country: dt("parties.country", "Country"),
            timeZone: dt("parties.timeZone", "Time zone"),
            customerType: dt("parties.customerType", "Customer type"),
          }}
        />
      </div>

      <DetailCard
        title={dt("overview.provenance", "Record provenance")}
        description={dt("overview.provenanceDescription", "Recorded snapshot values are never replaced by current project settings.")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge tone={snapshotRecorded ? "emerald" : "amber"}>
            {snapshotRecorded
              ? dt("overview.snapshotRecorded", "Booking-time snapshot recorded")
              : dt("overview.snapshotMissing", "Legacy: booking-time snapshot not recorded")}
          </ProvenanceBadge>
          {snapshot?.capturedAt ? (
            <span className="text-xs text-gray-600">
              {dt("overview.capturedAt", "Captured {date}", {
                date: formatInstant(snapshot.capturedAt, intl, displayTimeZone.timeZone) || snapshot.capturedAt,
              })}
            </span>
          ) : null}
          {snapshot?.authority ? (
            <Badge variant="outline" className="text-[10px] capitalize">
              {snapshot.authority.replace(/_/g, " ")}
            </Badge>
          ) : null}
        </div>
        {!snapshotRecorded && liveProject ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">{dt("overview.liveProjectReference", "Current project reference (live)")}</p>
            <p className="mt-0.5">{dt("overview.liveProjectWarning", "This is today's project data and may differ from the original booking. It is not the recorded agreement.")}</p>
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <DetailField label={dt("fields.title", "Title")} empty={!liveProject.title}>{liveProject.title}</DetailField>
              <DetailField label={dt("fields.category", "Category")} empty={!liveProject.category}>{liveProject.category}</DetailField>
              <DetailField label={dt("fields.service", "Service")} empty={!liveProject.service}>{liveProject.service}</DetailField>
            </dl>
            {booking.project?._id ? (
              <button
                type="button"
                onClick={() => onSelectTab("booking")}
                className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                {dt("overview.openBookingData", "Open booking data")}
              </button>
            ) : null}
          </div>
        ) : null}
        <NoticeList notices={notices} />
      </DetailCard>

      <AdminReferencesCard links={visibleAdminLinks} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelectTab("booking")}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {dt("overview.openBookingData", "Booking data")}
        </button>
        <button
          type="button"
          onClick={() => onSelectTab("quotation")}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {dt("tabs.quotation", "Quotation")}
        </button>
        <button
          type="button"
          onClick={() => onSelectTab("payments")}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {dt("tabs.payments", "Payments")}
        </button>
        <button
          type="button"
          onClick={() => onSelectTab("activity")}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {dt("tabs.activity", "Activity")}
        </button>
      </div>
    </div>
  )
}
