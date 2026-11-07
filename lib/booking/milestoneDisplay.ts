export type MilestoneDisplayRecord = {
  expectedCustomerCharge?: number | null;
  customerChargeTotalWithVat?: number | null;
};
export function milestoneDisplayAmount<Fallback extends number | null>(args: {
  index: number;
  recorded?: MilestoneDisplayRecord | null;
  payment?: { milestoneIndex?: number; totalWithVat?: number } | null;
  preview?: number | null;
  fallback: Fallback;
}): number | Fallback {
  const amounts = [
    args.recorded?.customerChargeTotalWithVat,
    args.payment?.milestoneIndex === args.index ? args.payment.totalWithVat : undefined,
    args.recorded?.expectedCustomerCharge,
    args.preview,
  ];
  return amounts.find((amount): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0)
    ?? args.fallback;
}
