import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from '@swc/core'
import { componentHarness, elementText } from './helpers/componentHarness.mjs'
import * as categoryLookup from '../lib/catalog/categoryLayoutLookup.ts'
import * as categoryResolver from '../lib/catalog/resolveCategory.ts'
import * as cooldown from '../lib/auth/signupOtpCooldown.ts'

const require = createRequire(import.meta.url)
function moduleWithMocks(file, mocks) {
  const { code } = transformSync(readFileSync(file, 'utf8'), { filename: String(file), jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } })
  const exports = {}
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), exports)
  return exports
}
function layoutHarness(categories, slug) {
  const countries = []
  const redirects = []
  const t = key => key === 'names.categories.outdoor-garden.name' ? 'Extérieur et jardin' : key
  const exports = moduleWithMocks(new URL('../app/(pages)/categories/[categorySlug]/layout.tsx', import.meta.url), {
    react: { cache: fn => fn },
    'next/headers': { headers: async () => ({ get: name => name === 'x-fixera-content-country' ? 'NL' : null }) },
    'next/navigation': { permanentRedirect: to => { redirects.push(to); throw new Error('redirect') }, notFound: () => { throw new Error('not found') } },
    'next-intl/server': { getTranslations: async () => t },
    '@/data/content': { serviceCategories: [{ slug: 'outdoor-garden', name: 'Garden' }] },
    '@/lib/seo/metadata': { buildMetadata: input => input },
    '@/components/seo/JsonLd': { __esModule: true, default: () => null },
    '@/lib/seo/jsonLd': { breadcrumbSchema: entries => entries },
    '@/lib/server/serviceCategories': { getServiceCategories: async country => { countries.push(country); return categories } },
    '@/lib/geo/contentCountryHeader': { readContentCountry: headers => headers.get('x-fixera-content-country') },
    '@/lib/catalog/categoryLayoutLookup': categoryLookup,
    '@/components/catalog/CatalogCountryContext': { CatalogCountryProvider: ({ children }) => children, useCatalogCountry: () => null },
  })
  return { exports, countries, redirects, props: { children: 'category body', params: Promise.resolve({ categorySlug: slug }) } }
}

test('server category layout propagates NL to catalog lookup and preserves a live route', async () => {
  const ui = layoutHarness([{ slug: 'garden-work', name: 'Garden work', services: [] }], 'garden-work')
  const tree = await ui.exports.default(ui.props)
  assert.equal(tree.props.children[1], 'category body')
  assert.deepEqual(ui.countries, ['NL'])
  assert.deepEqual(ui.redirects, [])
})
test('outage fallback cannot reject a real category outside its six navigation entries', async () => {
  const ui = layoutHarness([{ slug: 'interior', name: 'Interior', services: [], isFallback: true }], 'custom-live-category')
  assert.equal((await ui.exports.default(ui.props)).props.children[1], 'category body')
  assert.deepEqual(ui.redirects, [])
})
test('category metadata and breadcrumbs use the same translated category label', async () => {
  const ui = layoutHarness([{ slug: 'outdoor-garden', name: 'Outdoor & Garden', services: [] }], 'outdoor-garden')
  const metadata = await ui.exports.generateMetadata(ui.props)
  const tree = await ui.exports.default(ui.props)
  assert.equal(metadata.title, 'Extérieur et jardin')
  assert.equal(tree.props.children[0].props.data.at(-1).name, metadata.title)
})
test('malformed array or services responses reach the retry UI and recover without a redirect', async () => {
  const previous = { fetch: globalThis.fetch, document: globalThis.document, error: console.error }
  const router = { replace: path => redirects.push(path) }
  const redirects = []
  const t = key => key
  console.error = () => {}
  globalThis.document = { cookie: 'fixera_geo_country=NL' }
  try {
    for (const malformed of [{ error: true }, [{ slug: 'garden-work', name: 'Garden work', services: null }]]) {
      let response = malformed
      const urls = []
      globalThis.fetch = async url => { urls.push(String(url)); return { ok: true, json: async () => response } }
      const ui = componentHarness(new URL('../app/(pages)/categories/[categorySlug]/page.tsx', import.meta.url), {
        'next/navigation': { useParams: () => ({ categorySlug: 'garden-work' }), useRouter: () => router },
        'next-intl': { useTranslations: () => t },
        sonner: { toast: { error() {} } },
        '@/lib/catalog/resolveCategory': categoryResolver,
        '@/lib/marketing/siteAnnouncements/constants': { GEO_COUNTRY_COOKIE: 'fixera_geo_country' },
        '@/components/catalog/CatalogCountryContext': { CatalogCountryProvider: ({ children }) => children, useCatalogCountry: () => null },
      })
      ui.render(); await ui.settle()
      assert.match(elementText(ui.render()), /servicesPage.errorMessage/)
      assert.deepEqual(redirects, [])
      assert.match(urls[0], /country=NL$/)
      response = [{ slug: 'garden-work', name: 'Garden work', services: [{ slug: 'painting', name: 'Painting' }] }]
      ui.findAll(node => typeof node.props.onClick === 'function')[0].props.onClick()
      await ui.settle()
      assert.ok(ui.findAll(node => node.props.href === '/services/painting').length)
      ui.unmount()
    }
  } finally { globalThis.fetch = previous.fetch; globalThis.document = previous.document; console.error = previous.error }
})
test('private-use-only browser languages do not select an unrelated catalog market', () => {
  assert.equal(categoryResolver.resolveCatalogCountry(null, 'x-ca'), 'BE')
  assert.equal(categoryResolver.resolveCatalogCountry(null, 'X-US'), 'BE')
})
test('professional verification mount permits resend until an actual channel send establishes the cooldown', async () => {
  const previous = { fetch: globalThis.fetch, document: globalThis.document }
  const t = key => key
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  let calls = 0
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ success: true }) } }
  const ui = componentHarness(new URL('../components/DualVerificationComponent.tsx', import.meta.url), {
    'next-intl': { useTranslations: () => t },
    sonner: { toast: { error() {}, success() {} } },
    '@/lib/i18n/useErrorMessage': { useErrorMessage: () => (_error, fallback) => fallback },
    '@/lib/auth/signupOtpCooldown': cooldown,
  })
  try {
    ui.render({ email: 'test@example.test', phone: '+320000000', onVerificationSuccess() {}, onBack() {} })
    await ui.settle()
    const buttons = () => ui.findAll(node => node.type === 'Button' && String(elementText(node)).includes('resend'))
    assert.equal(calls, 0)
    assert.equal(buttons().length, 2)
    assert.ok(buttons().every(button => !button.props.disabled))
    await buttons()[0].props.onClick()
    await ui.settle()
    assert.equal(calls, 1)
    assert.equal(buttons()[0].props.disabled, true)
    assert.equal(buttons()[1].props.disabled, false)
  } finally { ui.unmount(); globalThis.fetch = previous.fetch; globalThis.document = previous.document }
})


