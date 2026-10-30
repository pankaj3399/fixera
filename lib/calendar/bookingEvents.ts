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
 */
export type BookingCalendarEventType = 'booking' | 'booking-active' | 'booking-completed';

const ACTIVE_STATUSES = new Set(['in_progress', 'professional_completed']);
const COMPLETED_STATUSES = new Set(['completed']);
const HIDDEN_STATUSES = new Set(['cancelled', 'refunded', 'quote_rejected']);

export const bookingCalendarEventType = (
  status?: string | null,
): BookingCalendarEventType | null => {
  if (!status) return 'booking';
  if (HIDDEN_STATUSES.has(status)) return null;
  if (COMPLETED_STATUSES.has(status)) return 'booking-completed';
  if (ACTIVE_STATUSES.has(status)) return 'booking-active';
  return 'booking';
};
