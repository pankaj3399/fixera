import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
// Test-only resolution: Next's `next/server` subpath has no extensionless ESM export.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) {
    if (s === 'next/server') return n('next/server.js', c)
    return n(s, c)
  }
`))

const { loadComponent, findAll, textOf, ui } = await import('./reviewComponentHarness.mjs')
const messages = Object.fromEntries(['en', 'nl', 'fr'].map(locale => [
  locale,
  JSON.parse(readFileSync(new URL(`../messages/${locale}/common.json`, import.meta.url), 'utf8')),
]))

const renderNotFound = async (locale) => {
  const copy = messages[locale].common?.notFound ?? messages[locale].notFound
  const translator = key => { assert.ok(key in copy, `missing common.notFound.${key}`); return copy[key] }
  const Page = loadComponent('../app/not-found.tsx', {
    'next-intl/server': { getTranslations: async ns => { assert.equal(ns, 'common.notFound'); return translator } },
    'next/link': { __esModule: true, default: function Link() { return null } },
    'lucide-react': ui,
    '@/components/ui/button': { Button: function Button() { return null } },
  })
  const loadMetadata = loadComponent('../app/not-found.tsx', {
    'next-intl/server': { getTranslations: async () => translator },
    'next/link': { __esModule: true, default: () => null }, 'lucide-react': ui,
    '@/components/ui/button': { Button: () => null },
  }, 'generateMetadata')
  return { tree: await Page(), metadata: await loadMetadata() }
}

test('the 404 page renders its copy in en, nl and fr from next-intl messages', async () => {
  const seen = new Set()
  for (const locale of ['en', 'nl', 'fr']) {
    const { tree, metadata } = await renderNotFound(locale)
    const copy = messages[locale].notFound
    const text = textOf(tree) + findAll(tree, n => n.props?.children).map(textOf).join(' ')
    assert.match(text, new RegExp(copy.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(text, /404/)
    assert.equal(metadata.title, copy.metaTitle)
    assert.equal(metadata.robots.index, false)
    seen.add(copy.title)
  }
  assert.equal(seen.size, 3, 'each locale has its own wording')
})

test('a prefixed URL that 404s resolves its locale from the prefix; unprefixed URLs keep the negotiated locale', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new TypeError('fetch failed') }
  try {
    const { NextRequest } = await import('next/server.js')
    const { middleware } = await import('../middleware.ts')
    const run = (url, cookie) => middleware(new NextRequest(url, {
      headers: { 'x-vercel-ip-country': 'DE', 'accept-language': 'en', ...(cookie ? { cookie } : {}) },
    }))
    const forwarded = (res, name) => res.headers.get(`x-middleware-request-${name}`)

    for (const [path, locale] of [['/nl/login', 'nl'], ['/fr/does-not-exist', 'fr'], ['/nl/search?q=x', 'nl']]) {
      const res = await run(`https://fixtract.test${path}`, 'NEXT_LOCALE=en')
      assert.equal(res.headers.get('x-middleware-rewrite'), null, `${path} is still not rewritten`)
      assert.equal(forwarded(res, 'x-fixera-locale'), locale, `${path} 404 renders in ${locale}`)
      assert.equal(forwarded(res, 'x-fixera-document-locale'), locale, `${path} <html lang>`)
      assert.equal(forwarded(res, 'x-fixera-url-locale'), null)
      assert.equal(res.cookies.get('NEXT_LOCALE'), undefined, 'a prefix never writes the preference cookie')
    }
    const prefixedWithLang = await run('https://fixtract.test/fr/missing?lang=nl')
    assert.equal(forwarded(prefixedWithLang, 'x-fixera-locale'), 'fr')
    assert.equal(prefixedWithLang.cookies.get('NEXT_LOCALE'), undefined)

    const plain = await run('https://fixtract.test/does-not-exist', 'NEXT_LOCALE=fr')
    assert.equal(forwarded(plain, 'x-fixera-locale'), 'fr', 'unprefixed 404 follows the cookie')
  } finally {
    globalThis.fetch = realFetch
  }
})
