import { BASE_CURRENCY } from "@/lib/currency/currencies";

/**
 * Server/client-safe pure conversion + formatting helpers. Receives the rates
 * explicitly, so it can be used from server components.
 */

export interface ExchangeRateData {
  base: "EUR";
  date: string;
  rates: Record<string, number>;
}

/** Convert an EUR amount into the target currency using stored euro-based rates. */
export function convertFromEur(
  amount: number,
  currency: string,
  rates: Record<string, number> | null | undefined
): number {
  if (currency === BASE_CURRENCY) return amount;
  const rate = rates?.[currency];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return amount; // never guess — callers fall back to EUR display
  }
  return amount * rate;
}

export interface PriceOptions {
  /** Active next-intl locale or any valid Intl tag. */
  locale: string;
  /** Display currency code. */
  currency: string;
  /** Euro-based rates; falls back to EUR display when missing. */
  rates?: Record<string, number> | null;
  /** Checkout/payment/invoice contexts: always the charged (EUR) amount. */
  charge?: boolean;
}

function formatAmount(amount: number, currency: string, locale: string): string {
  if (!Number.isFinite(amount)) return "…";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

const LEGACY_SYMBOLS: Record<string, string> = { "€": "EUR", "$": "USD", "£": "GBP" };

/**
 * Resolve the currency stored on a transactional record. Pass the charged
 * currency first, then fallbacks (e.g. payment, quote, budget); the first
 * non-empty value wins and `formatMoney` formats it without conversion.
 */
export function resolveRecordCurrency(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) return value;
  }
  return BASE_CURRENCY;
}

/**
 * Format an amount in its own currency (no conversion), e.g. a booking quote
 * stored as GBP. Unknown/invalid codes fall back to "CODE 1,234.00".
 */
export function formatMoney(amount: number, currency: string | null | undefined, locale: string): string {
  if (!Number.isFinite(amount)) return "…";
  const raw = (currency || BASE_CURRENCY).trim();
  // Legacy records store a symbol instead of an ISO code (e.g. RFQ budgets use "€").
  const code = LEGACY_SYMBOLS[raw] ?? raw.toUpperCase();
  try {
    return formatAmount(amount, code, locale);
  } catch {
    return `${code} ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
  }
}

/**
 * Format a EUR amount for display in the given currency. When the target
 * currency has no available rate (or `charge` is set), the EUR amount is
 * formatted as-is — a wrong number is never shown.
 */
export function formatPrice(amount: number, options: PriceOptions): string {
  const { locale, currency, rates } = options;
  if (options.charge || currency === BASE_CURRENCY) {
    return formatAmount(amount, BASE_CURRENCY, locale);
  }
  const rate = rates?.[currency];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return formatAmount(amount, BASE_CURRENCY, locale);
  }
  const converted = convertFromEur(amount, currency, rates);
  return formatAmount(converted, currency, locale);
}
