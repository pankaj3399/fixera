"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  describeAnswer,
  dedupeNotices,
  durationLabel,
  fileLabel,
  formatCalendarDate,
  formatInstant,
  formatTimeZoneLabel,
  isSafeHttpUrl,
  isValidTimeZone,
  noticeFallback,
  noticeKey,
  recordedNumber,
  viewerTimeZone,
} from "@/lib/bookingDetails"
import type { AttachmentDto, DetailsNotice, PartyDto } from "@/types/bookingDetails"

/**
 * Safe translator for the additive `details.*` namespace: the localized key is
 * used when present, otherwise the English fallback keeps a partially
 * translated install readable instead of throwing at runtime.
 */
export function useDetailT() {
  const t = useTranslations("bookings")
  return (key: string, fallback: string, values?: Record<string, string | number | boolean>) => {
    const full = `details.${key}`
    const has = (t.has as unknown as (k: string) => boolean)(full)
    if (!has) return fallback
    try {
      return (t as unknown as (k: string, v?: Record<string, string | number | boolean>) => string)(full, values)
    } catch {
      return fallback
    }
  }
}

/**
 * One display zone for every recorded instant in the detail view: the
 * booking's recorded IANA zone when present, otherwise the viewer's browser
 * zone. The first render uses UTC on both server and client so hydration is
 * deterministic; the viewer zone is applied on mount.
 */
export function useDetailDisplayTimeZone(recordedTimeZone?: string | null) {
  const [browserTimeZone, setBrowserTimeZone] = useState<string | null>(null)
  useEffect(() => {
    if (isValidTimeZone(recordedTimeZone)) return
    setBrowserTimeZone(viewerTimeZone())
  }, [recordedTimeZone])
  const recorded = isValidTimeZone(recordedTimeZone) ? recordedTimeZone : null
  return {
    timeZone: recorded || browserTimeZone || "UTC",
    recorded: Boolean(recorded),
  }
}

export function TimeZoneNote({
  timeZone,
  recorded,
}: {
  timeZone: string | null | undefined
  recorded: boolean
}) {
  const dt = useDetailT()
  const { intl } = useFormatLocale()
  if (!timeZone) return null
  const label = formatTimeZoneLabel(timeZone, intl) || timeZone
  return (
    <p className="text-[11px] text-gray-500">
      {recorded
        ? dt("timeZone.recorded", "Record timestamps use the booking time zone: {zone}.", { zone: label })
        : dt("timeZone.viewer", "No booking time zone was recorded; record timestamps use your browser time zone: {zone}.", {
            zone: label,
          })}
    </p>
  )
}

export function DetailCard({
  title,
  description,
  children,
  className,
  id,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <Card id={id} className={cn("bg-white/90 border-slate-100 shadow-sm scroll-mt-24", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-gray-900">{title}</CardTitle>
        {description ? <p className="text-xs text-gray-500">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">{children}</CardContent>
    </Card>
  )
}

export function NotRecorded({ label }: { label?: string }) {
  const t = useTranslations("bookings")
  return (
    <span className="inline-flex items-center rounded border border-dashed border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
      {label || t("details.notRecorded")}
    </span>
  )
}

export function DetailField({
  label,
  children,
  empty,
  className,
}: {
  label: ReactNode
  children?: ReactNode
  empty?: boolean
  className?: string
}) {
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="break-words text-sm text-gray-900">
        {empty || children === null || children === undefined || children === "" ? <NotRecorded /> : children}
      </dd>
    </div>
  )
}

export function MoneyText({
  amount,
  currency,
  formatMoney,
  className,
}: {
  amount: number | null | undefined
  currency: string | null | undefined
  formatMoney: (amount: number, currencyCode?: string | null) => string
  className?: string
}) {
  const t = useTranslations("bookings")
  const recorded = recordedNumber(amount)
  if (recorded == null) return <NotRecorded />
  if (!currency) {
    return (
      <span className={cn("inline-flex flex-wrap items-baseline gap-1 tabular-nums", className)}>
        <span>{recorded}</span>
        <span className="text-[10px] font-normal text-gray-500">{t("details.currencyNotRecorded")}</span>
      </span>
    )
  }
  return <span className={cn("tabular-nums", className)}>{formatMoney(recorded, currency)}</span>
}

export function PercentText({ value }: { value: number | null | undefined }) {
  const recorded = recordedNumber(value)
  return recorded == null ? <NotRecorded /> : <span className="tabular-nums">{recorded}%</span>
}

export function StatusText({ value, capitalize = false }: { value?: string | null; capitalize?: boolean }) {
  const t = useTranslations("bookings")
  if (!value) return <NotRecorded />
  const key = `status.${value}`
  if ((t.has as unknown as (k: string) => boolean)(key)) {
    return <>{t(key as never)}</>
  }
  return <span className={capitalize ? "capitalize" : undefined}>{value.replace(/_/g, " ")}</span>
}

export function EnumText({ prefix, value }: { prefix: string; value?: string | null }) {
  const t = useTranslations("bookings")
  if (!value) return <NotRecorded />
  const key = `${prefix}.${value}`
  if ((t.has as unknown as (k: string) => boolean)(key)) {
    return <>{t(key as never)}</>
  }
  return <span className="capitalize">{value.replace(/_/g, " ")}</span>
}

export function DurationText({
  duration,
}: {
  duration: { value?: number | null; unit?: string | null } | null | undefined
}) {
  const parsed = durationLabel(duration)
  if (!parsed) return <NotRecorded />
  return (
    <>
      {parsed.value} <EnumText prefix="unit" value={parsed.unit} />
    </>
  )
}

export function ProvenanceBadge({
  children,
  tone = "slate",
}: {
  children: ReactNode
  tone?: "slate" | "emerald" | "amber" | "blue"
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  }
  return <Badge variant="outline" className={cn("text-[10px] font-medium", tones[tone])}>{children}</Badge>
}

export function NoticeList({
  notices,
  className,
}: {
  notices?: DetailsNotice[] | null
  className?: string
}) {
  const t = useTranslations("bookings")
  const deduped = dedupeNotices(notices)
  if (deduped.length === 0) return null
  return (
    <ul className={cn("space-y-1.5", className)}>
      {deduped.map((notice) => {
        const key = noticeKey(notice.code)
        const message =
          key && (t.has as unknown as (k: string) => boolean)(key)
            ? (t as unknown as (k: string) => string)(key)
            : noticeFallback(notice.code)
        return (
          <li
            key={notice.code}
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              notice.severity === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-blue-100 bg-blue-50 text-blue-800"
            )}
          >
            {message}
          </li>
        )
      })}
    </ul>
  )
}

