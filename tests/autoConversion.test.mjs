import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
// Test-only resolution the shared loader lacks: Next's `next/server` subpath
// (no ESM export map) and `@/` imports of a directory with an index.ts.
const ROOT = new URL('..', import.meta.url).pathname
register('data:text/javascript,' + encodeURIComponent(`
  import { statSync } from 'node:fs'
  export async function resolve(s, c, n) {
    if (s === 'next/server') return n('next/server.js', c)
    if (s.startsWith('@/')) {
      try { if (statSync(${JSON.stringify(ROOT)} + s.slice(2)).isDirectory()) return n(s + '/index', c) } catch {}
    }
    return n(s, c)
  }
`))
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.test'

const { parseAutoConversionResponse, resolveEffectiveCountry } = await import('../lib/i18n/autoConversion.ts')
const { createAutoConversionLoader } = await import('../lib/i18n/autoConversionLoader.ts')
const {
  buildAutoConversionPayload,
  hydrateAutoConversion,
  toggleRolloutCountry,
  validateAutoConversionDraft,
  ROLLOUT_COUNTRY_OPTIONS,
} = await import('../lib/admin/autoConversionSettings.ts')

const configured = (enabledCountries, defaultCountry = 'BE') => ({
  success: true,
  data: { configured: true, enabledCountries, defaultCountry },
})

test('roll-out countries keep their geo country; all others get the default country', () => {
  const config = parseAutoConversionResponse(configured(['be', 'NL', 'NL', 'xx1']))
  assert.deepEqual(config, { enabledCountries: ['BE', 'NL'], defaultCountry: 'BE' })
  assert.deepEqual(resolveEffectiveCountry('NL', config), { country: 'NL', autoConverted: true })
  assert.deepEqual(resolveEffectiveCountry('DE', config), { country: 'BE', autoConverted: false })
  assert.deepEqual(resolveEffectiveCountry(undefined, config), { country: 'BE', autoConverted: false })
})

test('unconfigured or unusable config keeps auto-conversion on everywhere', () => {
  assert.equal(parseAutoConversionResponse({ success: true, data: { configured: false } }), null)
  assert.equal(parseAutoConversionResponse({ success: false }), null)
  assert.equal(parseAutoConversionResponse('nope'), null)
  assert.deepEqual(resolveEffectiveCountry('DE', null), { country: 'DE', autoConverted: true })
  assert.deepEqual(resolveEffectiveCountry(undefined, null), { country: undefined, autoConverted: false })
})

test('loader caches, dedupes, survives outages and keeps the last good value', async () => {
  let clock = 0
  let calls = 0
  let mode = 'ok'
  const fetchImpl = async () => {
    calls++
    if (mode === 'down') throw new Error('offline')
    return new Response(JSON.stringify(configured(['FR'], 'FR')), { status: 200 })
  }
  const load = createAutoConversionLoader({ url: 'x', fetchImpl, now: () => clock, ttlMs: 1000, failureTtlMs: 100 })
  const [a, b] = await Promise.all([load(), load()])
  assert.deepEqual(a, { enabledCountries: ['FR'], defaultCountry: 'FR' })
  assert.equal(b, a)
  assert.equal(calls, 1, 'concurrent requests share one fetch')
  clock = 500
  await load()
  assert.equal(calls, 1, 'fresh value is reused within the TTL')
  clock = 1500
  mode = 'down'
  assert.deepEqual(await load(), a, 'outage keeps the last good value')
  assert.equal(calls, 2)
  clock = 1550
  await load()
  assert.equal(calls, 2, 'failure window avoids hammering the backend')
  clock = 1700
  mode = 'ok'
  await load()
  assert.equal(calls, 3)
})

test('loader times out a hanging backend and reports not configured', async () => {
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  const load = createAutoConversionLoader({ url: 'x', fetchImpl, timeoutMs: 10 })
  assert.equal(await load(), null)
})

