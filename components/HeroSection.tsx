import React from 'react'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Clock, Star, CreditCard } from 'lucide-react'
import { keyBenefits } from '@/data/content'
import HeroSearchForm from './HeroSearchForm'
import PopularProjectsCarousel from './PopularProjectsCarousel'
import type { PopularProject } from '@/lib/popularProject'

const benefitIcons = {
  ShieldCheck,
  Clock,
  Star,
  CreditCard,
} as const

const HeroSection = ({
  popularServices,
  popularProjects,
}: {
  popularServices: string[]
  popularProjects: PopularProject[]
}) => {
  return (
    <section id="hero" className="pt-8 pb-16 bg-gradient-to-br from-blue-50 via-white to-purple-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234F46E5' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <Badge className="mb-4 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 border-blue-200 px-6 py-2 text-base font-medium">
            One Platform. Every Solution.
          </Badge>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold mb-4 leading-[1.1] tracking-tight">
            <span className="bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
              Find Trusted Property
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
              Professionals Fast
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-gray-600 mb-8 max-w-4xl mx-auto leading-relaxed">
            From quick repairs to full renovations, connect with verified professionals
            across Europe. Book instantly or get custom quotes with guaranteed quality.
          </p>

          <HeroSearchForm popularServices={popularServices} />

          <PopularProjectsCarousel projects={popularProjects} />

          <div className="mt-10 pt-16 border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
              {keyBenefits.map((benefit) => {
                const Icon = benefitIcons[benefit.icon as keyof typeof benefitIcons]
                return (
                  <div key={benefit.title} className="flex items-start space-x-4 text-left">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      {Icon ? <Icon className="w-6 h-6 text-blue-700" /> : null}
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">{benefit.title}</h4>
                      <p className="mt-1 text-gray-600">{benefit.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default HeroSection
