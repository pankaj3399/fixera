import React from 'react'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Search, Users } from 'lucide-react'

const stepIcons = {
  Search,
  Users,
  CheckCircle,
} as const

/** Step copy lives in the `home` namespace; icons/structure stay in code. */
const STEPS = [
  {
    step: 1,
    icon: 'Search',
    titleKey: 'howItWorks.steps.search.title',
    descriptionKey: 'howItWorks.steps.search.description',
    featureKeys: [
      'howItWorks.steps.search.features.verified',
      'howItWorks.steps.search.features.reviews',
      'howItWorks.steps.search.features.pricing',
      'howItWorks.steps.search.features.availability',
    ],
  },
  {
    step: 2,
    icon: 'Users',
    titleKey: 'howItWorks.steps.book.title',
    descriptionKey: 'howItWorks.steps.book.description',
    featureKeys: [
      'howItWorks.steps.book.features.instantBooking',
      'howItWorks.steps.book.features.customQuotes',
      'howItWorks.steps.book.features.messaging',
      'howItWorks.steps.book.features.planning',
    ],
  },
  {
    step: 3,
    icon: 'CheckCircle',
    titleKey: 'howItWorks.steps.complete.title',
    descriptionKey: 'howItWorks.steps.complete.description',
    featureKeys: [
      'howItWorks.steps.complete.features.quality',
      'howItWorks.steps.complete.features.payments',
      'howItWorks.steps.complete.features.tracking',
      'howItWorks.steps.complete.features.warranty',
    ],
  },
] as const

const HowItWorksSection = async () => {
  const t = await getTranslations('home')

  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-purple-100 text-purple-800 px-4 py-2 border-purple-200">
            {t('howItWorks.badge')}
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            {t('howItWorks.title')}
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t('howItWorks.description')}
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-1/2 left-0 w-full h-px -translate-y-1/2">
            <svg width="100%" height="2">
              <line
                x1="0" y1="1" x2="100%" y2="1"
                strokeWidth="2" strokeDasharray="8, 8"
                className="stroke-gray-300"
              />
            </svg>
          </div>

          <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-x-12 gap-y-16">
            {STEPS.map((step) => {
              const StepIcon = stepIcons[step.icon]
              return (
                <div key={step.step} className="relative bg-white text-center p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl hover:-translate-y-2 transition-all duration-300">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center justify-center shadow-lg">
                    {StepIcon ? <StepIcon className="w-8 h-8" /> : null}
                  </div>

                  <h3 className="mt-8 text-2xl font-bold text-gray-900 mb-4">
                    {t(step.titleKey)}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {t(step.descriptionKey)}
                  </p>

                  <ul className="space-y-2 text-left">
                    {step.featureKeys.map((featureKey) => (
                      <li key={featureKey} className="flex items-center text-gray-700">
                        <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                        <span>{t(featureKey)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

export default HowItWorksSection
