import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { transformSync } from '@swc/core'

register('./swc-loader.mjs', import.meta.url)
const require = createRequire(import.meta.url)
const React = require('react')
const { createTranslator } = await import('next-intl')

const {
  PRICE_TOKEN_KEYS, priceTokenKey, statusOptionCount,
} = await import('../lib/dashboardOverview.ts')
const { usernameCheckResult } = await import('../lib/utils.ts')
const { ONBOARDING_STEPS, onboardingStepPath, stripeReturnPath } = await import('../lib/constants/onboardingSteps.ts')
const { isSafeRedirectPath, resolvePostAuthRedirect } = await import('../lib/auth/redirectResolver.ts')
const signupOtpCooldown = await import('../lib/auth/signupOtpCooldown.ts')
const dashboardOverview = await import('../lib/dashboardOverview.ts')
const dashboardBookingHelpers = await import('../lib/dashboardBookingHelpers.ts')
const apiErrors = await import('../lib/apiErrors.ts')

const messages = (locale, namespace) => JSON.parse(readFileSync(new URL(`../messages/${locale}/${namespace}.json`, import.meta.url), 'utf8'))

// Hook stand-in with dependency-aware memoization and effect cleanups, so a
// changed dependency aborts the previous run exactly as React does.
function hooks() {
  const slots = []
  let index = 0
  let pending = new Set()
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.length || deps.some((v, j) => !Object.is(v, prev[j]))
  const api = {
    ...React,
    useRef(value) { const i = index++; return slots[i] ??= { current: value } },
    useState(value) {
      const i = index++
      if (!(i in slots)) {
        const cell = { value: typeof value === 'function' ? value() : value }
        cell.set = v => { cell.value = typeof v === 'function' ? v(cell.value) : v }
        slots[i] = cell
      }
      return [slots[i].value, slots[i].set]
    },
    useMemo(fn, deps) {
      const i = index++
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() }
      return slots[i].value
    },
    useCallback(fn, deps) {
      const i = index++
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn }
      return slots[i].value
    },
    useEffect(fn, deps) {
      const i = index++
      const slot = slots[i] ??= { deps: undefined, cleanup: null, ran: false }
      if (!slot.ran || changed(slot.deps, deps)) {
        slot.deps = deps
        slot.ran = true
        pending.add(slot)
        slot.fn = fn
      }
    },
  }
  return {
    api,
    render(fn) { index = 0; return fn() },
    flush() {
      const run = [...pending]
      pending = new Set()
      for (const slot of run) {
        if (typeof slot.cleanup === 'function') slot.cleanup()
        const cleanup = slot.fn()
        slot.cleanup = typeof cleanup === 'function' ? cleanup : null
      }
    },
    unmount() { for (const slot of slots) if (slot && typeof slot.cleanup === 'function') slot.cleanup() },
    reset() { slots.length = 0; pending = new Set() },
  }
}

function loadComponent(file, mocks) {
  const { code } = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  })
  const exports = {}
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name]
    if (name.startsWith('@/')) throw new Error(`unmocked import ${name}`)
    return require(name)
  }, exports)
  return exports.default
}

/** Any named export is an inert component (UI primitives, icons). */
const stubModule = () => new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : function Stub() { return null }) })

function findAll(tree, predicate, found = []) {
  if (!tree || typeof tree !== 'object') return found
  if (Array.isArray(tree)) { tree.forEach(node => findAll(node, predicate, found)); return found }
  if (predicate(tree)) found.push(tree)
  for (const child of React.Children.toArray(tree.props?.children)) findAll(child, predicate, found)
  return found
}
const textOf = node => (typeof node === 'string' || typeof node === 'number')
  ? String(node)
  : node && typeof node === 'object' ? React.Children.toArray(node.props?.children).map(textOf).join('') : ''

