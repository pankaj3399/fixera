import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

const {
  normalizeCategorySlug,
  matchCatalogCategory,
  resolveCatalogCountry,
  CATALOG_HOME_COUNTRY,
} = await import('../lib/catalog/resolveCategory.ts')

test('slug normalization is case/space/separator insensitive', () => {
  assert.equal(normalizeCategorySlug('Small-Tasks'), 'small-tasks')
  assert.equal(normalizeCategorySlug('  SMALL_TASKS  '), 'small-tasks')
  assert.equal(normalizeCategorySlug('small%20tasks'), 'small-tasks')
  assert.equal(normalizeCategorySlug('Small--Tasks'), 'small-tasks')
  assert.equal(normalizeCategorySlug(''), '')
})

test('category matching finds the canonical entry by any slug variant', () => {
  const categories = [
    { name: 'Small Tasks', slug: 'small-tasks', services: [{ name: 'Plumbing', slug: 'plumbing' }] },
    { name: 'Interior', slug: 'interior', services: [] },
  ]
  const match = matchCatalogCategory(categories, 'SMALL_TASKS')
  assert.equal(match?.slug, 'small-tasks')
  assert.equal(match?.services.length, 1)
  assert.equal(matchCatalogCategory(categories, 'nope'), undefined)
  assert.equal(matchCatalogCategory(categories, ''), undefined)
})

test('catalog country prefers geo cookie, then browser region, then home', () => {
  assert.equal(resolveCatalogCountry('nl', 'fr-FR'), 'NL')
  assert.equal(resolveCatalogCountry(' nl ', 'fr-FR'), 'NL')
  assert.equal(resolveCatalogCountry(null, 'nl-NL'), 'NL')
  assert.equal(resolveCatalogCountry(undefined, 'fr-BE'), 'BE')
  assert.equal(resolveCatalogCountry(null, 'en'), CATALOG_HOME_COUNTRY)
  // Extension subtags are not regions: "-ca" is the calendar key here.
  assert.equal(resolveCatalogCountry(null, 'en-u-ca-gregory'), CATALOG_HOME_COUNTRY)
  assert.equal(resolveCatalogCountry(null, 'nl-BE-u-ca-gregory'), 'BE')
  assert.equal(resolveCatalogCountry(null, 'zh-Hant-TW'), 'TW')
  assert.equal(resolveCatalogCountry(null, 'en-x-ca'), CATALOG_HOME_COUNTRY)
  assert.equal(resolveCatalogCountry('xx!', 'yy'), CATALOG_HOME_COUNTRY)
})
