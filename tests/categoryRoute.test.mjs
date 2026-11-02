import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolveCategoryRoute, normalizeRouteSlug, CATEGORY_FALLBACK_PATH } from '../lib/catalog/categoryLayoutLookup.ts'
import { CONTENT_COUNTRY_REQUEST_HEADER, readContentCountry } from '../lib/geo/contentCountryHeader.ts'

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

test('F6: the layout reads the first-party content-country header before the platform header', () => {
  const h = (values) => ({ get: (name) => values[name] ?? null })
  assert.equal(readContentCountry(h({ [CONTENT_COUNTRY_REQUEST_HEADER]: 'be', 'x-vercel-ip-country': 'DE' })), 'BE')
  assert.equal(readContentCountry(h({ 'x-vercel-ip-country': 'nl' })), 'NL')
  assert.equal(readContentCountry(h({ [CONTENT_COUNTRY_REQUEST_HEADER]: 'BEL', 'x-vercel-ip-country': 'FR' })), 'FR', 'malformed values are ignored')
  assert.equal(readContentCountry(h({})), undefined)
})

test('layout consults the live catalog, redirects or 404s on the server', () => {
  const layout = readFileSync(new URL('../app/(pages)/categories/[categorySlug]/layout.tsx', import.meta.url), 'utf8')
  assert.match(layout, /getServiceCategories\(country\)/)
  assert.match(layout, /readContentCountry\(await headers\(\)\)/)
  assert.match(layout, /if \(route\.kind === "redirect"\) permanentRedirect\(route\.to\);/)
  assert.match(layout, /if \(route\.kind === "not_found"\) notFound\(\);/)
  // The built-in outage fallback includes the subnav's `interior` slug.
  const server = readFileSync(new URL('../lib/server/serviceCategories.ts', import.meta.url), 'utf8')
  assert.match(server, /slug: "interior"/)
})
