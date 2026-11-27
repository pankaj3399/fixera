/** The parts of the wizard's VAT preview that decide the amount charged. */
export interface VatPreviewRates {
  action: 'standard_rate' | 'reduced_rate' | 'rfq';
  standardRate: number;
  appliedRate: number;
  reverseCharge: boolean;
}

/**
 * The amount the customer is charged for a net total under the VAT preview:
 * no VAT under reverse charge; the standard rate when a review-required
 * preview is accepted at standard VAT; the net amount while that review is
 * still open; otherwise the resolved rate.
 */
export function vatInclusiveTotal(
  net: number,
  preview: VatPreviewRates | null | undefined,
  proceedAtStandardVat: boolean,
): number {
  if (!preview || preview.reverseCharge) return net;
  if (preview.action === 'rfq') {
    return proceedAtStandardVat ? Math.round(net * (100 + preview.standardRate)) / 100 : net;
  }
  return Math.round(net * (100 + preview.appliedRate)) / 100;
}
