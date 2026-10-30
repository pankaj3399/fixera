"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { useCurrency } from "@/contexts/CurrencyContext"
import {
  activityAmountRows,
  activityQualityNoteKey,
  activityTitleKey,
  activityTypeFallback,
  buildAdminDetailLinks,
  buildQuoteAnchors,
  formatCalendarDate,
  formatInstant,
  groupActivityByDay,
  quotationVersionLabel,
  resolveActivityItems,
  recordedScheduleTimeZone,
} from "@/lib/bookingDetails"
import type { ActivityItem, BookingDetailsDto, DetailViewerRole, RawBookingRecord } from "@/types/bookingDetails"
import { useAdminAccess } from "@/hooks/useAdminAccess"
import {
  AttachmentLinks,
  DetailCard,
  EnumText,
  MoneyText,
  NotRecorded,
  ProvenanceBadge,
  StatusText,
  TimeZoneNote,
  useDetailDisplayTimeZone,
  useDetailT,
} from "./DetailPrimitives"

interface ActivityPanelProps {
  booking: RawBookingRecord
  details: BookingDetailsDto | null
  viewerRole: DetailViewerRole | null
  pathname: string
  search: string
}

function ScheduleValue({
  schedule,
  intl,
}: {
  schedule?: {
    scheduledStartDate?: string | null
    scheduledStartTime?: string | null
    scheduledExecutionEndDate?: string | null
    scheduledBufferEndDate?: string | null
    preferredStartDate?: string | null
  } | null
  intl: string
}) {
  if (!schedule) return <NotRecorded />
  const start = formatCalendarDate(schedule.scheduledStartDate || schedule.preferredStartDate, intl) || schedule.scheduledStartDate
  const end = formatCalendarDate(schedule.scheduledExecutionEndDate, intl) || schedule.scheduledExecutionEndDate
  const parts = [
    start,
    schedule.scheduledStartTime,
    end ? `→ ${end}` : null,
    schedule.scheduledBufferEndDate ? `buffer → ${formatCalendarDate(schedule.scheduledBufferEndDate, intl) || schedule.scheduledBufferEndDate}` : null,
  ].filter(Boolean)
  if (parts.length === 0) return <NotRecorded />
  return <span>{parts.join(" ")}</span>
}

