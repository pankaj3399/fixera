"use client";

import { useMemo } from "react";
import { CURRENCY_CODE_PLACEHOLDER, useCurrency } from "@/contexts/CurrencyContext";

/**
 * Currency glyph matching the active display currency. Use beside converted
 * prices instead of a fixed Euro icon, which would contradict non-EUR amounts.
 * Blank until the visitor's currency is known (see CurrencyProvider).
 */
export function CurrencySymbol({ className }: { className?: string }) {
  const { currency, currencyReady } = useCurrency();
  const symbol = useMemo(() => {
    if (!currencyReady) return CURRENCY_CODE_PLACEHOLDER;
    try {
      const part = new Intl.NumberFormat(undefined, { style: "currency", currency })
        .formatToParts(0)
        .find((segment) => segment.type === "currency");
      return part?.value ?? currency;
    } catch {
      return currency;
    }
  }, [currency, currencyReady]);
  return (
    <span className={className} aria-hidden="true">
      {symbol}
    </span>
  );
}
