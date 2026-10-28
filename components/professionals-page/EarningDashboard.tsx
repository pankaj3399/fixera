'use client'
import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { earningsData } from '@/data/content';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';

const EarningsDashboard = () => {
  const t = useTranslations('search');
  const { formatPrice } = useCurrency();
  const { intl } = useFormatLocale();

  // Month labels are locale-aware; the earnings amounts stay in EUR.
  const chartData = earningsData.map((entry, index) => ({
    ...entry,
    month: new Date(2025, index, 1).toLocaleDateString(intl, { month: 'short' }),
  }));

  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-purple-100 text-purple-800 px-4 py-2 border-purple-200">
            {t('prosPage.earnings.badge')}
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            {t('prosPage.earnings.title')}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t('prosPage.earnings.description')}
          </p>
        </div>
        <Card className="shadow-2xl border-gray-200">
          <CardHeader>
            <CardTitle>{t('prosPage.earnings.cardTitle')}</CardTitle>
            <CardDescription>{t('prosPage.earnings.cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="month" stroke="#555" />
                  <YAxis stroke="#555" />
                  <Tooltip
                    contentStyle={{
                      background: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '0.5rem',
                    }}
                    formatter={(value: number) => formatPrice(value, { charge: true })}
                  />
                  <Area type="monotone" dataKey="earnings" stroke="#8884d8" fillOpacity={1} fill="url(#colorEarnings)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default EarningsDashboard;
