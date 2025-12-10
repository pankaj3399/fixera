'use client'

import { useEffect, useState } from 'react'

interface GoogleMapsHook {
  isLoaded: boolean
  validateAddress: (address: string) => Promise<boolean>
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

  return { isLoaded, validateAddress }
}
