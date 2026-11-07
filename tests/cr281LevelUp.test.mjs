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

test('pending level-ups are independent of the bell first page', () => {
  const h = popup({ notification: item({ eventKey: 'other' }), inbox: { pendingItems: [item()] } })
  assert.match(textOf(h.render()), /Gold/)
  h.state.unmount()
})

test('inbox scans unread before/nextCursor pages independently and read flow updates older items', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch, previousBackend = process.env.NEXT_PUBLIC_BACKEND_URL
  process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.test'
  globalThis.window = { addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {} }
  const urls = [], state = hooks()
  globalThis.fetch = async (url, options) => {
    urls.push(String(url))
    if (options?.method === 'PATCH') return { ok: true }
    const query = new URL(url).searchParams
    const data = !query.has('unreadOnly') ? { items: [item({ id: 'bell', eventKey: 'other' })], unreadCount: 55 }
      : query.has('before') ? { items: [item()], nextCursor: null }
      : { items: Array.from({ length: 50 }, (_, i) => item({ id: `recent-${i}`, eventKey: 'other' })), nextCursor: '2026-10-01T00:00:00.000Z|older-id' }
    return { ok: true, json: async () => ({ success: true, data }) }
  }
  try {
    const Provider = loadComponent('../contexts/NotificationInboxProvider.tsx', { react: state.api, '@/lib/utils': { getAuthToken: () => null } }, 'NotificationInboxProvider')
    const render = () => { const tree = state.render(() => Provider({ isAuthenticated: true, sessionKey: 'user' })); state.flush(); return tree.props.value }
    render(); await settle(); let value = render()
    assert.deepEqual(value.items.map(n => n.id), ['bell'])
    assert.equal(value.pendingItems.length, 51)
    assert.equal(new URL(urls[2]).searchParams.get('before'), '2026-10-01T00:00:00.000Z|older-id')
    await value.markRead('up-1'); value = render()
    assert.ok(value.pendingItems.find(n => n.id === 'up-1').readAt)
    assert.equal(value.unreadCount, 54)
  } finally { state.unmount(); globalThis.window = previousWindow; globalThis.fetch = previousFetch; if (previousBackend === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL; else process.env.NEXT_PUBLIC_BACKEND_URL = previousBackend }
})

test('failed read recovery retries a dismissed popup without showing it again', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previousWindow = globalThis.window
  const storage = new Map()
  globalThis.window = { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }
  let reads = 0
  const inbox = { pendingItems: [item()] }
  const h = popup({ inbox, markRead: async id => {
    reads++
    inbox.pendingItems = inbox.pendingItems.map(n => n.id === id ? { ...n, readAt: 'optimistic' } : n)
  } })
  try {
    const tree = h.render()
    findAll(tree, n => typeof n.props.onClick === 'function' && textOf(n) === 'Maybe later')[0].props.onClick()
    assert.equal(reads, 1)
    assert.equal(h.render(), null)
    // The provider refresh restores unread state after a failed PATCH.
    inbox.pendingItems = [item()]
    assert.equal(h.render(), null)
    t.mock.timers.tick(4999); assert.equal(reads, 1)
    t.mock.timers.tick(1); await settle(); assert.equal(reads, 2)
    assert.equal(h.render(), null)
    t.mock.timers.tick(10000); assert.equal(reads, 2, 'successful read cancels retries')
  } finally { h.state.unmount(); globalThis.window = previousWindow }
})

for (const [url, expected] of [
  ['/dashboard/benefits?tab=levels#gold', '/dashboard/benefits?tab=levels#gold'],
  ['https://fixera.test/profile', '/profile'],
  ['//evil.test/path', '/dashboard/benefits'],
  ['/\\evil.test/path', '/dashboard/benefits'],
  ['https://evil.test/path', '/dashboard/benefits'],
  ['javascript:alert(1)', '/dashboard/benefits'],
]) test(`level-up navigation validates the resolved origin: ${url}`, () => {
  const previousWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://fixera.test' }, localStorage: { getItem() {}, setItem() {} } }
  const h = popup({ notification: item({ clickUrl: url }) })
  try {
    findAll(h.render(), n => typeof n.props.onClick === 'function' && textOf(n) === 'View my benefits')[0].props.onClick()
    assert.deepEqual(h.pushes, [expected])
  } finally { h.state.unmount(); globalThis.window = previousWindow }
})
