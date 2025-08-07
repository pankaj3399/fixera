'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import { serviceCategories, iconMap } from '@/data/content'

// --- Helper Component for Icons ---
const Icon = ({ name, className }: { name: string; className?: string }) => {
  const LucideIcon = iconMap[name];
  return LucideIcon ? <LucideIcon className={className} /> : null;
};

const ServiceCard = ({ service }: { service: any }) => {  //eslint-disable-line
    return (
    <Link href={`/services/${service.id}`} className="block group">
      <Card className="h-full hover:shadow-2xl transition-all duration-300 border-gray-200 hover:-translate-y-2 cursor-pointer overflow-hidden bg-white">
        <div className="relative">
          <div className="h-48 bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
            <div className="p-6 rounded-full bg-white shadow-lg group-hover:scale-110 transition-transform duration-300">
              <Icon 
                name={service.icon || 'Wrench'} // Fallback icon
                className="w-8 h-8 text-blue-600 group-hover:text-purple-600 transition-colors duration-300" 
              />
            </div>
          </div>
          <div className="absolute top-3 left-3">
            {service.popular && <Badge className="bg-orange-500 border-orange-500 text-white">Popular</Badge>}
          </div>
        </div>
        <CardContent className="p-6 flex flex-col h-full">
          <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
            {service.name}
          </h3>
          <p className="text-gray-600 mb-4 leading-relaxed flex-grow">
            {service.description}
          </p>
          <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
            <div>
              <span className="text-sm text-gray-500">More Info</span>
              <div className="text-lg font-bold text-gray-900">Click to View</div>
            </div>
            <div className="px-4 py-2 bg-blue-600 text-white rounded-full font-semibold group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-purple-600 transition-all duration-300">
              Explore
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

// --- Main ServicesSection Component ---
const ServicesSection = () => {
  // Create a curated list of featured services from your nested data
  const featuredServices = serviceCategories.flatMap(cat => 
    cat.subCategories.flatMap(sub => sub.services)
  ).slice(0, 6); // Display the first 6 services as featured

  return (
    <section id="services" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-blue-100 text-blue-800 px-4 py-2 border-blue-200">
            Our Services
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            Every Service You Need,
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              All in One Place
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            From quick fixes to major renovations, find verified professionals for every project.
            Quality guaranteed, payments protected.
          </p>
        </div>

        {/* Display the grid of featured services */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredServices.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>

        {/* The CTA now links to the main services/category page */}
        <div className="text-center mt-16">
          <Link href="/services">
            <Button
              size="lg"
              variant="outline"
              className="border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 group"
            >
              View All Services
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}

export default ServicesSection;