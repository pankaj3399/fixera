'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Users, Shield, Clock, Star } from 'lucide-react'
import { quickStats } from '@/data/content'

const iconMap: { [key: string]: React.ElementType } = {
  Users, Shield, Clock, Star
};

// Helper Icon Component
const Icon = ({ name, className }: { name: string; className?: string }) => {
  const LucideIcon = iconMap[name as keyof typeof iconMap];
  return LucideIcon ? <LucideIcon className={className} /> : null;
};

const CTASection = () => {

  return (
    <section id="cta" className="py-24 bg-gray-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-5"></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <Badge className="mb-6 bg-blue-100 text-blue-800 border-blue-200 px-6 py-2 text-base hover:bg-blue-200">
            Ready to Get Started?
          </Badge>

          <h2 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight text-gray-900">
            Your Perfect Project
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
              Starts Here
            </span>
          </h2>

          <p className="text-xl lg:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
            Join thousands of satisfied customers and professionals. Quality work, guaranteed results, secure payments.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <Button asChild size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-6 text-lg font-bold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <Link href="#services">
                <Search className="w-5 h-5 mr-2" />
                I Need a Service
              </Link>
            </Button>

            <span className="text-gray-400 font-medium px-2">or</span>

            <Button asChild size="lg" variant="outline" className="border-2 border-gray-200 text-gray-700 hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50 px-8 py-6 text-lg font-bold rounded-full transition-all duration-300 hover:-translate-y-1">
              <Link href="#professionals">
                <Users className="w-5 h-5 mr-2" />
                I&apos;m a Professional
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {quickStats.map((stat) => (
              <div key={stat.text} className="flex flex-col items-center text-center group">
                <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 group-hover:border-blue-200 group-hover:shadow-md">
                  <Icon name={stat.icon} className="w-7 h-7 text-blue-600" />
                </div>
                <span className="text-gray-900 font-semibold">{stat.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default CTASection