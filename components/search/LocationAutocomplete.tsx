'use client'

import { useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { MapPin } from 'lucide-react'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'

interface LocationAutocompleteProps {
  value: string
  onChange: (location: string) => void
  placeholder?: string
  className?: string
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Location',
  className = ''
}: LocationAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const { isLoaded } = useGoogleMaps()

  useEffect(() => {
    if (!isLoaded || !inputRef.current) {
      return
    }

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['(regions)'],
      fields: ['formatted_address', 'address_components', 'geometry']
    })

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace()
      if (!place?.formatted_address) return

      let city = ''
      let country = ''

      if (place.address_components) {
        for (const component of place.address_components) {
          if (component.types.includes('locality')) {
            city = component.long_name
          }
          if (component.types.includes('country')) {
            country = component.long_name
          }
          if (!city && component.types.includes('administrative_area_level_1')) {
            city = component.long_name
          }
        }
      }

      const formattedLocation = city && country ? `${city}, ${country}` : place.formatted_address
      onChange(formattedLocation)
    })

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current)
      }
    }
  }, [isLoaded, onChange])

  return (
    <div className="flex items-center w-full">
      <MapPin className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
      <Input
        ref={inputRef}
        id="location-search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border-0 focus:ring-0 text-lg placeholder:text-gray-500 w-full ${className}`}
      />
    </div>
  )
}
