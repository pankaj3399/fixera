'use client';

import { useTranslations } from 'next-intl';
import { packageDurationDisplay } from '@/lib/packageDuration';

type Props = {
  subproject: Parameters<typeof packageDurationDisplay>[0];
};

/**
 * Execution duration of a package on a project card. A customer-set hourly
 * package has no stored value by design, so it says the customer decides;
 * passing its absent value to the plural formatter rendered "NaN hours".
 */
export default function PackageDurationLabel({ subproject }: Props) {
  const t = useTranslations('search');
  const tBooking = useTranslations('projectBooking');
  const duration = packageDurationDisplay(subproject);
  if (!duration) return null;
  return (
    <span>
      {duration.kind === 'customer_hours'
        ? tBooking('package.hoursDeterminedByCustomer')
        : t(duration.unit === 'days' ? 'units.days' : 'units.hours', { count: duration.value })}
    </span>
  );
}
