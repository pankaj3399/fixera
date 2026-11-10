// Runs in its own process (node --test isolation), so the middleware's
// per-isolate loader starts cold here.
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
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

test('F5: backend outage on a cold isolate keeps the visitor\'s previous decision and writes no geo cookies', async () => {
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed') }
  try {
    const { NextRequest } = await import('next/server.js')
    const { middleware } = await import('../middleware.ts')
    const run = (country, cookie, extra = {}) => middleware(new NextRequest('https://fixtract.test/', {
      headers: { 'x-vercel-ip-country': country, 'accept-language': 'de-DE,de;q=0.9', ...(cookie ? { cookie } : {}), ...extra },
    }))
    const header = (res, name) => res.headers.get(`x-middleware-request-${name}`)

    // German visitor previously served as the admin default (BE): stays BE.
    const returning = await run('DE', 'fixera_geo_country=BE; fixera_geo_locale=nl; geo_currency=EUR')
    assert.equal(calls, 1)
    assert.equal(header(returning, 'x-fixera-content-country'), 'BE')
    assert.equal(header(returning, 'x-vercel-ip-country'), 'BE')
    assert.equal(header(returning, 'x-fixera-locale'), 'nl')
    assert.equal(returning.cookies.getAll().length, 0, 'no geo cookie rewritten from an unknown config')

    // Roll-out visitor previously served as themselves (NL): stays NL.
    const rollout = await run('NL', 'fixera_geo_country=NL')
    assert.equal(header(rollout, 'x-fixera-content-country'), 'NL')

    // First visit during the outage: geo country is not granted on its own.
    const fresh = await run('DE', undefined, { 'x-fixera-content-country': 'DE' })
    assert.equal(header(fresh, 'x-fixera-content-country'), 'BE', 'platform default, client header ignored')
    assert.equal(header(fresh, 'x-fixera-currency'), 'EUR')
    assert.equal(fresh.cookies.getAll().length, 0)
    assert.equal(calls, 1, 'failure window: no fetch per request')
  } finally {
    globalThis.fetch = realFetch
  }
})
