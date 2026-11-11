import type { CalendarEventType } from '@/components/calendar/WeeklyAvailabilityCalendar';

/**
 * Booking status -> personal-availability calendar colour code.
 *
 * - `booking` (existing sky/blue) means pending bookings: scheduled work that
 *   has not started yet.
 * - `booking-active` (indigo, coherent with the blue family) means work in
 *   progress, including professional-completed work awaiting approval.
 * - `booking-completed` (emerald) is the dedicated completed-booking colour.
 * - `null` means the booking is not shown on the calendar at all
 *   (cancelled, refunded, rejected quotes).
 *
 * Exception (FT3 #5): a started booking cancelled by a partial refund keeps
 * its already-worked past days blocked. Those retained days are finished work
 * and render in the completed colour instead of being hidden.
 */
export type BookingCalendarEventType = 'booking' | 'booking-active' | 'booking-completed';

const ACTIVE_STATUSES = new Set(['in_progress', 'professional_completed']);
const COMPLETED_STATUSES = new Set(['completed']);
const HIDDEN_STATUSES = new Set(['cancelled', 'refunded', 'quote_rejected']);

export type BookingCalendarEventOptions = {
  /** The range/booking is the retained past portion of a partial refund. */
  retainedAfterRefund?: boolean | null;
};

/**
 * True for a booking (as returned by the bookings API) that was cancelled by a
 * partial refund after work started and therefore kept its past planned days.
 */
export const isRetainedPartialRefundBooking = (booking?: {
  status?: string | null;
  refundPreservesPastPlanning?: boolean | null;
  payment?: { status?: string | null } | null;
} | null): boolean =>
  booking?.status === 'cancelled'
  && booking?.refundPreservesPastPlanning === true
  && booking?.payment?.status === 'partially_refunded';

export const bookingCalendarEventType = (
  status?: string | null,
  options: BookingCalendarEventOptions = {},
): BookingCalendarEventType | null => {
  if (status === 'cancelled' && options.retainedAfterRefund === true) return 'booking-completed';
  if (!status) return 'booking';
  if (HIDDEN_STATUSES.has(status)) return null;
  if (COMPLETED_STATUSES.has(status)) return 'booking-completed';
  if (ACTIVE_STATUSES.has(status)) return 'booking-active';
  return 'booking';
};
