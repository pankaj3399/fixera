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
  const isPB = (d: Date) =>
    pSet.has(ymd(d)) || inRanges(d, personalBlockedRanges);
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

  const click = (d: Date) => {
    if (disabledPast && isBefore(d, today)) return;
    if (isCompanyBlocked(d)) return;
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
      : isPB(d)
      ? 'from-rose-200 to-red-200'
      : isWork(d)
      ? 'from-emerald-200 to-teal-200'
      : 'from-slate-200 to-gray-200';
  const label = (d: Date) =>
    isCompanyBlocked(d)
      ? 'Company Block'
      : isPB(d)
      ? 'Blocked'
      : isWork(d)
      ? 'Available'
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
                disabled={past || isCompanyBlocked(d)}
                className={cn(
                  'relative',
                  cellHeight,
                  'rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400',
                  out && 'opacity-40',
                  (past || isCompanyBlocked(d)) && 'cursor-not-allowed'
                )}
                aria-label={`${format(d, 'PPP')} - ${lb}`}
                title={`${format(d, 'PPP')} - ${lb}`}
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
                      isPB(d) && 'border-rose-300',
                      !isCompanyBlocked(d) &&
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
                        isPB(d) && 'bg-rose-100 text-rose-700',
                        !isCompanyBlocked(d) &&
                          !isPB(d) &&
                          (isWork(d)
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-700')
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
            label='Working Day'
            chipClass='bg-emerald-100 text-emerald-700'
          />
          <LegendDot
            className='from-slate-200 to-gray-200'
            label='Off'
            chipClass='bg-slate-100 text-slate-700'
          />
        </div>
        <div className='mt-2 text-[11px] text-muted-foreground'>
          Tip: Click once to start a range, click another day to end it. Click
          the same day twice to toggle a single-day block.
        </div>
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
