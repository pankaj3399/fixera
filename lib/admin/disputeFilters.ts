/**
 * Admin dispute-overview row filtering (defense in depth).
 *
 * The booking-dispute list and the analytics cards describe the same
 * population: bookings with a recorded dispute. The backend already filters by
 * view; the client re-checks so one stray row can never make the list disagree
 * with the cards.
 *
 * - `all` / `open`: only bookings whose status is `dispute` (client bug #7:
 *   never plain extra-cost requests or settled history).
 * - `resolved`: settled dispute history (`dispute.resolvedAt` set), whatever
 *   the booking status is now. This view is the only place history appears.
 *
 * Warranty claims and escalated refund requests (`source` set) are their own
 * records and queues. They are never booking-dispute rows; the page shows them
 * in a separate, labeled section with their own counts.
 */

export type DisputeOverviewView = 'all' | 'open' | 'resolved';

export interface DisputeOverviewRow {
  _id: string;
  status?: string;
  source?: string;
  dispute?: { resolvedAt?: string | null } | null;
}

const DISPUTE_BOOKING_STATUS = 'dispute';

export const isSeparateQueueRow = (row: DisputeOverviewRow | null | undefined): boolean =>
  Boolean(row?.source);

export const isDisputeOverviewRow = (
  row: DisputeOverviewRow | null | undefined,
  view: DisputeOverviewView = 'all',
): boolean => {
  if (!row || isSeparateQueueRow(row)) return false;
  if (view === 'resolved') return Boolean(row.dispute?.resolvedAt);
  return row.status === DISPUTE_BOOKING_STATUS;
};

export const filterDisputeOverviewRows = <T extends DisputeOverviewRow>(
  rows: T[] | null | undefined,
  view: DisputeOverviewView = 'all',
): T[] => (Array.isArray(rows) ? rows.filter((row) => isDisputeOverviewRow(row, view)) : []);

export const filterSeparateQueueRows = <T extends DisputeOverviewRow>(
  rows: T[] | null | undefined,
): T[] => (Array.isArray(rows) ? rows.filter(isSeparateQueueRow) : []);

export interface DisputeOverviewInput<T extends DisputeOverviewRow> {
  disputes: T[] | null | undefined;
  externalDisputes: T[] | null | undefined;
  view: DisputeOverviewView;
  page: number;
}

/**
 * Splits one `/api/admin/disputes` response into the booking-dispute list
 * (what the cards and pagination count) and the separate warranty/refund
 * preview. The preview never joins the booking list, so it cannot change the
 * booking count, the empty state or the page count.
 */
export const buildDisputeOverview = <T extends DisputeOverviewRow>({
  disputes,
  externalDisputes,
  view,
  page,
}: DisputeOverviewInput<T>) => {
  const showSeparateQueues = view !== 'resolved';
  return {
    bookingRows: filterDisputeOverviewRows(disputes, view),
    showSeparateQueues,
    // The backend sends the preview with page 1 only.
    separatePreviewOnPageOne: showSeparateQueues && page > 1,
    separateRows: showSeparateQueues && page <= 1 ? filterSeparateQueueRows(externalDisputes) : [],
  };
};
