import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { register } from 'node:module'
import { resolveCategoryRoute, normalizeRouteSlug, CATEGORY_FALLBACK_PATH } from '../lib/catalog/categoryLayoutLookup.ts'

register('./swc-loader.mjs', import.meta.url)
const { formatRouteContext, parseRouteContext } = await import('../lib/routeContext.ts')

const STATIC = [
  { slug: 'interior-services', name: 'Interior Services', description: 'Inside work' },
  { slug: 'outdoor-garden', name: 'Outdoor & Garden' },
]
// Shape returned by GET /api/service-categories/active (and the subnav's links).
const LIVE = [
  { slug: 'interior', name: 'Interior', services: [{ slug: 'painting', name: 'Painting' }] },
  { slug: 'outdoor-work', name: 'Outdoor work', services: [] },
]

test('live subnav category slugs resolve instead of a framework 404', () => {
  assert.deepEqual(resolveCategoryRoute('interior', STATIC, LIVE), { kind: 'category', category: { slug: 'interior', name: 'Interior' } })
})

test('F11: non-canonical spellings of a live slug redirect server-side to the canonical URL', () => {
  assert.deepEqual(resolveCategoryRoute('Outdoor_Work', STATIC, LIVE), { kind: 'redirect', to: '/categories/outdoor-work' })
})

test('F11: legacy static marketing slugs are never a 200 category page; they redirect like the page body does', () => {
  assert.equal(CATEGORY_FALLBACK_PATH, '/services')
  assert.deepEqual(resolveCategoryRoute('interior-services', STATIC, LIVE), { kind: 'redirect', to: '/services' })
  assert.deepEqual(resolveCategoryRoute('outdoor-garden', STATIC, LIVE), { kind: 'redirect', to: '/services' })
  // A live category that reuses a static slug is a real page.
  assert.equal(resolveCategoryRoute('outdoor-garden', STATIC, [...LIVE, { slug: 'outdoor-garden', name: 'Garden' }]).kind, 'category')
})

test('unknown or empty slugs still 404', () => {
  assert.deepEqual(resolveCategoryRoute('does-not-exist', STATIC, LIVE), { kind: 'not_found' })
  assert.deepEqual(resolveCategoryRoute('', STATIC, LIVE), { kind: 'not_found' })
  assert.deepEqual(resolveCategoryRoute(undefined, STATIC, LIVE), { kind: 'not_found' })
})

test('slug normalization decodes and unifies separators', () => {
  assert.equal(normalizeRouteSlug('Interior%20Services'), 'interior-services')
  assert.equal(normalizeRouteSlug('%E0%A4%A'), '%e0%a4%a')
})

test('F6: the content country reaches the layout in the route context middleware writes', () => {
  assert.equal(parseRouteContext(formatRouteContext({ locale: 'nl', country: 'BE', mode: 'u' })).country, 'BE')
  assert.equal(parseRouteContext('nl-00-u').country, undefined, 'unknown country')
  for (const malformed of ['nl-BEL-u', 'nl-be-u', 'de-BE-u', 'nl-BE-x', 'about', '']) {
    assert.equal(parseRouteContext(malformed), null, `${malformed} is not a route context`)
  }
})

test('layout consults the live catalog, redirects or 404s on the server', () => {
  const layout = readFileSync(new URL('../app/[ctx]/(pages)/categories/[categorySlug]/layout.tsx', import.meta.url), 'utf8')
  assert.match(layout, /getServiceCategories\(country\)/)
  assert.match(layout, /context\.country \?\? "BE"/)
  assert.doesNotMatch(layout, /next\/headers/, 'no request headers: the page is cached per route context')
  assert.match(layout, /if \(route\.kind === "redirect"\) permanentRedirect\(redirectTarget\(urlLocale, route\.to\)\);/)
  assert.match(layout, /if \(route\.kind === "not_found"\) notFound\(\);/)
  // The built-in outage fallback includes the subnav's `interior` slug.
  const server = readFileSync(new URL('../lib/server/serviceCategories.ts', import.meta.url), 'utf8')
  assert.match(server, /slug: "interior"/)
})

test('the category page fetches with the country the server layout validated against', () => {
  const layout = readFileSync(new URL('../app/[ctx]/(pages)/categories/[categorySlug]/layout.tsx', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/[ctx]/(pages)/categories/[categorySlug]/page.tsx', import.meta.url), 'utf8')
  // One route-context country feeds both the server lookup and the provider.
  assert.match(layout, /const contentCountryOf = \(context: RouteContext\): string => context\.country \?\? "BE";/)
  assert.match(layout, /const country = contentCountryOf\(context\);/)
  // The route lookup and the page's initial data share one cached live catalog read.
  assert.match(layout, /const loadLiveCategories = cache\(async \(country: string\) => getServiceCategories\(country\)\);/)
  assert.match(layout, /resolveCategoryRoute\(categorySlug, serviceCategories, await loadLiveCategories\(country\)\)/)
  assert.match(layout, /initialCategoryFor\(country, cat\.slug\)/)
  assert.match(layout, /<CatalogCountryProvider country=\{country\} initialCategory=\{initialCategory\}>/)
  // The mounted page test covers the country preference; refetch when it changes.
  assert.match(page, /\[rawSlug, router, t, reloadToken, serverCountry\]/)
})
