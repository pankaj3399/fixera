'use client'
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { professionalPageStats } from '@/data/content';

const ProfessionalsHero = () => {
  return (
    <section className="relative bg-gray-900 text-white pt-32  pb-28 overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10 [mask-image:linear-gradient(to_bottom,white,rgba(255,255,255,0))]"></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
          Grow Your Business with Fixera
        </h1>
        <p className="text-xl lg:text-2xl text-gray-300 max-w-3xl mx-auto mb-10">
          Access thousands of high-quality jobs, manage your workflow with powerful tools, and get paid securely. Join the leading platform for property professionals.
        </p>
        <div className="flex justify-center gap-4 mb-16">
          <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 group">
            <Link href="/join">
              Get Started for Free
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
          {professionalPageStats.map(stat => (
            <div key={stat.name} className="bg-white/5 p-4 rounded-lg text-center backdrop-blur-sm border border-white/10">
              <p className="text-3xl font-bold text-green-300">{stat.value}</p>
              <p className="text-sm text-gray-300">{stat.name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProfessionalsHero;