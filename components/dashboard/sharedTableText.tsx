'use client'

import { useTranslations } from "next-intl"
import { priceModelKey, type PriceModelKey } from "@/lib/priceModel"

/**
 * Shared bookings/quotations table headers from the dashboardWidgets
 * namespace (loaded for every request). Keys are typed from the English
 * messages, so a misspelled key fails `tsc` instead of silently rendering an
 * English fallback; new keys must be mirrored in messages/{en,fr,nl}.
 */
export function useSharedTableText() {
  const t = useTranslations("dashboardWidgets")
  return {
    project: t("tables.colProject"),
    booking: t("tables.colBooking"),
    quotation: t("tables.colQuotation"),
    address: t("tables.colAddress"),
    professional: t("tables.colProfessional"),
    customer: t("tables.colCustomer"),
    orderDate: t("tables.colOrderDate"),
    requested: t("tables.colRequested"),
    planned: t("tables.colPlanned"),
    real: t("tables.colReal"),
    priceModel: t("tables.colPriceModel"),
    paidPrice: t("tables.colPaidPrice"),
    quoteDate: t("tables.colQuoteDate"),
    firstStart: t("tables.colFirstStart"),
    duration: t("tables.colDuration"),
    price: t("tables.colPrice"),
    status: t("tables.colStatus"),
    invoice: t("tables.colInvoice"),
    payoutDate: t("tables.colPayoutDate"),
    payoutRefund: t("tables.colPayoutRefund"),
    actions: t("tables.colActions"),
    details: t("tables.colDetails"),
    bookingsTableLabel: t("tables.bookingsTableLabel"),
    quotesTableLabel: t("tables.quotesTableLabel"),
    /** Recorded price-model token (fixed, unit, rfq, m2…) in the viewer's language; unknown free text stays as recorded. */
    formatPriceModel: (value: string | null | undefined): string | null => {
      const key = tablePriceModelKey(value)
      return key ? t(`tables.priceModels.${key}`) : value || null
    },
    /** "3 days" / "3 dagen" / "3 jours"; an unrecognised unit stays as recorded. */
    formatDuration: (value: number, unit: string | null | undefined): string => {
      const key = tableDurationUnitKey(unit)
      return key ? t(`tables.durationUnits.${key}`, { count: value }) : `${value} ${unit || ""}`.trim()
    },
  }
}

export function tablePriceModelKey(value: string | null | undefined): PriceModelKey | null {
  return priceModelKey(value)
}

export function tableDurationUnitKey(unit: string | null | undefined): "hours" | "days" | null {
  if (typeof unit !== "string") return null
  const normalized = unit.trim().toLowerCase()
  if (["h", "hr", "hrs", "hour", "hours"].includes(normalized)) return "hours"
  if (["d", "day", "days"].includes(normalized)) return "days"
  return null
}
