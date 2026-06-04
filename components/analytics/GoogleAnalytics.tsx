'use client'

/**
 * GoogleAnalytics Component
 * Loads GA4, manages consent mode v2, tracks page views on route change,
 * and sets user properties when authenticated.
 */

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  initGA4,
  setupConsentListener,
  trackPageView,
  setUserProperties,
  setUserId,
} from '@/lib/analytics'

interface GoogleAnalyticsProps {
  measurementId: string
  clarityProjectId: string
}

export default function GoogleAnalytics({
  measurementId,
  clarityProjectId,
}: GoogleAnalyticsProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const prevPathname = useRef<string>('')

  // Initialize GA4 script (always loads for consent mode, but data only
  // flows when consent is granted)
  useEffect(() => {
    if (!measurementId) return
    initGA4(measurementId)
    const cleanup = setupConsentListener(measurementId, clarityProjectId)
    return cleanup
  }, [measurementId, clarityProjectId])

  // Track page views on route change
  useEffect(() => {
    if (!pathname || pathname === prevPathname.current) return
    prevPathname.current = pathname

    // Small delay to ensure page title is updated
    const timer = setTimeout(() => {
      trackPageView(pathname)
    }, 100)

    return () => clearTimeout(timer)
  }, [pathname])

  // Set user properties when auth state changes
  useEffect(() => {
    if (user) {
      setUserId(user._id)
      setUserProperties({
        user_role: user.role,
        country:
          user.location?.country ||
          user.businessInfo?.country ||
          user.companyAddress?.country ||
          'unknown',
        customer_type: user.customerType || 'unknown',
        professional_status: user.professionalStatus || 'n/a',
      })
    } else {
      setUserId(null)
    }
  }, [user?._id, user?.role, user?.location?.country])

  // No visible UI
  return null
}
