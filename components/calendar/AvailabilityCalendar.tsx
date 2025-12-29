'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  format,
  isBefore,
  startOfDay,
  isWithinInterval,
  parseISO,
} from 'date-fns';

type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface WeeklySchedule {
  [k: string]: { available: boolean; startTime?: string; endTime?: string };
}
export interface BlockedDate {
  date: string;
  reason?: string;
}
export interface BlockedRange {
  startDate: string;
  endDate: string;
  reason?: string;
  isHoliday?: boolean;
}

interface Props {
  title?: string;
  description?: string;
  weeklySchedule: WeeklySchedule;
  personalBlockedDates?: BlockedDate[];
  personalBlockedRanges?: BlockedRange[];
  companyBlockedDates?: (BlockedDate & { isHoliday?: boolean })[];
  companyBlockedRanges?: BlockedRange[];
  readonlyBlockedDates?: BlockedDate[];
  readonlyBlockedRanges?: BlockedRange[];
  mode?: 'professional' | 'employee';
  onToggleDay?: (date: string) => void;
  onAddRange?: (s: string, e: string) => void;
  disabledPast?: boolean;
  compact?: boolean;
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const toD = (d: string | Date) => {
  if (d instanceof Date) return startOfDay(d);
  try {
    return startOfDay(parseISO(d));
  } catch {
    return startOfDay(new Date(d));
  }
};

export default function AvailabilityCalendar({
  title = 'Availability Calendar',
  description,
  weeklySchedule,
  personalBlockedDates = [],
  personalBlockedRanges = [],
  companyBlockedDates = [],
  companyBlockedRanges = [],
  readonlyBlockedDates = [],
  readonlyBlockedRanges = [],
  onToggleDay,
  onAddRange,
  disabledPast = true,
}: Props) {
  const [cur, setCur] = useState<Date>(startOfMonth(new Date()));
  const [rs, setRs] = useState<Date | null>(null);
  const today = startOfDay(new Date());

  const pSet = useMemo(() => {
    const s = new Set<string>();
    personalBlockedDates.forEach((d) => s.add(d.date));
    return s;
  }, [personalBlockedDates]);
  const rSet = useMemo(() => {
    const s = new Set<string>();
    readonlyBlockedDates.forEach((d) => s.add(d.date));
    return s;
  }, [readonlyBlockedDates]);
  const cMap = useMemo(() => {
    const m = new Map<string, { isHoliday?: boolean; reason?: string }>();
    companyBlockedDates.forEach((d) =>
      m.set(d.date, { isHoliday: d.isHoliday, reason: d.reason })
    );
    return m;
  }, [companyBlockedDates]);

  const days = useMemo(() => {
    const s = startOfWeek(startOfMonth(cur), { weekStartsOn: 1 });
    const e = endOfWeek(endOfMonth(cur), { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = s;
    while (d <= e) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [cur]);
  const inRanges = (dt: Date, rs: BlockedRange[]) =>
    rs.some((r) =>
      isWithinInterval(dt, { start: toD(r.startDate), end: toD(r.endDate) })
    );
  const isCompanyBlocked = (d: Date) => {
    const md = cMap.get(ymd(d));
    if (md) return true;
    return companyBlockedRanges.some((r) =>
      isWithinInterval(d, { start: toD(r.startDate), end: toD(r.endDate) })
    );
  };
  // Threshold for considering a day as fully blocked (4 hours)
  const BLOCK_THRESHOLD_HOURS = 4;

  const isReadonlyBlocked = (d: Date) => {
    if (rSet.has(ymd(d))) return true;

    const dayStart = startOfDay(d);
    const dayEnd = addDays(dayStart, 1);

    // Calculate total blocked hours on this day from all ranges
    let totalBlockedMinutes = 0;

    for (const range of readonlyBlockedRanges) {
      const rangeStart = new Date(range.startDate);
      const rangeEnd = new Date(range.endDate);

      // Check if range overlaps with this day
      if (rangeStart >= dayEnd || rangeEnd <= dayStart) continue;

      // For multi-day executions, fully block
      if (range.reason === 'booking') {
        const execStartDay = startOfDay(rangeStart);
        const execEndDay = startOfDay(rangeEnd);
        if (execEndDay.getTime() > execStartDay.getTime()) {
          return true; // Multi-day execution = fully blocked
        }
      }

      // Calculate overlap with this day
      const overlapStart = rangeStart > dayStart ? rangeStart : dayStart;
      const overlapEnd = rangeEnd < dayEnd ? rangeEnd : dayEnd;
      const overlapMinutes = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60);
      totalBlockedMinutes += overlapMinutes;
    }

    // If total blocked time >= 4 hours, fully block the day
    return totalBlockedMinutes >= BLOCK_THRESHOLD_HOURS * 60;
  };

  // Check if a day has a partial booking (< 4 hours blocked)
  const hasPartialBookingOnDay = (d: Date) => {
    if (isReadonlyBlocked(d)) return false; // If fully blocked, not partial

    const dayStart = startOfDay(d);
    const dayEnd = addDays(dayStart, 1);

    return readonlyBlockedRanges.some((range) => {
      const rangeStart = new Date(range.startDate);
      const rangeEnd = new Date(range.endDate);

      // Must overlap this day
      if (rangeStart >= dayEnd || rangeEnd <= dayStart) return false;

      // Any booking overlap means partial (since we already checked it's not fully blocked)
      return range.reason === 'booking';
    });
  };

  const isPB = (d: Date) =>
    pSet.has(ymd(d)) || inRanges(d, personalBlockedRanges);

  // Get booking details for a specific day (for hover tooltip)
  const getBookingDetailsForDay = (d: Date): string[] => {
    const details: string[] = [];
    const dayStart = startOfDay(d);
    const dayEnd = addDays(dayStart, 1);

    readonlyBlockedRanges.forEach((range) => {
      const rangeStart = new Date(range.startDate);
      const rangeEnd = new Date(range.endDate);

      // Check if range overlaps with this day
      if (rangeStart < dayEnd && rangeEnd > dayStart) {
        const start = new Date(range.startDate);
        const end = new Date(range.endDate);

        // Format the time
        const startTime = format(start, 'HH:mm');
        const endTime = format(end, 'HH:mm');
        const startDate = format(start, 'MMM d');
        const endDate = format(end, 'MMM d');

        if (range.reason === 'booking') {
          // Same day booking - show time range
          if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
            details.push(`Booked: ${startTime} - ${endTime}`);
          } else {
            details.push(`Booked: ${startDate} ${startTime} - ${endDate} ${endTime}`);
          }
        } else if (range.reason === 'booking-buffer') {
          details.push(`Buffer: ${startDate} - ${endDate}`);
        } else {
          details.push(`Blocked: ${startTime} - ${endTime}`);
        }
      }
    });

    return details;
  };
  const isWork = (d: Date) => {
    const idx = d.getDay();
    const key: WeekdayKey = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][idx] as WeekdayKey;
    return !!weeklySchedule?.[key]?.available;
  };

  // Check if calendar is interactive (has callbacks)
  const isInteractive = !!(onToggleDay || onAddRange);

  const click = (d: Date) => {
    // If no callbacks, calendar is read-only
    if (!isInteractive) return;
    if (disabledPast && isBefore(d, today)) return;
    if (isCompanyBlocked(d) || isReadonlyBlocked(d)) return;
    if (!rs) {
      setRs(d);
      return;
    }
    const s = rs <= d ? rs : d;
    const e = rs <= d ? d : rs;
    if (ymd(s) === ymd(e)) {
      onToggleDay?.(ymd(d));
      setRs(null);
      return;
    }
    onAddRange?.(ymd(s), ymd(e));
    setRs(null);
  };
  const grad = (d: Date) =>
    isCompanyBlocked(d)
      ? 'from-amber-200 to-orange-200'
      : isReadonlyBlocked(d)
      ? 'from-indigo-200 to-sky-200'
      : isPB(d)
      ? 'from-rose-200 to-red-200'
      : isWork(d)
      ? (hasPartialBookingOnDay(d) ? 'from-emerald-200 to-indigo-200' : 'from-emerald-200 to-teal-200')
      : 'from-slate-200 to-gray-200';
  const label = (d: Date) =>
    isCompanyBlocked(d)
      ? 'Company Block'
      : isReadonlyBlocked(d)
      ? 'Booked'
      : isPB(d)
      ? 'Blocked'
      : isWork(d)
      ? (hasPartialBookingOnDay(d) ? 'Partial' : 'Available')
      : 'Off';
  const cellHeight = 'h-20';
  const borderPad = 'p-0';
  const innerPad = 'p-2';

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <CalendarIcon className='h-5 w-5' />
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setCur(addDays(cur, -31))}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <div className='text-sm font-medium min-w-[140px] text-center'>
              {format(cur, 'MMMM yyyy')}
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setCur(addDays(cur, 31))}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-7 text-xs text-muted-foreground'>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((h) => (
            <div key={h} className='text-center font-medium'>
              {h}
            </div>
          ))}
        </div>
        <div className='grid grid-cols-7 gap-1'>
          {days.map((d) => {
            const k = ymd(d);
            const out = !isSameMonth(d, cur);
            const past = disabledPast && isBefore(d, today);
            const lb = label(d);
            const bookingDetails = getBookingDetailsForDay(d);
            const tooltipText = bookingDetails.length > 0
              ? `${format(d, 'PPP')}\n${bookingDetails.join('\n')}`
              : `${format(d, 'PPP')} - ${lb}`;
            let inTmp = false;
            if (rs) {
              const s = rs <= d ? rs : d;
              const e = rs <= d ? d : rs;
              inTmp = isWithinInterval(d, {
                start: startOfDay(s),
                end: startOfDay(e),
              });
            }
            return (
              <button
                key={k}
                onClick={() => click(d)}
                disabled={!isInteractive || past || isCompanyBlocked(d) || isReadonlyBlocked(d)}
                className={cn(
                  'relative',
                  cellHeight,
                  'rounded-xl transition-all',
                  isInteractive && 'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400',
                  out && 'opacity-40',
                  !isInteractive ? 'cursor-default' : (past || isCompanyBlocked(d) || isReadonlyBlocked(d)) && 'cursor-not-allowed'
                )}
                aria-label={tooltipText}
                title={tooltipText}
              >
                <div
                  className={cn(
                    borderPad,
                    'rounded-xl bg-gradient-to-br',
                    grad(d),
                    inTmp && 'shadow-[0_0_0_3px_rgba(59,130,246,0.35)]'
                  )}
                >
                  <div
                    className={cn(
                      'h-full w-full rounded-[10px] bg-white dark:bg-neutral-950 flex flex-col items-center justify-between',
                      innerPad,
                      'border',
                      isCompanyBlocked(d) && 'border-orange-300',
                      isReadonlyBlocked(d) && !isCompanyBlocked(d) && 'border-indigo-300',
                      isPB(d) && !isCompanyBlocked(d) && !isReadonlyBlocked(d) && 'border-rose-300',
                      !isCompanyBlocked(d) &&
                        !isReadonlyBlocked(d) &&
                        !isPB(d) &&
                        (isWork(d) ? 'border-emerald-300' : 'border-slate-300')
                    )}
                  >
                    <div className='w-full flex items-center justify-between text-[10px] text-muted-foreground'>
                      <span>{format(d, 'EEE')}</span>
                      <span className='font-semibold text-gray-700 dark:text-gray-200'>
                        {format(d, 'd')}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full',
                        isCompanyBlocked(d) && 'bg-orange-100 text-orange-700',
                        isReadonlyBlocked(d) && !isCompanyBlocked(d) && 'bg-indigo-100 text-indigo-700',
                        isPB(d) && !isCompanyBlocked(d) && !isReadonlyBlocked(d) && 'bg-rose-100 text-rose-700',
                        !isCompanyBlocked(d) &&
                          !isReadonlyBlocked(d) &&
                          !isPB(d) &&
                          isWork(d) &&
                          (hasPartialBookingOnDay(d)
                            ? 'bg-gradient-to-r from-emerald-100 to-indigo-100 text-indigo-700'
                            : 'bg-emerald-100 text-emerald-700'),
                        !isCompanyBlocked(d) &&
                          !isReadonlyBlocked(d) &&
                          !isPB(d) &&
                          !isWork(d) &&
                          'bg-slate-100 text-slate-700'
                      )}
                    >
                      {lb}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className='mt-4 flex flex-wrap gap-3 text-xs'>
          <LegendDot
            className='from-indigo-200 to-sky-200'
            label='Fully Booked'
            chipClass='bg-indigo-100 text-indigo-700'
          />
          <LegendDot
            className='from-emerald-200 to-indigo-200'
            label='Partial Booking'
            chipClass='bg-gradient-to-r from-emerald-100 to-indigo-100 text-indigo-700'
          />
          <LegendDot
            className='from-amber-200 to-orange-200'
            label='Company Block'
            chipClass='bg-orange-100 text-orange-700'
          />
          <LegendDot
            className='from-rose-200 to-red-200'
            label='Your Block'
            chipClass='bg-rose-100 text-rose-700'
          />
          <LegendDot
            className='from-emerald-200 to-teal-200'
            label='Available'
            chipClass='bg-emerald-100 text-emerald-700'
          />
          <LegendDot
            className='from-slate-200 to-gray-200'
            label='Off'
            chipClass='bg-slate-100 text-slate-700'
          />
        </div>
        {isInteractive && (
          <div className='mt-2 text-[11px] text-muted-foreground'>
            Tip: Click once to start a range, click another day to end it. Click
            the same day twice to toggle a single-day block.
          </div>
        )}
        {!isInteractive && (
          <div className='mt-2 text-[11px] text-muted-foreground'>
            Hover over days to see booking details.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LegendDot({
  className,
  label,
  chipClass,
}: {
  className?: string;
  label: string;
  chipClass?: string;
}) {
  return (
    <div className='flex items-center gap-2'>
      <div
        className={cn('h-4 w-4 rounded-full bg-gradient-to-br', className)}
      />
      <span className={cn('px-2 py-0.5 rounded-full', chipClass)}>{label}</span>
    </div>
  );
}
