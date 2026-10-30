"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import {
  formatInstant,
  isSafeHttpUrl,
  ownRecordedCurrency,
  recordedNumber,
  recordedScheduleTimeZone,
} from "@/lib/bookingDetails"
import type {
  BookingDetailsDto,
  ExtraCostsDetailsDto,
  PaymentRecordDto,
  RawBookingRecord,
  RefundDto,
  RoleInvoiceDto,
} from "@/types/bookingDetails"
import {
  AttachmentLinks,
  DetailCard,
  DetailField,
  EnumText,
  InstantLine,
  MoneyText,
  NotRecorded,
  NoticeList,
  PercentText,
  ProvenanceBadge,
  StatusText,
  TimeZoneNote,
  useDetailDisplayTimeZone,
  useDetailT,
} from "./DetailPrimitives"

interface PaymentsPanelProps {
  booking: RawBookingRecord
  details: BookingDetailsDto | null
  viewerRole: "customer" | "professional" | "admin" | null
}

type NewPaymentFields = PaymentRecordDto & {
  extraCostCustomerNetAmount?: number | null;
  extraCostVatAmount?: number | null;
  extraCostCustomerDiscount?: number | null;
  extraCostLoyaltyTier?: string | null;
  extraCostLoyaltyPercentage?: number | null;
  extraCostStatus?: string | null;
  extraCostAmount?: number | null;
  extraCostPaidAt?: string | null;
  refundAmount?: number | null;
  refundReason?: string | null;
  transferStatus?: string | null;
  transferAmount?: number | null;
  transferCurrency?: string | null;
  transferAttemptedAt?: string | null;
};

type InvoiceT = (k: string, f: string, v?: Record<string, string | number | boolean>) => string

