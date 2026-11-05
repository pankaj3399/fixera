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

const { parseAutoConversionResponse, parseAutoConversionState, resolveEffectiveCountry, resolveRequestCountry } = await import('../lib/i18n/autoConversion.ts')
const { createAutoConversionLoader } = await import('../lib/i18n/autoConversionLoader.ts')
const {
  buildAutoConversionPayload,
  isAutoConversionConfig,
  hydrateAutoConversion,
  initAutoConversionCard,
  syncAutoConversionCard,
  editAutoConversionCard,
  savedAutoConversionCard,
  toggleRolloutCountry,
  validateAutoConversionDraft,
  ROLLOUT_COUNTRY_OPTIONS,
} = await import('../lib/admin/autoConversionSettings.ts')

const configured = (enabledCountries, defaultCountry = 'BE') => ({
  success: true,
  data: { configured: true, enabledCountries, defaultCountry },
})

test('roll-out countries keep their geo country; all others get the default country', () => {
  const config = parseAutoConversionResponse(configured(['be', 'NL', 'NL']))
  assert.deepEqual(config, { enabledCountries: ['BE', 'NL'], defaultCountry: 'BE' })
  assert.deepEqual(resolveEffectiveCountry('NL', config), { country: 'NL', autoConverted: true })
  assert.deepEqual(resolveEffectiveCountry('DE', config), { country: 'BE', autoConverted: false })
  assert.deepEqual(resolveEffectiveCountry(undefined, config), { country: 'BE', autoConverted: false })
})

test('only an authoritative "configured: false" is unconfigured; unusable bodies are not', () => {
  assert.equal(parseAutoConversionResponse({ success: true, data: { configured: false } }), null)
  assert.deepEqual(parseAutoConversionState({ success: true, data: { configured: false } }), { status: 'unconfigured' })
  assert.equal(parseAutoConversionState({ success: false }), null)
  assert.equal(parseAutoConversionState({ success: true, data: {} }), null)
  assert.equal(parseAutoConversionState('nope'), null)
  for (const data of [{ configured: true }, { configured: true, enabledCountries: [] },
    { configured: true, enabledCountries: 'NL', defaultCountry: 'BE' },
    { configured: true, enabledCountries: ['invalid'], defaultCountry: 'BE' },
    { configured: true, enabledCountries: ['NL'], defaultCountry: 123 }]) {
    assert.equal(parseAutoConversionState({ success: true, data }), null)
  }
  assert.deepEqual(resolveEffectiveCountry('DE', null), { country: 'DE', autoConverted: true })
  assert.deepEqual(resolveEffectiveCountry(undefined, null), { country: undefined, autoConverted: false })
})

test('F5: request country per state — unknown never grants the geo country, keeps the previous decision', () => {
  const config = { status: 'configured', config: { enabledCountries: ['NL'], defaultCountry: 'FR' } }
  assert.deepEqual(resolveRequestCountry('DE', 'NL', config), { country: 'FR', autoConverted: false, authoritative: true })
  assert.deepEqual(resolveRequestCountry('NL', 'FR', config), { country: 'NL', autoConverted: true, authoritative: true })
  assert.deepEqual(resolveRequestCountry('DE', 'FR', { status: 'unconfigured' }), { country: 'DE', autoConverted: true, authoritative: true })
  const unknown = { status: 'unknown' }
  assert.deepEqual(resolveRequestCountry('DE', 'FR', unknown), { country: 'FR', autoConverted: false, authoritative: false }, 'previous default-country decision kept')
  assert.deepEqual(resolveRequestCountry('NL', 'nl', unknown), { country: 'NL', autoConverted: true, authoritative: false }, 'previous roll-out decision kept')
  assert.deepEqual(resolveRequestCountry('DE', undefined, unknown), { country: 'BE', autoConverted: false, authoritative: false }, 'no cookie: platform default, not DE')
  assert.deepEqual(resolveRequestCountry('DE', 'nope', unknown).country, 'BE')
})

