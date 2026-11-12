import { format, parseISO } from 'date-fns';

/**
 * Calendar-day Dates in the booking wizard are browser-local midnights: the
 * DayPicker hands them out, and the day-level helpers re-key them with
 * calendarDateKey (format in the browser zone) before resolving the
 * professional's weekday, hours and blocked ranges from that key.
 *
 * A key must therefore become a local midnight, never the professional's
 * midnight instant: for a Europe/Brussels professional that instant is
 * 23:00 the previous day in UTC or Europe/Lisbon (and 18:00 in New York), so
 * re-keying it shifted every check to the day before and the wizard rejected
 * the start date it had proposed itself.
 */
export const calendarDateFromKey = (dateKey: string): Date => parseISO(dateKey);

/** yyyy-MM-dd of a calendar-day Date (browser-local). */
export const calendarDateKey = (date: Date): string => format(date, 'yyyy-MM-dd');
