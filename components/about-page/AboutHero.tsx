'use client'
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { companyValues } from '@/data/content';
import Icon from '@/components/Icon';

const AboutHero = () => {
  return (
    <section className="bg-gray-900 text-white pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Badge className="mb-4 bg-blue-500 text-white">Our Mission</Badge>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">Rebuilding Trust in Property Services.</h1>
        <p className="mt-6 text-xl text-gray-300 max-w-3xl mx-auto">
          Fixera was founded on a simple principle: finding reliable, skilled professionals for your home shouldn&apos;t be a gamble. We&apos;re dedicated to creating a transparent, secure, and high-quality platform for homeowners and professionals alike.
        </p>
      </div>
      <div className="max-w-5xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
        {companyValues.map(value => (
          <div key={value.title} className="bg-white/5 p-6 rounded-lg border border-white/10 text-center">
            <div className="inline-block p-4 bg-blue-500/10 rounded-lg mb-4">
              <Icon name={value.icon} className="w-8 h-8 text-blue-300" />
            </div>
            <h3 className="text-xl font-semibold text-white">{value.title}</h3>
            <p className="mt-2 text-gray-400">{value.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
export default AboutHero;