test('loader caches, dedupes, survives outages and keeps the last good value', async () => {
  let clock = 0
  let calls = 0
  let mode = 'ok'
  const fetchImpl = async () => {
    calls++
    if (mode === 'down') throw new Error('offline')
    if (mode === 'partial') return new Response(JSON.stringify({ success: true, data: { configured: true } }))
    return new Response(JSON.stringify(configured(['FR'], 'FR')), { status: 200 })
  }
  const load = createAutoConversionLoader({ url: 'x', fetchImpl, now: () => clock, ttlMs: 1000, failureTtlMs: 100 })
  const [a, b] = await Promise.all([load(), load()])
  assert.deepEqual(a, { status: 'configured', config: { enabledCountries: ['FR'], defaultCountry: 'FR' } })
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
  const recovered = await load()
  assert.equal(calls, 3)
  clock = 2800; mode = 'partial'
  assert.equal(await load(), recovered, 'an incomplete configured body keeps the last good value')
})

test('loader uses the long timeout for only its first attempt, even after failure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let signal
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    signal = init.signal
    signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  let clock = 0
  const load = createAutoConversionLoader({ url: 'x', fetchImpl, now: () => clock, timeoutMs: 5, firstTimeoutMs: 40, failureTtlMs: 10 })
  const first = load()
  t.mock.timers.tick(39)
  assert.equal(signal.aborted, false)
  t.mock.timers.tick(1)
  assert.deepEqual(await first, { status: 'unknown' })
  clock = 11
  const retry = load()
  t.mock.timers.tick(5)
  assert.equal(signal.aborted, true, 'retry uses the steady-state timeout after a failed first attempt')
  assert.deepEqual(await retry, { status: 'unknown' })
})

test('F5: 5xx and unusable bodies keep unknown / the last answer; 404 (no endpoint) is authoritative unconfigured', async () => {
  let clock = 0
  let reply = () => new Response('boom', { status: 503 })
  const load = createAutoConversionLoader({ url: 'x', fetchImpl: async () => reply(), now: () => clock, ttlMs: 1000, failureTtlMs: 100 })
  assert.deepEqual(await load(), { status: 'unknown' })
  clock = 200; reply = () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })
  assert.deepEqual(await load(), { status: 'unknown' }, 'unusable 200 is not treated as unconfigured')
  clock = 400; reply = () => new Response(JSON.stringify(configured(['NL'], 'BE')), { status: 200 })
  const good = await load()
  assert.equal(good.status, 'configured')
  clock = 1500; reply = () => new Response('boom', { status: 502 })
  assert.equal(await load(), good, 'outage keeps the last authoritative answer')
  clock = 1700; reply = () => new Response(JSON.stringify({ success: false, msg: 'Not found' }), { status: 404 })
  assert.deepEqual(await load(), { status: 'unconfigured' })
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

