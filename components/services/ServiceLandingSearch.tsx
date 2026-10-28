'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LocationAutocomplete, { type LocationData } from '@/components/search/LocationAutocomplete';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  serviceName: string;
}

export default function ServiceLandingSearch({ serviceName }: Props) {
  const t = useTranslations('catalog');
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState(serviceName);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setQuery(serviceName);
  }, [serviceName]);

  useEffect(() => {
    const parts = [user?.location?.city, user?.location?.country].filter(Boolean);
    setLocation(parts.length > 0 ? parts.join(', ') : '');
    const c = user?.location?.coordinates;
    if (Array.isArray(c) && c.length === 2) {
      const [lng, lat] = c;
      if (typeof lat === 'number' && typeof lng === 'number') {
        setCoords({ lat, lng });
      } else {
        setCoords(null);
      }
    } else {
      setCoords(null);
    }
  }, [user]);

  const handleLocationChange = useCallback((value: string, locationData?: LocationData) => {
    setLocation(value);
    setCoords(locationData?.coordinates || null);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set('type', 'projects');
    params.set('q', (query.trim() || serviceName).trim());
    if (location.trim()) params.set('loc', location.trim());
    if (coords) {
      params.set('lat', coords.lat.toString());
      params.set('lon', coords.lng.toString());
    }
    router.push(`/search?${params.toString()}`);
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-3xl">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2.5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          <div className="lg:col-span-5 flex items-center px-2">
            <label htmlFor="service-landing-search" className="sr-only">{t('landingSearch.serviceLabel')}</label>
            <Search className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
            <Input
              id="service-landing-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('landingSearch.servicePlaceholder')}
              className="border-0 focus:ring-0 text-base placeholder:text-gray-500 w-full"
            />
          </div>
          <div className="lg:col-span-4 px-2 lg:border-l lg:border-gray-200">
            <label htmlFor="service-landing-location" className="sr-only">{t('landingSearch.locationLabel')}</label>
            <LocationAutocomplete
              id="service-landing-location"
              value={location}
              onChange={handleLocationChange}
              placeholder={t('landingSearch.locationPlaceholder')}
            />
          </div>
          <div className="lg:col-span-3">
            <Button
              type="submit"
              className="w-full h-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl"
            >
              {t('landingSearch.submit')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
