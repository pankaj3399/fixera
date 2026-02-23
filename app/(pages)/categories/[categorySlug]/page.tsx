'use client'

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from '@/components/ui/separator';
import { Star, Heart, Award, ChevronRight, Loader2, AlertCircle, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProfessionalFilters from '@/components/ProfessionalFilters';
import { toast } from 'sonner';
import { useParams } from 'next/navigation';
import StartChatButton from '@/components/chat/StartChatButton';

interface Professional {
  _id: string;
  name: string;
  email: string;
  businessInfo?: {
    companyName?: string;
    description?: string;
    city?: string;
    country?: string;
  };
  hourlyRate?: number;
  currency?: string;
  serviceCategories?: string[];
  profileImage?: string;
}

const ProfessionalCard = ({ professional }: { professional: Professional }) => {
  const displayName = professional.businessInfo?.companyName || professional.name;
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const location = professional.businessInfo?.city
    ? `${professional.businessInfo.city}, ${professional.businessInfo.country || ''}`
    : professional.businessInfo?.country || 'Location not specified';

  return (
    <Card className="group overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border-gray-200 flex flex-col w-full">
      <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        {professional.profileImage ? (
          <Image
            src={professional.profileImage}
            alt={displayName}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center text-white text-3xl font-bold">
            {initials}
          </div>
        )}
        <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-white/70 backdrop-blur-sm hover:bg-white rounded-full">
          <Heart className="w-5 h-5 text-gray-700" />
        </Button>
      </div>
      <CardContent className="p-4 flex flex-col flex-grow">
        <div className="flex items-center space-x-3 mb-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={professional.profileImage} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-base leading-tight">{displayName}</p>
            <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
              <Award className="w-3 h-3" />Verified Professional
            </p>
          </div>
        </div>

        {professional.businessInfo?.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {professional.businessInfo.description}
          </p>
        )}

        <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
          <MapPin className="w-3 h-3" />
          <span>{location}</span>
        </div>

        <div className="flex items-center gap-1 mt-auto">
          <Star className="w-4 h-4 text-yellow-400 fill-current" />
          <span className="font-bold text-gray-700">5.0</span>
          <span className="text-sm text-gray-500">(New)</span>
        </div>
      </CardContent>
      <div className="p-4 border-t flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-500 font-semibold tracking-wider">STARTING AT</span>
          <p className="text-xl font-bold text-gray-900">
            {professional.currency || 'EUR'} {professional.hourlyRate || 0}/hr
          </p>
        </div>
        <StartChatButton professionalId={professional._id} label="Start Chat" />
      </div>
    </Card>
  );
};

export default function CategoryPage() {
  const params = useParams();
  const categorySlug = params?.categorySlug as string;

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Convert slug to display name
  const getCategoryName = (slug: string) => {
    const nameMap: Record<string, string> = {
      'small-tasks': 'Small tasks',
      'interior': 'Interior',
      'exterior': 'Exterior',
      'outdoor-work': 'Outdoor work',
      'renovation': 'Renovation',
      'inspections': 'Inspections'
    };
    return nameMap[slug] || slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const categoryName = getCategoryName(categorySlug);
  const categoryDescription = `Find verified professionals for all your ${categoryName.toLowerCase()} needs`;

  const fetchProfessionals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/professionals/by-category/${categorySlug}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch professionals');
      }

      const data: Professional[] = await response.json();
      setProfessionals(data);
    } catch (error) {
      console.error('Error fetching professionals:', error);
      setError('Unable to load professionals. Please try again later.');
      toast.error('Failed to load professionals');
    } finally {
      setIsLoading(false);
    }
  }, [categorySlug]);

  useEffect(() => {
    if (categorySlug) {
      fetchProfessionals();
    }
  }, [categorySlug, fetchProfessionals]);

  if (isLoading) {
    return (
      <div className="bg-white min-h-screen">
        <div className="relative h-72 md:h-96 w-full bg-gradient-to-br from-blue-50 to-purple-50">
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          </div>
        </div>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-gray-600 text-lg">Loading professionals...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white min-h-screen">
        <div className="relative h-72 md:h-96 w-full bg-gradient-to-br from-red-50 to-orange-50" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Professionals</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={fetchProfessionals}>
              Try Again
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="relative h-72 md:h-96 w-full">
        <Image
          src="/images/banner.jpg"
          alt={`${categoryName} professionals`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/20" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-12">
            <div className="flex items-center text-sm text-white mb-2">
              <Link href="/" className="hover:underline">Home</Link>
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href="/services" className="hover:underline">Services</Link>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span>Categories</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-3">
              {categoryName}
            </h1>
            <p className="text-lg md:text-xl text-white/90 max-w-2xl">
              {categoryDescription}
            </p>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <ProfessionalFilters resultsCount={professionals.length} />
        <Separator className="mb-8" />

        {professionals.length === 0 ? (
          <div className="text-center py-20">
            <div className="mb-4">
              <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No Professionals Found</h3>
              <p className="text-gray-600 max-w-md mx-auto">
                We currently don&apos;t have any professionals in this category. Check back soon or explore other categories.
              </p>
            </div>
            <Button asChild className="mt-6">
              <Link href="/services">Browse All Services</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {professionals.map(professional => (
              <ProfessionalCard key={professional._id} professional={professional} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
