'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, ArrowRight} from 'lucide-react'
import SearchAutocomplete from './search/SearchAutocomplete'
import LocationAutocomplete from './search/LocationAutocomplete'
import { useSearchAutocomplete, type Suggestion } from '@/hooks/useSearchAutocomplete'
import { useAuth } from '@/contexts/AuthContext'

// Import the Select component from shadcn/ui
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { keyBenefits } from '@/data/content'
import Icon from './Icon'



const HeroSection = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('');
  const [locationCoordinates, setLocationCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [searchType, setSearchType] = useState('projects');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [popularServices, setPopularServices] = useState<string[]>([]);

  // Use autocomplete hook
  const { suggestions, isLoading } = useSearchAutocomplete(searchQuery, {
    searchType: searchType as 'professionals' | 'projects',
  });

  // Pre-fill location from user's saved address
  useEffect(() => {
    if (user?.location?.city && user?.location?.country) {
      // Format: "City, Country" for better user experience
      const userLocation = `${user.location.city}, ${user.location.country}`;
      setLocation(userLocation);
    }

    if (
      user?.location?.coordinates &&
      Array.isArray(user.location.coordinates) &&
      user.location.coordinates.length === 2
    ) {
      const [lng, lat] = user.location.coordinates;
      if (typeof lat === 'number' && typeof lng === 'number') {
        setLocationCoordinates({ lat, lng });
      }
    }
  }, [user]);

  // Fetch popular services from backend on mount
  useEffect(() => {
    fetchPopularServices();
  }, []);

  const fetchPopularServices = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const response = await fetch(
        `${backendUrl}/api/search/popular?limit=5`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = (await response.json()) as { services?: Array<{ name: string }> };
        // Extract service names from published projects
        if (data.services && data.services.length > 0) {
          const serviceNames = data.services.map((s) => s.name);
          setPopularServices(serviceNames);
        } else {
          // No published projects yet, show message or fallback
          setPopularServices([]);
        }
      } else {
        // Fallback to empty if API fails
        console.error('Failed to fetch popular services');
        setPopularServices([]);
      }
    } catch (error) {
      console.error('Failed to fetch popular services:', error);
      // Fallback to empty on error
      setPopularServices([]);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAutocompleteOpen(false);

    if (searchQuery.trim()) {
      const params = new URLSearchParams();
      params.set('type', searchType);
      params.set('q', searchQuery.trim());
      if (location.trim()) {
        params.set('loc', location.trim());
      }
      if (locationCoordinates) {
        params.set('lat', locationCoordinates.lat.toString());
        params.set('lon', locationCoordinates.lng.toString());
      }
      router.push(`/search?${params.toString()}`);
    }
  };

  const handleSuggestionSelect = (suggestion: Suggestion) => {
    setSearchQuery(suggestion.value);
    setIsAutocompleteOpen(false);
  };

  return (
    <section id="hero" className="py-20 pt-32 pb-24 bg-gradient-to-br from-blue-50 via-white to-purple-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234F46E5' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <Badge className="mb-8 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 border-blue-200 px-6 py-2 text-base font-medium">
            One Platform. Every Solution.
          </Badge>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-[1.1] tracking-tight">
            <span className="bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
              Find Trusted Property
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
              Professionals Fast
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-gray-600 mb-12 max-w-4xl mx-auto leading-relaxed">
            From quick repairs to full renovations, connect with verified professionals
            across Europe. Book instantly or get custom quotes with guaranteed quality.
          </p>

          <form onSubmit={handleSearch} className="max-w-5xl mx-auto mb-5">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-3 relative">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-4 flex items-center px-2 relative">
                  <label htmlFor="service-search" className="sr-only">Service Search</label>
                  <Search className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
                  <Input
                    id="service-search"
                    placeholder="What service do you need?"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsAutocompleteOpen(true);
                    }}
                    onFocus={() => setIsAutocompleteOpen(true)}
                    className="border-0 focus:ring-0 text-lg placeholder:text-gray-500 w-full"
                  />
                </div>

                <div className="lg:col-span-3 px-2 lg:border-l lg:border-gray-200">
                  <label htmlFor="location-search" className="sr-only">Location</label>
                  <LocationAutocomplete
                    value={location}
                    onChange={setLocation}
                    placeholder="City, Country"
                  />
                </div>

                {/* --- NEW SELECT COMPONENT --- */}
                <div className="lg:col-span-3 lg:border-l lg:border-gray-200">
                  <Select value={searchType} onValueChange={setSearchType}>
                    <SelectTrigger className="w-full h-full text-lg px-4 ml-2 mt-1 text-gray-500 border-0 focus-visible:ring-0 focus:ring-0">
                      <SelectValue placeholder="Search for..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="projects">Search Projects</SelectItem>
                      <SelectItem value="professionals">Search Professionals</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="lg:col-span-2">
                  <Button
                    type="submit"
                    className="w-full h-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold text-lg rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    Search
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>

              {/* Autocomplete Dropdown */}
              <SearchAutocomplete
                suggestions={suggestions}
                isLoading={isLoading}
                onSelect={handleSuggestionSelect}
                isOpen={isAutocompleteOpen && searchQuery.length >= 2}
                onClose={() => setIsAutocompleteOpen(false)}
              />
            </div>

            {popularServices.length > 0 && (
              <div className="mt-6 text-center">
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                  <p className="text-gray-600 text-sm">Popular:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {popularServices.map((service) => (
                      <button
                        type="button"
                        key={service}
                        onClick={() => setSearchQuery(service)}
                        className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-full text-gray-700 hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        {service}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </form>

          {/* Key Benefits Section */}
        <div className="mt-10 pt-16 border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
                {keyBenefits.map((benefit) => (
                    <div key={benefit.title} className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                           <Icon name={benefit.icon} className="w-6 h-6 text-blue-700"/>
                        </div>
                        <div>
                            <h4 className="text-lg font-semibold text-gray-900">{benefit.title}</h4>
                            <p className="mt-1 text-gray-600">{benefit.description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        </div>
      </div>
    </section>
  )
}

export default HeroSection
