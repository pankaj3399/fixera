import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const {
  documentLocaleOf, formatRouteContext, hasRouteContextPrefix, listingFromSearchParams,
  parseRouteContext, toVisiblePathname, urlLocaleOf,
} = await import('../lib/routeContext.ts')

test('a route context round-trips through its path segment', () => {
  for (const context of [
    { locale: 'nl', country: 'BE', mode: 'u' },
    { locale: 'fr', country: 'FR', mode: 'p' },
    { locale: 'en', country: undefined, mode: 'a' },
    { locale: 'nl', country: 'NL', mode: 'p', listing: { page: 3, tag: undefined } },
    { locale: 'en', country: 'BE', mode: 'u', listing: { page: 1, tag: 'tür & dak/goot' } },
  ]) {
    const segment = formatRouteContext(context)
    assert.match(segment, /^[A-Za-z0-9~_-]+$/, `${segment} needs no URL encoding`)
    assert.deepEqual(parseRouteContext(segment), context)
    assert.deepEqual(parseRouteContext(encodeURIComponent(segment)), context, 'percent-encoded params still parse')
  }
  assert.equal(formatRouteContext({ locale: 'nl', country: 'BE', mode: 'p' }), 'nl-BE-p')
  assert.equal(formatRouteContext({ locale: 'en', mode: 'u' }), 'en-00-u', 'unknown country')
})

test('page paths never parse as a route context', () => {
  for (const segment of ['', 'about', 'nl', 'blog', 'de-BE-u', 'nl-be-u', 'nl-BE-x', 'nl-BE-u~0', 'nl-BE-u~2~***']) {
    assert.equal(parseRouteContext(segment), null, segment)
  }
  assert.equal(hasRouteContextPrefix('/nl-BE-u/about'), true)
  assert.equal(hasRouteContextPrefix('/about'), false)
  assert.equal(hasRouteContextPrefix('/'), false)
})

test('URL locale and document language follow the mode', () => {
  assert.equal(urlLocaleOf({ locale: 'nl', mode: 'p' }), 'nl')
  assert.equal(urlLocaleOf({ locale: 'nl', mode: 'u' }), undefined)
  assert.equal(documentLocaleOf({ locale: 'fr', mode: 'a' }), 'en', 'admin is English-only')
  assert.equal(documentLocaleOf({ locale: 'fr', mode: 'u' }), 'fr')
})

test('the visible pathname of an internal path is what the browser shows', () => {
  assert.equal(toVisiblePathname('/nl-BE-u/about'), '/about')
  assert.equal(toVisiblePathname('/nl-BE-p/about'), '/nl/about')
  assert.equal(toVisiblePathname('/fr-BE-p'), '/fr')
  assert.equal(toVisiblePathname('/en-BE-u'), '/')
  assert.equal(toVisiblePathname('/en-BE-a/admin/cms'), '/admin/cms')
  assert.equal(toVisiblePathname('/nl-BE-u~2/blog'), '/blog')
  assert.equal(toVisiblePathname('/nl-BE-u/nl/login'), '/nl/login', 'a private page under a prefix keeps it')
  assert.equal(toVisiblePathname('/about'), '/about', 'visible paths are unchanged')
  assert.equal(toVisiblePathname('/'), '/')
})

test('blog/news listings follow the index page parsing rules', () => {
  const listing = (qs) => listingFromSearchParams(new URLSearchParams(qs))
  assert.equal(listing(''), undefined)
  assert.equal(listing('page=1'), undefined)
  assert.equal(listing('page=abc'), undefined)
  assert.equal(listing('page=-4'), undefined)
  assert.deepEqual(listing('page=2'), { page: 2, tag: undefined })
  assert.deepEqual(listing('tag=roof'), { page: 1, tag: 'roof' })
  assert.deepEqual(listing('page=3&tag=roof'), { page: 3, tag: 'roof' })
  assert.equal(listing(`tag=${'x'.repeat(151)}`), undefined, 'over-long tags are not cached')
})
