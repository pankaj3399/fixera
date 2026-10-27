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
  type CurrencyCode,
  isSupportedCurrency,
} from "@/lib/currency/currencies";
import {
  convertFromEur as convertFromEurWithRates,
  formatMoney as formatMoneyInLocale,
  formatPrice as formatPriceWithRates,
  type PriceOptions,
} from "@/lib/currency/convert";
import { readClientCookie, setClientCookie } from "@/lib/preferences/cookies";

export interface CurrencyContextValue {
  /** Active display currency. Payments are always charged in EUR. */
  currency: CurrencyCode;
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
   * `{ charge: true }` always formats the charged (EUR) amount.
   */
  formatPrice: (eurAmount: number, options?: { charge?: boolean }) => string;
  /**
   * Formats an amount in its OWN currency (no conversion) using the active
   * locale — for transactional records that store a currency (booking quotes,
   * payments). Defaults to EUR.
   */
  formatMoney: (amount: number, currencyCode?: string | null) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

interface CurrencyProviderProps {
  children: React.ReactNode;
  /** Resolved on the server (middleware header) so SSR matches hydration. */
  initialCurrency: string;
  /** Server-fetched euro-based rates (optional seed). */
  initialRates?: Record<string, number> | null;
  /** Refetch exchange rates from the backend in the background (default true). */
  refreshRates?: boolean;
  /** Background refresh interval in ms. */
  ratesRefreshIntervalMs?: number;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 12 * 1000;

export function CurrencyProvider({
  children,
  initialCurrency,
  initialRates = null,
  refreshRates = true,
  ratesRefreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: CurrencyProviderProps) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() =>
    isSupportedCurrency(initialCurrency) ? initialCurrency : BASE_CURRENCY
  );
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
      return formatPriceWithRates(eurAmount, optionsFull);
    },
    [currency, rates, locale]
  );

  const formatMoney = useCallback(
    (amount: number, currencyCode?: string | null) =>
      formatMoneyInLocale(amount, currencyCode, INTL_FORMAT_LOCALES[locale] ?? locale),
    [locale]
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
    () => ({ currency, setCurrency, rates, convertFromEur: convert, convertToEur, formatPrice, formatMoney }),
    [currency, setCurrency, rates, convert, convertToEur, formatPrice, formatMoney]
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
