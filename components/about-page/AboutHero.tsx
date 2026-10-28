'use client'
import React from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { companyValues } from '@/data/content';
import Icon, { IconName } from '@/components/Icon';

/** Company-value copy lives in the `content` namespace, in the same order as the data. */
const COMPANY_VALUE_KEYS = ['trust', 'quality', 'community'] as const;

const AboutHero = () => {
  const t = useTranslations('content');

  return (
    <section className="bg-gray-900 text-white pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Badge className="mb-4 bg-blue-500 text-white">{t('about.missionBadge')}</Badge>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">{t('about.title')}</h1>
        <p className="mt-6 text-xl text-gray-300 max-w-3xl mx-auto">
          {t('about.description')}
        </p>
      </div>
      <div className="max-w-5xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
        {companyValues.map((value, index) => {
          const key = COMPANY_VALUE_KEYS[index] ?? COMPANY_VALUE_KEYS[0]
          return (
            <div key={value.title} className="bg-white/5 p-6 rounded-lg border border-white/10 text-center">
              <div className="inline-block p-4 bg-blue-600/10 rounded-lg mb-4">
                <Icon name={value.icon as IconName} className="w-8 h-8 text-blue-300" />
              </div>
              <h3 className="text-xl font-semibold text-white">{t(`about.values.${key}.title`)}</h3>
              <p className="mt-2 text-gray-400">{t(`about.values.${key}.description`)}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
export default AboutHero;
