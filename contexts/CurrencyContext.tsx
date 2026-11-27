"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale } from "next-intl";

import { CURRENCY_COOKIE, INTL_FORMAT_LOCALES, type Locale } from "@/i18n/config";
import {
  BASE_CURRENCY,
  GEO_CURRENCY_COOKIE,
  type CurrencyCode,
  isSupportedCurrency,
} from "@/lib/currency/currencies";
import {
  convertFromEur as convertFromEurWithRates,
  formatDisplayMoney as formatDisplayMoneyWithRates,
  formatMoney as formatMoneyInLocale,
  formatPrice as formatPriceWithRates,
  type PriceOptions,
} from "@/lib/currency/convert";
import { readClientCookie, setClientCookie } from "@/lib/preferences/cookies";

export interface CurrencyContextValue {
  /**
   * Active display currency. Payments are always charged in EUR. It is only
   * known in the browser (see `currencyReady`); until then it reads EUR and
   * must not be shown as the visitor's currency.
   */
  currency: CurrencyCode;
  /**
   * False during the server render and hydration, true once the visitor's
   * currency has been read from cookies. While false, `formatPrice` returns a
   * blank placeholder of the same width instead of an amount.
   */
  currencyReady: boolean;
  /** Sets NEXT_CURRENCY (1 year) and updates the context instantly. */
  setCurrency: (code: string) => void;
  /** Euro-based rates from the backend, or null while unavailable. */
  rates: Record<string, number> | null;
  /** EUR amount in the active currency (returns the EUR amount when unknown). */
  convertFromEur: (amount: number) => number;
  /** Converts an active-display amount back to EUR when a known rate exists. */
  convertToEur: (amount: number) => number;
  /**
   * Formats a EUR amount in the active display currency using the active
   * next-intl locale. Falls back to the raw EUR amount when rates are missing;
   * `{ charge: true }` always formats the charged (EUR) amount. Before the
   * currency is known it returns a blank placeholder (`pricePlaceholder`).
   */
  formatPrice: (eurAmount: number, options?: { charge?: boolean }) => string;
  /**
   * Formats an amount in its OWN currency (no conversion) using the active
   * locale — for transactional records that store a currency (booking quotes,
   * payments). Defaults to EUR.
   */
  formatMoney: (amount: number, currencyCode?: string | null) => string;
  /**
   * CUR: a not-yet-paid amount of a record (wizard, quote, checkout). EUR is
   * converted to the display currency like `formatPrice`; the charge stays
   * EUR, so show the EUR amount (`formatMoney`) where the customer pays.
   */
  formatDisplayMoney: (amount: number, currencyCode?: string | null) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

interface CurrencyProviderProps {
  children: React.ReactNode;
  /** Server-fetched euro-based rates (optional seed). */
  initialRates?: Record<string, number> | null;
  /** Refetch exchange rates from the backend in the background (default true). */
  refreshRates?: boolean;
  /** Background refresh interval in ms. */
  ratesRefreshIntervalMs?: number;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 12 * 1000;

/** Figure spaces have the width of a digit, so a placeholder keeps the layout. */
const FIGURE_SPACE = "\u2007";

/**
 * Blank stand-in for a price whose currency is not known yet: the EUR amount's
 * shape with every visible character replaced by a figure space.
 */
export function pricePlaceholder(formatted: string): string {
  return formatted.replace(/\S/g, FIGURE_SPACE);
}

/** Short blank stand-in for a currency code or symbol (e.g. "EUR"). */
export const CURRENCY_CODE_PLACEHOLDER = FIGURE_SPACE.repeat(3);

/**
 * The visitor's display currency, as middleware resolves it: the manual
 * NEXT_CURRENCY choice, else the geo currency cookie middleware writes, else EUR.
 */
export function readCurrencyFromCookies(): CurrencyCode {
  const manual = readClientCookie(CURRENCY_COOKIE);
  if (isSupportedCurrency(manual)) return manual;
  const geo = readClientCookie(GEO_CURRENCY_COOKIE);
  if (isSupportedCurrency(geo)) return geo;
  return BASE_CURRENCY;
}

/**
 * Display currency for prices. It is resolved in the browser from cookies, not
 * on the server, so cached public HTML is the same for every currency. The
 * server render and hydration show placeholders (`currencyReady` false), which
 * keeps hydration consistent and never shows an amount in the wrong currency.
 */
export function CurrencyProvider({
  children,
  initialRates = null,
  refreshRates = true,
  ratesRefreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: CurrencyProviderProps) {
  const [resolvedCurrency, setCurrencyState] = useState<CurrencyCode | null>(null);
  const currency = resolvedCurrency ?? BASE_CURRENCY;
  const currencyReady = resolvedCurrency !== null;
  const [rates, setRates] = useState<Record<string, number> | null>(initialRates);
  const locale = useLocale() as Locale;
  const hadSeedRef = useRef(initialRates !== null);

  const fetchRates = useCallback(async () => {
    if (!BACKEND_URL) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/exchange-rates`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        success?: boolean;
        data?: { rates?: unknown };
      };
      const raw = json?.data?.rates;
      if (!raw || typeof raw !== "object") return;
      const normalized: Record<string, number> = {};
      for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
          normalized[code.toUpperCase()] = value;
        }
      }
      if (Object.keys(normalized).length > 0) {
        normalized.EUR = 1;
        setRates(normalized);
      }
    } catch {
      // Rates are best-effort; keep the previous ones (or none, which makes
      // formatPrice fall back to EUR instead of showing a wrong amount).
    }
  }, []);

  // Cookies are only readable in the browser, after hydration.
  useEffect(() => {
    setCurrencyState(readCurrencyFromCookies());
  }, []);

  // Background refresh so long-lived tabs see updated ECB rates.
  useEffect(() => {
    if (!refreshRates) return;
    if (!hadSeedRef.current) void fetchRates(); // no server seed: try once on mount
    const timer = setInterval(() => void fetchRates(), ratesRefreshIntervalMs);
    return () => clearInterval(timer);
  }, [fetchRates, ratesRefreshIntervalMs, refreshRates]);

  const setCurrency = useCallback((code: string) => {
    if (!isSupportedCurrency(code)) return;
    setClientCookie(CURRENCY_COOKIE, code);
    setCurrencyState(code);
  }, []);

  const formatPrice = useCallback(
    (eurAmount: number, options?: { charge?: boolean }) => {
      const optionsFull: PriceOptions = {
        currency,
        rates,
        charge: options?.charge,
        locale: INTL_FORMAT_LOCALES[locale] ?? locale,
      };
      const formatted = formatPriceWithRates(eurAmount, optionsFull);
      return currencyReady || options?.charge ? formatted : pricePlaceholder(formatted);
    },
    [currency, currencyReady, rates, locale]
  );

  const formatMoney = useCallback(
    (amount: number, currencyCode?: string | null) =>
      formatMoneyInLocale(amount, currencyCode, INTL_FORMAT_LOCALES[locale] ?? locale),
    [locale]
  );

  const formatDisplayMoney = useCallback(
    (amount: number, currencyCode?: string | null) => {
      const formatted = formatDisplayMoneyWithRates(amount, currencyCode, {
        currency,
        rates,
        locale: INTL_FORMAT_LOCALES[locale] ?? locale,
      });
      return currencyReady ? formatted : pricePlaceholder(formatted);
    },
    [currency, currencyReady, rates, locale]
  );

  const convert = useCallback(
    (amount: number) => convertFromEurWithRates(amount, currency, rates),
    [currency, rates]
  );
  const convertToEur = useCallback(
    (amount: number) => {
      const rate = rates?.[currency];
      return currency === BASE_CURRENCY || !rate || !Number.isFinite(rate) || rate <= 0 ? amount : amount / rate;
    },
    [currency, rates]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, currencyReady, setCurrency, rates, convertFromEur: convert, convertToEur, formatPrice, formatMoney, formatDisplayMoney }),
    [currency, currencyReady, setCurrency, rates, convert, convertToEur, formatPrice, formatMoney, formatDisplayMoney]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return ctx;
}

export { readClientCookie };
