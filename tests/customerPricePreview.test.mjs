import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'
register('./swc-loader.mjs', import.meta.url)
import { hooks, loadComponent, settle } from './reviewComponentHarness.mjs'
const { createCustomerPriceCache } = await import('@/lib/customerPricePreview')
const { formatMoney, formatPrice } = await import('@/lib/currency/convert')

test('customer previews batch and deduplicate display amounts, preserving per-unit inputs and zero', async () => {
  const batches = []
  const cache = createCustomerPriceCache(async prices => { batches.push(prices); return prices.map(p => p.amount * 1.17) })
  const amount = { kind: 'amount', amount: 100 }
  assert.ok(Number.isNaN(cache.read(amount)))
  assert.ok(Number.isNaN(cache.read(amount)))
  const units = { kind: 'amount', amount: 50, unitPricing: { pricingType: 'unit', unitAmount: 10, quantity: 5 } }
  cache.read(units)
  await settle()
  assert.equal(batches.length, 1)
  assert.deepEqual(batches[0], [amount, units])
  assert.equal(cache.read(amount), 117)
  assert.equal(cache.ready(), true)
  cache.read({ kind: 'amount', amount: 0 })
  await settle()
  assert.equal(cache.read({ kind: 'amount', amount: 0 }), 0)
})

test('failed previews never become zero or a supplier amount; explicit retry can recover', async () => {
  let fails = true
  const cache = createCustomerPriceCache(async prices => { if (fails) throw new Error('Unavailable'); return prices.map(() => 121) })
  const request = { kind: 'amount', amount: 100 }
  cache.read(request); await settle()
  assert.equal(cache.ready(), false)
  assert.ok(cache.error())
  assert.ok(Number.isNaN(cache.read(request)))
  assert.equal(formatMoney(cache.read(request), 'EUR', 'en'), '…')
  assert.equal(formatPrice(cache.read(request), { currency: 'EUR', locale: 'en' }), '…')
  fails = false; cache.invalidate(); cache.read(request); await settle()
  assert.equal(cache.read(request), 121)
  assert.equal(cache.ready(), true)
})

test('an invalidation fences an older in-flight response and large lists are sent in bounded batches', async () => {
  let resolveOld
  let calls = 0
  const cache = createCustomerPriceCache(async prices => {
    calls++
    if (calls === 1) return new Promise(resolve => { resolveOld = resolve })
    assert.ok(prices.length <= 100)
    return prices.map(p => p.amount * 1.2)
  })
  const request = { kind: 'amount', amount: 100 }
  cache.read(request); await settle()
  cache.invalidate(); cache.read(request); await settle()
  resolveOld([110]); await settle()
  assert.equal(cache.read(request), 120)
  for (let amount = 1; amount <= 250; amount++) cache.read({ kind: 'amount', amount })
  await settle(); await settle(); await settle()
  assert.equal(cache.ready(), true)
  assert.equal(cache.read({ kind: 'amount', amount: 250 }), 300)
})

test('customer pricing hook requests amounts without ever fetching the commission endpoint', async () => {
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  globalThis.window = new EventTarget()
  globalThis.fetch = async () => { throw new Error('Customer must not fetch commission-rate') }
  const state = hooks()
  const cache = createCustomerPriceCache(async prices => prices.map(() => 117))
  const react = { ...state.api, useSyncExternalStore(subscribe, snapshot) {
    const [, setVersion] = state.api.useState(0)
    state.api.useEffect(() => subscribe(() => setVersion(v => v + 1)), [subscribe])
    return snapshot()
  } }
  const usePricing = loadComponent('../hooks/useCommissionRate.ts', {
    react,
    '@/contexts/AuthContext': { useAuth: () => ({ user: { _id: 'customer', role: 'customer' } }) },
    '@/lib/clientRequestCache': { cachedClientRequest() { throw new Error('Customer must not request a rate') } },
    '@/lib/customerPricePreview': { customerPriceCache: cache },
  }, 'useCommissionRate')
  const draw = () => { const value = state.render(() => usePricing()); state.flush(); return value }
  try {
    let value = draw()
    assert.equal(value.commissionPercent, null)
    assert.ok(Number.isNaN(value.customerPrice(100)))
    await settle()
    value = draw()
    assert.equal(value.customerPrice(100), 117)
    assert.equal(value.commissionPercent, null)
    assert.equal(value.pricingReady, true)
  } finally { state.unmount(); globalThis.window = previousWindow; globalThis.fetch = previousFetch }
})

test('a failed price lookup renders a translated retry control', async () => {
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { readFileSync } = await import('node:fs')
  for (const locale of ['en', 'nl', 'fr']) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}/common.json`, import.meta.url)))
    const Notice = loadComponent('../components/CustomerPricingNotice.tsx', {
      react: React,
      'next-intl': { useTranslations: () => key => messages[key] },
      '@/lib/customerPricePreview': { customerPriceCache: { subscribe: () => () => {}, snapshot: () => 1, error: () => new Error('Unavailable'), invalidate() {} } },
    }, 'CustomerPricingNotice')
    const html = renderToStaticMarkup(React.createElement(Notice))
    assert.match(html, /role="alert"/)
    assert.ok(html.includes(messages.pricesUnavailable))
    assert.ok(html.includes(messages.tryAgain))
  }
})

test('an unavailable price remains unknown through VAT and milestone allocation', async () => {
  const { calculateQuoteVersionVatTotals, calculateMilestoneGrossAmounts } = await import('@/lib/vatPricing')
  const version = { pricingLines: [{ price: 100, vatRate: 21 }], milestones: [{ amount: 50 }, { amount: 50 }] }
  const unavailable = () => NaN
  assert.ok(Number.isNaN(calculateQuoteVersionVatTotals(version, unavailable).total))
  assert.ok(calculateMilestoneGrossAmounts(version, unavailable).every(Number.isNaN))
})


test('a fixed checkout keeps its payment flow while server pricing is unavailable', async () => {
  const { readFileSync } = await import('node:fs')
  const { transformSync } = await import('@swc/core')
  const source = readFileSync(new URL('../components/project/ProjectBookingForm.tsx', import.meta.url), 'utf8')
  const fragment = source.slice(source.indexOf('  const baseDisplayTotal ='), source.indexOf('  const finalStepLabel ='))
  const code = transformSync(fragment, { jsc: { parser: { syntax: 'typescript' } } }).code
  const run = new Function('displayTotalPrice', 'calculateTotal', 'packageUnitCount', 'discountedDisplayTotalPrice', 'vatPreview', 'proceedAtStandardVat', 'selectedPackage', `${code}; return { finalDisplayTotal, shouldPayAtCheckoutFlow }`)
  const missing = run(null, () => 100, 1, null, null, false, { pricing: { type: 'fixed', amount: 100 } })
  assert.ok(Number.isNaN(missing.finalDisplayTotal))
  assert.equal(missing.shouldPayAtCheckoutFlow, true)
  const ready = run(117, () => 100, 1, null, null, false, { pricing: { type: 'fixed', amount: 100 } })
  assert.equal(ready.finalDisplayTotal, 117)
})
