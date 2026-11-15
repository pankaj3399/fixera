'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CONSENT_EVENT, STORAGE_KEY, LEGACY_STORAGE_KEY, getConsent, setConsent, type ConsentState } from '@/lib/consent'

export default function CookieConsent() {
  const t = useTranslations('cookieConsent')
  const [decided, setDecided] = useState<ConsentState | null | undefined>(undefined)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [analyticsOn, setAnalyticsOn] = useState(false)
  const [marketingOn, setMarketingOn] = useState(false)

  useEffect(() => {
    setDecided(getConsent())

    const refresh = () => setDecided(getConsent())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY || e.key === null) refresh()
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
  }

  const handleRejectAll = () => {
    const state = setConsent({ analytics: false, marketing: false })
    setDecided(state)
  }

  const handleSave = () => {
    const state = setConsent({ analytics: analyticsOn, marketing: marketingOn })
    setDecided(state)
    setCustomizeOpen(false)
  }

  return (
    <>
      <div
        role="region"
        aria-label={t('regionLabel')}
        aria-live="polite"
        className="fixed bottom-0 left-0 right-0 z-[100] border-t bg-background p-4 shadow-lg sm:p-6"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t('title')}</p>
            <p className="mt-1">
              {t('intro')}{' '}
              {/* A plain link, as before; the rule matches every path since pages live under app/[ctx]. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/privacy-policy" className="underline underline-offset-2 hover:text-foreground">
                {t('privacyPolicy')}
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
              {t('customize')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRejectAll}>
              {t('rejectAll')}
            </Button>
            <Button size="sm" onClick={handleAcceptAll}>
              {t('acceptAll')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('preferencesTitle')}</DialogTitle>
            <DialogDescription>{t('preferencesDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="cookie-label-necessary" className="font-medium">{t('necessary')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('necessaryDescription')}
                </p>
              </div>
              <Switch checked disabled aria-labelledby="cookie-label-necessary" />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="cookie-label-analytics" className="font-medium">{t('analytics')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('analyticsDescription')}
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
                <p id="cookie-label-marketing" className="font-medium">{t('marketing')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('marketingDescription')}
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
              {t('cancel')}
            </Button>
            <Button onClick={handleSave}>{t('savePreferences')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