test('uncertain-only savings retain coverage warnings and unknown currencies never reach the formatter', async () => {
  const previousFetch = globalThis.fetch
  const t = key => key
  const router = { push() {} }
  const user = { _id: 'u1', role: 'customer' }
  const auth = { user, isAuthenticated: true, loading: false }
  const formatted = []
  const ui = componentHarness(new URL('../app/(pages)/dashboard/benefits/page.tsx', import.meta.url), {
    'next/navigation': { useRouter: () => router }, 'next-intl': { useTranslations: () => t },
    '@/contexts/AuthContext': { useAuth: () => auth },
    '@/lib/utils': { getAuthToken: () => null },
    '@/contexts/CurrencyContext': { useCurrency: () => ({ formatMoney: (amount, currency) => { formatted.push(currency); return String(amount) } }) },
    '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
    '@/components/dashboard/BenefitsProgramCard': { __esModule: true, default: 'BenefitsProgramCard' },
    '@/components/dashboard/ReferralCard': { __esModule: true, default: 'ReferralCard' },
    '@/components/dashboard/BacklinkCard': { __esModule: true, default: 'BacklinkCard' },
  })
  globalThis.fetch = async url => ({ ok: true, json: async () => ({ success: true, data: String(url).includes('/savings/summary')
    ? { settledBookingCount: 0, excludedUncertainCount: 1, groups: [{ currency: 'UNKNOWN', totalRecorded: 12, bookingCount: 0, recordedReferral: 12 }] }
    : {} }) })
  try {
    ui.render(); await ui.settle()
    const text = elementText(ui.render())
    assert.match(text, /benefits.savings.excludedUncertain/)
    assert.doesNotMatch(text, /benefits.savings.noSavingsYet/)
    assert.ok(!formatted.includes('UNKNOWN'))
  } finally { ui.unmount(); globalThis.fetch = previousFetch }
})


test('approved professionals with no completion timestamp retain their explicit login workflow', async () => {
  const pushes = []
  const t = key => key
  const router = { push: path => pushes.push(path) }
  const resolver = await import('../lib/auth/redirectResolver.ts')
  const auth = { loading: false, isAuthenticated: true, user: { role: 'professional', professionalStatus: 'approved', isEmailVerified: true, isPhoneVerified: true }, login: async () => true }
  const params = new URLSearchParams({ redirect: '/bookings/approved-booking' })
  const ui = componentHarness(new URL('../app/(pages)/login/page.tsx', import.meta.url), {
    'next/navigation': { useRouter: () => router, useSearchParams: () => params },
    'next-intl': { useTranslations: () => t }, '@/contexts/AuthContext': { useAuth: () => auth },
    '@/lib/auth/redirectResolver': resolver,
  })
  ui.useComponent(ui.render().props.children.type)
  ui.render(); await ui.settle()
  assert.deepEqual(pushes, ['/bookings/approved-booking'])
  ui.unmount()
})

test('outage metadata and breadcrumbs normalize spelling and encode URL delimiters', async () => {
  const fallback = [{ slug: 'interior', name: 'Interior', services: [], isFallback: true }]
  for (const [raw, path] of [
    ['Garden_Work', '/categories/garden-work'],
    ['%2F', '/categories/%2F'],
    ['Garden%2FWork%3Fquery%23anchor', '/categories/garden%2Fwork%3Fquery%23anchor'],
  ]) {
    const ui = layoutHarness(fallback, raw)
    const metadata = await ui.exports.generateMetadata(ui.props)
    const tree = await ui.exports.default(ui.props)
    assert.equal(metadata.path, path)
    assert.equal(tree.props.children[0].props.data.at(-1).path, path)
    const url = new URL(metadata.path, 'https://example.test')
    assert.equal(url.search, '')
    assert.equal(url.hash, '')
    assert.equal(url.pathname.split('/').length, 3)
  }
})
