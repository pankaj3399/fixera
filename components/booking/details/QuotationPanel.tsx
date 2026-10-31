"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import {
  buildLegacyActivity,
  buildQuoteAnchors,
  dedupeActivity,
  durationLabel,
  formatCalendarDate,
  formatInstant,
  quotationVersionLabel,
  quoteVersionStatus,
  resolveQuotationVersionFromUrl,
  sortActivity,
  recordedScheduleTimeZone,
} from "@/lib/bookingDetails"
import type {
  ActivityItem,
  BookingDetailsDto,
  QuotationVersionDto,
  RawBookingRecord,
} from "@/types/bookingDetails"
import {
  AttachmentLinks,
  DetailCard,
  DetailField,
  DurationText,
  EnumText,
  MoneyText,
  NotRecorded,
  NoticeList,
  PercentText,
  ProvenanceBadge,
  ScheduleSummary,
  StatusText,
  TimeZoneNote,
  useDetailDisplayTimeZone,
  useDetailT,
} from "./DetailPrimitives"
import { QuestionAnswerList } from "./BookingDataPanel"

interface QuotationPanelProps {
  booking: RawBookingRecord
  details: BookingDetailsDto | null
  pathname: string
  search: string
}

function ActivityHistory({ items, timeZone }: { items: ActivityItem[]; timeZone: string }) {
  const dt = useDetailT()
  const { intl } = useFormatLocale()
  const t = useTranslations("bookings")
  if (items.length === 0) return <NotRecorded />
  return (
    <ol className="space-y-2">
      {items.map((item) => {
        const quotationNumber = item.metadata?.quotationNumber || item.references?.quotationNumber
        const version = item.metadata?.version ?? item.references?.version
        return (
        <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs font-semibold text-gray-900">
              {t.has(`details.activity.types.${item.type}` as never)
                ? t(`details.activity.types.${item.type}` as never)
                : item.type.replace(/_/g, " ")}
            </p>
            <span className="text-[11px] text-gray-500">
              {formatInstant(item.occurredAt, intl, timeZone) || dt("activity.dateNotRecorded", "date not recorded")}
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span>
              {item.actor?.name || (item.actorRecorded === false ? (
                dt("fields.actorNotRecorded", "actor not recorded")
              ) : item.actor?.role ? (
                <EnumText prefix="details.enums.actorRole" value={item.actor.role} />
              ) : (
                dt("activity.systemActor", "system")
              ))}
            </span>
            {item.statusTo ? <StatusText value={item.statusTo} /> : null}
          </p>
          {item.description ? <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{item.description}</p> : null}
          {quotationNumber ? (
            <p className="mt-1 font-mono text-[11px] text-gray-500">
              {quotationVersionLabel(quotationNumber, version)}
            </p>
          ) : null}
          {Array.isArray(item.attachments) && item.attachments.length > 0 ? (
            <div className="mt-2"><AttachmentLinks attachments={item.attachments} /></div>
          ) : null}
        </li>
        )
      })}
    </ol>
  )
}

