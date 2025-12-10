'use client'

import { useEffect, useState } from 'react'

interface GoogleMapsHook {
  isLoaded: boolean
  validateAddress: (address: string) => Promise<boolean>
  geocodeAddress: (address: string) => Promise<{ lat: number; lng: number } | null>
}

export const useGoogleMaps = (): GoogleMapsHook => {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Check if Google Maps is already loaded
    if ((window as any).google?.maps?.places) {
      setIsLoaded(true)
      return
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    )

    if (existingScript) {
      // Script is already loading, wait for it
      const checkInterval = setInterval(() => {
        if ((window as any).google?.maps?.places) {
          setIsLoaded(true)
          clearInterval(checkInterval)
        }
      }, 100)

      // Clear interval after 10 seconds
      setTimeout(() => clearInterval(checkInterval), 10000)
      return
    }

    const loadGoogleMapsScript = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/google-maps-config`
        )

        if (!response.ok) {
          throw new Error('Failed to get Google Maps configuration')
        }

        const data = await response.json()

        if (data.success && data.scriptUrl) {
          const script = document.createElement('script')
          script.src = data.scriptUrl
          script.async = true
          script.defer = true
          script.onload = () => {
            // Wait a bit for the API to fully initialize
            setTimeout(() => {
              if ((window as any).google?.maps?.places) {
                setIsLoaded(true)
              } else {
                console.error('❌ Google Maps loaded but places API not available')
              }
            }, 100)
          }
          script.onerror = (error) => {
            console.error('❌ Failed to load Google Maps script:', error)
            setIsLoaded(false)
          }
          document.head.appendChild(script)
        } else {
          console.error('❌ Invalid Google Maps config response')
        }
      } catch (error) {
        console.error('❌ Failed to load Google Maps configuration:', error)
        setIsLoaded(false)
      }
    }

    loadGoogleMapsScript()
  }, [])

  const validateAddress = async (address: string): Promise<boolean> => {
    if (!address) return false

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/validate-address`,
        {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ address })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        console.error('[GoogleMaps] Validation request failed:', response.status, data)
        return false
      }

      return data.success && data.isValid
    } catch (error) {
      console.error('Address validation error:', error)
      return false
    }
  }

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!address || !isLoaded) {
      console.log('⚠️ Geocoding skipped: address or Google Maps not loaded')
      return null
    }

    // Check if Google Maps and Geocoder are available
    if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder) {
      console.error('❌ Google Maps Geocoder not available')
      return null
    }

    try {
      const geocoder = new google.maps.Geocoder()

      return new Promise((resolve) => {
        // Set a timeout to avoid hanging promises
        const timeoutId = setTimeout(() => {
          console.error('❌ Geocoding timeout')
          resolve(null)
        }, 10000)

        geocoder.geocode({ address }, (results, status) => {
          clearTimeout(timeoutId)

          if (status === 'OK' && results && results.length > 0 && results[0]) {
            try {
              const location = results[0].geometry.location
              const lat = typeof location.lat === 'function' ? location.lat() : location.lat
              const lng = typeof location.lng === 'function' ? location.lng() : location.lng

              if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                console.log('✅ Geocoded address:', address, '→', { lat, lng })
                resolve({ lat, lng })
              } else {
                console.error('❌ Invalid coordinates from geocoding:', { lat, lng })
                resolve(null)
              }
            } catch (parseError) {
              console.error('❌ Error parsing geocoding result:', parseError)
              resolve(null)
            }
          } else {
            console.warn(`⚠️ Geocoding failed: ${status}`)
            resolve(null)
          }
        })
      })
    } catch (error) {
      console.error('❌ Geocoding error:', error)
      return null
    }
  }

  return { isLoaded, validateAddress, geocodeAddress }
}
