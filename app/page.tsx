'use client'

import HeroSection from '@/components/HeroSection'
import HowItWorksSection from '@/components/HowItWorksSection'
import FeaturesSection from '@/components/FeaturesSection'
import CTASection from '@/components/CTASection'
import ProfessionalsSection from '@/components/ProfessionalsSection'

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <ProfessionalsSection/>
      <CTASection />
    </main>
  )
}