test('F9: a dirty card draft survives a new initial prop (main settings save); a clean one re-hydrates', () => {
  const stored = { enabledCountries: ['NL'], defaultCountry: 'BE' }
  let state = initAutoConversionCard(stored)
  assert.equal(syncAutoConversionCard(state, stored), state, 'same prop: no state update')
  state = editAutoConversionCard(state, (d) => ({ ...d, enabledCountries: toggleRolloutCountry(d.enabledCountries, 'FR', true) }))
  assert.equal(state.dirty, true)
  // General settings save: the page passes a new, equal-valued object.
  const afterMainSave = { enabledCountries: ['NL'], defaultCountry: 'BE' }
  state = syncAutoConversionCard(state, afterMainSave)
  assert.deepEqual(state.draft.enabledCountries, ['FR', 'NL'], 'unsaved ticks are kept')
  assert.equal(syncAutoConversionCard(state, afterMainSave), state, 'and the new prop is remembered (no render loop)')
  state = savedAutoConversionCard(state, { enabledCountries: ['FR', 'NL'], defaultCountry: 'BE' })
  assert.equal(state.dirty, false)
  // Clean card follows a later server value.
  state = syncAutoConversionCard(state, { enabledCountries: ['LU'], defaultCountry: 'LU' })
  assert.deepEqual(state.draft, { configured: true, enabledCountries: ['LU'], defaultCountry: 'LU' })
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
    assert.equal(header(german, 'x-fixera-content-country'), 'BE', 'first-party content country')
    assert.equal(german.cookies.get('fixera_geo_country')?.value, 'BE')
    assert.equal(german.cookies.get('geo_currency')?.value, 'EUR')
    assert.equal(german.cookies.get('fixera_geo_locale')?.value, 'nl', 'Belgian default, not English for DE')
    assert.equal(header(german, 'x-fixera-locale'), 'nl')

    const forged = await run('DE', { 'x-fixera-content-country': 'NL' })
    assert.equal(header(forged, 'x-fixera-content-country'), 'BE', 'a client-supplied content country is overwritten')

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


test('admin validator and editor cover assigned ISO countries rather than arbitrary letters or Europe alone', () => {
  assert.equal(ROLLOUT_COUNTRY_OPTIONS.length, 249)
  const codes = new Set(ROLLOUT_COUNTRY_OPTIONS.map((c) => c.code))
  assert.equal(codes.size, 249)
  for (const code of ['US', 'CA', 'AU', 'JP', 'AQ', 'BV', 'AX', 'BQ', 'SS']) {
    assert.ok(codes.has(code))
    assert.equal(validateAutoConversionDraft({ enabledCountries: [code], defaultCountry: code }), null)
  }
  for (const code of ['ZZ', 'XX', 'EU', 'UN', 'UK', 'AN', 'XK']) {
    assert.ok(validateAutoConversionDraft({ enabledCountries: [code], defaultCountry: 'BE' }))
    assert.ok(validateAutoConversionDraft({ enabledCountries: [], defaultCountry: code }))
  }
  assert.equal(isAutoConversionConfig({ enabledCountries: ['US'], defaultCountry: 'US' }), true)
})

test('a completed save only clears the submitted draft, never newer edits', () => {
  const state = initAutoConversionCard({ enabledCountries: ['NL'], defaultCountry: 'BE' })
  const submitted = state.draft
  const newer = editAutoConversionCard(state, (draft) => ({ ...draft, defaultCountry: 'US' }))
  const saved = { enabledCountries: ['NL'], defaultCountry: 'FR' }
  const result = savedAutoConversionCard(newer, saved, submitted)
  assert.equal(result.draft, newer.draft)
  assert.equal(result.dirty, true)
  assert.equal(savedAutoConversionCard(state, saved, submitted).dirty, false)
})

test('content-country reader prefers middleware country and falls back to platform geo', async () => {
  const { readContentCountry } = await import('../lib/geo/contentCountryHeader.ts')
  assert.equal(readContentCountry(new Headers({ 'x-fixera-content-country': 'BE', 'x-vercel-ip-country': 'DE' })), 'BE')
  assert.equal(readContentCountry(new Headers({ 'x-vercel-ip-country': 'DE' })), 'DE')
  assert.equal(readContentCountry(new Headers({ 'x-fixera-content-country': 'bad', 'x-vercel-ip-country': 'NL' })), 'NL')
})

test('middleware matcher covers dynamic CMS slugs with asset extensions', async () => {
  const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server.js')
  const { config } = await import('../middleware.ts')
  for (const url of ['/pages/example.png', '/pages/example.svg', '/services/example.webp', '/blog', '/faq', '/api/cms/revalidate']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true, url)
  }
  for (const url of ['/_next/static/chunk.js', '/_next/image?url=a', '/favicon.ico', '/sw.js']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false, url)
  }
})
