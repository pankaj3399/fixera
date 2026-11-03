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
