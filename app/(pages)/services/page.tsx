'use client'

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Star, Shield } from 'lucide-react';
import { iconMap, services as allServicesData, categories } from '@/data/content';

// Helper Icon Component
const Icon = ({ name, className }: { name: string; className?: string }) => {
  const LucideIcon = iconMap[name];
  return LucideIcon ? <LucideIcon className={className} /> : null;
};

// Reusable Service Card Component
const ServiceCard = ({ service }: { service: (typeof allServicesData)[0] }) => {
  return (
    <Card className="group overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border-gray-200 flex flex-col">
        <div className="relative h-48 bg-gray-100 flex items-center justify-center">
            <Icon name={service.icon || 'Wrench'} className="w-12 h-12 text-gray-400" />
            <div className="absolute top-2 right-2">
                {service.popular && <Badge variant="destructive">Popular</Badge>}
            </div>
        </div>
        <CardContent className="p-4 flex flex-col flex-grow">
            <p className="text-sm text-gray-500">{service.category}</p>
            <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors mt-1">
                {service.name}
            </h3>
            <p className="text-sm text-gray-600 mt-2 flex-grow">
                {service.description}
            </p>
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                    <span className="font-medium text-gray-800">{service.avgRating}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-green-500" />
                    <span className="text-gray-800">{service.professionals} pros</span>
                </div>
            </div>
        </CardContent>
        <div className="p-4 border-t flex items-center justify-between">
            <div>
                <span className="text-xs text-gray-500">STARTING AT</span>
                <p className="text-xl font-bold text-gray-900">€{service.startingPrice}</p>
            </div>
            <Button asChild size="sm">
                <Link href={`/services/${service.slug}`}>
                    View <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
            </Button>
        </div>
    </Card>
  );
};

// The Main Page Component
export default function ServicesHubPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  
  const filteredServices = activeCategory === 'all'
    ? allServicesData
    : allServicesData.filter(service => service.category === activeCategory);

  return (
    <div className="bg-white">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-gray-900">All Services</h1>
          <p className="mt-4 text-xl text-gray-600 max-w-3xl">
            Explore the full range of professional services available on Fixera. Find exactly what you need for your next project.
          </p>
        </div>

        <Tabs defaultValue="all" onValueChange={setActiveCategory} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 h-auto">
            <TabsTrigger value="all">All Services</TabsTrigger>
            {/* Using the flat categories from your data file */}
            {categories.filter(c => c.id !== 'all').map(cat => (
              <TabsTrigger key={cat.id} value={cat.id}>{cat.name}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCategory}>
            <div className="mt-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                {categories.find(c => c.id === activeCategory)?.name || 'All Services'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {filteredServices.map(service => (
                  <ServiceCard key={service.id} service={service} />
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}