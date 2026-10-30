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

test('a failed dropdown selection cannot suppress future manual blur, and other inputs do not arm it', async () => {
  const previousDocument = globalThis.document
  const previousGoogle = globalThis.google
  const events = {}
  globalThis.document = { activeElement: null, addEventListener: (type, fn) => { events[type] = fn }, removeEventListener() {} }
  globalThis.google = { maps: { places: { Autocomplete: class { addListener() {} } }, event: { clearInstanceListeners() {} } } }
  try {
    const state = hooks()
    const changes = []
    const validations = []
    let value = ''
    const Input = () => null
    const Component = loadComponent('../components/professional/project-wizard/AddressAutocomplete.tsx', {
      react: state.api,
      'next-intl': { useTranslations: () => key => key },
      '@/components/ui/input': { Input }, '@/components/ui/label': { Label: () => null },
      '@/hooks/useGoogleMaps': { useGoogleMaps: () => ({ isLoaded: true, loadGoogleMaps: async () => true, validateAddress: async () => false, geocodeAddress: async () => null }) },
      '@/lib/address/blurCommitGuard': guardExports,
    })
    const render = () => state.render(() => Component({ value, onChange: (...args) => { changes.push(args); value = args[0] }, onValidation: v => validations.push(v), useCompanyAddress: false }))
    let input = findElement(render(), node => node.type === Input)
    const field = {}
    input.props.ref.current = field
    state.flush()
    globalThis.document.activeElement = field
    const dropdownEvent = { target: { closest: () => ({}) } }
    events.mousedown(dropdownEvent)
    await input.props.onBlur()
    assert.deepEqual(validations, [])
    // No place_changed arrives. A fresh edit must restore validation.
    input.props.onChange({ target: { value: 'Invalid address' } })
    input = findElement(render(), node => node.type === Input)
    await input.props.onBlur()
    assert.deepEqual(validations, [false])
    assert.deepEqual(changes, [['Invalid address']])
    // A second autocomplete owns this dropdown interaction.
    globalThis.document.activeElement = {}
    events.mousedown(dropdownEvent)
    await input.props.onBlur()
    assert.deepEqual(validations, [false, false])
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
      globalThis.fetch = async url => { requests.push(url); return { ok: true, json: async () => categories } }
      const Component = loadComponent('../app/(pages)/categories/[categorySlug]/page.tsx', {
        react: state.api,
        'next/link': { default: () => null },
        sonner: { toast: { error() {} } },
        'next/navigation': { useParams: () => ({ categorySlug: 'small-tasks' }), useRouter: () => ({ replace: path => redirects.push(path) }) },
        'next-intl': { useTranslations: () => key => key },
        '@/components/ui/skeleton': { Skeleton: () => null }, '@/components/ui/button': { Button: () => null },
        '@/lib/catalog/resolveCategory': { CATALOG_HOME_COUNTRY: 'BE', resolveCatalogCountry: () => 'NL', matchCatalogCategory: (rows, slug) => rows.find(row => row.slug === slug), normalizeCategorySlug: s => s },
        '@/lib/marketing/siteAnnouncements/constants': { GEO_COUNTRY_COOKIE: 'fixera_geo_country' },
      })
      state.render(() => Component())
      state.flush()
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(requests.length, 1)
      assert.match(requests[0], /country=NL$/)
      assert.deepEqual(redirects, ['/services'])
    }
  } finally { globalThis.document = previousDocument; globalThis.fetch = previousFetch }
})
