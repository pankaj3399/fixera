'use client'

import { useTranslations } from "next-intl"

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
  }
}
