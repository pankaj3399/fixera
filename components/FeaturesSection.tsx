import React from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, ArrowRight, Shield, Star, Clock, CreditCard, Phone, Globe } from 'lucide-react'
import { intlLocale } from '@/lib/i18n/format'

// --- Icon Mapping Helper ---
const iconMap: { [key: string]: React.ElementType } = {
  Shield, Star, Clock, CreditCard, CheckCircle, Phone, Globe
};

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const LucideIcon = iconMap[name];
  return LucideIcon ? <LucideIcon className={className} /> : null;
};

/** Feature copy lives in the `home` namespace; icons/structure stay in code. */
const FEATURES = [
  {
    icon: 'Shield',
    titleKey: 'features.items.verifiedProfessionals.title',
    descriptionKey: 'features.items.verifiedProfessionals.description',
    benefitKeys: [
      'features.items.verifiedProfessionals.benefits.identity',
      'features.items.verifiedProfessionals.benefits.background',
      'features.items.verifiedProfessionals.benefits.insurance',
      'features.items.verifiedProfessionals.benefits.skills',
    ],
  },
  {
    icon: 'Star',
    titleKey: 'features.items.qualityGuaranteed.title',
    descriptionKey: 'features.items.qualityGuaranteed.description',
    benefitKeys: [
      'features.items.qualityGuaranteed.benefits.warranty',
      'features.items.qualityGuaranteed.benefits.satisfaction',
      'features.items.qualityGuaranteed.benefits.qualityControl',
      'features.items.qualityGuaranteed.benefits.disputes',
    ],
  },
  {
    icon: 'Clock',
    titleKey: 'features.items.fastReliable.title',
    descriptionKey: 'features.items.fastReliable.description',
    benefitKeys: [
      'features.items.fastReliable.benefits.instantBooking',
      'features.items.fastReliable.benefits.quickQuotes',
      'features.items.fastReliable.benefits.flexibleSchedule',
      'features.items.fastReliable.benefits.emergency',
    ],
  },
  {
    icon: 'CreditCard',
    titleKey: 'features.items.securePayments.title',
    descriptionKey: 'features.items.securePayments.description',
    benefitKeys: [
      'features.items.securePayments.benefits.escrow',
      'features.items.securePayments.benefits.methods',
      'features.items.securePayments.benefits.invoicing',
      'features.items.securePayments.benefits.refunds',
    ],
  },
] as const;

const PLATFORM_STATS = [
  { labelKey: 'features.stats.satisfaction', icon: 'Star', display: '98%' },
  { labelKey: 'features.stats.projects', icon: 'CheckCircle', compactValue: 2_300_000 },
  { labelKey: 'features.stats.support', icon: 'Phone', display: '24/7' },
  { labelKey: 'features.stats.countries', icon: 'Globe', display: '8' },
] as const;

// --- Main Component ---
const FeaturesSection = async () => {
  const t = await getTranslations('home');
  const intl = intlLocale(await getLocale());
  const compactNumber = new Intl.NumberFormat(intl, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  return (
    <section id="features" className="py-24 bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-green-100 text-green-800 px-4 py-2 border-green-200">
            {t('features.badge')}
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            {t('features.title')}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t('features.description')}
          </p>
        </div>

        {/* Main Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-20">
          {FEATURES.map((feature) => (
            <div key={feature.titleKey} className="group relative p-8 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300">
                <div className="absolute inset-0 opacity-5" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234F46E5' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}/>
                <div className="relative">
                    <div className="flex items-start space-x-6">
                        <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110">
                            <Icon name={feature.icon} className="w-8 h-8 text-blue-600"/>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-2xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                                {t(feature.titleKey)}
                            </h3>
                            <p className="text-gray-600 leading-relaxed">
                                {t(feature.descriptionKey)}
                            </p>
                        </div>
                    </div>
                    <ul className="mt-6 space-y-3 pl-4 border-l-2 border-green-200">
                        {feature.benefitKeys.map((benefitKey) => (
                            <li key={benefitKey} className="flex items-center">
                                <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                                <span className="text-gray-700">{t(benefitKey)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-white shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {PLATFORM_STATS.map((stat) => (
              <div key={stat.labelKey} className="text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                  <Icon name={stat.icon} className="w-8 h-8" />
                </div>
                <div className="text-4xl lg:text-5xl font-bold">
                  {'compactValue' in stat ? `${compactNumber.format(stat.compactValue)}+` : stat.display}
                </div>
                <div className="mt-1 text-blue-100 font-medium">
                  {t(stat.labelKey)}
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link href="#services">
                <Button className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 group">
                    {t('features.cta')}
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export default FeaturesSection