test('admin draft helpers', () => {
  assert.deepEqual(hydrateAutoConversion(undefined), { configured: false, enabledCountries: [], defaultCountry: 'BE' })
  assert.deepEqual(hydrateAutoConversion({ enabledCountries: ['nl', 'BE'], defaultCountry: 'nl' }), {
    configured: true, enabledCountries: ['NL', 'BE'], defaultCountry: 'NL',
  })
  assert.deepEqual(toggleRolloutCountry(['NL'], 'be', true), ['BE', 'NL'])
  assert.deepEqual(toggleRolloutCountry(['BE', 'NL'], 'BE', false), ['NL'])
  assert.equal(validateAutoConversionDraft({ enabledCountries: [], defaultCountry: '' }), 'Choose a default country.')
  assert.equal(validateAutoConversionDraft({ enabledCountries: ['BE'], defaultCountry: 'BE' }), null)
  assert.deepEqual(buildAutoConversionPayload({ enabledCountries: ['nl', 'BE', 'NL'], defaultCountry: 'be' }), {
    enabledCountries: ['BE', 'NL'], defaultCountry: 'BE',
  })
  const codes = ROLLOUT_COUNTRY_OPTIONS.map((c) => c.code)
  for (const code of ['BE', 'NL', 'FR', 'DE', 'LU', 'CH', 'GB']) assert.ok(codes.includes(code), code)
  assert.equal(ROLLOUT_COUNTRY_OPTIONS.find((c) => c.code === 'CH').flag, '🇨🇭')
})

test('middleware serves non-roll-out visitors as the default country, roll-out visitors as themselves', async () => {
  const realFetch = globalThis.fetch
  const seen = []
  globalThis.fetch = async (url) => {
    seen.push(String(url))
    return new Response(JSON.stringify(configured(['NL'], 'BE')), { status: 200 })
  }
  try {
    const { NextRequest } = await import('next/server.js')
    const { middleware } = await import('../middleware.ts')
    const run = (country, extraHeaders = {}, cookie) => middleware(new NextRequest('https://fixtract.test/', {
      headers: { 'x-vercel-ip-country': country, 'accept-language': 'de-DE,de;q=0.9', ...(cookie ? { cookie } : {}), ...extraHeaders },
    }))
    const header = (res, name) => res.headers.get(`x-middleware-request-${name}`)

    const german = await run('DE')
    assert.equal(seen[0], 'https://backend.test/api/public/auto-conversion')
    assert.equal(header(german, 'x-vercel-ip-country'), 'BE', 'CMS content of the default country')
    assert.equal(german.cookies.get('fixera_geo_country')?.value, 'BE')
    assert.equal(german.cookies.get('geo_currency')?.value, 'EUR')
    assert.equal(german.cookies.get('fixera_geo_locale')?.value, 'nl', 'Belgian default, not English for DE')
    assert.equal(header(german, 'x-fixera-locale'), 'nl')

    const dutch = await run('NL')
    assert.equal(dutch.cookies.get('fixera_geo_country')?.value, 'NL')
    assert.equal(header(dutch, 'x-fixera-locale'), 'nl')
    assert.equal(header(dutch, 'x-vercel-ip-country'), 'NL')

    const swissManual = await run('CH', {}, 'NEXT_LOCALE=fr; NEXT_CURRENCY=CHF')
    assert.equal(swissManual.cookies.get('fixera_geo_country')?.value, 'BE')
    assert.equal(swissManual.cookies.get('geo_currency')?.value, 'EUR', 'geo default follows the default country')
    assert.equal(header(swissManual, 'x-fixera-locale'), 'fr', 'manual language wins')
    assert.equal(header(swissManual, 'x-fixera-currency'), 'CHF', 'manual currency wins')
    assert.equal(seen.length, 1, 'config fetched once per isolate within the TTL')
  } finally {
    globalThis.fetch = realFetch
  }
})
