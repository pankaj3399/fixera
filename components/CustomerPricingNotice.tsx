'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { customerPriceCache } from '@/lib/customerPricePreview'
const serverSnapshot = () => 0

export function CustomerPricingNotice() {
  useSyncExternalStore(customerPriceCache.subscribe, customerPriceCache.snapshot, serverSnapshot)
  const t = useTranslations('common')
  if (!customerPriceCache.error()) return null
  return (
    <div role="alert" className="mx-auto my-3 flex max-w-4xl items-center gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p>{t('pricesUnavailable')}</p>
      <button type="button" className="shrink-0 underline" onClick={customerPriceCache.invalidate}>{t('tryAgain')}</button>
    </div>
  )
}
