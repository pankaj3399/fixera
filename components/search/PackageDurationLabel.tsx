'use client';

import { useTranslations } from 'next-intl';
import { packageDurationDisplay } from '@/lib/packageDuration';
import { canonicalUnit } from '@/lib/bookingUnits';

type Subproject = Parameters<typeof packageDurationDisplay>[0];

type Props = {
  subproject: Subproject;
  className?: string;
};

/**
 * Execution duration text of a package, shared by the search card and the
 * project page. A customer-set hourly package has no stored value by design,
 * so it says the customer decides (passing its absent value to the plural
 * formatter rendered "NaN hours"). A per-unit package (FT1 6B) shows the
 * duration of one configured unit — "2 hours per m²" — because the booked
 * quantity multiplies it. Uses only `projectBooking`, which both the search
 * and the project-detail scopes ship.
 */
export function usePackageDurationText(subproject: Subproject): string | null {
  const t = useTranslations('projectBooking');
  const duration = packageDurationDisplay(subproject);
  if (!duration) return null;
  if (duration.kind === 'customer_hours') return t('package.hoursDeterminedByCustomer');
  const amount = t(duration.unit === 'days' ? 'units.durationDays' : 'units.durationHours', { count: duration.value });
  if (duration.kind === 'duration') return amount;
  // The professional's exact configured unit: known units are translated,
  // anything else (m³, "panel", …) is shown verbatim.
  const canonical = canonicalUnit(duration.pricingUnit);
  const unit = canonical ? t(`package.perUnitNames.${canonical}`) : duration.pricingUnit;
  return t('package.durationPerUnit', { duration: amount, unit });
}

export default function PackageDurationLabel({ subproject, className }: Props) {
  const text = usePackageDurationText(subproject);
  if (!text) return null;
  return <span className={className}>{text}</span>;
}
