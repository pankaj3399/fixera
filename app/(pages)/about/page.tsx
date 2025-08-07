import AboutHero from '@/components/about-page/AboutHero';
import TeamSection from '@/components/about-page/TeamSection';
import CTASection from '@/components/CTASection';
import TestimonialsSection from '@/components/TestimonialsSection';
import React from 'react'

const About = () => {
  return (
    <main className="mt-10">
      <AboutHero />
      <TestimonialsSection />
      <TeamSection />
      <CTASection />
    </main>
  )
}

export default About;