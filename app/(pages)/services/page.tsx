'use client'

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Shield, Loader2, AlertCircle } from 'lucide-react';
import { iconMap } from '@/data/content';
import { toast } from 'sonner';

interface Service {
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  countries: string[];
}

interface ServiceCategory {
  name: string;
  slug: string;
  description?: string;
  icon?: keyof typeof iconMap;
  services: Service[];
}

// Helper Icon Component
const Icon = ({ name, className }: { name: keyof typeof iconMap; className?: string }) => {
  const LucideIcon = iconMap[name];
  return LucideIcon ? <LucideIcon className={className} /> : null;
};

// Reusable Service Card Component
const ServiceCard = ({ service, categoryName, categoryIcon }: { service: Service; categoryName: string; categoryIcon?: keyof typeof iconMap }) => {
  return (
    <Card className="group overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border-gray-200 flex flex-col">
      <div className="relative h-48 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <Icon name={categoryIcon || 'Wrench'} className="w-16 h-16 text-blue-400 opacity-50" />
      </div>
      <CardContent className="p-4 flex flex-col flex-grow">
        <p className="text-sm text-gray-500 font-medium">{categoryName}</p>
        <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors mt-1">
          {service.name}
        </h3>
        {service.description && (
          <p className="text-sm text-gray-600 mt-2 flex-grow line-clamp-2">
            {service.description}
          </p>
        )}
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-green-500" />
            <span className="text-gray-700 font-medium">Verified Service</span>
          </div>
        </div>
      </CardContent>
      <div className="p-4 border-t">
        <Button asChild size="sm" className="w-full">
          <Link href={`/services/${service.slug}`}>
            View Details <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </div>
    </Card>
  );
};

// The Main Page Component
export default function ServicesHubPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServiceCategories();
  }, []);

  const fetchServiceCategories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=BE`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch service categories');
      }

      const data: ServiceCategory[] = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching service categories:', error);
      setError('Unable to load services. Please try again later.');
      toast.error('Failed to load services');
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredData = () => {
    if (activeCategory === 'all') {
      // Return all services from all categories
      return categories.flatMap(cat =>
        cat.services.map(service => ({
          service,
          categoryName: cat.name,
          categoryIcon: cat.icon
        }))
      );
    }

    // Filter to specific category
    const selectedCategory = categories.find(cat => cat.slug === activeCategory);
    if (!selectedCategory) return [];

    return selectedCategory.services.map(service => ({
      service,
      categoryName: selectedCategory.name,
      categoryIcon: selectedCategory.icon
    }));
  };

  const filteredData = getFilteredData();

  if (isLoading) {
    return (
      <div className="bg-white min-h-screen">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600 text-lg">Loading services...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white min-h-screen">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-24">
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Services</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={fetchServiceCategories}>
              Try Again
            </Button>
          </div>
        </main>
      </div>
    );
  }

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
            {categories.map(cat => (
              <TabsTrigger key={cat.slug} value={cat.slug}>{cat.name}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCategory}>
            <div className="mt-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                {activeCategory === 'all'
                  ? 'All Services'
                  : categories.find(c => c.slug === activeCategory)?.name || 'Services'}
              </h2>
              {filteredData.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600">No services available in this category.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {filteredData.map((item, index) => (
                    <ServiceCard
                      key={`${item.categoryName}-${item.service.slug}-${index}`}
                      service={item.service}
                      categoryName={item.categoryName}
                      categoryIcon={item.categoryIcon}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
