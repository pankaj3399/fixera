/**
 * Admin cancellation/refund request queue: view filter and actionability.
 *
 * The default view stays `pending`. `escalated` is the own queue for customer
 * refund requests escalated to admin; the dispute page links to it with
 * `?status=escalated`. The backend lets admins approve or deny both pending and
 * escalated requests, so both show the actions here.
 */

export const CANCELLATION_STATUS_FILTERS = ['all', 'pending', 'escalated', 'approved', 'denied'] as const;
export type CancellationStatusFilter = (typeof CANCELLATION_STATUS_FILTERS)[number];

export const DEFAULT_CANCELLATION_STATUS_FILTER: CancellationStatusFilter = 'pending';

export const parseCancellationStatusFilter = (value: string | null | undefined): CancellationStatusFilter =>
  (CANCELLATION_STATUS_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as CancellationStatusFilter)
    : DEFAULT_CANCELLATION_STATUS_FILTER;

const ADMIN_ACTIONABLE_STATUSES = ['pending', 'escalated'];

export const isAdminActionableCancellation = (status: string | null | undefined): boolean =>
  ADMIN_ACTIONABLE_STATUSES.includes(status ?? '');

/**
 * The view filter plus the last `?status=` value seen in the URL.
 *
 * Client navigation keeps the page mounted, so a filter read only on mount goes
 * stale: following the plain menu link after the dispute page's
 * `?status=escalated` link changed the URL but left the view on Escalated.
 * The filter is re-derived whenever the query value changes, and kept while it
 * stays the same. A dropdown selection changes only `filter`
 * (`selectCancellationStatusFilter`); the page then writes it to the URL, and
 * when that query arrives it derives the same filter.
 */
export interface CancellationStatusFilterState {
  queryStatus: string | null;
  filter: CancellationStatusFilter;
}

export const cancellationStatusFilterStateFromQuery = (queryStatus: string | null): CancellationStatusFilterState => ({
  queryStatus,
  filter: parseCancellationStatusFilter(queryStatus),
});

/** Returns the same object when the query is unchanged, a fresh state otherwise. */
export const syncCancellationStatusFilterState = (
  state: CancellationStatusFilterState,
  queryStatus: string | null,
): CancellationStatusFilterState =>
  state.queryStatus === queryStatus ? state : cancellationStatusFilterStateFromQuery(queryStatus);

export const selectCancellationStatusFilter = (
  state: CancellationStatusFilterState,
  filter: CancellationStatusFilter,
): CancellationStatusFilterState => (state.filter === filter ? state : { ...state, filter });

/** Query value for a selected filter; the default view has no `status` query. */
export const cancellationStatusQueryValue = (filter: CancellationStatusFilter): string | null =>
  filter === DEFAULT_CANCELLATION_STATUS_FILTER ? null : filter;

/** `search` (with leading `?`, or empty) with `status` set for `filter`; other query values are kept. */
export const cancellationRequestsSearch = (currentSearch: string, filter: CancellationStatusFilter): string => {
  const params = new URLSearchParams(currentSearch);
  const value = cancellationStatusQueryValue(filter);
  if (value) params.set('status', value);
  else params.delete('status');
  const search = params.toString();
  return search ? `?${search}` : '';
};
