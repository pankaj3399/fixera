import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from '@swc/core'

const require = createRequire(import.meta.url)
const React = require('react')

// Exercise the actual component handlers/effects without Maps or a DOM renderer.
function hooks() {
  const slots = []
  let index = 0
  let effects = []
  const api = {
    ...React,
    useRef(value) { const i = index++; return slots[i] ??= { current: value } },
    useState(value) {
      const i = index++
      if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v }]
    },
    useCallback(fn) { index++; return fn },
    useEffect(fn, deps) {
      const i = index++
      if (!slots[i] || deps?.some((v, j) => v !== slots[i][j])) effects.push(fn)
      slots[i] = deps
    },
  }
  return { api, render(fn) { index = 0; return fn() }, flush() { const pending = effects; effects = []; pending.forEach(fn => fn()) } }
}
function loadComponent(file, mocks) {
  const { code } = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  })
  const exports = {}
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), exports)
  return exports.default
}
function findElement(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null
  if (predicate(tree)) return tree
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = findElement(child, predicate)
    if (found) return found
  }
  return null
}

const { code: guardCode } = transformSync(readFileSync(new URL('../lib/address/blurCommitGuard.ts', import.meta.url), 'utf8'), {
  jsc: { parser: { syntax: 'typescript' } }, module: { type: 'commonjs' },
})
const guardExports = {}
new Function('exports', guardCode)(guardExports)

function mountAddressAutocomplete({ validateAddress = async () => false, geocodeAddress = async () => null } = {}) {
  const events = {}
  const listeners = {}
  let place = null
  globalThis.document = { activeElement: null, addEventListener: (type, fn) => { events[type] = fn }, removeEventListener() {} }
  globalThis.google = {
    maps: {
      places: { Autocomplete: class { addListener(name, fn) { listeners[name] = fn } getPlace() { return place } } },
      event: { clearInstanceListeners() {} },
    },
  }
  const state = hooks()
  const changes = []
  const validations = []
  let value = ''
  const Input = () => null
  const Component = loadComponent('../components/professional/project-wizard/AddressAutocomplete.tsx', {
    react: state.api,
    'next-intl': { useTranslations: () => key => key },
    '@/components/ui/input': { Input }, '@/components/ui/label': { Label: () => null },
    '@/hooks/useGoogleMaps': { useGoogleMaps: () => ({ isLoaded: true, loadGoogleMaps: async () => true, validateAddress, geocodeAddress }) },
    '@/lib/address/blurCommitGuard': guardExports,
  })
  const render = () => findElement(
    state.render(() => Component({ value, onChange: (...args) => { changes.push(args); value = args[0] }, onValidation: v => validations.push(v), useCompanyAddress: false })),
    node => node.type === Input,
  )
  const input = render()
  const field = {}
  input.props.ref.current = field
  state.flush()
  globalThis.document.activeElement = field
  return {
    events, listeners, changes, validations, field, render,
    setPlace(next) { place = next },
    dropdownEvent: { target: { closest: () => ({}) } },
  }
}

test('a dropdown pointer-down that commits no place still validates the typed text', async () => {
  const previousDocument = globalThis.document
  const previousGoogle = globalThis.google
  try {
    const ui = mountAddressAutocomplete()
    let input = ui.render()
    input.props.onChange({ target: { value: 'Typed street 1' } })
    input = ui.render()
    // Scrollbar/footer pointer-down inside .pac-container: no place_changed.
    ui.events.mousedown(ui.dropdownEvent)
    await input.props.onBlur()
    assert.deepEqual(ui.validations, [false])
    // A fresh edit keeps validating on blur.
    input.props.onChange({ target: { value: 'Invalid address' } })
    input = ui.render()
    await input.props.onBlur()
    assert.deepEqual(ui.validations, [false, false])
    assert.deepEqual(ui.changes, [['Typed street 1'], ['Invalid address']])
    // A second autocomplete owns this dropdown interaction: no grace, plain validation.
    globalThis.document.activeElement = {}
    ui.events.mousedown(ui.dropdownEvent)
    await input.props.onBlur()
    assert.deepEqual(ui.validations, [false, false, false])
  } finally { globalThis.document = previousDocument; globalThis.google = previousGoogle }
})

test('a suggestion click commits the selected place once and the blur never overwrites it', async () => {
  const previousDocument = globalThis.document
  const previousGoogle = globalThis.google
  try {
    const validateCalls = []
    const ui = mountAddressAutocomplete({ validateAddress: async address => { validateCalls.push(address); return false } })
    let input = ui.render()
    input.props.onChange({ target: { value: 'Grote Markt' } })
    input = ui.render()
    ui.events.mousedown(ui.dropdownEvent)
    const blur = input.props.onBlur()
    // Google commits the suggestion after the blur, within the grace window.
    ui.setPlace({
      formatted_address: 'Grote Markt 1, 1000 Brussel, Belgium',
      geometry: { location: { lat: () => 50.8467, lng: () => 4.3525 } },
      address_components: [{ long_name: 'Belgium', short_name: 'BE', types: ['country'] }],
    })
    ui.listeners.place_changed()
    await blur
    assert.equal(ui.changes.length, 2)
    const [address, placeData] = ui.changes[1]
    assert.equal(address, 'Grote Markt 1, 1000 Brussel, Belgium')
    assert.deepEqual(placeData.coordinates, { lat: 50.8467, lng: 4.3525 })
    assert.equal(placeData.address_components[0].short_name, 'BE')
    // Selection marks the field valid; the blur path neither re-validates nor flips it.
    assert.deepEqual(ui.validations, [true])
    assert.deepEqual(validateCalls, [])
  } finally { globalThis.document = previousDocument; globalThis.google = previousGoogle }
})

