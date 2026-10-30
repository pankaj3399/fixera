'use client'

import { useTranslations } from "next-intl"

/**
 * Shared bookings/quotations table headers. Reads dashboardWidgets keys when
 * present and falls back to English so the tables render before/without
 * translations. New keys must be mirrored in messages/{en,fr,nl} per i18n:check.
 */
export function useSharedTableText() {
  const t = useTranslations("dashboardWidgets")
  const has = t.has as unknown as (key: string) => boolean
  const pick = (key: string, fallback: string): string => {
    try {
      return has(key) ? (t as unknown as (k: string) => string)(key) : fallback
    } catch {
      return fallback
    }
  }
  return {
    project: pick("tables.colProject", "Project / subproject"),
    booking: pick("tables.colBooking", "Booking"),
    quotation: pick("tables.colQuotation", "Quotation"),
    address: pick("tables.colAddress", "Service address"),
    professional: pick("tables.colProfessional", "Professional"),
    customer: pick("tables.colCustomer", "Customer"),
    orderDate: pick("tables.colOrderDate", "Order date"),
    requested: pick("tables.colRequested", "Requested"),
    planned: pick("tables.colPlanned", "Planned start / end"),
    real: pick("tables.colReal", "Real start / end"),
    priceModel: pick("tables.colPriceModel", "Price model"),
    paidPrice: pick("tables.colPaidPrice", "Paid price"),
    quoteDate: pick("tables.colQuoteDate", "Quote / expiry"),
    firstStart: pick("tables.colFirstStart", "First start"),
    duration: pick("tables.colDuration", "Duration"),
    price: pick("tables.colPrice", "Price"),
    status: pick("tables.colStatus", "Status"),
    invoice: pick("tables.colInvoice", "Invoice"),
    payoutDate: pick("tables.colPayoutDate", "Payout date"),
    payoutRefund: pick("tables.colPayoutRefund", "Payout / refund"),
    actions: pick("tables.colActions", "Quick actions"),
    details: pick("tables.colDetails", "Details"),
  }
}
