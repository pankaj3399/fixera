'use client'

/**
 * ClarityAnalytics Component
 * Loads Microsoft Clarity when analytics consent is granted.
 * Sets custom Clarity tags for user identification and segmentation.
 */

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { initClarity, setClarityTag, setClarityUserId } from '@/lib/analytics'
import { getConsent, CONSENT_EVENT } from '@/lib/consent'

interface ClarityAnalyticsProps {
  projectId: string
}

export default function ClarityAnalytics({ projectId }: ClarityAnalyticsProps) {
  const { user } = useAuth()

  // Initialize Clarity when consent is available
  useEffect(() => {
    if (!projectId) return

    const tryInit = () => {
      const consent = getConsent()
      if (consent?.analytics) {
        initClarity(projectId)
      }
    }

    // Try immediately
    tryInit()

    // Also listen for future consent grants
    const handler = () => tryInit()
    window.addEventListener(CONSENT_EVENT, handler)
    return () => window.removeEventListener(CONSENT_EVENT, handler)
  }, [projectId])

  // Set user tags in Clarity when authenticated
  useEffect(() => {
    if (!user) return

    setClarityUserId(user._id)
    setClarityTag('userRole', user.role)
    setClarityTag(
      'country',
      user.location?.country ||
        user.businessInfo?.country ||
        user.companyAddress?.country ||
        'unknown'
    )
    setClarityTag('customerType', user.customerType || 'unknown')
  }, [user?._id, user?.role, user?.location?.country])

  return null
}
