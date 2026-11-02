import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.test'

const { createAnnouncementEventRecorder } = await import('../lib/marketing/siteAnnouncements/events.ts')

const announcement = (overrides = {}) => ({
  _id: 'a1',
  name: 'QA',
  type: 'modal',
  title: 'Offer',
  message: 'Hello',
  ctaUrl: '/services',
  activeCountries: [],
  locale: 'en',
  frequency: 'once_pageview',
  delaySeconds: 0,
  dismissible: true,
  requireMarketingConsent: false,
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2099-01-01T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  ...overrides,
})

test('recorder posts the backend event contract without credentials', () => {
  const calls = []
  const record = createAnnouncementEventRecorder({ apiBase: 'https://api.test', send: (url, init) => calls.push({ url, init }) })
  assert.equal(record(announcement(), 'impression', '/'), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.test/api/public/site-announcements/a1/event')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].init.body), { event: 'impression' })
  assert.equal(calls[0].init.credentials, 'omit')
  assert.equal(calls[0].init.keepalive, true)
})

test('each event counts once per reveal; new reveals and new versions count again', () => {
  const events = []
  const record = createAnnouncementEventRecorder({ apiBase: '', send: (_url, init) => events.push(JSON.parse(init.body).event) })
  record(announcement(), 'impression', '/')
  record(announcement(), 'impression', '/') // re-render of the same reveal
  record(announcement(), 'impression', '/services') // once_pageview: next page reveals again
  record(announcement(), 'click')
  record(announcement(), 'click') // double click
  record(announcement(), 'dismissal')
  record(announcement({ updatedAt: '2026-11-04T00:00:00.000Z' }), 'click') // edited announcement
  assert.deepEqual(events, ['impression', 'impression', 'click', 'dismissal', 'click'])
  assert.equal(record({ _id: '' }, 'click'), false)
})

test('a throwing transport never breaks the page', () => {
  const record = createAnnouncementEventRecorder({ apiBase: '', send: () => { throw new Error('offline') } })
  assert.equal(record(announcement(), 'click'), true)
})

test('provider records dismissals and clicks from real visitor actions', async () => {
  const realFetch = globalThis.fetch
  const sent = []
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), event: JSON.parse(init.body).event })
    return new Response(null, { status: 204 })
  }
  try {
    const React = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { NextIntlClientProvider } = await import('next-intl')
    const { SiteAnnouncementsProvider } = await import('@/components/marketing/site-announcements/Provider')
    const { useAnnouncementsCtx } = await import('@/components/marketing/site-announcements/context')
    const messages = { content: JSON.parse(readFileSync(new URL('../messages/en/content.json', import.meta.url), 'utf8')) }

    let ctx
    const Capture = () => { ctx = useAnnouncementsCtx(); return null }
    renderToStaticMarkup(
      React.createElement(NextIntlClientProvider, { locale: 'en', messages },
        React.createElement(SiteAnnouncementsProvider, null, React.createElement(Capture))),
    )
    assert.ok(ctx, 'context captured')

    const dismissible = announcement({ _id: 'd1' })
    const locked = announcement({ _id: 'l1', dismissible: false })
    ctx.hide(dismissible)
    ctx.hide(locked) // non-dismissible offers close only as an acknowledgement
    ctx.onCta(announcement({ _id: 'c1' }))
    ctx.onCta(announcement({ _id: 'c1' }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(sent, [
      { url: 'https://backend.test/api/public/site-announcements/d1/event', event: 'dismissal' },
      { url: 'https://backend.test/api/public/site-announcements/c1/event', event: 'click' },
    ], 'a CTA click is a click, not also a dismissal')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('overlays and top bar record impressions on reveal, never for previews', () => {
  const overlays = readFileSync(new URL('../components/marketing/site-announcements/Overlays.tsx', import.meta.url), 'utf8')
  assert.match(overlays, /recordAnnouncementEvent\(modal, "impression", modalOccurrence\)/)
  assert.match(overlays, /recordAnnouncementEvent\(exitIntent, "impression", exitOccurrence\)/)
  const previewSection = overlays.slice(overlays.indexOf('export function SiteAnnouncementPreviewOverlays'))
  assert.doesNotMatch(previewSection, /recordAnnouncementEvent/)
  const banner = readFileSync(new URL('../components/marketing/site-announcements/Banner.tsx', import.meta.url), 'utf8')
  assert.match(banner, /if \(!topBar \|\| isPreview\) return;\s*recordAnnouncementEvent\(topBar, "impression"\)/)
})