export function AttachmentLinks({
  attachments,
  emptyLabel,
}: {
  attachments?: AttachmentDto[] | null
  emptyLabel?: string
}) {
  const t = useTranslations("bookings")
  const entries = (attachments || []).filter(
    (attachment) =>
      Boolean(attachment?.url) || Boolean(attachment?.fileName) || Boolean(attachment?.unavailableReason)
  )
  if (entries.length === 0) {
    return emptyLabel ? <p className="text-xs text-gray-500">{emptyLabel}</p> : null
  }
  return (
    <ul className="space-y-1.5">
      {entries.map((attachment, index) => {
        const href = isSafeHttpUrl(attachment.url) ? attachment.url : null
        const label = attachment.fileName || t("details.fileNumber", { number: index + 1 })
        if (href) {
          return (
            <li key={`${href}-${index}`}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-indigo-700 hover:bg-slate-100"
              >
                <span className="truncate pr-3">{attachment.fileName || fileLabel(href, label)}</span>
                <span className="shrink-0 font-medium">{t("details.open")}</span>
              </a>
            </li>
          )
        }
        // A recorded attachment whose signed URL is unavailable stays visible
        // as a fact. The raw storage key/provider reason is never rendered.
        return (
          <li
            key={`unavailable-${index}-${attachment.unavailableReason || "unknown"}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-gray-600"
          >
            <span className="truncate pr-3">{label}</span>
            <span className="shrink-0 font-medium text-amber-700">{t("details.notices.attachmentUnavailable")}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function AnswerValue({ value, enumPrefix }: { value: unknown; enumPrefix?: string }) {
  const t = useTranslations("bookings")
  const { intl } = useFormatLocale()
  const display = describeAnswer(value)
  switch (display.kind) {
    case "empty":
      return <span className="text-xs italic text-gray-500">{t("details.answerEmpty")}</span>
    case "empty_array":
      return <span className="text-xs italic text-gray-500">{t("details.answerEmptyList")}</span>
    case "boolean":
      return <span className="text-sm">{display.value ? t("common.yes") : t("common.no")}</span>
    case "number":
      return <span className="tabular-nums text-sm">{String(display.value)}</span>
    case "date":
      return <span className="text-sm">{formatCalendarDate(display.value, intl) || display.value}</span>
    case "file":
      return (
        <a
          href={display.value}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-indigo-700 underline break-all"
        >
          {fileLabel(display.value, t("details.openAttachment"))}
        </a>
      )
    case "array":
      return (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {display.items.map((entry, index) => (
            <li key={index}>
              <AnswerValue value={entry} enumPrefix={enumPrefix} />
            </li>
          ))}
        </ul>
      )
    case "object":
      return (
        <dl className="space-y-0.5 text-xs">
          {display.entries.map((entry) => (
            <div key={entry.key} className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-gray-600">{entry.key.replace(/[_-]+/g, " ")}</dt>
              <dd className="text-gray-900">
                <AnswerValue value={entry.value} enumPrefix={enumPrefix} />
              </dd>
            </div>
          ))}
        </dl>
      )
    default: {
      if (enumPrefix) {
        const key = `${enumPrefix}.${display.value}`
        if ((t.has as unknown as (k: string) => boolean)(key)) {
          return <>{t(key as never)}</>
        }
      }
      return <span className="whitespace-pre-wrap break-words text-sm">{display.value}</span>
    }
  }
}

export function PartyCard({
  title,
  party,
  role,
  labels,
}: {
  title: ReactNode
  party?: PartyDto | null
  role: "customer" | "professional"
  labels: {
    name: string
    username: string
    businessName: string
    email: string
    phone: string
    vat: string
    website: string
    city: string
    postalCode: string
    country: string
    timeZone: string
    customerType: string
  }
}) {
  const t = useTranslations("bookings")
  if (!party) {
    return (
      <DetailCard title={title}>
        <NotRecorded />
      </DetailCard>
    )
  }
  return (
    <DetailCard title={title}>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DetailField label={labels.name} empty={!party.name}>{party.name}</DetailField>
        <DetailField label={labels.username} empty={!party.username}>{party.username}</DetailField>
        {role === "customer" ? (
          <>
            <DetailField label={labels.customerType} empty={!party.customerType}>
              <EnumText prefix="details.enums.customerType" value={party.customerType} />
            </DetailField>
            <DetailField label={labels.businessName} empty={!party.businessName}>
              {party.businessName}
            </DetailField>
          </>
        ) : (
          <DetailField label={labels.businessName} empty={!party.companyName && !party.businessName}>
            {party.companyName || party.businessName}
          </DetailField>
        )}
        <DetailField label={labels.email} empty={!party.email}>{party.email}</DetailField>
        <DetailField label={labels.phone} empty={!party.phone}>{party.phone}</DetailField>
        <DetailField label={labels.vat} empty={!party.vatNumber}>{party.vatNumber}</DetailField>
        {role === "professional" ? (
          <DetailField label={labels.website} empty={!party.website}>
            {party.website && isSafeHttpUrl(party.website) ? (
              <a href={party.website} target="_blank" rel="noreferrer noopener" className="break-all text-indigo-700 underline">
                {party.website}
              </a>
            ) : (
              party.website
            )}
          </DetailField>
        ) : null}
        <DetailField label={labels.city} empty={!party.address?.city}>{party.address?.city}</DetailField>
        <DetailField label={labels.postalCode} empty={!party.address?.postalCode}>{party.address?.postalCode}</DetailField>
        <DetailField label={labels.country} empty={!party.address?.country}>{party.address?.country}</DetailField>
        <DetailField label={labels.timeZone} empty={!party.timeZone}>{party.timeZone}</DetailField>
      </dl>
      <p className="text-[11px] text-gray-500">{t("details.partyContactNote")}</p>
    </DetailCard>
  )
}

export function ScheduleSummary({
  schedule,
  intl,
  timeZone,
}: {
  schedule?: {
    preferredStartDate?: string | null
    preferredStartTime?: string | null
    scheduledStartDate?: string | null
    scheduledStartTime?: string | null
    scheduledExecutionEndDate?: string | null
    scheduledBufferStartDate?: string | null
    scheduledBufferEndDate?: string | null
  } | null
  intl: string
  timeZone?: string | null
}) {
  const startValue = schedule?.scheduledStartDate || schedule?.preferredStartDate
  const startDate = formatCalendarDate(startValue, intl)
  const startTime = schedule?.scheduledStartTime || schedule?.preferredStartTime
  const endDate = formatCalendarDate(schedule?.scheduledExecutionEndDate, intl)
  const bufferStart = formatCalendarDate(schedule?.scheduledBufferStartDate, intl)
  const bufferEnd = formatCalendarDate(schedule?.scheduledBufferEndDate, intl)
  return (
    <div className="space-y-1 text-xs text-gray-700">
      <p>
        {startDate || startValue ? (
          <>
            <span className="text-gray-500">{`${startTime || ""} ${startDate || startValue || ""}`.trim()}</span>
            {endDate || schedule?.scheduledExecutionEndDate ? <> → {endDate || schedule?.scheduledExecutionEndDate}</> : null}
          </>
        ) : (
          <NotRecorded />
        )}
      </p>
      {bufferStart || bufferEnd ? (
        <p className="text-gray-500">
          {bufferStart} → {bufferEnd}
        </p>
      ) : null}
      {timeZone ? (
        <p className="text-[11px] text-gray-500">{formatTimeZoneLabel(timeZone, intl) || timeZone}</p>
      ) : null}
    </div>
  )
}

export function InstantLine({
  value,
  intl,
  label,
  timeZone,
}: {
  value?: string | null
  intl: string
  label: string
  timeZone?: string | null
}) {
  const formatted = formatInstant(value, intl, timeZone)
  if (!formatted) return null
  return (
    <p className="text-[11px] text-gray-500">
      {label}: {formatted}
    </p>
  )
}
