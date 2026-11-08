'use client'

import { useTranslations } from 'next-intl'
import type { QuotationVatDetermination } from '@/lib/quotationVat'
import { shouldShowArticle47Class } from '@/lib/quotationVat'

interface VatDeterminationPanelProps {
  determination: QuotationVatDetermination
}

/**
 * Shows the professional why a VAT rate (or reverse charge) applies:
 * customer type, Article 47 class (B2B only), VAT address and country.
 * Purely informational; never blocks quotation creation/editing.
 */
export default function VatDeterminationPanel({ determination }: VatDeterminationPanelProps) {
  const t = useTranslations('quotation')

  const customerTypeValue =
    determination.customerType === 'B2B'
      ? t('wizard.vatDetermination.customerTypes.b2b')
      : t('wizard.vatDetermination.customerTypes.b2c')

  const article47Value =
    determination.article47Class === 'Movable'
      ? t('wizard.vatDetermination.article47Classes.movable')
      : determination.article47Class === 'Immovable'
        ? t('wizard.vatDetermination.article47Classes.immovable')
        : determination.article47Class === 'Immovable but exempt from Belgian reverse charge'
          ? t('wizard.vatDetermination.article47Classes.immovableExempt')
          : null

  const addressTypeValue =
    determination.vatAddressType === 'Customer business address'
      ? t('wizard.vatDetermination.addressTypes.business')
      : t('wizard.vatDetermination.addressTypes.booking')

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
        {t('wizard.vatDetermination.title')}
      </p>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('wizard.vatDetermination.customerType')}</dt>
          <dd className="font-medium text-gray-800">{customerTypeValue}</dd>
        </div>
        {shouldShowArticle47Class(determination) && article47Value ? (
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">{t('wizard.vatDetermination.article47')}</dt>
            <dd className="text-right font-medium text-gray-800">{article47Value}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('wizard.vatDetermination.addressType')}</dt>
          <dd className="text-right font-medium text-gray-800">{addressTypeValue}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('wizard.vatDetermination.country')}</dt>
          <dd className="font-medium text-gray-800">{determination.vatCountry}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">{t('wizard.vatDetermination.reverseCharge')}</dt>
          <dd className="font-medium text-gray-800">
            {determination.reverseCharge
              ? t('wizard.vatDetermination.yes')
              : t('wizard.vatDetermination.no')}
          </dd>
        </div>
      </dl>
      {determination.reverseCharge ? (
        <p className="mt-2 text-xs text-indigo-800">{t('wizard.vatDetermination.reverseChargeNote')}</p>
      ) : null}
    </div>
  )
}