test('category loading keeps the resolved country even when its catalog is empty or unmatched', async () => {
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  globalThis.document = { cookie: 'fixera_geo_country=NL' }
  try {
    for (const categories of [[], [{ slug: 'other-category', name: 'Other', services: [] }]]) {
      const state = hooks()
      const requests = []
      const redirects = []
      const geoArgs = []
      globalThis.fetch = async url => { requests.push(url); return { ok: true, json: async () => categories } }
      const Component = loadComponent('../app/(pages)/categories/[categorySlug]/page.tsx', {
        react: state.api,
        'next/link': { default: () => null },
        sonner: { toast: { error() {} } },
        'next/navigation': { useParams: () => ({ categorySlug: 'small-tasks' }), useRouter: () => ({ replace: path => redirects.push(path) }) },
        'next-intl': { useTranslations: () => key => key },
        '@/components/ui/skeleton': { Skeleton: () => null }, '@/components/ui/button': { Button: () => null },
        '@/lib/catalog/resolveCategory': { CATALOG_HOME_COUNTRY: 'BE', resolveCatalogCountry: geo => { geoArgs.push(geo); return 'NL' }, matchCatalogCategory: (rows, slug) => rows.find(row => row.slug === slug), normalizeCategorySlug: s => s },
        '@/lib/marketing/siteAnnouncements/constants': { GEO_COUNTRY_COOKIE: 'fixera_geo_country' },
      })
      state.render(() => Component())
      state.flush()
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(requests.length, 1)
      assert.match(requests[0], /country=NL$/)
      // The page passes the geo cookie value itself, not a derived country.
      assert.deepEqual(geoArgs, ['NL'])
      assert.deepEqual(redirects, ['/services'])
    }
  } finally { globalThis.document = previousDocument; globalThis.fetch = previousFetch }
})

test('a matched category renders its service links, or the empty-services state', async () => {
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  globalThis.document = { cookie: 'fixera_geo_country=NL' }
  try {
    const cases = [
      { services: [{ name: 'Gutter cleaning', slug: 'gutter-cleaning' }, { name: 'Window cleaning', slug: 'window-cleaning' }], links: ['/services/gutter-cleaning', '/services/window-cleaning'] },
      { services: [], links: [] },
    ]
    for (const { services, links } of cases) {
      const state = hooks()
      const redirects = []
      globalThis.fetch = async () => ({ ok: true, json: async () => [{ slug: 'small-tasks', name: 'Small tasks', services }] })
      const Link = ({ children }) => children
      const Component = loadComponent('../app/(pages)/categories/[categorySlug]/page.tsx', {
        react: state.api,
        'next/link': { __esModule: true, default: Link },
        sonner: { toast: { error() {} } },
        'next/navigation': { useParams: () => ({ categorySlug: 'small-tasks' }), useRouter: () => ({ replace: path => redirects.push(path) }) },
        'next-intl': { useTranslations: () => key => key },
        '@/components/ui/skeleton': { Skeleton: () => null }, '@/components/ui/button': { Button: () => null },
        '@/lib/catalog/resolveCategory': { CATALOG_HOME_COUNTRY: 'BE', resolveCatalogCountry: geo => geo, matchCatalogCategory: (rows, slug) => rows.find(row => row.slug === slug), normalizeCategorySlug: s => s },
        '@/lib/marketing/siteAnnouncements/constants': { GEO_COUNTRY_COOKIE: 'fixera_geo_country' },
      })
      state.render(() => Component())
      state.flush()
      await new Promise(resolve => setImmediate(resolve))
      const tree = state.render(() => Component())
      assert.deepEqual(redirects, [])
      const found = []
      const collect = node => {
        if (!node || typeof node !== 'object') return
        if (node.type === Link && typeof node.props?.href === 'string' && node.props.href.startsWith('/services/')) found.push(node.props.href)
        for (const child of React.Children.toArray(node.props?.children)) collect(child)
      }
      collect(tree)
      assert.deepEqual(found, links)
      const emptyState = findElement(tree, node => node.props?.children === 'servicesPage.empty')
      assert.equal(Boolean(emptyState), links.length === 0)
    }
  } finally { globalThis.document = previousDocument; globalThis.fetch = previousFetch }
})
