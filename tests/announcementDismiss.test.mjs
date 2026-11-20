import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

const memoryStorage = () => {
  const values = new Map()
  return { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k), clear: () => values.clear() }
}
globalThis.window = { sessionStorage: memoryStorage(), localStorage: memoryStorage() }
globalThis.localStorage = globalThis.window.localStorage
globalThis.sessionStorage = globalThis.window.sessionStorage

const { dismissAnnouncement, isAnnouncementDismissed, isAnnouncementFrequencyBlocked, markAnnouncementShown } =
  await import('../lib/marketing/siteAnnouncements/dismissStorage.ts')

const popup = (frequency) => ({ _id: `a-${frequency}`, updatedAt: '2026-11-20T06:00:00.000Z', type: 'modal', dismissible: true, frequency })

test('CA6: a dismissed once-per-page-view popup stays closed after a reload in the same session', () => {
  const announcement = popup('once_pageview')
  markAnnouncementShown(announcement)
  assert.equal(isAnnouncementFrequencyBlocked(announcement), false, 'an undismissed popup shows on every page view')
  dismissAnnouncement(announcement)
  // A reload keeps sessionStorage; the module state is irrelevant.
  assert.equal(isAnnouncementDismissed(announcement), true)
  assert.equal(isAnnouncementFrequencyBlocked(announcement), true)
  // A new browser session (sessionStorage cleared) shows it again.
  window.sessionStorage.clear()
  assert.equal(isAnnouncementDismissed(announcement), false)
  // An edited announcement (new updatedAt) is a new campaign.
  dismissAnnouncement(announcement)
  assert.equal(isAnnouncementDismissed({ ...announcement, updatedAt: '2026-11-21T06:00:00.000Z' }), false)
})

test('other frequencies keep their dismissal rules', () => {
  const daily = popup('once_day')
  dismissAnnouncement(daily)
  assert.equal(isAnnouncementDismissed(daily), true)
  assert.ok(window.localStorage.getItem(`fixera-announce-frequency:${daily._id}:${daily.updatedAt}:once_day:dismissed`))
})
