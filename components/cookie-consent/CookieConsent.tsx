'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CONSENT_EVENT, STORAGE_KEY, getConsent, setConsent, type ConsentState } from '@/lib/consent'
import { trackCookieConsentDecision } from '@/lib/analyticsEvents'
import { updateGA4Consent } from '@/lib/analytics'

export default function CookieConsent() {
  const [decided, setDecided] = useState<ConsentState | null | undefined>(undefined)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [analyticsOn, setAnalyticsOn] = useState(false)
  const [marketingOn, setMarketingOn] = useState(false)

  useEffect(() => {
    setDecided(getConsent())

    const refresh = () => setDecided(getConsent())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) refresh()
    }
    window.addEventListener(CONSENT_EVENT, refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CONSENT_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  if (decided === undefined) return null
  if (decided !== null) return null

  const handleAcceptAll = () => {
    const state = setConsent({ analytics: true, marketing: true })
    setDecided(state)
    updateGA4Consent(true, true)
    trackCookieConsentDecision({ action: 'accept_all', analytics_accepted: true, marketing_accepted: true })
  }

  const handleRejectAll = () => {
    const state = setConsent({ analytics: false, marketing: false })
    setDecided(state)
    updateGA4Consent(false, false)
    trackCookieConsentDecision({ action: 'reject_all', analytics_accepted: false, marketing_accepted: false })
  }

  const handleSave = () => {
    const state = setConsent({ analytics: analyticsOn, marketing: marketingOn })
    setDecided(state)
    setCustomizeOpen(false)
    updateGA4Consent(analyticsOn, marketingOn)
    trackCookieConsentDecision({ action: 'custom', analytics_accepted: analyticsOn, marketing_accepted: marketingOn })
  }

  return (
    <>
      <div
        role="region"
        aria-label="Cookie consent"
        aria-live="polite"
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-4 shadow-lg sm:p-6"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">We use cookies</p>
            <p className="mt-1">
              Essential cookies keep the site running. With your consent we&apos;d also use analytics and marketing
              cookies to improve our service. You can change your choice anytime.{' '}
              <a href="/privacy-policy" className="underline underline-offset-2 hover:text-foreground">
                Privacy policy
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
              Customize
            </Button>
            <Button variant="outline" size="sm" onClick={handleRejectAll}>
              Reject all
            </Button>
            <Button size="sm" onClick={handleAcceptAll}>
              Accept all
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>
              Choose which categories of cookies to allow. You can change this later from the privacy policy page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="cookie-label-necessary" className="font-medium">Necessary</p>
                <p className="text-sm text-muted-foreground">
                  Required for the site to function (login, security, payment processing). Always on.
                </p>
              </div>
              <Switch checked disabled aria-labelledby="cookie-label-necessary" />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="cookie-label-analytics" className="font-medium">Analytics</p>
                <p className="text-sm text-muted-foreground">
                  Helps us understand how the site is used so we can improve it. No personal data is sold.
                </p>
              </div>
              <Switch
                checked={analyticsOn}
                onCheckedChange={setAnalyticsOn}
                aria-labelledby="cookie-label-analytics"
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="cookie-label-marketing" className="font-medium">Marketing</p>
                <p className="text-sm text-muted-foreground">
                  Used to show relevant content and measure campaign performance.
                </p>
              </div>
              <Switch
                checked={marketingOn}
                onCheckedChange={setMarketingOn}
                aria-labelledby="cookie-label-marketing"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomizeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save preferences</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
