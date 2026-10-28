import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import HeroSection from '@/components/HeroSection'
import HowItWorksSection from '@/components/HowItWorksSection'
import FeaturesSection from '@/components/FeaturesSection'
import CTASection from '@/components/CTASection'
import ProfessionalsSection from '@/components/ProfessionalsSection'
import { getPopularProjects, getPopularServices } from '@/lib/server/popular'
import { LOCALES, OG_LOCALES } from '@/i18n/config'
import { SITE_NAME, OG_DEFAULT_IMAGE, siteUrl, absoluteUrl } from '@/lib/seo/site'

export const revalidate = 21600

/**
 * The home route has no metadata of its own in the root layout, so the page
 * description and OpenGraph text are resolved here in the active locale. The
 * title stays the root layout's default (`Fixtract`).
 */
export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('home'), getLocale()])
  const description = t('meta.description')
  const alternateLocale = LOCALES.filter((candidate) => candidate !== locale).map(
    (candidate) => OG_LOCALES[candidate]
  )

  return {
    description,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: SITE_NAME,
      description,
      url: siteUrl(),
      locale: OG_LOCALES[locale],
      alternateLocale,
      images: [{ url: absoluteUrl(OG_DEFAULT_IMAGE), width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_NAME,
      description,
      images: [absoluteUrl(OG_DEFAULT_IMAGE)],
    },
  }
}

export default async function Home() {
  const [popularServices, popularProjects] = await Promise.all([
    getPopularServices(5),
    getPopularProjects({ limit: 10 }),
  ])

  return (
    <main className="min-h-screen bg-white">
      <HeroSection
        popularServices={popularServices}
        popularProjects={popularProjects}
      />
      <HowItWorksSection />
      <FeaturesSection />
      <ProfessionalsSection/>
      <CTASection />
    </main>
  )
}
