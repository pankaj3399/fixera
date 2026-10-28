"use client";

import { useMemo } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";

/**
 * Currency glyph matching the active display currency. Use beside converted
 * prices instead of a fixed Euro icon, which would contradict non-EUR amounts.
 */
export function CurrencySymbol({ className }: { className?: string }) {
  const { currency } = useCurrency();
  const symbol = useMemo(() => {
    try {
      const part = new Intl.NumberFormat(undefined, { style: "currency", currency })
        .formatToParts(0)
        .find((segment) => segment.type === "currency");
      return part?.value ?? currency;
    } catch {
      return currency;
    }
  }, [currency]);
  return (
    <span className={className} aria-hidden="true">
      {symbol}
    </span>
  );
}