function ActivityEvent({
  item,
  viewerRole,
  pathname,
  search,
  claimAdminHref,
  disputeAdminHref,
  timeZone,
}: {
  item: ActivityItem
  viewerRole: DetailViewerRole | null
  pathname: string
  search: string
  claimAdminHref: string | null
  disputeAdminHref: string | null
  timeZone: string
}) {
  const t = useTranslations("bookings")
  const dt = useDetailT()
  const { intl } = useFormatLocale()
  const { formatMoney } = useCurrency()

  const backendTitleKey = item.titleKey
    ? item.titleKey.startsWith("details.")
      ? item.titleKey
      : `details.${item.titleKey}`
    : activityTitleKey(item.type)
  const title = t.has(backendTitleKey as never)
    ? (t as unknown as (key: string, values?: Record<string, string | number | boolean>) => string)(
        backendTitleKey,
        item.titleParams
      )
    : t.has(activityTitleKey(item.type) as never)
    ? t(activityTitleKey(item.type) as never)
    : activityTypeFallback(item.type)
  const actor = item.actor
  const actorLabel = actor?.name
    ? actor.name
    : item.actorRecorded === false
    ? dt("fields.actorNotRecorded", "actor not recorded")
    : actor?.role === "system"
    ? dt("activity.systemActor", "System")
    : actor?.id
    ? dt("fields.actorNameUnknown", "recorded user (name unavailable)")
    : dt("fields.actorNotRecorded", "actor not recorded")
  const actorRole = actor?.role && actor.role !== "unknown" && actor.role !== "system" ? actor.role : null
  const quotationNumber = item.metadata?.quotationNumber || item.references?.quotationNumber || null
  const quotationVersion = item.metadata?.version ?? item.references?.version ?? null
  const claimNumber = item.metadata?.claimNumber || item.references?.claimNumber || null
  const disputeType = item.metadata?.disputeType || item.references?.disputeType || null
  const quotationHref =
    quotationVersion != null
      ? buildQuoteAnchors(pathname, search, quotationVersion).version
      : quotationNumber
      ? buildQuoteAnchors(pathname, search, null).overview
      : null
  const amountRows = activityAmountRows(item)
  const cancellationStage =
    item.metadata?.stage ||
    (typeof item.titleParams?.stage === "string" ? item.titleParams.stage : null)
  const statusLabel = item.statusTo
    ? t.has(`status.${item.statusTo}` as never)
      ? t(`status.${item.statusTo}` as never)
      : item.statusTo.replace(/_/g, " ")
    : null
  const descriptionSource =
    item.descriptionSource === "user"
      ? dt("activity.sourceUser", "recorded user")
      : item.descriptionSource === "admin"
      ? dt("activity.sourceAdmin", "administrator")
      : item.descriptionSource === "system"
      ? dt("activity.sourceSystem", "system")
      : item.descriptionSource
  const claimHref = claimNumber && claimAdminHref
    ? `/admin/warranty-claims?search=${encodeURIComponent(claimNumber)}`
    : claimAdminHref

  return (
    <li className="relative pl-7">
      <span className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-indigo-200 bg-white">
        <span className={`h-1.5 w-1.5 rounded-full ${item.category === "payment" || item.category === "refund" ? "bg-emerald-500" : item.category === "cancellation" || item.category === "dispute" ? "bg-rose-500" : "bg-indigo-500"}`} />
      </span>
      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{title}</span>
              {cancellationStage && item.type.startsWith("cancellation") ? (
                <ProvenanceBadge>
                  <EnumText prefix="details.enums.cancellationStage" value={cancellationStage} />
                </ProvenanceBadge>
              ) : null}
              {statusLabel ? <ProvenanceBadge>{statusLabel}</ProvenanceBadge> : null}
              {item.dataQuality?.legacyDerived || item.legacyDerived ? (
                <ProvenanceBadge tone="amber">{dt("activity.legacyDerived", "derived from legacy record")}</ProvenanceBadge>
              ) : null}
            </span>
            <span className="mt-0.5 block text-xs text-gray-600">
              {actorLabel}
              {actorRole ? (
                <span className="text-gray-400">
                  {" "}· <EnumText prefix="details.enums.actorRole" value={actorRole} />
                </span>
              ) : null}
            </span>
          </span>
          <span className="flex items-center gap-2 text-[11px] text-gray-500">
            <span>{formatInstant(item.occurredAt, intl, timeZone) || dt("activity.dateNotRecorded", "Date not recorded")}</span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-xs">
          {item.description ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.description", "Description")}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-gray-800">{item.description}</p>
              {descriptionSource && item.descriptionSource !== "not_recorded" ? (
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {dt("activity.descriptionSource", "Recorded {source}", { source: descriptionSource })}
                  {item.descriptionLocale === "en"
                    ? ` · ${dt("activity.recordedInEnglish", "language recorded as English")}`
                    : null}
                </p>
              ) : null}
            </div>
          ) : null}

          {item.statusFrom || item.statusTo ? (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.previousStatus", "Previous status")}</dt>
                <dd className="mt-0.5 text-gray-800">{item.statusFrom ? <StatusText value={item.statusFrom} /> : <NotRecorded />}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.newStatus", "New status")}</dt>
                <dd className="mt-0.5 text-gray-800">{item.statusTo ? <StatusText value={item.statusTo} /> : <NotRecorded />}</dd>
              </div>
            </dl>
          ) : null}

          {item.metadata?.previousSchedule || item.metadata?.proposedSchedule ? (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.previousSchedule", "Original schedule")}</dt>
                <dd className="mt-0.5 text-gray-800"><ScheduleValue schedule={item.metadata?.previousSchedule} intl={intl} /></dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.proposedSchedule", "New schedule")}</dt>
                <dd className="mt-0.5 text-gray-800"><ScheduleValue schedule={item.metadata?.proposedSchedule} intl={intl} /></dd>
              </div>
            </dl>
          ) : null}

          {amountRows.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.amounts", "Recorded amounts")}</p>
              <ul className="mt-0.5 space-y-0.5">
                {amountRows.map((amount, index) =>
                  amount.amount == null ? null : (
                    <li key={`${amount.kind}-${index}`} className="flex flex-wrap justify-between gap-2 text-gray-800">
                      <span className="capitalize">
                        {amount.kind
                          ? dt(`activity.amountKinds.${amount.kind}`, amount.kind.replace(/_/g, " "))
                          : dt("fields.amount", "Amount")}
                      </span>
                      <span className="tabular-nums">
                        <MoneyText
                          amount={amount.amount}
                          currency={amount.currency || null}
                          formatMoney={formatMoney}
                        />
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}

          {quotationNumber || quotationHref ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-gray-500">
                {quotationVersionLabel(quotationNumber, quotationVersion) || ""}
              </span>
              {quotationHref ? (
                <a href={quotationHref} className="text-[11px] text-indigo-700 underline">
                  {dt("activity.openQuotation", "Open quotation version")}
                </a>
              ) : null}
            </div>
          ) : null}

          {claimNumber && viewerRole === "admin" && claimHref ? (
            <a href={claimHref} className="inline-block text-[11px] text-slate-700 underline">
              {dt("activity.openWarrantyAdmin", "Open warranty claim (admin)")}: {claimNumber}
            </a>
          ) : null}
          {disputeType && viewerRole === "admin" && disputeAdminHref ? (
            <a href={disputeAdminHref} className="inline-block text-[11px] text-slate-700 underline">
              {dt("activity.openDisputesAdmin", "Open disputes (admin)")}
            </a>
          ) : null}

          {Array.isArray(item.attachments) && item.attachments.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("activity.attachments", "Attachments")}</p>
              <AttachmentLinks attachments={item.attachments} />
            </div>
          ) : null}

        </div>
      </details>
    </li>
  )
}

