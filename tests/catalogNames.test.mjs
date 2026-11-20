import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)
const { catalogNameSlug, translateCatalogName } = await import('../lib/catalog/catalogNames.ts')

const messages = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}/nav.json`, import.meta.url), 'utf8'))
const translator = (locale) => {
  const root = messages(locale)
  const lookup = (key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), root)
  const t = (key) => { const value = lookup(key); if (typeof value !== 'string') throw new Error(`missing ${key}`); return value }
  t.has = (key) => typeof lookup(key) === 'string'
  return t
}

test('CA3-1: catalog slugs match the backend toSlug of the English names', () => {
  assert.equal(catalogNameSlug('Painter & Wallpaperer'), 'painter-wallpaperer')
  assert.equal(catalogNameSlug('Façade Work'), 'facade-work')
  assert.equal(catalogNameSlug('Solar PV & Battery Storage'), 'solar-pv-battery-storage')
  assert.equal(catalogNameSlug('Small tasks'), 'small-tasks')
})

test('CA3-1: category and service names are shown in the visitor language', () => {
  const nl = translator('nl')
  const fr = translator('fr')
  assert.equal(translateCatalogName(nl, 'categories', 'Small tasks'), 'Kleine klussen')
  assert.equal(translateCatalogName(fr, 'categories', 'Outdoor work'), 'Travaux extérieurs')
  assert.equal(translateCatalogName(nl, 'services', 'Plumbing'), 'Loodgieterswerk')
  assert.equal(translateCatalogName(fr, 'services', 'Painter & Wallpaperer'), 'Peintre-tapissier')
  assert.equal(translateCatalogName(nl, 'services', 'painter-wallpaperer'), 'Schilder en behanger', 'a slug works too')
  // Unknown names and translators without has() keep the recorded name.
  assert.equal(translateCatalogName(nl, 'services', 'Brand new service'), 'Brand new service')
  assert.equal(translateCatalogName((key) => key, 'services', 'Plumbing'), 'Plumbing')
  assert.equal(translateCatalogName(nl, 'services', ''), '')
})

test('CA3-1: en, nl and fr carry the same catalog name keys, and nl/fr are translated', () => {
  const en = messages('en').catalogNames
  for (const locale of ['nl', 'fr']) {
    const other = messages(locale).catalogNames
    for (const kind of ['categories', 'services']) {
      assert.deepEqual(Object.keys(other[kind]).sort(), Object.keys(en[kind]).sort(), `${locale} ${kind}`)
    }
  }
  const translated = Object.keys(en.services).filter((key) => messages('nl').catalogNames.services[key] !== en.services[key])
  assert.ok(translated.length > 40)
})

test('CA3-1: the category bar, popular chips, card tags, search filters and /services use the translated labels', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
  assert.match(read('../components/SubNavbar.tsx'), /categoryName\(category\.name\)/)
  assert.match(read('../components/SubNavbar.tsx'), /serviceName\(service\.name\)/)
  assert.match(read('../components/HeroSearchForm.tsx'), /\{serviceName\(service\)\}/)
  assert.match(read('../components/HeroSearchForm.tsx'), /onClick=\{\(\) => setSearchQuery\(service\)\}/, 'the search value stays the catalog name')
  assert.match(read('../components/search/ProjectCard.tsx'), /categoryName\(project\.category\)/)
  const filters = read('../components/search/SearchFilters.tsx')
  assert.match(filters, /\{serviceName\(value\)\}/)
  assert.match(filters, /renderOptionContent\(categoryName\(value\), count\)/)
  const hub = read('../app/[ctx]/(pages)/services/ServicesHubClient.tsx')
  assert.match(hub, /\{categoryName\(cat\.name\)\}/)
  assert.match(hub, /\{serviceName\(service\.name\)\}/)
  assert.match(read('../app/[ctx]/(pages)/categories/[categorySlug]/page.tsx'), /\{serviceName\(service\.name\)\}/)
})
