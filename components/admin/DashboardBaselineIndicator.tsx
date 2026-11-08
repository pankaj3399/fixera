'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { formatBaselineDate, type DashboardBaselineInfo } from '@/lib/admin/dashboardBaselines'

/**
 * "Counting since <date> · Show all history" on every booking dashboard that a
 * reset affects. Renders nothing when no baseline is set. `toggleHref` is the
 * current page with `history=all` added or removed (see buildHistoryToggleHref).
 */
export default function DashboardBaselineIndicator({
  baseline,
  toggleHref,
}: {
  baseline: DashboardBaselineInfo | null | undefined
  toggleHref: string
}) {
  const t = useTranslations('adminDashboards')
  const locale = useLocale()

  if (!baseline?.resetAt) return null

  const date = formatBaselineDate(baseline.resetAt, locale)

  if (baseline.showAll) {
    return (
      <p data-testid="dashboard-baseline-indicator" data-state="showing-all" className="text-xs text-gray-500">
        <span>{t('indicator.showingAll', { date })}</span>
        {' · '}
        <Link href={toggleHref} className="font-medium text-blue-700 underline-offset-2 hover:underline">
          {t('indicator.countFromReset')}
        </Link>
      </p>
    )
  }

  return (
    <p data-testid="dashboard-baseline-indicator" data-state="counting" className="text-xs text-gray-500">
      <span>{t('indicator.countingSince', { date })}</span>
      {' · '}
      <Link href={toggleHref} className="font-medium text-blue-700 underline-offset-2 hover:underline">
        {t('indicator.showAll')}
      </Link>
    </p>
  )
}
