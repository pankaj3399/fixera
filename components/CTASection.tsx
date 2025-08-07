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

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const LucideIcon = iconMap[name];
  return LucideIcon ? <LucideIcon className={className} /> : null;
};

const CTASection = () => {

  return (
    <section id="cta" className="py-24 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10 [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <Badge className="mb-6 bg-white/10 border-white/20 text-white px-6 py-2 text-base">
            Ready to Get Started?
          </Badge>

          <h2 className="text-4xl lg:text-6xl font-bold mb-8 leading-tight">
            Your Perfect Project
            <br />
            <span className="bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
              Starts Here
            </span>
          </h2>

          <p className="text-xl lg:text-2xl text-blue-100 mb-12 max-w-4xl mx-auto leading-relaxed">
            Join thousands of satisfied customers and professionals. Quality work, guaranteed results, secure payments.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16">
            <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-10 py-5 text-xl font-bold rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
              <Link href="#services">
                <Search className="w-6 h-6 mr-3" />
                I Need a Service
              </Link>
            </Button>
            
            <div className="text-blue-100 font-medium">or</div>
            
            <Button asChild size="lg" variant="outline" className="border-2 border-white text-blue-400 hover:bg-white hover:text-blue-600 px-10 py-5 text-xl font-bold rounded-full transition-all duration-300 hover:scale-105">
              <Link href="#professionals">
                <Users className="w-6 h-6 mr-3" />
                I&apos;m a Professional
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {quickStats.map((stat) => (
              <div key={stat.text} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                  <Icon name={stat.icon} className="w-6 h-6"/>
                </div>
                <span className="text-blue-100 font-medium">{stat.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default CTASection