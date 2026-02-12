'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Loader2 } from 'lucide-react'
import Icon, { IconName } from '@/components/Icon'

interface ApiService {
  name: string
  slug: string
}

interface ApiCategory {
  name: string
  slug: string
  services: ApiService[]
}

function getServiceIcon(slug: string): IconName {
  const s = slug.toLowerCase()
  if (s.includes('plumb')) return 'Droplet'
  if (s.includes('electr')) return 'Zap'
  if (s.includes('paint')) return 'PaintBucket'
  if (s.includes('renov')) return 'Hammer'
  if (s.includes('roof')) return 'Home'
  if (s.includes('garden') || s.includes('landsc')) return 'TreePine'
  if (s.includes('clean')) return 'ShowerHead'
  if (s.includes('hvac') || s.includes('air')) return 'Fan'
  if (s.includes('insul')) return 'Thermometer'
  if (s.includes('floor')) return 'Layers'
  if (s.includes('tile')) return 'Grid'
  if (s.includes('solar')) return 'Sun'
  if (s.includes('design') || s.includes('3d')) return 'Palette'
  if (s.includes('kitchen')) return 'ChefHat'
  if (s.includes('bath')) return 'Bath'
  if (s.includes('carpentry') || s.includes('wood')) return 'Hammer'
  if (s.includes('window') || s.includes('door')) return 'DoorOpen'
  if (s.includes('mov')) return 'Truck'
  return 'Wrench'
}

const ServiceCard = ({ service }: { service: ApiService }) => {
  return (
    <Link href={`/services/${service.slug}`} className="block group">
      <Card className="h-full hover:shadow-2xl transition-all duration-300 border-gray-200 hover:-translate-y-2 cursor-pointer overflow-hidden bg-white">
        <div className="relative">
          <div className="h-48 bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
            <div className="p-6 rounded-full bg-white shadow-lg group-hover:scale-110 transition-transform duration-300">
              <Icon
                name={getServiceIcon(service.slug)}
                className="w-8 h-8 text-blue-600 group-hover:text-purple-600 transition-colors duration-300"
              />
            </div>
          </div>
        </div>
        <CardContent className="p-6 flex flex-col h-full">
          <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
            {service.name}
          </h3>
          <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-500">Learn more</span>
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
  const [services, setServices] = useState<ApiService[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=BE`
        )
        if (response.ok) {
          const json: unknown = await response.json()
          const categories: ApiCategory[] = Array.isArray(json)
            ? (json as ApiCategory[])
            : (
              typeof json === 'object' &&
              json !== null &&
              Array.isArray((json as { data?: unknown }).data)
                ? ((json as { data: ApiCategory[] }).data)
                : []
            )

          if (!Array.isArray(json) && !(typeof json === 'object' && json !== null && Array.isArray((json as { data?: unknown }).data))) {
            console.warn('Unexpected service category response shape:', json)
          }

          // Flatten all services from all categories, take first 6 as featured
          const allServices = categories.flatMap((cat) => Array.isArray(cat?.services) ? cat.services : [])
          setServices(allServices.slice(0, 6))
        }
      } catch (error) {
        console.error('Failed to fetch services:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchServices()
  }, [])

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

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : services.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-12">
            Services are being updated. Check back soon!
          </p>
        )}

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