const settle = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('category page: an aborted request does not end the loading state of its replacement', async () => {
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  globalThis.document = { cookie: '' }
  try {
    const state = hooks()
    const requests = []
    globalThis.fetch = (url, { signal }) => {
      const pendingResponse = deferred()
      signal.addEventListener('abort', () => pendingResponse.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      requests.push({ url, signal, ...pendingResponse })
      return pendingResponse.promise
    }
    let slug = 'small-tasks'
    const Skeleton = () => null
    const Component = loadComponent('../app/(pages)/categories/[categorySlug]/page.tsx', {
      react: state.api,
      'next/link': { __esModule: true, default: () => null },
      sonner: { toast: { error() {} } },
      'next/navigation': { useParams: () => ({ categorySlug: slug }), useRouter: () => ({ replace() {} }) },
      'next-intl': { useTranslations: () => key => key },
      '@/components/ui/skeleton': { Skeleton }, '@/components/ui/button': { Button: () => null },
      '@/lib/catalog/resolveCategory': { CATALOG_HOME_COUNTRY: 'BE', resolveCatalogCountry: () => 'BE', matchCatalogCategory: (rows, s) => rows.find(row => row.slug === s), normalizeCategorySlug: s => s },
      '@/lib/marketing/siteAnnouncements/constants': { GEO_COUNTRY_COOKIE: 'fixera_geo_country' },
    })
    state.render(() => Component())
    state.flush()
    assert.equal(requests.length, 1)
    // Client-side navigation to another category: cleanup aborts request 1.
    slug = 'gardening'
    state.render(() => Component())
    state.flush()
    assert.equal(requests.length, 2)
    assert.equal(requests[0].signal.aborted, true)
    await settle()
    // Request 2 is still in flight: the page keeps its skeleton.
    let tree = state.render(() => Component())
    assert.ok(findAll(tree, node => node.type === Skeleton).length > 0, 'stale finally must not clear loading')
    requests[1].resolve({ ok: true, json: async () => [{ slug: 'gardening', name: 'Gardening', services: [] }] })
    await settle()
    tree = state.render(() => Component())
    assert.equal(findAll(tree, node => node.type === Skeleton).length, 0)
    assert.ok(findAll(tree, node => node.props?.children === 'servicesPage.empty').length === 1)
    state.unmount()
  } finally { globalThis.document = previousDocument; globalThis.fetch = previousFetch }
})

test('verification: a double click on resend sends one request and disables the button meanwhile', async () => {
  const previousDocument = globalThis.document
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  try {
    const state = hooks()
    const posts = []
    const axios = { post: (url, body) => { const d = deferred(); posts.push({ url, body, ...d }); return d.promise } }
    const toasts = []
    const Button = () => null
    const Component = loadComponent('../components/verification.tsx', {
      react: state.api,
      'next-intl': { useTranslations: () => (key, values) => (values?.time ? `${key}:${values.time}` : key) },
      '@/components/ui/button': { Button },
      '@/components/ui/card': stubModule(),
      '@/components/ui/input-otp': stubModule(),
      'lucide-react': stubModule(),
      sonner: { toast: { success: m => toasts.push(['success', m]), error: m => toasts.push(['error', m]) } },
      axios: { __esModule: true, default: axios },
      '@/lib/auth/signupOtpCooldown': signupOtpCooldown,
    })
    const props = { email: 'a@example.com', phone: '+32470000000', onVerificationSuccess() {} }
    const resendButtons = () => findAll(state.render(() => Component(props)), node => node.type === Button && node.props.variant === 'outline')

    let [emailResend, phoneResend] = resendButtons()
    assert.equal(emailResend.props.disabled, false)
    emailResend.props.onClick()
    emailResend.props.onClick() // same render: the ref blocks re-entry
    assert.equal(posts.length, 1)
    assert.match(posts[0].url, /resend-email-otp$/)
    ;[emailResend, phoneResend] = resendButtons()
    assert.equal(emailResend.props.disabled, true)
    emailResend.props.onClick()
    assert.equal(posts.length, 1)
    // The phone channel is independent.
    assert.equal(phoneResend.props.disabled, false)

    posts[0].resolve({ status: 200 })
    await settle()
    ;[emailResend] = resendButtons()
    // Success starts the cooldown, so the button stays disabled with a countdown.
    assert.equal(emailResend.props.disabled, true)
    assert.match(textOf(emailResend), /verification\.resendIn/)

    // A failed resend re-enables the button for another attempt.
    ;[, phoneResend] = resendButtons()
    phoneResend.props.onClick()
    phoneResend.props.onClick()
    assert.equal(posts.length, 2)
    posts[1].reject(new Error('network'))
    await settle()
    ;[, phoneResend] = resendButtons()
    assert.equal(phoneResend.props.disabled, false)
    phoneResend.props.onClick()
    assert.equal(posts.length, 3)
    assert.deepEqual(toasts.slice(0, 2), [['success', 'verification.emailResent'], ['error', 'verification.phoneResendFailed']])
  } finally { globalThis.document = previousDocument }
})

test('professional manager: an older list response never overwrites newer facet counts', async () => {
  const previousFetch = globalThis.fetch
  try {
    const state = hooks()
    const listRequests = []
    globalThis.fetch = url => {
      if (String(url).includes('/api/bookings/my-bookings')) {
        const d = deferred()
        listRequests.push({ url: String(url), ...d })
        return d.promise
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) })
    }
    const ui = stubModule()
    const Select = function Select() { return null }
    // next-intl and the error helper hand out stable functions, as in the app.
    const t = key => key
    const getErrorText = (_err, fallback) => fallback
    const router = { push() {}, replace() {} }
    const auth = { user: { role: 'professional' }, isAuthenticated: true, loading: false }
    const Component = loadComponent('../components/dashboard/ProfessionalBookingsQuotesManager.tsx', {
      react: state.api,
      'next/navigation': { useRouter: () => router },
      'next-intl': { useTranslations: () => t },
      '@/lib/i18n/useErrorMessage': { useErrorMessage: () => getErrorText },
      sonner: { toast: { success() {}, error() {} } },
      '@/contexts/AuthContext': { useAuth: () => auth },
      '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
      '@/lib/utils': { getAuthToken: () => null },
      '@/components/ui/card': ui, '@/components/ui/button': ui, '@/components/ui/input': ui,
      '@/components/ui/select': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'Select' ? Select : function Stub() { return null }) }),
      '@/components/ui/dialog': ui, '@/components/ui/checkbox': ui, 'lucide-react': ui,
      '@/components/dashboard/QuoteComparisonModal': ui,
      '@/components/dashboard/BookingTimelineBoard': ui,
      '@/components/dashboard/RefundRequestsPanel': ui,
      '@/components/dashboard/SharedBookingsTable': ui,
      '@/components/dashboard/SharedQuotesTable': ui,
      '@/contexts/CurrencyContext': { useCurrency: () => ({ formatMoney: amount => String(amount) }) },
      '@/lib/dashboardOverview': dashboardOverview,
      '@/lib/dashboardBookingHelpers': dashboardBookingHelpers,
    })
    const render = () => state.render(() => Component({ mode: 'quotes' }))
    const quotedLabel = tree => findAll(tree, node => typeof node.props?.children === 'string' && node.props.children.startsWith('status.quoted ('))[0]?.props.children

    render()
    state.flush()
    assert.equal(listRequests.length, 1)
    // The professional narrows the status filter: a second, newer query.
    const statusSelect = findAll(render(), node => node.type === Select && node.props.value === 'all')[0]
    statusSelect.props.onValueChange('quoted')
    render()
    state.flush()
    assert.equal(listRequests.length, 2)
    assert.match(listRequests[1].url, /status=quoted/)

    const reply = (statusCounts, ids) => ({ ok: true, json: async () => ({ success: true, statusCounts, serviceCounts: {}, bookings: ids.map(id => ({ _id: id, status: 'quoted', bookingType: 'professional' })), pagination: { page: 1, totalPages: 1, total: ids.length } }) })
    // Newer response first, then the older (unfiltered) one finishes last.
    listRequests[1].resolve(reply({ quoted: 5 }, ['new']))
    await settle()
    assert.equal(quotedLabel(render()), 'status.quoted (5)')
    listRequests[0].resolve(reply({ quoted: 1, rfq: 9 }, ['old']))
    await settle()
    assert.equal(quotedLabel(render()), 'status.quoted (5)')
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('customer dashboard: a failed list keeps its filters, offers a retry, and the alias shows one count', async () => {
  const previousFetch = globalThis.fetch
  try {
    const state = hooks()
    const listRequests = []
    globalThis.fetch = url => {
      url = String(url)
      if (url.includes('/api/bookings/my-bookings') && url.includes('limit=20')) {
        const d = deferred()
        listRequests.push({ url, ...d })
        return d.promise
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, bookings: [], data: { claims: [] } }) })
    }
    const ui = stubModule()
    const Select = function Select() { return null }
    const SelectItem = function SelectItem() { return null }
    const Button = function Button() { return null }
    const t = key => key
    const getErrorText = (err, fallback) => (err && typeof err.msg === 'string' ? err.msg : fallback)
    const router = { push() {}, replace() {} }
    const auth = { user: { role: 'customer' } }
    const currency = { formatMoney: amount => String(amount) }
    const locale = { intl: 'en-GB' }
    const Component = loadComponent('../components/dashboard/CustomerDashboard.tsx', {
      react: state.api,
      'next/navigation': { useRouter: () => router },
      'next-intl': { useTranslations: () => t },
      '@/lib/i18n/useErrorMessage': { useErrorMessage: () => getErrorText },
      '@/components/ui/card': ui, '@/components/ui/button': { Button }, '@/components/ui/badge': ui,
      '@/components/ui/input': ui, '@/components/ui/tabs': ui, '@/components/ui/skeleton': ui, '@/components/ui/checkbox': ui,
      '@/components/ui/select': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'Select' ? Select : key === 'SelectItem' ? SelectItem : function Stub() { return null }) }),
      'lucide-react': ui,
      '@/contexts/AuthContext': { useAuth: () => auth },
      '@/contexts/CurrencyContext': { useCurrency: () => currency },
      '@/lib/i18n/useFormatLocale': { useFormatLocale: () => locale },
      '@/lib/utils': { getAuthToken: () => null },
      '@/lib/dashboardBookingHelpers': dashboardBookingHelpers,
      '@/lib/dashboardOverview': dashboardOverview,
      '@/lib/actionNeededHelpers': await import('../lib/actionNeededHelpers.ts'),
      '@/components/dashboard/QuoteComparisonModal': ui,
      '@/components/dashboard/SharedBookingsTable': ui,
      '@/components/dashboard/SharedQuotesTable': ui,
    })
    const render = () => state.render(() => Component())
    render()
    state.flush()
    assert.equal(listRequests.length, 2)
    const quoteRequest = listRequests.find(r => r.url.includes('status=rfq'))
    const bookingRequest = listRequests.find(r => r.url.includes('status=quote_accepted'))
    bookingRequest.resolve({ ok: true, json: async () => ({ success: true, bookings: [], statusCounts: { payment_pending: 3, quote_accepted: 2 }, serviceCounts: {}, distinctServices: [], pagination: { page: 1, totalPages: 1, total: 5 } }) })
    quoteRequest.resolve({ ok: false, json: async () => ({ success: false, msg: 'Quotes unavailable' }) })
    await settle()

    let tree = render()
    // The awaiting-payment option counts the rows its alias filter returns.
    const paymentPending = findAll(tree, node => node.type === SelectItem && node.props.value === 'payment_pending')[0]
    assert.match(textOf(paymentPending), /\(5\)$/)
    assert.doesNotMatch(textOf(paymentPending), /\+/)
    // The quotes tab keeps its status filter mounted next to the error.
    const quoteFilter = findAll(tree, node => node.type === Select && findAll(node, child => child.type === SelectItem && child.props.value === 'quote_rejected').length > 0)
    assert.equal(quoteFilter.length, 1)
    const alert = findAll(tree, node => node.props?.role === 'alert' && textOf(node).includes('Quotes unavailable'))
    assert.equal(alert.length, 1)
    const retry = findAll(alert[0], node => node.type === Button && node.props.children === 'common.retry')[0]
    assert.ok(retry, 'error card offers a retry')
    retry.props.onClick()
    assert.equal(listRequests.length, 3)
    assert.match(listRequests[2].url, /page=1&limit=20&status=rfq/)
    // Changing the filter also re-queries the failed list.
    quoteFilter[0].props.onValueChange('quoted')
    render()
    state.flush()
    assert.equal(listRequests.length, 4)
    assert.match(listRequests[3].url, /status=quoted/)
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('professional payments: the onboarding empty state only shows for an unfiltered, successful empty list', async () => {
  const previousFetch = globalThis.fetch
  try {
    const txRequests = []
    globalThis.fetch = url => {
      url = String(url)
      if (url.includes('/api/professional/transactions')) {
        const d = deferred()
        txRequests.push({ url, ...d })
        return d.promise
      }
      if (url.includes('/account-status')) return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { onboardingCompleted: true, chargesEnabled: true } }) })
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { totalEarnings: 0, pendingEarnings: 0, completedBookings: 0, pendingBookings: 0, currency: 'EUR' } }) })
    }
    const ui = stubModule()
    const Select = function Select() { return null }
    const t = key => key
    const router = { push() {}, replace() {} }
    const auth = { user: { role: 'professional' }, isAuthenticated: true, loading: false }
    const currency = { formatMoney: amount => String(amount) }
    const locale = { intl: 'en-GB' }
    const mocks = state => ({
      react: state.api,
      'next/link': { __esModule: true, default: () => null },
      'next/navigation': { useRouter: () => router },
      'next-intl': { useTranslations: () => t },
      '@/lib/apiErrors': apiErrors,
      '@/lib/i18n/useErrorMessage': { useErrorMessage: () => (_e, fallback) => fallback },
      '@/contexts/AuthContext': { useAuth: () => auth },
      '@/contexts/CurrencyContext': { useCurrency: () => currency },
      '@/lib/i18n/useFormatLocale': { useFormatLocale: () => locale },
      '@/components/ui/card': ui, '@/components/ui/input': ui, '@/components/ui/badge': ui, '@/components/ui/button': ui, '@/components/ui/skeleton': ui,
      '@/components/ui/select': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'Select' ? Select : function Stub() { return null }) }),
      'lucide-react': ui,
    })
    const state = hooks()
    // The page picks the professional view for this role; that view is then
    // mounted on a fresh stand-in (the role switch's hooks are discarded).
    const Dashboard = loadComponent('../app/(pages)/dashboard/payments/page.tsx', mocks(state))
    const ViewComponent = state.render(() => Dashboard()).type
    state.reset()
    assert.equal(ViewComponent.name, 'ProfessionalPaymentsView')
    const render = () => state.render(() => ViewComponent())
    const texts = tree => findAll(tree, node => typeof node.props?.children === 'string').map(node => node.props.children)
    render()
    state.flush()
    await settle()
    render()
    state.flush()
    assert.equal(txRequests.length, 1)
    txRequests[0].resolve({ ok: true, json: async () => ({ success: true, data: [], pagination: { page: 1, totalPages: 1 } }) })
    await settle()
    let tree = render()
    assert.ok(texts(tree).includes('payments.professional.noTransactions'))
    assert.ok(!texts(tree).includes('payments.table.empty'))

    // A status filter that matches nothing is not "no transactions yet".
    const statusSelect = findAll(tree, node => node.type === Select && node.props.value === 'all')[0]
    statusSelect.props.onValueChange('refunded')
    render()
    state.flush()
    assert.equal(txRequests.length, 2)
    txRequests[1].resolve({ ok: true, json: async () => ({ success: true, data: [], pagination: { page: 1, totalPages: 1 } }) })
    await settle()
    tree = render()
    assert.ok(texts(tree).includes('payments.table.empty'))
    assert.ok(!texts(tree).includes('payments.professional.noTransactions'))

    // A failed request shows only the alert, never an empty state.
    statusSelect.props.onValueChange('all')
    render()
    state.flush()
    txRequests[2].resolve({ ok: false, json: async () => ({}) })
    await settle()
    tree = render()
    assert.ok(texts(tree).includes('payments.loadFailed'))
    assert.ok(!texts(tree).includes('payments.professional.noTransactions'))
    assert.ok(!texts(tree).includes('payments.table.empty'))
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('customer status filter shows one summed count for the payment-pending alias', () => {
  const counts = { payment_pending: 3, quote_accepted: 2, booked: 4 }
  assert.equal(statusOptionCount(counts, 'payment_pending'), 5)
  assert.equal(statusOptionCount(counts, 'booked'), 4)
  assert.equal(statusOptionCount(counts, 'quote_accepted'), 2)
  assert.equal(statusOptionCount(null, 'payment_pending'), 0)
})

