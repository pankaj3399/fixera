import React from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, TrendingUp, Users, CreditCard, Calendar, BarChart3, Star, Euro } from 'lucide-react'
import { successStories } from '@/data/content'
import { intlLocale } from '@/lib/i18n/format'

const iconMap: { [key: string]: React.ElementType } = {
  Users, CreditCard, Calendar, TrendingUp
};

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const LucideIcon = iconMap[name];
  return LucideIcon ? <LucideIcon className={className} /> : null;
};

/** Benefit copy lives in the `home` namespace; icons/structure stay in code. */
const PROFESSIONAL_BENEFITS = [
  { icon: 'Users', titleKey: 'professionals.benefits.customers.title', descriptionKey: 'professionals.benefits.customers.description' },
  { icon: 'CreditCard', titleKey: 'professionals.benefits.payments.title', descriptionKey: 'professionals.benefits.payments.description' },
  { icon: 'Calendar', titleKey: 'professionals.benefits.scheduling.title', descriptionKey: 'professionals.benefits.scheduling.description' },
  { icon: 'TrendingUp', titleKey: 'professionals.benefits.growth.title', descriptionKey: 'professionals.benefits.growth.description' },
] as const;

/** Translation keys for the hardcoded success stories, in the same order. */
const SUCCESS_STORY_KEYS = [
  {
    profession: 'professionals.stories.thomas.profession',
    location: 'professionals.stories.thomas.location',
    growth: 'professionals.stories.thomas.growth',
    story: 'professionals.stories.thomas.story',
  },
  {
    profession: 'professionals.stories.elena.profession',
    location: 'professionals.stories.elena.location',
    growth: 'professionals.stories.elena.growth',
    story: 'professionals.stories.elena.story',
  },
  {
    profession: 'professionals.stories.marco.profession',
    location: 'professionals.stories.marco.location',
    growth: 'professionals.stories.marco.growth',
    story: 'professionals.stories.marco.story',
  },
] as const;

const SuccessStoryCard = ({
  story,
  copy,
}: {
  story: (typeof successStories)[0]
  copy: {
    growth: string
    story: string
    profession: string
    location: string
  }
}) => (
  <Card className="group overflow-hidden relative shadow-lg hover:shadow-2xl transition-all duration-300 border-gray-200">
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent"></div>
    <div className="h-80 w-full bg-gray-300">
        {/* when we upscale this we add images here  */}
    </div>
    <CardContent className="absolute bottom-0 left-0 right-0 p-6 text-white">
      <Badge className="mb-3 bg-green-500 border-green-500 text-white font-semibold">
        {copy.growth}
      </Badge>
      <p className="text-lg leading-relaxed italic mb-4">
        &quot;{copy.story}&quot;
      </p>
      <div className="flex items-center gap-4 pt-4 border-t border-white/20">
        <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
          {story.avatarInitial}
        </div>
        <div>
          <h4 className="font-semibold text-lg">{story.name}</h4>
          <p className="text-sm text-gray-300">{copy.profession}, {copy.location}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);


const ProfessionalsSection = async () => {
  const t = await getTranslations('home')
  const intl = intlLocale(await getLocale())

  return (
    <section id="professionals" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="lg:pr-8">
            <Badge className="mb-6 bg-purple-100 text-purple-800 px-4 py-2 border-purple-200">
              {t('professionals.badge')}
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              {t('professionals.titleTop')}
              <br />
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                {t('professionals.titleBottom')}
              </span>
            </h2>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed">
              {t('professionals.description')}
            </p>
            <div className="space-y-6 mb-12">
              {PROFESSIONAL_BENEFITS.map((benefit) => (
                <div key={benefit.titleKey} className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl flex items-center justify-center">
                    <Icon name={benefit.icon} className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{t(benefit.titleKey)}</h3>
                    <p className="mt-1 text-gray-600">{t(benefit.descriptionKey)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/join">
                <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-4 text-lg font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 group">
                  {t('professionals.join')}
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/professionals">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-2 border-purple-600 text-purple-600 hover:bg-purple-50 hover:text-purple-700 px-8 py-4 text-lg font-semibold rounded-full transition-all duration-300">
                  {t('learnMore')}
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <Card className="bg-white shadow-2xl border-gray-100 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                <div className="bg-gray-800 text-white p-6 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">{t('professionals.dashboard.title')}</h3>
                    <BarChart3 className="w-6 h-6 text-gray-400" />
                  </div>
                </div>
              <CardContent className="p-6 space-y-6">
                <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">{t('professionals.dashboard.earnings')}</p>
                      <div className="text-3xl font-bold text-green-600 flex items-center">
                        <Euro className="w-6 h-6 mr-1" />{new Intl.NumberFormat(intl).format(5200)}
                      </div>
                    </div>
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
                      <TrendingUp className="w-8 h-8 text-green-600" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <p className="text-sm font-medium text-blue-900 mb-1">{t('professionals.dashboard.activeProjects')}</p>
                    <div className="text-3xl font-bold text-blue-600">{new Intl.NumberFormat(intl).format(12)}</div>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                    <p className="text-sm font-medium text-purple-900 mb-1">{t('professionals.dashboard.rating')}</p>
                    <div className="text-3xl font-bold text-purple-600 flex items-center gap-1">
                      {new Intl.NumberFormat(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(4.9)}
                      <Star className="w-6 h-6 text-yellow-400 fill-current" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-24 pt-16 border-t border-gray-200">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">
              {t('professionals.storiesTitle')}
            </h3>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {t('professionals.storiesDescription')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {successStories.map((story, index) => {
              const keys = SUCCESS_STORY_KEYS[index] ?? SUCCESS_STORY_KEYS[0]
              return (
                <SuccessStoryCard
                  key={story.name}
                  story={story}
                  copy={{
                    growth: t(keys.growth),
                    story: t(keys.story),
                    profession: t(keys.profession),
                    location: t(keys.location),
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

export default ProfessionalsSection