export function ActivityPanel({ booking, details, viewerRole, pathname, search }: ActivityPanelProps) {
  const dt = useDetailT()
  const { intl } = useFormatLocale()
  const { can } = useAdminAccess()
  const role = viewerRole || "customer"
  const items = useMemo(() => resolveActivityItems(details, booking as never, role), [booking, details, role])
  const displayTimeZone = useDetailDisplayTimeZone(
    recordedScheduleTimeZone(details, booking.scheduleTimeZone)
  )
  const groups = useMemo(
    () => groupActivityByDay(items, displayTimeZone.timeZone),
    [items, displayTimeZone.timeZone]
  )
  const activity = details?.activity

  const adminLinks = buildAdminDetailLinks({
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
  })
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
  const claimAdminHref = visibleAdminLinks.find((link) => link.key === "warranty")?.href || null
  const disputeAdminHref = visibleAdminLinks.find((link) => link.key === "disputes")?.href || null

  return (
    <div className="space-y-4">
      <DetailCard
        title={dt("activity.title", "Activity history")}
        description={dt("activity.descriptionLong", "Chronological, day-grouped events from recorded booking data. Expand an event for its details.")}
      >
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <ProvenanceBadge tone={activity?.complete === false ? "amber" : "emerald"}>
            {activity?.complete === false
              ? dt("activity.partial", "Some history may be unavailable")
              : dt("activity.complete", "Recorded history")}
          </ProvenanceBadge>
          <span>{dt("activity.eventCount", "{count} events", { count: items.length })}</span>
          {details?.meta?.legacy ? <ProvenanceBadge tone="amber">{dt("activity.legacy", "Legacy record")}</ProvenanceBadge> : null}
        </div>
        <TimeZoneNote timeZone={displayTimeZone.timeZone} recorded={displayTimeZone.recorded} />
        {activity?.dataQuality?.notes && activity.dataQuality.notes.length > 0 ? (
          <ul className="space-y-1 text-[11px] text-gray-500">
            {activity.dataQuality.notes.map((note) => (
              <li key={note}>
                {dt(activityQualityNoteKey(note), note.replace(/_/g, " ").toLowerCase())}
              </li>
            ))}
          </ul>
        ) : null}
      </DetailCard>

      {items.length === 0 ? (
        <DetailCard title={dt("activity.emptyTitle", "No activity recorded")}>
          <p className="text-xs text-gray-600">{dt("activity.empty", "No timestamped activity is available for this booking yet.")}</p>
        </DetailCard>
      ) : (
        groups.map((group) => (
          <DetailCard
            key={group.key}
            title={
              group.undated
                ? dt("activity.undated", "Date not recorded")
                : formatCalendarDate(group.key, intl) || group.key
            }
            description={dt("activity.eventsOnDay", "{count} events", { count: group.items.length })}
          >
            <ol className="relative space-y-2 border-l border-indigo-100 pl-4">
              {group.items.map((item) => (
                <ActivityEvent
                  key={item.id}
                  item={item}
                  viewerRole={viewerRole}
                  pathname={pathname}
                  search={search}
                  claimAdminHref={claimAdminHref}
                  disputeAdminHref={disputeAdminHref}
                  timeZone={displayTimeZone.timeZone}
                />
              ))}
            </ol>
          </DetailCard>
        ))
      )}
    </div>
  )
}
