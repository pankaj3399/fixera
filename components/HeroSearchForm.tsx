'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, ArrowRight } from 'lucide-react'
import SearchAutocomplete from './search/SearchAutocomplete'
import LocationAutocomplete, { type LocationData } from './search/LocationAutocomplete'
import { useSearchAutocomplete, type Suggestion } from '@/hooks/useSearchAutocomplete'
import { useAuth } from '@/contexts/AuthContext'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function HeroSearchForm({
  popularServices,
}: {
  popularServices: string[]
}) {
  const router = useRouter()
  const t = useTranslations('home')
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [location, setLocation] = useState('')
  const [locationCoordinates, setLocationCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  const [searchType, setSearchType] = useState('projects')
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false)
  const hasPrefilledLocation = useRef(false)

  const { suggestions, isLoading } = useSearchAutocomplete(searchQuery, {
    searchType: searchType as 'professionals' | 'projects',
  })

  useEffect(() => {
    if (hasPrefilledLocation.current) return

    if (user?.location?.city && user?.location?.country) {
      setLocation(`${user.location.city}, ${user.location.country}`)
      hasPrefilledLocation.current = true
    }

    if (
      user?.location?.coordinates &&
      Array.isArray(user.location.coordinates) &&
      user.location.coordinates.length === 2
    ) {
      const [lng, lat] = user.location.coordinates
      if (typeof lat === 'number' && typeof lng === 'number') {
        setLocationCoordinates({ lat, lng })
      }
    }
  }, [user])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setIsAutocompleteOpen(false)

    if (searchQuery.trim()) {
      const params = new URLSearchParams()
      params.set('type', searchType)
      params.set('q', searchQuery.trim())
      if (location.trim()) {
        params.set('loc', location.trim())
      }
      if (locationCoordinates) {
        params.set('lat', locationCoordinates.lat.toString())
        params.set('lon', locationCoordinates.lng.toString())
      }
      router.push(`/search?${params.toString()}`)
    }
  }

  const handleSuggestionSelect = (suggestion: Suggestion) => {
    setSearchQuery(suggestion.value)
    setIsAutocompleteOpen(false)
  }

  return (
    <form onSubmit={handleSearch} className="max-w-5xl mx-auto mb-5">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-3 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4 flex items-center px-2 relative">
            <label htmlFor="service-search" className="sr-only">{t('search.serviceLabel')}</label>
            <Search className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
            <Input
              id="service-search"
              placeholder={t('search.servicePlaceholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setIsAutocompleteOpen(true)
              }}
              onFocus={() => setIsAutocompleteOpen(true)}
              className="border-0 focus:ring-0 text-lg placeholder:text-gray-500 w-full"
            />
          </div>

          <div className="lg:col-span-3 px-2 lg:border-l lg:border-gray-200">
            <label htmlFor="location-search" className="sr-only">{t('search.locationLabel')}</label>
            <LocationAutocomplete
              value={location}
              onChange={(value: string, locationData?: LocationData) => {
                setLocation(value)
                setLocationCoordinates(locationData?.coordinates || null)
              }}
              placeholder={t('search.locationPlaceholder')}
            />
          </div>

          <div className="lg:col-span-3 lg:border-l lg:border-gray-200">
            <Select value={searchType} onValueChange={setSearchType}>
              <SelectTrigger className="w-full h-full text-lg px-4 ml-2 mt-1 text-gray-500 border-0 focus-visible:ring-0 focus:ring-0">
                <SelectValue placeholder={t('search.typePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="projects">{t('search.typeProjects')}</SelectItem>
                <SelectItem value="professionals">{t('search.typeProfessionals')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-2">
            <Button
              type="submit"
              className="w-full h-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold text-lg rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {t('search.submit')}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>

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
            <p className="text-gray-600 text-sm">{t('search.popular')}</p>
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
  )
}
