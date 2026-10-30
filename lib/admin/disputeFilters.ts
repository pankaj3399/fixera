/**
 * Admin dispute-overview row filtering (defense in depth).
 *
 * The backend dispute filter already requires booking `status: 'dispute'`,
 * so the endpoint should only return genuine disputes. The overview still
 * filters client-side: only bookings whose status is `dispute` are shown.
 * External escalation rows (warranty claims, escalated refunds) carry
 * `source` and are genuine dispute work, so they are always kept.
 */

export interface DisputeOverviewRow {
  _id: string;
  status?: string;
  source?: string;
}

const DISPUTE_BOOKING_STATUS = 'dispute';

export const isDisputeOverviewRow = (row: DisputeOverviewRow | null | undefined): boolean => {
  if (!row) return false;
  if (row.source) return true;
  return row.status === DISPUTE_BOOKING_STATUS;
};

export const filterDisputeOverviewRows = <T extends DisputeOverviewRow>(
  rows: T[] | null | undefined,
): T[] => (Array.isArray(rows) ? rows.filter(isDisputeOverviewRow) : []);