export function QuotationPanel({ booking, details, pathname, search }: QuotationPanelProps) {
  const t = useTranslations("bookings")
  const dt = useDetailT()
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()
  const copyRef = useRef<HTMLDivElement | null>(null)
  const [copied, setCopied] = useState(false)
  const displayTimeZone = useDetailDisplayTimeZone(
    recordedScheduleTimeZone(details, booking.scheduleTimeZone)
  )

  const quotation = details?.quotation
  const versions: QuotationVersionDto[] = useMemo(() => {
    if (Array.isArray(quotation?.versions) && quotation.versions.length > 0) return quotation.versions
    return (booking.quoteVersions || []).map((version) => ({
      ...version,
      quotationNumber: version.quotationNumber || booking.quotationNumber || null,
    }))
  }, [booking.quotationNumber, booking.quoteVersions, quotation?.versions])

  const currentVersion = quotation?.currentVersion ?? booking.currentQuoteVersion ?? versions[versions.length - 1]?.version ?? null
  const [selectedVersion, setSelectedVersion] = useState<number | null>(currentVersion)
  const quotationNumber = quotation?.quotationNumber || versions[0]?.quotationNumber || booking.quotationNumber || null
  const acceptedVersion = quotation?.acceptedVersion || null
  const hasQuotationSummary = Boolean(
    quotationNumber ||
      quotation?.status ||
      versions.length > 0 ||
      quotation?.totalAmountProfessional != null
  )
  const hasLegacyQuote = Boolean(booking.quote)
  const wizard = details?.wizard
  const snapshot = details?.bookingSnapshot
  const rfqQuestions = wizard?.rfqQuestions || snapshot?.questions?.rfq || []
  const rfqAnswers = wizard?.rfq?.answers || booking.rfqData?.answers || []
  const rfqAttachments = booking.rfqData?.attachments || []
  const liveQuestions = rfqQuestions.length === 0 ? booking.project?.rfqQuestions || [] : []
  const effectiveQuestions = rfqQuestions.length > 0 ? rfqQuestions : liveQuestions
  const isLiveQuestions = rfqQuestions.length === 0 && liveQuestions.length > 0

  const selected =
    versions.find((version) => version.version === selectedVersion) ||
    versions.find((version) => version.version === currentVersion) ||
    versions[versions.length - 1] ||
    null

  const selectedStatus = selected ? quoteVersionStatus(selected, details) : null
  const conflictingRejection =
    selected?.rejectedAt && selectedStatus !== "rejected"
      ? formatInstant(selected.rejectedAt, intl, displayTimeZone.timeZone) || selected.rejectedAt
      : null
  const anchors = buildQuoteAnchors(pathname, search, selected?.version ?? currentVersion)
  const acceptedAnchor = acceptedVersion?.version ? buildQuoteAnchors(pathname, search, acceptedVersion.version) : null
  const scheduleSelection = wizard?.scheduleSelection
  const recordedSchedule = details?.bookingSnapshot?.schedule || details?.booking?.schedule || (scheduleSelection ? {
    scheduledStartDate: scheduleSelection.startDate,
    scheduledStartTime: scheduleSelection.startTime,
    scheduledExecutionEndDate: scheduleSelection.executionEndDate,
    scheduledBufferEndDate: scheduleSelection.bufferEndDate,
    timeZone: scheduleSelection.timeZone,
    timeZoneRecorded: Boolean(scheduleSelection.timeZone),
  } : null)
  const recordedScheduleZone =
    recordedSchedule?.timeZoneRecorded === false ? null : recordedSchedule?.timeZone || null

  // One policy for mount, hash changes and browser Back/Forward: an explicit
  // `#quotation-vN` wins; when the hash is removed the panel follows the
  // current version instead of keeping a stale selected card.
  useEffect(() => {
    if (typeof window === "undefined") return
    const applyUrl = () => {
      const fallbackVersion = versions[versions.length - 1]?.version ?? null
      setSelectedVersion(
        resolveQuotationVersionFromUrl(window.location.hash, currentVersion, fallbackVersion)
      )
    }
    applyUrl()
    window.addEventListener("hashchange", applyUrl)
    window.addEventListener("popstate", applyUrl)
    return () => {
      window.removeEventListener("hashchange", applyUrl)
      window.removeEventListener("popstate", applyUrl)
    }
  }, [currentVersion, versions])

  const selectedVersionNumber = selected?.version
  useEffect(() => {
    if (!selectedVersionNumber) return
    // Only an explicit `#quotation-vN` target may scroll. Opening the tab from
    // the tab bar (or ?tab=quotation) must keep the quotation summary visible.
    if (typeof window === "undefined") return
    if (window.location.hash !== `#quotation-v${selectedVersionNumber}`) return
    const target = document.getElementById(`quotation-v${selectedVersionNumber}`)
    if (target) target.scrollIntoView({ block: "start" })
  }, [selectedVersionNumber])

  const history = useMemo(() => {
    const provided = dedupeActivity([...(quotation?.history || []), ...(quotation?.rfqHistory || [])])
    if (provided.length > 0) return provided
    const fallback = details?.activity?.items?.length
      ? details.activity.items
      : buildLegacyActivity(booking)
    return sortActivity(
      fallback.filter(
        (item) =>
          ["rfq", "quotation"].includes(item.category || "") ||
          item.type.startsWith("rfq") ||
          item.type.startsWith("quotation")
      )
    )
  }, [booking, details?.activity?.items, quotation?.history, quotation?.rfqHistory])

  const versionStatus = (version: QuotationVersionDto) => {
    const status = quoteVersionStatus(version, details)
    if (status === "accepted") return dt("quotation.accepted", "accepted")
    if (status === "rejected") return dt("quotation.rejected", "rejected")
    if (status === "current") return dt("quotation.current", "current")
    return dt("quotation.historical", "historical")
  }

  const copyLink = async () => {
    if (typeof window === "undefined") return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${anchors.version}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-4">
      <DetailCard
        title={
          <span className="flex flex-wrap items-center gap-2">
            {dt("quotation.title", "Quotation details")}
            {quotationNumber ? (
              <a href={anchors.version} className="font-mono text-xs text-indigo-700 underline">
                {quotationNumber}
              </a>
            ) : null}
          </span>
        }
        description={dt("quotation.description", "Recorded versions, RFQ answers and quotation history. Professional amounts are the amounts stored on each version.")}
      >
        <NoticeList notices={quotation?.notices} />
        <TimeZoneNote timeZone={displayTimeZone.timeZone} recorded={displayTimeZone.recorded} />
        {!hasQuotationSummary ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-600">
            {hasLegacyQuote
              ? dt("quotation.legacyOnly", "No versioned quotation was recorded. The legacy quotation is shown below.")
              : dt("quotation.noneRecorded", "No quotation has been recorded for this booking.")}
          </p>
        ) : null}
        {hasQuotationSummary ? (
          <>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label={dt("fields.quotationNumber", "Quotation number")} empty={!quotationNumber}>
            <span className="font-mono text-xs">{quotationNumber}</span>
          </DetailField>
          <DetailField label={dt("fields.quoteStatus", "Quote status")} empty={!quotation?.status}>
            <StatusText value={quotation?.status} />
          </DetailField>
          <DetailField label={dt("fields.currentVersion", "Current version")} empty={currentVersion == null}>
            {currentVersion != null ? `v${currentVersion}` : null}
          </DetailField>
          <DetailField label={dt("fields.acceptedVersion", "Accepted version")} empty={acceptedVersion?.version == null}>
            {acceptedVersion?.version != null ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">v{acceptedVersion.version}</span>
                {acceptedVersion.quotationNumber ? (
                  <span className="font-mono text-[11px] text-gray-500">{acceptedVersion.quotationNumber}</span>
                ) : null}
                {acceptedVersion.source === "inferred_current" ? (
                  <ProvenanceBadge tone="amber">{dt("quotation.inferred", "inferred from current version")}</ProvenanceBadge>
                ) : acceptedVersion.source === "not_recorded" ? (
                  <ProvenanceBadge tone="amber">{dt("notRecorded", "Not recorded")}</ProvenanceBadge>
                ) : null}
              </span>
            ) : null}
          </DetailField>
          <DetailField label={dt("fields.currency", "Currency")} empty={!quotation?.currency}>{quotation?.currency}</DetailField>
          <DetailField label={dt("fields.professionalTotal", "Professional total (excl. commission)")} empty={quotation?.totalAmountProfessional == null}>
            <MoneyText amount={quotation?.totalAmountProfessional} currency={quotation?.currency} formatMoney={formatMoney} />
          </DetailField>
          <DetailField label={dt("fields.versionCount", "Versions")}>
            {versions.length > 0 ? versions.length : <NotRecorded />}
          </DetailField>
          <DetailField label={dt("fields.customerPrice", "Customer price")} empty={!selected?.customerTotals}>
            {selected?.customerTotals ? (
              <span className="flex flex-wrap items-center gap-2">
                <MoneyText
                  amount={selected.customerTotals.totalAmount}
                  currency={selected.customerTotals.currency || selected.currency}
                  formatMoney={formatMoney}
                />
                <ProvenanceBadge tone="blue">{dt("quotation.recordedAtSubmit", "recorded when submitted")}</ProvenanceBadge>
              </span>
            ) : null}
          </DetailField>
        </dl>
        {acceptedAnchor ? (
          <p className="text-xs text-gray-600">
            {dt("quotation.acceptedLink", "Accepted quotation")}{" "}
            <a href={acceptedAnchor.version} className="font-mono text-indigo-700 underline">
              {acceptedVersion?.quotationNumber || `v${acceptedVersion?.version}`}
            </a>
            {acceptedVersion?.acceptedAt ? (
              <span className="ml-1 text-gray-500">
                · {dt("quotation.acceptedOn", "accepted {date}", { date: formatInstant(acceptedVersion.acceptedAt, intl, displayTimeZone.timeZone) || acceptedVersion.acceptedAt })}
              </span>
            ) : null}
          </p>
        ) : null}
        {booking.customerRejectionReason ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <p className="font-semibold">{dt("quotation.latestRejection", "Latest customer rejection reason")}</p>
            <p className="mt-0.5 whitespace-pre-wrap">{booking.customerRejectionReason}</p>
          </div>
        ) : null}
          </>
        ) : null}
      </DetailCard>

      <DetailCard
        title={dt("quotation.scheduleTitle", "Recorded service schedule")}
        description={dt("quotation.scheduleNote", "Schedule stored with the booking or quotation. It is not recalculated from the current project.")}
      >
        <ScheduleSummary schedule={recordedSchedule} intl={intl} timeZone={recordedScheduleZone} />
        {!recordedScheduleZone && (recordedSchedule?.scheduledStartDate || recordedSchedule?.scheduledStartTime) ? (
          <NoticeList notices={[{ code: "SCHEDULE_TIMEZONE_NOT_RECORDED", severity: "info", entity: "schedule" }]} />
        ) : null}
      </DetailCard>

      {versions.length > 0 ? (
        <DetailCard
          title={dt("quotation.versions", "Versions")}
          description={dt("quotation.versionsDescription", "Stable links: each version keeps its own number and content.")}
        >
          <ol className="space-y-2">
            {versions.map((version) => {
              const status = quoteVersionStatus(version, details)
              return (
                <li key={version.version}>
                  <a
                    href={buildQuoteAnchors(pathname, search, version.version).version}
                    onClick={(event) => {
                      event.preventDefault()
                      setSelectedVersion(version.version)
                      if (typeof window !== "undefined") {
                        window.history.pushState(null, "", buildQuoteAnchors(pathname, search, version.version).version)
                      }
                    }}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 ${
                      selected?.version === version.version ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">v{version.version}</span>
                      <span className="font-mono text-[11px] text-gray-500">{version.quotationNumber}</span>
                      <BadgeStatus status={status} label={versionStatus(version)} />
                    </span>
                    <span className="flex flex-wrap items-center gap-3 text-gray-600">
                      <span>{formatInstant(version.createdAt, intl, displayTimeZone.timeZone) || dt("activity.dateNotRecorded", "date not recorded")}</span>
                      <span className="tabular-nums">
                        <MoneyText amount={version.totalAmount} currency={version.currency} formatMoney={formatMoney} />
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ol>
        </DetailCard>
      ) : null}

      {selected ? (
        <DetailCard
          id={`quotation-v${selected.version}`}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {dt("quotation.versionTitle", "Version {version}", { version: selected.version })}
              <span className="font-mono text-xs text-gray-500">{selected.quotationNumber}</span>
              <BadgeStatus status={quoteVersionStatus(selected, details)} label={versionStatus(selected)} />
            </span>
          }
          description={
            selected.createdAt
              ? dt("quotation.createdAt", "Created {date}", {
                  date: formatInstant(selected.createdAt, intl, displayTimeZone.timeZone) || selected.createdAt,
                })
              : dt("quotation.createdAtMissing", "Creation time not recorded")
          }
        >
          <div ref={copyRef} className="flex flex-wrap items-center gap-2">
            <a href={anchors.version} className="text-[11px] text-indigo-700 underline">
              {dt("quotation.stableLink", "Stable version link")}
            </a>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
            >
              {copied ? dt("quotation.copied", "Copied") : dt("quotation.copyLink", "Copy link")}
            </button>
          </div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label={dt("fields.scope", "Scope")} empty={!selected.scope}>{selected.scope}</DetailField>
            <DetailField label={dt("fields.quotationNumber", "Quotation number")} empty={!selected.quotationNumber}>
              <span className="font-mono text-xs">{selected.quotationNumber}</span>
            </DetailField>
            <DetailField label={dt("fields.createdBy", "Created by")} empty={!selected.createdBy && selected.actorRecorded !== false}>
              {selected.createdBy ? (
                <span>
                  {selected.createdBy.name || dt("fields.actorNameUnknown", "recorded user (name unavailable)")}
                  {selected.createdBy.role ? (
                    <span className="ml-1 text-[11px] text-gray-500">
                      · <EnumText prefix="details.enums.actorRole" value={selected.createdBy.role} />
                    </span>
                  ) : null}
                </span>
              ) : (
                dt("quotation.actorNotRecorded", "actor not recorded")
              )}
            </DetailField>
            <DetailField label={dt("fields.validUntil", "Valid until")} empty={!selected.validUntil}>
              {formatCalendarDate(selected.validUntil, intl) || selected.validUntil}
            </DetailField>
            <DetailField label={dt("quotation.acceptedAt", "Accepted at")} empty={!selected.acceptedAt}>
              {formatInstant(selected.acceptedAt, intl, displayTimeZone.timeZone)}
            </DetailField>
            {selectedStatus === "rejected" ? (
              <DetailField label={dt("quotation.rejectedAt", "Rejected at")} empty={!selected.rejectedAt}>
                {formatInstant(selected.rejectedAt, intl, displayTimeZone.timeZone)}
              </DetailField>
            ) : null}
            <DetailField label={dt("fields.warranty", "Warranty")} empty={!durationLabel(selected.warrantyDuration)}>
              <DurationText duration={selected.warrantyDuration} />
            </DetailField>
            <DetailField label={dt("fields.materialsIncluded", "Materials included")}>
              {selected.materialsIncluded == null ? <NotRecorded /> : selected.materialsIncluded ? t("common.yes") : t("common.no")}
            </DetailField>
            <DetailField label={dt("fields.preparationDuration", "Preparation")} empty={!durationLabel(selected.preparationDuration)}>
              <DurationText duration={selected.preparationDuration} />
            </DetailField>
            <DetailField label={dt("fields.executionDuration", "Execution")} empty={!durationLabel(selected.executionDuration)}>
              <DurationText duration={selected.executionDuration} />
            </DetailField>
            <DetailField label={dt("fields.bufferDuration", "Buffer")} empty={!durationLabel(selected.bufferDuration)}>
              <DurationText duration={selected.bufferDuration} />
            </DetailField>
            <DetailField label={dt("fields.professionalTotal", "Professional total (excl. commission)")} empty={selected.totalAmount == null}>
              <MoneyText amount={selected.totalAmount} currency={selected.currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.currency", "Currency")} empty={!selected.currency}>{selected.currency}</DetailField>
          </dl>

          {selectedStatus === "rejected" && selected.rejectionReason ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {dt("quotation.rejectionReason", "Recorded rejection reason")}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{selected.rejectionReason}</p>
            </div>
          ) : null}

          {conflictingRejection ? (
            <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {dt(
                "quotation.rejectionTimestampConflict",
                "Backend data also contains a rejection timestamp for this version ({date}), but the version is {status}. The timestamp is shown as recorded and does not change the status.",
                { date: conflictingRejection, status: versionStatus(selected) }
              )}
            </p>
          ) : null}

          {selected.description ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("fields.description", "Description")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{selected.description}</p>
            </div>
          ) : null}

          {Array.isArray(selected.materials) && selected.materials.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("fields.materialsList", "Materials")}</p>
              <ul className="mt-1 space-y-1 text-xs text-gray-700">
                {selected.materials.map((material, index) => (
                  <li key={`${material.name}-${index}`}>
                    {material.name}
                    {material.quantity != null ? ` × ${material.quantity}` : ""}
                    {material.unit ? ` ${material.unit}` : ""}
                    {material.description ? ` — ${material.description}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("quotation.pricingLines", "Pricing lines (professional net)")}</p>
            {Array.isArray(selected.pricingLines) && selected.pricingLines.length > 0 ? (
              <div className="mt-1 overflow-x-auto rounded-md border">
                <table className="w-full min-w-[34rem] text-xs">
                  <thead className="bg-slate-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">{dt("fields.description", "Description")}</th>
                      <th className="px-3 py-2 text-right font-medium">{dt("fields.netAmount", "Net amount")}</th>
                      <th className="px-3 py-2 text-right font-medium">{dt("fields.vatRate", "VAT rate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.pricingLines.map((line, index) => (
                      <tr key={`${line.description}-${index}`} className="border-t">
                        <td className="px-3 py-2 text-gray-800">
                          <div>{line.description}</div>
                          {line.quantity != null ? (
                            <div className="text-[10px] text-gray-500">
                              {line.quantity}
                              {line.unit ? ` ${line.unit}` : ""}
                            </div>
                          ) : null}
                          {line.vatLabel || line.vatCountry ? (
                            <div className="text-[10px] text-gray-500">{[line.vatLabel, line.vatCountry].filter(Boolean).join(" · ")}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <MoneyText amount={line.price} currency={selected.currency} formatMoney={formatMoney} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.vatRate == null ? <NotRecorded /> : `${line.vatRate}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-1"><NotRecorded /></div>
            )}
          </div>

          {selected.customerTotals ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-semibold text-blue-900">{dt("quotation.customerSnapshot", "Customer price recorded with this version")}</p>
              <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DetailField label={dt("fields.professionalNet", "Professional net")} empty={selected.customerTotals.professionalNetAmount == null}>
                  <MoneyText amount={selected.customerTotals.professionalNetAmount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.customerNet", "Customer net")} empty={selected.customerTotals.customerNetAmount == null}>
                  <MoneyText amount={selected.customerTotals.customerNetAmount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.amountBeforeDiscounts", "Amount before discounts")} empty={selected.customerTotals.amountBeforeDiscounts == null}>
                  <MoneyText amount={selected.customerTotals.amountBeforeDiscounts} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.vatRate", "VAT rate")} empty={selected.customerTotals.vatRate == null}>
                  <PercentText value={selected.customerTotals.vatRate} />
                </DetailField>
                <DetailField label={dt("fields.vatAmount", "VAT amount")} empty={selected.customerTotals.vatAmount == null}>
                  <MoneyText amount={selected.customerTotals.vatAmount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.totalWithVat", "Total incl. VAT")} empty={selected.customerTotals.totalWithVat == null && selected.customerTotals.totalAmount == null}>
                  <MoneyText amount={selected.customerTotals.totalWithVat ?? selected.customerTotals.totalAmount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.commission", "Commission")} empty={selected.customerTotals.commissionPercent == null}>
                  {selected.customerTotals.commissionPercent != null ? `${selected.customerTotals.commissionPercent}%` : null}
                </DetailField>
                <DetailField label={dt("fields.recordedAt", "Recorded at")} empty={!selected.customerTotals.recordedAt}>
                  {formatInstant(selected.customerTotals.recordedAt, intl, displayTimeZone.timeZone)}
                </DetailField>
                <DetailField label={dt("fields.loyaltyDiscount", "Loyalty discount")} empty={selected.customerTotals.discount?.loyaltyAmount == null}>
                  <MoneyText amount={selected.customerTotals.discount?.loyaltyAmount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.repeatBuyer", "Repeat buyer discount")} empty={selected.customerTotals.discount?.repeatBuyerAmount == null}>
                  <MoneyText amount={selected.customerTotals.discount?.repeatBuyerAmount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.pointsDiscount", "Points discount")} empty={selected.customerTotals.discount?.pointsDiscountAmount == null}>
                  <MoneyText amount={selected.customerTotals.discount?.pointsDiscountAmount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.codeDiscount", "Discount code")} empty={selected.customerTotals.discount?.codeDiscountAmount == null}>
                  <MoneyText amount={selected.customerTotals.discount?.codeDiscountAmount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
                <DetailField label={dt("fields.totalDiscount", "Total discount")} empty={selected.customerTotals.discount?.totalDiscount == null}>
                  <MoneyText amount={selected.customerTotals.discount?.totalDiscount} currency={selected.customerTotals.currency || selected.currency} formatMoney={formatMoney} />
                </DetailField>
              </dl>
              <p className="mt-1 text-[11px] text-blue-800">
                {dt("quotation.customerSnapshotNote", "Recorded quote-time amount. The final payment amount is in the Payments tab.")}
              </p>
            </div>
          ) : (
            <NoticeList
              notices={[
                {
                  code: "QUOTE_CUSTOMER_PRICING_NOT_RECORDED",
                  severity: "warning",
                  entity: "quotation",
                },
              ]}
            />
          )}

          {selected.serviceLocation ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("quotation.serviceLocation", "Service address for this version")}</p>
              <p className="mt-1 text-xs text-gray-700">
                {[selected.serviceLocation.address, selected.serviceLocation.city, selected.serviceLocation.postalCode, selected.serviceLocation.country]
                  .filter(Boolean)
                  .join(", ") || dt("notRecorded", "Not recorded")}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              {dt("quotation.serviceLocationMissing", "Service address was not recorded with this version.")}
            </p>
          )}

          {selected.termsAndConditions ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("quotation.terms", "Terms and conditions")}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{selected.termsAndConditions}</p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              {dt("quotation.termsMissing", "No separate quotation terms were recorded for this version; the recorded scope, description, materials and pricing lines above are the terms.")}
            </p>
          )}

          {Array.isArray(selected.milestones) && selected.milestones.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("quotation.milestones", "Payment milestones")}</p>
              <ul className="mt-1 space-y-1 text-xs text-gray-700">
                {selected.milestones.map((milestone, index) => (
                  <li key={`${milestone.title}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <span>
                      {milestone.title}
                      {milestone.dueCondition ? <span className="ml-2 text-[10px] text-gray-500"><EnumText prefix="details.enums.dueCondition" value={milestone.dueCondition} /></span> : null}
                    </span>
                    <span className="tabular-nums">
                      <MoneyText amount={milestone.amount} currency={selected.currency} formatMoney={formatMoney} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selected.changeNote ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("quotation.changeNote", "Change note")}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{selected.changeNote}</p>
            </div>
          ) : null}
        </DetailCard>
      ) : booking.quote ? null : (
        <DetailCard title={dt("quotation.noVersions", "Quotation versions")}>
          <NotRecorded />
        </DetailCard>
      )}

      {booking.quote && versions.length === 0 ? (
        <DetailCard
          title={dt("quotation.legacyTitle", "Legacy quotation")}
          description={dt("quotation.legacyDescription", "The old quote format is shown as stored. It has no version history.")}
        >
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label={dt("fields.professionalTotal", "Professional total (excl. commission)")} empty={booking.quote.amount == null}>
              <MoneyText amount={booking.quote.amount} currency={booking.quote.currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.currency", "Currency")} empty={!booking.quote.currency}>{booking.quote.currency}</DetailField>
            <DetailField label={dt("fields.validUntil", "Valid until")} empty={!booking.quote.validUntil}>
              {formatCalendarDate(booking.quote.validUntil, intl) || booking.quote.validUntil}
            </DetailField>
            <DetailField label={dt("fields.createdAt", "Created")} empty={!booking.quote.submittedAt}>
              {formatInstant(booking.quote.submittedAt, intl, displayTimeZone.timeZone) || booking.quote.submittedAt}
            </DetailField>
          </dl>
          {booking.quote.description ? (
            <p className="whitespace-pre-wrap text-sm text-gray-800">{booking.quote.description}</p>
          ) : null}
          {Array.isArray(booking.quote.breakdown) && booking.quote.breakdown.length > 0 ? (
            <ul className="space-y-1 text-xs text-gray-700">
              {booking.quote.breakdown.map((line, index) => (
                <li key={`${line.item}-${index}`} className="flex flex-wrap justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <span>{line.item}</span>
                  <span className="tabular-nums">
                    <MoneyText amount={line.totalPrice ?? line.amount ?? line.unitPrice} currency={booking.quote?.currency} formatMoney={formatMoney} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {booking.quote.termsAndConditions ? (
            <p className="whitespace-pre-wrap text-xs text-gray-700">{booking.quote.termsAndConditions}</p>
          ) : null}
        </DetailCard>
      ) : null}

      <DetailCard
        title={dt("quotation.rfqWizard", "RFQ wizard data")}
        description={dt("quotation.rfqWizardDescription", "Questions, answers and attachments recorded with the request.")}
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label={dt("fields.serviceType", "Service type")} empty={!wizard?.rfq?.serviceType && !booking.rfqData?.serviceType}>
            {wizard?.rfq?.serviceType || booking.rfqData?.serviceType}
          </DetailField>
          <DetailField label={dt("fields.urgency", "Urgency")} empty={!wizard?.rfq?.urgency && !booking.rfqData?.urgency}>
            <EnumText prefix="urgency" value={wizard?.rfq?.urgency || booking.rfqData?.urgency} />
          </DetailField>
          <DetailField label={dt("fields.preferredStart", "Preferred start")} empty={!wizard?.rfq?.preferredStartDate && !booking.rfqData?.preferredStartDate}>
            {formatCalendarDate(wizard?.rfq?.preferredStartDate || booking.rfqData?.preferredStartDate, intl) ||
              wizard?.rfq?.preferredStartDate ||
              booking.rfqData?.preferredStartDate}
          </DetailField>
          <DetailField label={dt("fields.budget", "Budget")} empty={!wizard?.rfq?.budget && !booking.rfqData?.budget}>
            {(() => {
              const budget = wizard?.rfq?.budget || booking.rfqData?.budget
              if (!budget) return null
              const budgetCurrency = budget.currency || null
              if (budget.min != null && budget.max != null) {
                return (
                  <span>
                    <MoneyText amount={budget.min} currency={budgetCurrency} formatMoney={formatMoney} /> –{" "}
                    <MoneyText amount={budget.max} currency={budgetCurrency} formatMoney={formatMoney} />
                  </span>
                )
              }
              const one = budget.min ?? budget.max
              return one != null ? (
                <MoneyText amount={one} currency={budgetCurrency} formatMoney={formatMoney} />
              ) : null
            })()}
          </DetailField>
        </dl>
        {wizard?.rfq?.description || booking.rfqData?.description ? (
          <p className="whitespace-pre-wrap text-sm text-gray-800">{wizard?.rfq?.description || booking.rfqData?.description}</p>
        ) : null}
        {wizard?.rfq?.additionalNotes || booking.rfqData?.additionalNotes ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.additionalNotes", "Additional notes")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{wizard?.rfq?.additionalNotes || booking.rfqData?.additionalNotes}</p>
          </div>
        ) : null}
        {effectiveQuestions.length > 0 ? (
          <QuestionAnswerList
            questions={effectiveQuestions}
            answers={rfqAnswers}
            sourceLabel={isLiveQuestions ? dt("booking.liveProjectData", "current project (live)") : undefined}
            emptyAnsweredLabel={dt("booking.unanswered", "Not answered")}
          />
        ) : rfqAnswers.length > 0 ? (
          <ul className="space-y-1.5">
            {rfqAnswers.map((answer, index) => (
              <li key={`${answer.question}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-medium text-gray-900">{answer.question}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-gray-800">{answer.answer}</p>
              </li>
            ))}
          </ul>
        ) : (
          <NotRecorded />
        )}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("booking.rfqAttachments", "RFQ attachments")}</p>
          <div className="mt-1">
            {wizard?.rfq?.attachments && wizard.rfq.attachments.length > 0 ? (
              <AttachmentLinks attachments={wizard.rfq.attachments} />
            ) : rfqAttachments.length > 0 ? (
              <NoticeList notices={[{ code: "ATTACHMENT_UNAVAILABLE", severity: "info", entity: "quotation" }]} />
            ) : (
              <NotRecorded />
            )}
          </div>
        </div>
      </DetailCard>

      <DetailCard
        title={dt("quotation.history", "RFQ & quotation history")}
        description={dt("quotation.historyDescription", "Recorded events with their stored actor and time; no inferred steps.")}
      >
        <ActivityHistory items={history} timeZone={displayTimeZone.timeZone} />
      </DetailCard>
    </div>
  )
}

function BadgeStatus({ status, label }: { status: string; label: string }) {
  const tone =
    status === "accepted"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "rejected"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status === "current"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-slate-200 bg-slate-50 text-slate-600"
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>{label}</span>
}
