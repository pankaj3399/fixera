'use client'

import { useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { MapPin } from 'lucide-react'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete'

export interface LocationData {
  formattedAddress: string
  coordinates?: {
    lat: number
    lng: number
  }
  city?: string
  state?: string
  country?: string
}

const LOCATION_AUTOCOMPLETE_OPTIONS = {
  types: ['(regions)'],
  fields: ['formatted_address', 'address_components', 'geometry'],
}

interface LocationAutocompleteProps {
  value: string
  onChange: (location: string, locationData?: LocationData) => void
  placeholder?: string
  className?: string
  id?: string
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  className = '',
  id = 'location-search'
}: LocationAutocompleteProps) {
  const t = useTranslations('search')
  const inputRef = useRef<HTMLInputElement>(null)
  const { isLoaded, loadGoogleMaps } = useGoogleMaps()

  const enableAutocomplete = useCallback(() => {
    void loadGoogleMaps()
  }, [loadGoogleMaps])

  // One widget per input for the life of the field: callers pass an inline
  // onChange, and re-creating the widget per render stacked stale dropdowns
  // on the input so the first click on a suggestion did nothing (FT2-6A).
  usePlacesAutocomplete(inputRef, {
    enabled: isLoaded,
    options: LOCATION_AUTOCOMPLETE_OPTIONS,
    onPlaceChanged: (place) => {
      if (!place.formatted_address) return

      let city = ''
      let country = ''
      let stateOrRegion = ''

      if (place.address_components) {
        for (const component of place.address_components) {
          if (component.types.includes('locality')) {
            city = component.long_name
          }
          if (component.types.includes('administrative_area_level_1')) {
            stateOrRegion = component.long_name
          }
          if (component.types.includes('country')) {
            country = component.long_name
          }
        }
      }

      const parts = [city, stateOrRegion, country].filter(Boolean)
      const formattedLocation = parts.length > 0 ? parts.join(', ') : place.formatted_address

      let coordinates: { lat: number; lng: number } | undefined
      try {
        const location = place.geometry?.location
        if (location) {
          const lat = typeof location.lat === 'function' ? location.lat() : location.lat
          const lng = typeof location.lng === 'function' ? location.lng() : location.lng
          if (typeof lat === 'number' && typeof lng === 'number') {
            coordinates = { lat, lng }
          }
        }
      } catch (error) {
        console.warn('Could not extract coordinates from location:', error)
      }

      onChange(formattedLocation, {
        formattedAddress: formattedLocation,
        coordinates,
        city,
        state: stateOrRegion,
        country,
      })
    },
  })

  return (
    <div className="flex items-center w-full">
      <MapPin className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
      <Input
        ref={inputRef}
        id={id}
        placeholder={placeholder ?? t('filters.location')}
        value={value}
        onFocus={enableAutocomplete}
        onPointerDown={enableAutocomplete}
        onChange={(e) => onChange(e.target.value)}
        className={`border-0 focus:ring-0 text-lg placeholder:text-gray-500 w-full ${className}`}
      />
    </div>
  )
}