function InvoiceDocument({
  title,
  number,
  generatedAt,
  pdfUrl,
  ublUrl,
  relatedNumber,
  peppolStatus,
  peppolReference,
  peppolDispatchedAt,
  dt,
  intl,
  timeZone,
}: {
  title: string
  number: string | null | undefined
  generatedAt: string | null | undefined
  pdfUrl: string | null | undefined
  ublUrl: string | null | undefined
  relatedNumber?: string | null
  peppolStatus?: string | null
  peppolReference?: string | null
  peppolDispatchedAt?: string | null
  dt: InvoiceT
  intl: string
  timeZone: string
}) {
  const pdf = isSafeHttpUrl(pdfUrl) ? pdfUrl : null
  const ubl = isSafeHttpUrl(ublUrl) ? ublUrl : null
  if (!number && !pdf && !ubl && !generatedAt) return null
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-semibold text-gray-800">{title}</p>
      <p className="break-words text-xs text-gray-600">{number || dt("payments.generated", "Generated")}</p>
      {generatedAt ? (
        <p className="text-[11px] text-gray-500">
          {dt("payments.generatedAt", "Generated {date}", {
            date: formatInstant(generatedAt, intl, timeZone) || generatedAt,
          })}
        </p>
      ) : null}
      {relatedNumber ? (
        <p className="break-words text-[11px] text-gray-500">
          {dt("payments.relatedInvoice", "Related invoice: {number}", { number: relatedNumber })}
        </p>
      ) : null}
      {(pdf || ubl) ? (
        <div className="flex flex-wrap gap-2">
          {pdf ? (
            <a href={pdf} target="_blank" rel="noreferrer noopener" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-indigo-700 hover:bg-slate-50">
              {dt("payments.downloadPdf", "Download PDF")}
            </a>
          ) : null}
          {ubl ? (
            <a href={ubl} target="_blank" rel="noreferrer noopener" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-indigo-700 hover:bg-slate-50">
              {dt("payments.downloadUbl", "Download UBL")}
            </a>
          ) : null}
        </div>
      ) : null}
      {peppolStatus ? (
        <div className="text-[11px] text-gray-500">
          <p>
            {dt("payments.peppolStatusLabel", "Peppol status:")}{" "}
            <EnumText prefix="details.enums.peppolStatus" value={peppolStatus} />
          </p>
          {peppolReference ? (
            <p className="break-words">{dt("payments.peppolReference", "Peppol reference: {reference}", { reference: peppolReference })}</p>
          ) : null}
          {peppolDispatchedAt ? (
            <p>
              {dt("payments.peppolDispatchedAt", "Peppol dispatched {date}", {
                date: formatInstant(peppolDispatchedAt, intl, timeZone) || peppolDispatchedAt,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function invoiceRows(
  invoice: RoleInvoiceDto | null | undefined,
  viewerRole: string | null,
  dt: InvoiceT,
  intl: string,
  timeZone: string
) {
  if (!invoice) return null
  const showCustomer = viewerRole !== "professional"
  const showSupplier = viewerRole !== "customer"
  const history = Array.isArray(invoice.invoiceArtifactHistory) ? invoice.invoiceArtifactHistory : []
  const manualClaims = Array.isArray(invoice.manualArtifactClaims) ? invoice.manualArtifactClaims : []
  return (
    <div className="space-y-4">
      {showCustomer ? (
        <>
          <InvoiceDocument
            title={dt("payments.customerInvoice", "Customer invoice (FIX)")}
            number={invoice.invoiceNumber}
            generatedAt={invoice.invoiceGeneratedAt}
            pdfUrl={invoice.invoiceUrl}
            ublUrl={invoice.invoiceUblUrl}
            peppolStatus={invoice.peppolDispatchStatus}
            peppolReference={invoice.peppolDispatchReference}
            peppolDispatchedAt={invoice.peppolDispatchedAt}
            dt={dt}
            intl={intl}
            timeZone={timeZone}
          />
          <InvoiceDocument
            title={dt("payments.creditNote", "Credit note")}
            number={invoice.creditNoteNumber}
            generatedAt={invoice.creditNoteGeneratedAt}
            pdfUrl={invoice.creditNoteUrl}
            ublUrl={invoice.creditNoteUblUrl}
            relatedNumber={invoice.creditNoteRelatedInvoiceNumber}
            dt={dt}
            intl={intl}
            timeZone={timeZone}
          />
        </>
      ) : null}
      {showSupplier ? (
        <>
          <InvoiceDocument
            title={dt("payments.supplierInvoice", "Supplier self-bill (SUP)")}
            number={invoice.supplierInvoiceNumber}
            generatedAt={invoice.supplierInvoiceGeneratedAt}
            pdfUrl={invoice.supplierInvoiceUrl}
            ublUrl={invoice.supplierInvoiceUblUrl}
            peppolStatus={invoice.supplierPeppolDispatchStatus}
            peppolReference={invoice.supplierPeppolDispatchReference}
            peppolDispatchedAt={invoice.supplierPeppolDispatchedAt}
            dt={dt}
            intl={intl}
            timeZone={timeZone}
          />
          <InvoiceDocument
            title={dt("payments.supplierCreditNote", "Supplier credit note")}
            number={invoice.supplierCreditNoteNumber}
            generatedAt={invoice.supplierCreditNoteGeneratedAt}
            pdfUrl={invoice.supplierCreditNoteUrl}
            ublUrl={invoice.supplierCreditNoteUblUrl}
            relatedNumber={invoice.supplierCreditNoteRelatedInvoiceNumber}
            dt={dt}
            intl={intl}
            timeZone={timeZone}
          />
        </>
      ) : null}
      {history.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-800">{dt("payments.artifactHistory", "Replaced documents")}</p>
          <ul className="space-y-1 text-[11px] text-gray-600">
            {history.map((entry, index) => (
              <li key={`${entry.side}-${entry.documentType}-${entry.invoiceNumber}-${index}`} className="break-words">
                {[
                  entry.side ? dt(`payments.artifactSide.${entry.side}`, entry.side) : null,
                  entry.documentType
                    ? dt(`payments.artifactType.${entry.documentType}`, entry.documentType.replace(/_/g, " "))
                    : null,
                  entry.invoiceNumber,
                  entry.replacedAt
                    ? dt("payments.replacedAt", "replaced {date}", {
                        date: formatInstant(entry.replacedAt, intl, timeZone) || entry.replacedAt,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {isSafeHttpUrl(entry.invoiceUrl) ? (
                  <>
                    {" · "}
                    <a href={entry.invoiceUrl} target="_blank" rel="noreferrer noopener" className="text-indigo-700 underline">
                      {dt("payments.downloadPdf", "Download PDF")}
                    </a>
                  </>
                ) : null}
                {isSafeHttpUrl(entry.invoiceUblUrl) ? (
                  <>
                    {" · "}
                    <a href={entry.invoiceUblUrl} target="_blank" rel="noreferrer noopener" className="text-indigo-700 underline">
                      {dt("payments.downloadUbl", "Download UBL")}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {manualClaims.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-800">{dt("payments.manualClaims", "Document claims")}</p>
          <ul className="space-y-1 text-[11px] text-gray-600">
            {manualClaims.map((entry, index) => (
              <li key={`${entry.side}-${entry.documentType}-${entry.invoiceNumber}-${index}`} className="break-words">
                {[
                  entry.side ? dt(`payments.artifactSide.${entry.side}`, entry.side) : null,
                  entry.documentType
                    ? dt(`payments.artifactType.${entry.documentType}`, entry.documentType.replace(/_/g, " "))
                    : null,
                  entry.invoiceNumber || dt("payments.documentNumberNotRecorded", "number not recorded"),
                  entry.createdAt
                    ? dt("payments.claimedAt", "claimed {date}", {
                        date: formatInstant(entry.createdAt, intl, timeZone) || entry.createdAt,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function transferForRecord(
  record: NewPaymentFields,
  bookingPayment: NewPaymentFields | null
): { status?: string | null; currency?: string | null; amount?: number | null; attemptedAt?: string | null } | null {
  const recorded = record.transfer || null
  // The base Payment row stores transfer status/time, while the historical
  // transfer amount/currency live on the booking payment subdocument. They are
  // the same logical payout; use the subdocument only for the base record and
  // only for fields the row did not record.
  const base = record.kind !== "milestone" ? bookingPayment : null
  if (!recorded && !base) return null
  const transfer = {
    status: recorded?.status ?? base?.transferStatus ?? null,
    currency: recorded?.currency ?? base?.transferCurrency ?? null,
    amount: recorded?.amount ?? base?.transferAmount ?? null,
    attemptedAt: recorded?.attemptedAt ?? base?.transferAttemptedAt ?? null,
  }
  return transfer.status || transfer.amount != null || transfer.attemptedAt ? transfer : null
}

function PaymentRecordCard({
  record,
  viewerRole,
  dt,
  formatMoney,
  intl,
  timeZone,
  bookingPayment,
}: {
  record: NewPaymentFields
  viewerRole: "customer" | "professional" | "admin" | null
  dt: (k: string, f: string, v?: Record<string, string | number | boolean>) => string
  formatMoney: (amount: number, currencyCode?: string | null) => string
  intl: string
  timeZone: string
  bookingPayment: NewPaymentFields | null
}) {
  const t = useTranslations("bookings")
  const currency = ownRecordedCurrency(record)
  const showProfessionalSide = viewerRole === "professional" || viewerRole === "admin"
  const stamp = record.timestamps
  const transfer = transferForRecord(record, bookingPayment)
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-gray-900">
            {record.kind === "milestone"
              ? dt("payments.recordMilestone", "Milestone payment")
              : record.kind === "legacy_unknown"
              ? dt("payments.recordLegacy", "Legacy payment record")
              : dt("payments.recordBase", "Payment at booking")}
          </p>
          {record.status ? (
            <ProvenanceBadge tone={record.status === "completed" || record.status === "paid" ? "emerald" : "slate"}>
              <StatusText value={record.status} />
            </ProvenanceBadge>
          ) : null}
          {record.method ? <ProvenanceBadge><EnumText prefix="details.enums.paymentMethod" value={record.method} /></ProvenanceBadge> : null}
        </div>
        <span className="text-xs font-semibold tabular-nums text-gray-900">
          <MoneyText amount={record.totalWithVat} currency={currency} formatMoney={formatMoney} />
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DetailField label={dt("fields.charge", "Charged (incl. VAT)")} empty={record.totalWithVat == null}>
          <MoneyText amount={record.totalWithVat} currency={currency} formatMoney={formatMoney} />
        </DetailField>
        <DetailField label={dt("fields.netAmount", "Net amount")} empty={record.netAmount == null && record.amount == null}>
          <MoneyText amount={record.netAmount ?? record.amount} currency={currency} formatMoney={formatMoney} />
        </DetailField>
        <DetailField label={dt("fields.vatRate", "VAT rate")} empty={record.vatRate == null}>
          <PercentText value={record.vatRate} />
        </DetailField>
        <DetailField label={dt("fields.vatAmount", "VAT amount")} empty={record.vatAmount == null}>
          <MoneyText amount={record.vatAmount} currency={currency} formatMoney={formatMoney} />
        </DetailField>
        <DetailField label={dt("fields.currency", "Currency")} empty={!currency}>
          {currency}
        </DetailField>
        <DetailField label={dt("fields.reverseCharge", "Reverse charge")}>
          {record.reverseCharge == null ? <NotRecorded /> : record.reverseCharge ? t("common.yes") : t("common.no")}
        </DetailField>
        {showProfessionalSide ? (
          <>
            <DetailField label={dt("fields.platformCommission", "Platform commission")} empty={record.platformCommission == null}>
              <MoneyText amount={record.platformCommission} currency={currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.professionalPayout", "Professional payout")} empty={record.professionalPayout == null}>
              <MoneyText amount={record.professionalPayout} currency={currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.stripeFee", "Payment provider fee (stored estimate)")} empty={record.stripeFeeAmount == null}>
              <MoneyText amount={record.stripeFeeAmount} currency={currency} formatMoney={formatMoney} />
            </DetailField>
          </>
        ) : null}
      </dl>

      {transfer && showProfessionalSide ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            {dt("payments.transfer", "Payout transfer")}
          </p>
          <dl className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <DetailField label={dt("fields.status", "Status")} empty={!transfer.status}>
              {transfer.status ? <StatusText value={transfer.status} /> : null}
            </DetailField>
            <DetailField label={dt("payments.transferAmount", "Transfer amount")} empty={transfer.amount == null}>
              <MoneyText amount={transfer.amount} currency={transfer.currency || null} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("payments.transferAttemptedAt", "Transfer attempted")} empty={!transfer.attemptedAt}>
              {formatInstant(transfer.attemptedAt, intl, timeZone)}
            </DetailField>
          </dl>
        </div>
      ) : null}

      {Array.isArray(record.vatBreakdown) && record.vatBreakdown.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("payments.vatBreakdown", "VAT breakdown")}</p>
          <div className="mt-1 overflow-x-auto rounded border">
            <table className="w-full min-w-[30rem] text-xs">
              <thead className="bg-slate-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{dt("fields.description", "Description")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{dt("fields.netAmount", "Net")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{dt("fields.vatRate", "VAT")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{dt("fields.vatAmount", "VAT amount")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{dt("fields.totalWithVat", "Total")}</th>
                </tr>
              </thead>
              <tbody>
                {record.vatBreakdown.map((line, index) => (
                  <tr key={`${line.description}-${index}`} className="border-t">
                    <td className="px-2 py-1.5">
                      <div>{line.description}</div>
                      {line.vatLabel || line.vatCountry ? <div className="text-[10px] text-gray-500">{[line.vatLabel, line.vatCountry].filter(Boolean).join(" · ")}</div> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums"><MoneyText amount={line.netAmount} currency={currency} formatMoney={formatMoney} /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{line.vatRate == null ? <NotRecorded /> : `${line.vatRate}%`}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums"><MoneyText amount={line.vatAmount} currency={currency} formatMoney={formatMoney} /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums"><MoneyText amount={line.totalAmount} currency={currency} formatMoney={formatMoney} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {record.discount ? (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("payments.discounts", "Discounts and coupons (recorded)")}</p>
          <dl className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DetailField label={dt("fields.originalAmount", "Original amount")} empty={record.discount.originalAmount == null}>
              <MoneyText amount={record.discount.originalAmount} currency={currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.loyaltyDiscount", "Loyalty discount")} empty={record.discount.loyaltyAmount == null}>
              <span>
                <MoneyText amount={record.discount.loyaltyAmount} currency={currency} formatMoney={formatMoney} />
                {record.discount.loyaltyTier ? <span className="ml-1 text-[11px] text-gray-500">{record.discount.loyaltyTier}</span> : null}
                {record.discount.loyaltyPercentage != null ? <span className="ml-1 text-[11px] text-gray-500">({record.discount.loyaltyPercentage}%)</span> : null}
              </span>
            </DetailField>
            <DetailField label={dt("fields.repeatBuyer", "Repeat buyer discount")} empty={record.discount.repeatBuyerAmount == null}>
              <MoneyText amount={record.discount.repeatBuyerAmount} currency={currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.pointsDiscount", "Points discount")} empty={record.discount.pointsDiscountAmount == null}>
              <span>
                <MoneyText amount={record.discount.pointsDiscountAmount} currency={currency} formatMoney={formatMoney} />
                {record.discount.pointsRedeemed != null ? <span className="ml-1 text-[11px] text-gray-500">({record.discount.pointsRedeemed} pts)</span> : null}
              </span>
            </DetailField>
            <DetailField label={dt("fields.codeDiscount", "Discount code")} empty={record.discount.codeDiscountAmount == null}>
              <span>
                <MoneyText amount={record.discount.codeDiscountAmount} currency={currency} formatMoney={formatMoney} />
                {record.discount.codeLabel ? <span className="ml-1 font-mono text-[11px] text-gray-500">{record.discount.codeLabel}</span> : null}
              </span>
            </DetailField>
            <DetailField label={dt("fields.totalDiscount", "Total discount")} empty={record.discount.totalDiscount == null}>
              <MoneyText amount={record.discount.totalDiscount} currency={currency} formatMoney={formatMoney} />
            </DetailField>
          </dl>
        </div>
      ) : null}

      {record.originalCurrency && record.originalCurrency !== currency ? (
        <p className="mt-2 text-[11px] text-gray-500">
          {dt("payments.originalCurrency", "Original currency: {currency} (no conversion applied)", { currency: record.originalCurrency })}
          {record.fxRate != null ? ` · ${dt("payments.fxRate", "recorded rate {rate}", { rate: String(record.fxRate) })}` : ""}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        <InstantLine value={stamp?.authorizedAt} intl={intl} timeZone={timeZone} label={dt("payments.authorizedAt", "Authorized")} />
        <InstantLine value={stamp?.capturedAt} intl={intl} timeZone={timeZone} label={dt("payments.capturedAt", "Captured")} />
        <InstantLine value={stamp?.paidAt} intl={intl} timeZone={timeZone} label={dt("payments.paidAt", "Paid")} />
        <InstantLine value={stamp?.transferredAt} intl={intl} timeZone={timeZone} label={dt("payments.transferredAt", "Payout transferred")} />
        <InstantLine value={stamp?.refundedAt} intl={intl} timeZone={timeZone} label={dt("payments.refundedAt", "Refunded")} />
        <InstantLine value={stamp?.failedAt} intl={intl} timeZone={timeZone} label={dt("payments.failedAt", "Failed")} />
        <InstantLine value={stamp?.canceledAt} intl={intl} timeZone={timeZone} label={dt("payments.canceledAt", "Canceled")} />
        <InstantLine value={stamp?.disputeOpenedAt} intl={intl} timeZone={timeZone} label={dt("payments.disputeOpenedAt", "Dispute opened")} />
      </div>

      {record.invoice ? (
        <div className="mt-3 border-t border-slate-200 pt-3">{invoiceRows(record.invoice, viewerRole, dt, intl, timeZone)}</div>
      ) : null}
    </div>
  )
}

export function PaymentsPanel({ booking, details, viewerRole }: PaymentsPanelProps) {
  const dt = useDetailT()
  const { formatMoney } = useCurrency()
  const { intl } = useFormatLocale()
  const displayTimeZone = useDetailDisplayTimeZone(
    recordedScheduleTimeZone(details, booking.scheduleTimeZone)
  )

  const payments = details?.payments
  const records = useMemo<NewPaymentFields[]>(() => {
    const fromDetails = (payments?.records || []) as NewPaymentFields[]
    const base = (payments?.base || null) as NewPaymentFields | null
    const raw = (booking.payment || null) as NewPaymentFields | null
    const merged = [...fromDetails]
    if (base && !merged.some((record) => record.paymentId && record.paymentId === base.paymentId)) merged.unshift(base)
    if (merged.length === 0 && raw) {
      merged.push({
        ...raw,
        kind: "booking",
        timestamps:
          raw.timestamps || {
            authorizedAt: raw.authorizedAt || null,
            capturedAt: raw.capturedAt || null,
            paidAt: raw.paidAt || null,
            transferredAt: raw.transferredAt || null,
            refundedAt: raw.refundedAt || null,
            failedAt: raw.failedAt || null,
            canceledAt: raw.canceledAt || null,
            disputeOpenedAt: raw.disputeOpenedAt || null,
          },
      })
    }
    return merged
  }, [booking.payment, payments?.base, payments?.records])

  const baseRecord = records.find((record) => record.kind !== "milestone") || records[0] || null
  const milestones = payments?.milestones || booking.milestonePayments || []
  const extraCosts: ExtraCostsDetailsDto | null =
    details?.extraCosts ||
    (booking.extraCosts?.length
      ? {
          totalProfessionalAmount: booking.extraCostTotal ?? null,
          currency: null,
          currencySource: "not_recorded",
          status: booking.extraCostStatus || null,
          items: booking.extraCosts.map((cost) => ({
            type: cost.type,
            name: cost.name,
            justification: cost.justification,
            professionalAmount: cost.amount,
            unitPrice: cost.unitPrice,
            estimatedUnits: cost.estimatedUnits,
            actualUnits: cost.actualUnits,
            referenceIndex: cost.referenceIndex,
          })),
          payment: booking.payment && (
            booking.payment.extraCostAmount != null ||
            booking.payment.extraCostCustomerNetAmount != null ||
            booking.payment.extraCostVatAmount != null ||
            booking.payment.extraCostStatus != null
          )
            ? {
                status: booking.payment.extraCostStatus || null,
                currency: null,
                customerNetChargeAmount: booking.payment.extraCostCustomerNetAmount ?? null,
                vatAmount: booking.payment.extraCostVatAmount ?? null,
                // The base payment VAT rate is not evidence for the extra-cost
                // intent; leave it unknown when the details DTO is absent.
                vatRate: null,
                customerChargeAmount: booking.payment.extraCostAmount ?? null,
                customerDiscount: booking.payment.extraCostCustomerDiscount ?? null,
                loyaltyTier: booking.payment.extraCostLoyaltyTier || null,
                loyaltyPercentage: booking.payment.extraCostLoyaltyPercentage ?? null,
                paidAt: booking.payment.extraCostPaidAt || null,
                completeBreakdownRecorded: false,
              }
            : null,
          confirmation: booking.completionAttestation
            ? {
                confirmedAt: booking.completionAttestation.confirmedAt || null,
                notes: booking.completionAttestation.notes || null,
                attachments: (booking.completionAttestation.attachments || []).map((url) => ({ url, source: "completion" })),
              }
            : null,
          dispute: booking.dispute?.raisedAt
            ? {
                raisedAt: booking.dispute.raisedAt,
                type: booking.dispute.type || null,
                reason: booking.dispute.reason || null,
                description: booking.dispute.description || null,
                status: booking.dispute.resolvedAt ? "resolved" : "open",
              }
            : null,
        }
      : null)
  const bookingPayment = (booking.payment || null) as NewPaymentFields | null
  const refunds: RefundDto[] = useMemo(() => {
    const provided = payments?.refunds || []
    if (provided.length > 0) return provided
    const raw = booking.payment
    const rawCurrency = ownRecordedCurrency(raw as NewPaymentFields | null)
    if (raw && (recordedNumber(raw.refundAmount) != null || raw.timestamps?.refundedAt || raw.refundedAt)) {
      return [
        {
          id: "payment:aggregate-refund",
          amount: raw.refundAmount ?? raw.totalWithVat ?? null,
          currency: rawCurrency,
          currencySource: rawCurrency ? "payment" : "not_recorded",
          refundedAt: raw.timestamps?.refundedAt || raw.refundedAt || null,
          source: "platform",
          status: "aggregate_only",
          justification: raw.refundReason || null,
          justificationRecorded: Boolean(raw.refundReason),
          vatSplitRecorded: false,
          kind: "booking",
          noticeCodes: ["REFUND_VAT_SPLIT_NOT_RECORDED"],
        },
      ]
    }
    // Legacy detail responses can carry the cancellation refund only on the
    // cancellation record. Show its recorded amount/currency, not a computed
    // VAT split and not the base payment's currency.
    const legacyCancellation =
      (Array.isArray(booking.cancellationRequests) ? booking.cancellationRequests : []).find(
        (request) => request.refundAmount != null && request.refundedAt
      ) || null
    const finalCancellation = booking.cancellation
    const amount = legacyCancellation?.refundAmount ?? finalCancellation?.refundAmount
    const refundedAt = legacyCancellation?.refundedAt ?? finalCancellation?.cancelledAt
    const justification = legacyCancellation?.reason ?? finalCancellation?.reason
    const legacyCurrency = legacyCancellation
      ? ownRecordedCurrency({
          currency: legacyCancellation.currency,
          currencyRecorded: legacyCancellation.currencyRecorded,
        })
      : null
    if (amount != null || refundedAt) {
      return [
        {
          id: "cancellation:legacy-refund",
          amount: amount ?? null,
          currency: legacyCurrency,
          currencySource: legacyCurrency ? "cancellation_request" : "not_recorded",
          refundedAt: refundedAt || null,
          source: "platform",
          status: "approved",
          justification: justification || null,
          justificationRecorded: Boolean(justification),
          vatSplitRecorded: false,
          kind: "booking",
          noticeCodes: ["REFUND_VAT_SPLIT_NOT_RECORDED"],
        },
      ]
    }
    return []
  }, [booking.cancellation, booking.cancellationRequests, booking.payment, payments?.refunds])

  const finalCancellation = booking.cancellation || null
  const cancellationRequests = useMemo(() => {
    const provided = details?.cancellations || []
    if (provided.length > 0) return provided
    const legacy = booking.cancellationRequests || []
    if (legacy.length > 0) return legacy
    if (finalCancellation) {
      return [
        {
          id: "final-cancellation",
          status: "approved",
          reason: finalCancellation.reason || null,
          createdAt: finalCancellation.cancelledAt || null,
          resolvedAt: finalCancellation.cancelledAt || null,
          refundAmount: finalCancellation.refundAmount ?? null,
          refundedAt: finalCancellation.cancelledAt || null,
          // The raw final-cancellation subdocument stores no currency.
          currency: null,
          currencyRecorded: false,
        },
      ]
    }
    return []
  }, [booking.cancellationRequests, details?.cancellations, finalCancellation])
  const checkout = payments?.checkout || details?.bookingSnapshot?.checkoutSnapshot || booking.checkoutSnapshot
  const extraCostsCurrency = ownRecordedCurrency(extraCosts)
  const extraCostPaymentCurrency = extraCosts?.payment ? ownRecordedCurrency(extraCosts.payment) : null
  const extraCostItemCurrency = (item: NonNullable<ExtraCostsDetailsDto["items"]>[number]) =>
    ownRecordedCurrency(item.customerCharge || null)
  const byCurrency = payments?.byCurrency || []

  return (
    <div className="space-y-4">
      <DetailCard
        title={dt("payments.title", "Payment records")}
        description={dt("payments.description", "Stored ledger facts in each record's own currency. No conversion or repricing with today's fees.")}
      >
        <NoticeList notices={payments?.notices} />
        <TimeZoneNote timeZone={displayTimeZone.timeZone} recorded={displayTimeZone.recorded} />
        {records.length > 0 ? (
          <div className="space-y-3">
            {records.map((record, index) => (
              <PaymentRecordCard
                key={record.paymentId || `${record.kind}-${index}`}
                record={record}
                viewerRole={viewerRole}
                dt={dt}
                formatMoney={formatMoney}
                intl={intl}
                timeZone={displayTimeZone.timeZone}
                bookingPayment={bookingPayment}
              />
            ))}
          </div>
        ) : (
          <NotRecorded />
        )}
        {byCurrency.length > 0 ? (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("payments.byCurrency", "Recorded totals by currency")}</p>
            <div className="mt-1 overflow-x-auto rounded border">
              <table className="w-full min-w-[28rem] text-xs">
                <thead className="bg-slate-50 text-gray-600">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">{dt("fields.currency", "Currency")}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{dt("payments.charged", "Charged")}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{dt("payments.refunded", "Refunded")}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{dt("payments.net", "Net")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byCurrency.map((row) => (
                    <tr key={row.currency} className="border-t">
                      <td className="px-2 py-1.5">{row.currency}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums"><MoneyText amount={row.recordedCharged} currency={row.currency} formatMoney={formatMoney} /></td>
                      <td className="px-2 py-1.5 text-right tabular-nums"><MoneyText amount={row.recordedRefunded} currency={row.currency} formatMoney={formatMoney} /></td>
                      <td className="px-2 py-1.5 text-right tabular-nums"><MoneyText amount={row.recordedNet} currency={row.currency} formatMoney={formatMoney} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">{dt("payments.byCurrencyNote", "Arithmetic over stored records only; currencies are never added together.")}</p>
            {byCurrency.some((row) => row.complete === false) ? (
              <NoticeList notices={[{ code: "PAYMENT_ROW_MISSING", severity: "info", entity: "payment" }]} />
            ) : null}
          </div>
        ) : null}
      </DetailCard>

      {checkout || booking.checkoutSnapshot ? (
        <DetailCard
          title={dt("payments.checkoutTitle", "Original booking charge composition")}
          description={dt("payments.checkoutDescription", "Professional unit price and quantity stored at checkout, before commission/VAT/discount.")}
        >
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label={dt("fields.pricingType", "Pricing")} empty={!checkout?.pricingType}><EnumText prefix="details.enums.pricingType" value={checkout?.pricingType} /></DetailField>
            <DetailField label={dt("fields.unitPrice", "Unit price")} empty={checkout?.unitAmount == null}>
              <MoneyText amount={checkout?.unitAmount} currency={checkout?.currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.quantity", "Quantity")} empty={checkout?.quantity == null}>
              {checkout?.quantity}{checkout?.unit ? <> <EnumText prefix="unit" value={checkout.unit} /></> : null}
            </DetailField>
            <DetailField label={dt("fields.baseSubtotal", "Base subtotal")} empty={checkout?.baseSubtotal == null}>
              <MoneyText amount={checkout?.baseSubtotal} currency={checkout?.currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.extraOptionsTotal", "Extra options total")} empty={checkout?.extraOptionsTotal == null}>
              <MoneyText amount={checkout?.extraOptionsTotal} currency={checkout?.currency} formatMoney={formatMoney} />
            </DetailField>
            <DetailField label={dt("fields.totalAmount", "Total (professional amount)")} empty={checkout?.totalAmount == null}>
              <MoneyText amount={checkout?.totalAmount} currency={checkout?.currency} formatMoney={formatMoney} />
            </DetailField>
          </dl>
          {Array.isArray(checkout?.selectedOptions) && checkout.selectedOptions.length > 0 ? (
            <ul className="space-y-1 text-xs text-gray-700">
              {checkout.selectedOptions.map((option, index) => (
                <li key={`${option.name}-${index}`} className="flex flex-wrap justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <span>
                    {option.name}
                    {option.quantity != null && option.quantity !== 1 ? ` × ${option.quantity}` : ""}
                    {option.unitPrice != null ? (
                      <span className="ml-2 text-[10px] text-gray-500">
                        @ <MoneyText amount={option.unitPrice} currency={checkout?.currency} formatMoney={formatMoney} />
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums"><MoneyText amount={option.totalPrice ?? option.unitPrice} currency={checkout?.currency} formatMoney={formatMoney} /></span>
                </li>
              ))}
            </ul>
          ) : null}
          {checkout?.complete === false ? (
            <NoticeList notices={[{ code: "CHECKOUT_SNAPSHOT_INCOMPLETE", severity: "warning", entity: "payment" }]} />
          ) : null}
        </DetailCard>
      ) : null}

      {milestones.length > 0 ? (
        <DetailCard
          title={dt("payments.milestones", "Milestone payments")}
          description={dt("payments.milestonesDescription", "Show stored amounts and whether a payment row records the customer charge.")}
        >
          <div className="overflow-x-auto rounded border">
            <table className="w-full min-w-[38rem] text-xs">
              <thead className="bg-slate-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{dt("fields.title", "Title")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{dt("fields.amount", "Amount")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{dt("payments.customerCharge", "Customer charge")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{dt("fields.status", "Status")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{dt("fields.workStatus", "Work")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{dt("payments.paidAt", "Paid")}</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((milestone, index) => {
                  const row = payments?.milestones?.find((candidate) => candidate.index === index)
                  const customerAmount = row?.customerChargeTotalWithVat
                  const rowCurrency = ownRecordedCurrency(row)
                  return (
                    <tr key={`${milestone.title}-${index}`} className="border-t">
                      <td className="px-2 py-1.5">{milestone.title}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums"><MoneyText amount={milestone.amount} currency={rowCurrency} formatMoney={formatMoney} /></td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {customerAmount == null ? (
                          <span className="text-[10px] text-amber-700">{dt("payments.notRecordedShort", "not recorded")}</span>
                        ) : (
                          <MoneyText amount={customerAmount} currency={rowCurrency} formatMoney={formatMoney} />
                        )}
                      </td>
                      <td className="px-2 py-1.5 capitalize">{milestone.status ? <StatusText value={milestone.status} /> : <NotRecorded />}</td>
                      <td className="px-2 py-1.5 capitalize">{milestone.workStatus ? <StatusText value={milestone.workStatus} /> : <NotRecorded />}</td>
                      <td className="px-2 py-1.5">{formatInstant(row?.paidAt || milestone.paidAt, intl, displayTimeZone.timeZone) || <NotRecorded />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </DetailCard>
      ) : null}

      <DetailCard
        title={dt("payments.extrasTitle", "Completion extras")}
        description={dt("payments.extrasDescription", "Recorded extra-cost declarations, their justification and the stored customer charge (never recomputed).")}
      >
        {extraCosts ? (
          <>
            <NoticeList notices={extraCosts.notices} />
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField label={dt("fields.extraCostsProfessional", "Professional total")} empty={extraCosts.totalProfessionalAmount == null}>
                <MoneyText amount={extraCosts.totalProfessionalAmount} currency={extraCostsCurrency} formatMoney={formatMoney} />
              </DetailField>
              <DetailField label={dt("fields.extraCostsStatus", "Status")} empty={!extraCosts.status}>
                <StatusText value={extraCosts.status} />
              </DetailField>
              <DetailField label={dt("fields.currency", "Currency")} empty={!extraCostsCurrency}>
                {extraCostsCurrency}
              </DetailField>
            </dl>
            {Array.isArray(extraCosts.items) && extraCosts.items.length > 0 ? (
              <ul className="space-y-2">
                {extraCosts.items.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-900">{item.name}</p>
                        <p className="text-[11px] text-gray-500"><EnumText prefix="extraCostType" value={item.type} /></p>
                      </div>
                      <span className="text-xs font-semibold tabular-nums">
                        <MoneyText amount={item.professionalAmount} currency={extraCostsCurrency} formatMoney={formatMoney} />
                      </span>
                    </div>
                    {item.justification ? <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{item.justification}</p> : null}
                    {item.unitPrice != null || item.estimatedUnits != null || item.actualUnits != null ? (
                      <p className="mt-1 text-[11px] text-gray-500">
                        {item.unitPrice != null ? (
                          <span>
                            {dt("payments.unitPriceLabel", "Unit price")}{" "}
                            <MoneyText
                              amount={item.unitPrice}
                              currency={extraCostsCurrency}
                              formatMoney={formatMoney}
                            />
                          </span>
                        ) : null}
                        {item.estimatedUnits != null ? ` · ${dt("payments.estimatedUnits", "estimated {count}", { count: String(item.estimatedUnits) })}` : ""}
                        {item.actualUnits != null ? ` · ${dt("payments.actualUnits", "actual {count}", { count: String(item.actualUnits) })}` : ""}
                      </p>
                    ) : null}
                    {item.customerCharge ? (
                      <dl className="mt-2 grid grid-cols-1 gap-2 rounded border border-blue-100 bg-blue-50/60 p-2 sm:grid-cols-2">
                        <DetailField label={dt("payments.customerNetCharge", "Customer net charge")} empty={item.customerCharge.amount == null}>
                          <MoneyText amount={item.customerCharge.amount} currency={extraCostItemCurrency(item)} formatMoney={formatMoney} />
                        </DetailField>
                        <DetailField label={dt("fields.vatAmount", "VAT amount")} empty={item.customerCharge.vatAmount == null}>
                          <MoneyText amount={item.customerCharge.vatAmount} currency={extraCostItemCurrency(item)} formatMoney={formatMoney} />
                        </DetailField>
                        <DetailField label={dt("fields.discount", "Discount")} empty={item.customerCharge.discount == null}>
                          <MoneyText amount={item.customerCharge.discount} currency={extraCostItemCurrency(item)} formatMoney={formatMoney} />
                        </DetailField>
                        <DetailField label={dt("payments.customerCharge", "Customer charge")} empty={item.customerCharge.totalAmount == null}>
                          <MoneyText amount={item.customerCharge.totalAmount} currency={extraCostItemCurrency(item)} formatMoney={formatMoney} />
                        </DetailField>
                      </dl>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <NotRecorded />
            )}
            {extraCosts.payment ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-900">{dt("payments.extraChargeRecorded", "Recorded customer charge for completion extras")}</p>
                <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DetailField label={dt("payments.customerNetCharge", "Customer net charge")} empty={extraCosts.payment.customerNetChargeAmount == null}>
                    <MoneyText amount={extraCosts.payment.customerNetChargeAmount} currency={extraCostPaymentCurrency} formatMoney={formatMoney} />
                  </DetailField>
                  <DetailField label={dt("fields.vatRate", "VAT rate")} empty={extraCosts.payment.vatRate == null}>
                    <PercentText value={extraCosts.payment.vatRate} />
                  </DetailField>
                  <DetailField label={dt("fields.vatAmount", "VAT amount")} empty={extraCosts.payment.vatAmount == null}>
                    <MoneyText amount={extraCosts.payment.vatAmount} currency={extraCostPaymentCurrency} formatMoney={formatMoney} />
                  </DetailField>
                  <DetailField label={dt("fields.discount", "Discount")} empty={extraCosts.payment.customerDiscount == null}>
                    <MoneyText amount={extraCosts.payment.customerDiscount} currency={extraCostPaymentCurrency} formatMoney={formatMoney} />
                  </DetailField>
                  <DetailField label={dt("payments.customerCharge", "Customer charge")} empty={extraCosts.payment.customerChargeAmount == null}>
                    <MoneyText amount={extraCosts.payment.customerChargeAmount} currency={extraCostPaymentCurrency} formatMoney={formatMoney} />
                  </DetailField>
                  <DetailField label={dt("payments.loyalty", "Loyalty")} empty={!extraCosts.payment.loyaltyTier && extraCosts.payment.loyaltyPercentage == null}>
                    {[extraCosts.payment.loyaltyTier, extraCosts.payment.loyaltyPercentage != null ? `${extraCosts.payment.loyaltyPercentage}%` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </DetailField>
                  {viewerRole !== "customer" ? (
                    <>
                      <DetailField label={dt("fields.platformCommission", "Platform commission")} empty={extraCosts.payment.platformCommission == null}>
                        <MoneyText amount={extraCosts.payment.platformCommission} currency={extraCostPaymentCurrency} formatMoney={formatMoney} />
                      </DetailField>
                      <DetailField label={dt("fields.professionalPayout", "Professional payout")} empty={extraCosts.payment.professionalPayout == null}>
                        <MoneyText amount={extraCosts.payment.professionalPayout} currency={extraCostPaymentCurrency} formatMoney={formatMoney} />
                      </DetailField>
                      <DetailField label={dt("payments.professionalNet", "Professional net")} empty={extraCosts.payment.professionalNetAmount == null}>
                        <MoneyText amount={extraCosts.payment.professionalNetAmount} currency={extraCostPaymentCurrency} formatMoney={formatMoney} />
                      </DetailField>
                      <DetailField label={dt("payments.extraCostTransferStatus", "Extra-cost payout transfer")} empty={!extraCosts.payment.transferStatus}>
                        {extraCosts.payment.transferStatus ? <StatusText value={extraCosts.payment.transferStatus} /> : null}
                      </DetailField>
                    </>
                  ) : null}
                  <DetailField label={dt("fields.status", "Status")} empty={!extraCosts.payment.status}>
                    <StatusText value={extraCosts.payment.status} />
                  </DetailField>
                  <DetailField label={dt("payments.paidAt", "Paid")} empty={!extraCosts.payment.paidAt}>
                    {formatInstant(extraCosts.payment.paidAt, intl, displayTimeZone.timeZone)}
                  </DetailField>
                  <DetailField label={dt("payments.failedAt", "Failed")} empty={!extraCosts.payment.failedAt}>
                    {formatInstant(extraCosts.payment.failedAt, intl, displayTimeZone.timeZone)}
                  </DetailField>
                </dl>
                {extraCosts.payment.completeBreakdownRecorded === false ? (
                  <NoticeList notices={[{ code: "EXTRA_COST_PAYMENT_NOT_RECORDED", severity: "warning", entity: "payment" }]} />
                ) : null}
              </div>
            ) : (
              <NoticeList notices={[{ code: "EXTRA_COST_PAYMENT_NOT_RECORDED", severity: "info", entity: "payment" }]} />
            )}
            {extraCosts.confirmation ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold text-gray-800">{dt("payments.completionConfirmation", "Completion confirmation")}</p>
                <p className="mt-1 text-xs text-gray-600">{formatInstant(extraCosts.confirmation.confirmedAt, intl, displayTimeZone.timeZone) || dt("activity.dateNotRecorded", "date not recorded")}</p>
                {extraCosts.confirmation.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{extraCosts.confirmation.notes}</p> : null}
                {extraCosts.confirmation.attachments && extraCosts.confirmation.attachments.length > 0 ? (
                  <div className="mt-2"><AttachmentLinks attachments={extraCosts.confirmation.attachments} /></div>
                ) : null}
              </div>
            ) : null}
            {extraCosts.dispute ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">{dt("payments.disputeSummary", "Extra-cost dispute (summary)")}</p>
                <p className="mt-0.5">{extraCosts.dispute.reason || extraCosts.dispute.type?.replace(/_/g, " ")}</p>
                {extraCosts.dispute.description ? <p className="mt-1 whitespace-pre-wrap">{extraCosts.dispute.description}</p> : null}
                <p className="mt-1 text-[11px]">
                  {formatInstant(extraCosts.dispute.raisedAt, intl, displayTimeZone.timeZone) || dt("activity.dateNotRecorded", "date not recorded")}
                  {extraCosts.dispute.status ? <> · <StatusText value={extraCosts.dispute.status} /></> : null}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <NotRecorded />
        )}
      </DetailCard>

      <DetailCard
        title={dt("payments.refundsTitle", "Refunds")}
        description={dt("payments.refundsDescription", "Amount, justification, date and status as recorded. Internal notes and provider identifiers are never shown here.")}
      >
        {refunds.length > 0 ? (
          <ul className="space-y-2">
            {refunds.map((refund) => {
              const refundCurrency = ownRecordedCurrency(refund)
              return (
                <li key={refund.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold tabular-nums">
                        <MoneyText amount={refund.amount} currency={refundCurrency} formatMoney={formatMoney} />
                      </p>
                      <ProvenanceBadge tone={refund.status === "recorded" ? "emerald" : "amber"}>
                        {refund.status ? <StatusText value={refund.status} /> : dt("payments.recorded", "recorded")}
                      </ProvenanceBadge>
                      {refund.kind ? (
                        <ProvenanceBadge tone={refund.kind === "extra_cost" ? "blue" : "slate"}>
                          <EnumText prefix="details.payments.refundKind" value={refund.kind} />
                        </ProvenanceBadge>
                      ) : null}
                      {refund.source ? <ProvenanceBadge>{dt(`payments.refundSource.${refund.source}`, refund.source)}</ProvenanceBadge> : null}
                    </div>
                    <span className="text-[11px] text-gray-500">{formatInstant(refund.refundedAt, intl, displayTimeZone.timeZone) || dt("activity.dateNotRecorded", "date not recorded")}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DetailField label={dt("fields.vatAmount", "VAT amount")} empty={refund.vatAmount == null}>
                      <MoneyText amount={refund.vatAmount} currency={refundCurrency} formatMoney={formatMoney} />
                    </DetailField>
                    <DetailField label={dt("fields.netAmount", "Net amount")} empty={refund.netAmount == null}>
                      <MoneyText amount={refund.netAmount} currency={refundCurrency} formatMoney={formatMoney} />
                    </DetailField>
                    <DetailField label={dt("fields.vatRate", "VAT rate")} empty={refund.vatRate == null}>
                      <PercentText value={refund.vatRate} />
                    </DetailField>
                  </dl>
                  <div className="mt-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("payments.justification", "Justification")}</p>
                    {refund.justification ? (
                      <p className="whitespace-pre-wrap text-xs text-gray-700">{refund.justification}</p>
                    ) : (
                      <NotRecorded label={dt("payments.justificationNotRecorded", "Justification not recorded")} />
                    )}
                  </div>
                  {refund.vatSplitRecorded === false || (refund.noticeCodes || []).includes("REFUND_VAT_SPLIT_NOT_RECORDED") ? (
                    <NoticeList notices={[{ code: "REFUND_VAT_SPLIT_NOT_RECORDED", severity: "info", entity: "refund" }]} />
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : cancellationRequests.length > 0 ? (
          <div className="space-y-2">
            <NoticeList notices={[{ code: "REFUND_BREAKDOWN_INCOMPLETE", severity: "info", entity: "refund" }]} />
          </div>
        ) : (
          <p className="text-xs text-gray-500">{dt("payments.noRefunds", "No refunds recorded for this booking.")}</p>
        )}
      </DetailCard>

      {cancellationRequests.length > 0 ? (
        <DetailCard
          title={dt("payments.cancellationTitle", "Cancellation & refund summary")}
          description={dt("payments.cancellationDescription", "Every recorded cancellation request and its resolution fields.")}
        >
          <ol className="space-y-3">
            {cancellationRequests.map((request, index) => {
              const requestCurrency = ownRecordedCurrency({
                currency: request.currency,
                currencyRecorded: request.currencyRecorded,
              })
              return (
              <li key={request.id || `cancellation-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusText value={request.status} />
                  <span className="text-[11px] text-gray-500">
                    {formatInstant(request.createdAt, intl, displayTimeZone.timeZone) || dt("activity.dateNotRecorded", "date not recorded")}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DetailField label={dt("fields.reason", "Reason")} empty={!request.reason && !finalCancellation?.reason}>
                    {request.reason || (index === 0 ? finalCancellation?.reason : null)}
                  </DetailField>
                  <DetailField label={dt("payments.requestedBy", "Requested by")} empty={!request.requestedBy?.name && !request.requestedRole}>
                    {request.requestedBy?.name || request.requestedRole || null}
                  </DetailField>
                  <DetailField label={dt("payments.professionalDecision", "Professional decision")} empty={!request.professionalDecision}>
                    {request.professionalDecision ? <StatusText value={request.professionalDecision} /> : null}
                  </DetailField>
                  <DetailField label={dt("payments.counterOffer", "Counter offer")} empty={request.counterOfferAmount == null}>
                    <MoneyText amount={request.counterOfferAmount} currency={requestCurrency} formatMoney={formatMoney} />
                  </DetailField>
                  <DetailField label={dt("payments.customerDecision", "Customer decision")} empty={!request.customerDecision}>
                    {request.customerDecision ? <StatusText value={request.customerDecision} /> : null}
                  </DetailField>
                  <DetailField label={dt("payments.resolvedAt", "Resolved")} empty={!request.resolvedAt}>
                    {formatInstant(request.resolvedAt, intl, displayTimeZone.timeZone)}
                  </DetailField>
                  <DetailField label={dt("payments.refundAmount", "Refund amount")} empty={request.refundAmount == null}>
                    <MoneyText amount={request.refundAmount} currency={requestCurrency} formatMoney={formatMoney} />
                  </DetailField>
                  <DetailField label={dt("payments.refundedAt", "Refunded at")} empty={!request.refundedAt}>
                    {formatInstant(request.refundedAt, intl, displayTimeZone.timeZone)}
                  </DetailField>
                  <DetailField label={dt("payments.denyReason", "Denial reason")} empty={!request.denyReason}>
                    {request.denyReason}
                  </DetailField>
                  <DetailField label={dt("payments.responseDeadline", "Response deadline")} empty={!request.responseDeadline}>
                    {formatInstant(request.responseDeadline, intl, displayTimeZone.timeZone)}
                  </DetailField>
                </dl>
                {request.professionalNote || request.escalationReason ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">
                    {request.professionalNote || request.escalationReason}
                  </p>
                ) : null}
                {request.evidence && request.evidence.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dt("payments.evidence", "Evidence")}</p>
                    <AttachmentLinks attachments={request.evidence} />
                  </div>
                ) : null}
              </li>
              )
            })}
          </ol>
        </DetailCard>
      ) : null}

      <DetailCard
        title={dt("payments.invoicesTitle", "Invoices & credit notes")}
        description={dt("payments.invoicesDescription", "Only your role's invoice side is shown.")}
      >
        {baseRecord?.invoice ? (
          invoiceRows(baseRecord.invoice, viewerRole, dt, intl, displayTimeZone.timeZone)
        ) : (
          <p className="text-xs text-gray-500">{dt("payments.noInvoices", "No invoice documents recorded.")}</p>
        )}
      </DetailCard>

      {!payments && !booking.payment ? (
        <DetailCard title={dt("payments.legacyTitle", "Legacy payment data")}>
          <div className="space-y-2">
            <NotRecorded />
            <p className="text-xs text-gray-500">
              {dt("payments.legacyDescription", "No payment subdocument was returned for this booking. No amount has been calculated from today's settings.")}
            </p>
          </div>
        </DetailCard>
      ) : null}
    </div>
  )
}
