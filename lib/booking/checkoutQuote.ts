/** Internal markers the checkout writes into an auto-generated quote breakdown. */
const CHECKOUT_SNAPSHOT_PREFIX = 'checkout_snapshot:'

export const isCheckoutSnapshotLine = (line: { item?: string | null } | null | undefined): boolean =>
  typeof line?.item === 'string' && line.item.startsWith(CHECKOUT_SNAPSHOT_PREFIX)

/**
 * A direct (non-RFQ) booking stores its checkout as an auto-generated quote
 * whose breakdown carries `checkout_snapshot:*` lines. That is not a
 * quotation and is never shown as one (C11-1).
 */
export const isCheckoutSnapshotQuote = (
  quote: { breakdown?: Array<{ item?: string | null }> | null } | null | undefined,
): boolean => Array.isArray(quote?.breakdown) && quote!.breakdown!.some(isCheckoutSnapshotLine)
