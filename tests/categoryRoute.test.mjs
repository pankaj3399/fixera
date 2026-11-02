import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { findCategoryForLayout, normalizeRouteSlug } from '../lib/catalog/categoryLayoutLookup.ts'

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
  assert.deepEqual(findCategoryForLayout('interior', STATIC, LIVE), { slug: 'interior', name: 'Interior', source: 'live' })
  assert.deepEqual(findCategoryForLayout('Outdoor_Work', STATIC, LIVE), { slug: 'outdoor-work', name: 'Outdoor work', source: 'live' })
})

test('static marketing slugs keep their translated copy and win over live ones', () => {
  assert.deepEqual(findCategoryForLayout('interior-services', STATIC, LIVE), {
    slug: 'interior-services', name: 'Interior Services', description: 'Inside work', source: 'static',
  })
})

test('unknown or empty slugs still 404', () => {
  assert.equal(findCategoryForLayout('does-not-exist', STATIC, LIVE), null)
  assert.equal(findCategoryForLayout('', STATIC, LIVE), null)
  assert.equal(findCategoryForLayout(undefined, STATIC, LIVE), null)
})

test('slug normalization decodes and unifies separators', () => {
  assert.equal(normalizeRouteSlug('Interior%20Services'), 'interior-services')
  assert.equal(normalizeRouteSlug('%E0%A4%A'), '%e0%a4%a')
})

test('layout consults the live catalog before calling notFound()', () => {
  const layout = readFileSync(new URL('../app/(pages)/categories/[categorySlug]/layout.tsx', import.meta.url), 'utf8')
  assert.match(layout, /getServiceCategories\(country\)/)
  assert.doesNotMatch(layout, /serviceCategories\.find\(\(c\) => c\.slug === categorySlug\)/)
  // The built-in outage fallback includes the subnav's `interior` slug.
  const server = readFileSync(new URL('../lib/server/serviceCategories.ts', import.meta.url), 'utf8')
  assert.match(server, /slug: "interior"/)
})
