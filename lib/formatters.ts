/**
 * Shared formatting utilities for consistent display across the application.
 */

const DEFAULT_LOCALE = 'nl-NL';
const DEFAULT_CURRENCY = 'EUR';

/**
 * Formats a number as currency using the specified locale and currency.
 * @param value - The numeric value to format (optional)
 * @param options - Optional configuration for locale and currency
 * @returns Formatted currency string, or null if value is not a number
 */
export function formatCurrency(
  value?: number,
  options?: { locale?: string; currency?: string }
): string | null {
  if (typeof value !== 'number') {
    return null;
  }

  const locale = options?.locale ?? DEFAULT_LOCALE;
  const currency = options?.currency ?? DEFAULT_CURRENCY;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Formats a required number as currency (non-null return).
 * Use this when you're certain the value is a valid number.
 * @param value - The numeric value to format
 * @param options - Optional configuration for locale and currency
 * @returns Formatted currency string
 */
export function formatCurrencyRequired(
  value: number,
  options?: { locale?: string; currency?: string }
): string {
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const currency = options?.currency ?? DEFAULT_CURRENCY;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}