test('project card price tokens translate in every locale; free text stays as recorded', () => {
  for (const locale of ['en', 'fr', 'nl']) {
    const t = createTranslator({ locale, messages: { proProjects: messages(locale, 'proProjects') }, namespace: 'proProjects' })
    for (const key of Object.values(PRICE_TOKEN_KEYS)) {
      assert.notEqual(t(key), `proProjects.${key}`, `${locale} ${key}`)
    }
    const localize = value => { const key = priceTokenKey(value); return key ? t(key) : value }
    const label = t('manage.card.startingFrom', { model: localize('unit'), unit: `/${localize('m2')}`, price: '€45' })
    assert.doesNotMatch(label, /\(unit\//, `${locale}: ${label}`)
    if (locale === 'nl') assert.equal(label, 'Vanaf €45 (Eenheid/m²)')
  }
  assert.equal(priceTokenKey(' Fixed '), 'priceModels.fixed')
  // An admin-configured option name or a display-ready unit is not an identifier.
  assert.equal(priceTokenKey('Total price'), null)
  assert.equal(priceTokenKey('m²'), null)
  assert.equal(priceTokenKey(null), null)
  assert.equal(priceTokenKey('constructor'), null)
})

test('username check: only an explicit available:true is available; failures keep a reason', () => {
  const describe = reason => (typeof reason === 'string' && reason ? `err:${reason}` : 'Username check failed')
  assert.deepEqual(usernameCheckResult({ available: true }, describe), { available: true, reason: undefined })
  assert.deepEqual(usernameCheckResult({ available: false, reason: 'taken' }, describe), { available: false, reason: 'err:taken' })
  // A 5xx/validation body without `available` must not leave the status box empty.
  assert.deepEqual(usernameCheckResult({ success: false, msg: 'Server error' }, describe), { available: false, reason: 'Username check failed' })
  assert.deepEqual(usernameCheckResult({ available: 'yes' }, describe), { available: false, reason: 'Username check failed' })
  assert.deepEqual(usernameCheckResult(null, describe), { available: false, reason: 'Username check failed' })
})

test('stripe return pages resume onboarding at the shared Stripe step', () => {
  assert.equal(stripeReturnPath(true), `/professional/onboarding?step=${ONBOARDING_STEPS.STRIPE}`)
  assert.equal(stripeReturnPath(true), '/professional/onboarding?step=3')
  assert.equal(stripeReturnPath(false), '/dashboard')
  assert.equal(onboardingStepPath(ONBOARDING_STEPS.RULES), '/professional/onboarding?step=7')
  for (const file of ['../app/professional/stripe/complete/page.tsx', '../app/professional/stripe/refresh/page.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /onboarding\?step=\d/, file)
  }
})

test('redirect guard validates the exact string it approves (no trimmed copy)', () => {
  for (const value of [' /foo', ' /foo', ' /bookings/1', ' //evil.com']) {
    assert.equal(isSafeRedirectPath(value), false, JSON.stringify(value))
    assert.equal(resolvePostAuthRedirect({ role: 'customer', explicitRedirect: value }), '/', JSON.stringify(value))
  }
  assert.equal(resolvePostAuthRedirect({ role: 'customer', explicitRedirect: '/bookings/1?tab=chat' }), '/bookings/1?tab=chat')
})

test('pending payout count pluralizes in en, fr and nl', () => {
  const expected = {
    en: ['1 pending payout', '2 pending payouts'],
    fr: ['1 versement en attente', '2 versements en attente'],
    nl: ['1 openstaande uitbetaling', '2 openstaande uitbetalingen'],
  }
  for (const [locale, [one, other]] of Object.entries(expected)) {
    const t = createTranslator({ locale, messages: { dashboard: messages(locale, 'dashboard') }, namespace: 'dashboard' })
    assert.equal(t('payments.professional.pendingBookingsCount', { count: 1 }), one)
    assert.equal(t('payments.professional.pendingBookingsCount', { count: 2 }), other)
  }
})

test('Dutch dashboard copy uses vakman/dienst consistently', () => {
  const dashboard = messages('nl', 'dashboard')
  const widgets = messages('nl', 'dashboardWidgets')
  const proProjects = messages('nl', 'proProjects')
  assert.equal(dashboard.payments.table.search, 'Zoeken op boekingsnr., vakman…')
  assert.equal(dashboard.payments.table.filterService, 'Filteren op dienst')
  assert.equal(dashboard.payments.table.allServices, 'Alle diensten')
  assert.equal(dashboard.warranty.filterService, 'Filteren op dienst')
  assert.equal(dashboard.warranty.allServices, 'Alle diensten')
  assert.equal(widgets.tables.colProfessional, 'Vakman')
  assert.equal(proProjects.manage.card.service, 'Dienst: {value}')
})
