import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import HeroSection from '@/components/HeroSection'
import HowItWorksSection from '@/components/HowItWorksSection'
import FeaturesSection from '@/components/FeaturesSection'
import CTASection from '@/components/CTASection'
import ProfessionalsSection from '@/components/ProfessionalsSection'
import { getPopularProjects, getPopularServices } from '@/lib/server/popular'
import { buildMetadata } from '@/lib/seo/metadata'

export const revalidate = 21600

/**
 * Page-specific title and description for the home route, through the shared
 * `buildMetadata` helper (canonical, OpenGraph and Twitter in the active locale).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home')
  return buildMetadata({
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/',
  })
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
