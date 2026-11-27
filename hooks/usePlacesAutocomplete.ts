'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { attachPlacesAutocomplete } from '@/lib/address/placesAutocomplete'

/**
 * Binds one Google Places Autocomplete widget to `inputRef` for the life of
 * the input (see lib/address/placesAutocomplete.ts for why the widget must
 * never be re-created per render). `onPlaceChanged` may be a new function on
 * every render; the latest one is always used.
 */
export function usePlacesAutocomplete(
  inputRef: RefObject<HTMLInputElement | null>,
  {
    enabled,
    options,
    onPlaceChanged,
  }: {
    enabled: boolean
    options: google.maps.places.AutocompleteOptions
    onPlaceChanged: (place: google.maps.places.PlaceResult) => void
  },
) {
  const handlerRef = useRef(onPlaceChanged)
  const optionsRef = useRef(options)
  useEffect(() => {
    handlerRef.current = onPlaceChanged
  }, [onPlaceChanged])

  useEffect(() => {
    const input = inputRef.current
    if (!enabled || !input) return
    const { detach } = attachPlacesAutocomplete(
      {
        create: (element) => new google.maps.places.Autocomplete(element, optionsRef.current),
        clearListeners: (instance) => google.maps.event.clearInstanceListeners(instance),
      },
      input,
      () => (instance) => {
        const place = instance.getPlace()
        if (place) handlerRef.current(place)
      },
    )
    return detach
  }, [enabled, inputRef])
}
