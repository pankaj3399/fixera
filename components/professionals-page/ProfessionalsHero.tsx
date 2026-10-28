'use client'
import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';

const ProfessionalsHero = () => {
  const t = useTranslations('search');
  const { formatPrice } = useCurrency();
  const { intl } = useFormatLocale();
  const numberFormat = new Intl.NumberFormat(intl);

  const stats = [
    { name: t('prosPage.stats.averageProjectValue'), value: formatPrice(450, { charge: true }) },
    { name: t('prosPage.stats.topEarner'), value: `${formatPrice(8500, { charge: true })}+` },
    { name: t('prosPage.stats.newJobsDaily'), value: `${numberFormat.format(1200)}+` },
    { name: t('prosPage.stats.activeProfessionals'), value: `${numberFormat.format(2500)}+` },
  ];

  return (
    <section className="relative bg-gray-900 text-white pt-32  pb-28 overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10 [mask-image:linear-gradient(to_bottom,white,rgba(255,255,255,0))]"></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
          {t('prosPage.hero.title')}
        </h1>
        <p className="text-xl lg:text-2xl text-gray-300 max-w-3xl mx-auto mb-10">
          {t('prosPage.hero.description')}
        </p>
        <div className="flex justify-center gap-4 mb-16">
          <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 group">
            <Link href="/join">
              {t('prosPage.hero.cta')}
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
          {stats.map(stat => (
            <div key={stat.name} className="bg-white/5 p-4 rounded-lg text-center backdrop-blur-sm border border-white/10">
              <p className="text-3xl font-bold text-green-300">{stat.value}</p>
              <p className="text-sm text-gray-300">{stat.name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProfessionalsHero;
