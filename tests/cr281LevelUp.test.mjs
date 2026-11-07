import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createTranslator } from 'next-intl'
import { hooks, loadComponent, findAll, textOf, common, settle } from './reviewComponentHarness.mjs'
const item = (extra = {}) => ({ id: 'up-1', eventKey: 'professional.leveling_up', body: 'Congratulations — you reached Gold.', clickUrl: '/dashboard/benefits', createdAt: '2026-11-01', readAt: null, ...extra })
function popup({ locale = 'en', notification = item(), markRead = async () => {}, inbox = {} } = {}) {
  const state = hooks(), pushes = []
  const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}/dashboardWidgets.json`, import.meta.url), 'utf8'))
  const t = createTranslator({ locale, messages, timeZone: 'UTC' })
  const Popup = loadComponent('../components/dashboard/LevelUpPopup.tsx', {
    ...common, react: state.api,
    'next-intl': { useTranslations: () => t }, 'next/navigation': { useRouter: () => ({ push: url => pushes.push(url) }) },
    '@/contexts/NotificationInboxProvider': { useNotificationInbox: () => ({ items: [notification], markRead, ...inbox }) },
  })
  return { state, pushes, render() { const tree = state.render(() => Popup()); state.flush(); return tree } }
}
for (const locale of ['en', 'nl', 'fr']) test(`level-up description translates server copy and keeps the level (${locale})`, () => {
  for (const eventKey of ['customer.loyalty_tier_up', 'professional.leveling_up']) {
    const h = popup({ locale, notification: item({ eventKey }) })
    const text = textOf(h.render())
    assert.match(text, /Gold/)
    assert.match(text, locale === 'nl' ? /Gefeliciteerd/ : locale === 'fr' ? /Félicitations/ : /Congratulations/)
    if (locale !== 'en') assert.doesNotMatch(text, /Congratulations/)
    h.state.unmount()
  }
})
