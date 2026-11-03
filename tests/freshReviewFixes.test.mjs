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

// ---------------------------------------------------------------------------
// CodeRabbit CLI review of e03bbc6: behavior regressions through the real
// components and the hook stand-in above.
// ---------------------------------------------------------------------------

test('category page: navigating to an unknown slug never shows the previous category while it redirects', async () => {
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
    let slug = 'gardening'
    const replaces = []
    const router = { replace: href => replaces.push(href) }
    const Component = loadComponent('../app/(pages)/categories/[categorySlug]/page.tsx', {
      react: state.api,
      'next/link': { __esModule: true, default: () => null },
      sonner: { toast: { error() {} } },
      'next/navigation': { useParams: () => ({ categorySlug: slug }), useRouter: () => router },
      'next-intl': { useTranslations: () => key => key },
      '@/components/ui/skeleton': { Skeleton: () => null }, '@/components/ui/button': { Button: () => null },
      '@/lib/catalog/resolveCategory': { CATALOG_HOME_COUNTRY: 'BE', resolveCatalogCountry: () => 'BE', matchCatalogCategory: (rows, s) => rows.find(row => row.slug === s), normalizeCategorySlug: s => s },
      '@/lib/marketing/siteAnnouncements/constants': { GEO_COUNTRY_COOKIE: 'fixera_geo_country' },
    })
    const catalog = [{ slug: 'gardening', name: 'Gardening', services: [] }]
    state.render(() => Component())
    state.flush()
    requests[0].resolve({ ok: true, json: async () => catalog })
    await settle()
    assert.ok(textOf(state.render(() => Component())).includes('Gardening'))

    slug = 'no-such-category'
    state.render(() => Component())
    state.flush()
    requests[1].resolve({ ok: true, json: async () => catalog })
    await settle()
    assert.deepEqual(replaces, ['/services'])
    // Loading ended, the redirect is pending: nothing of Gardening is shown.
    assert.equal(state.render(() => Component()), null)
    state.unmount()
  } finally { globalThis.document = previousDocument; globalThis.fetch = previousFetch }
})

test('verification: the first resend waits for the recorded initial send; an unknown send time assumes nothing', async () => {
  const previousDocument = globalThis.document
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
  try {
    const Button = () => null
    const load = state => loadComponent('../components/verification.tsx', {
      react: state.api,
      'next-intl': { useTranslations: () => (key, values) => (values?.time ? `${key}:${values.time}` : key) },
      '@/components/ui/button': { Button },
      '@/components/ui/card': stubModule(),
      '@/components/ui/input-otp': stubModule(),
      'lucide-react': stubModule(),
      sonner: { toast: { success() {}, error() {} } },
      axios: { __esModule: true, default: { post: () => new Promise(() => {}) } },
      '@/lib/auth/signupOtpCooldown': signupOtpCooldown,
    })
    const base = { email: 'a@example.com', phone: '+32470000000', onVerificationSuccess() {} }
    const resendButtons = (state, Component, props) =>
      findAll(state.render(() => Component(props)), node => node.type === Button && node.props.variant === 'outline')

    // Codes sent 30 s ago: 90 s of cooldown remain, on every re-render.
    const sent = Date.now() - 30_000
    const state = hooks()
    const Component = load(state)
    const props = { ...base, emailCodeSentAt: sent, phoneCodeSentAt: sent }
    let [emailResend, phoneResend] = resendButtons(state, Component, props)
    assert.equal(emailResend.props.disabled, true)
    assert.equal(phoneResend.props.disabled, true)
    assert.match(textOf(emailResend), /verification\.resendIn:1:(29|30)/)
    state.flush()
    ;[emailResend] = resendButtons(state, Component, props)
    assert.match(textOf(emailResend), /verification\.resendIn:1:(29|30)/, 're-render keeps the original deadline')
    state.unmount()

    // A send that already left the cooldown window enables resend.
    const old = hooks()
    const OldComponent = load(old)
    ;[emailResend] = resendButtons(old, OldComponent, { ...base, emailCodeSentAt: Date.now() - 121_000 })
    assert.equal(emailResend.props.disabled, false)

    // No recorded send time: existing callers keep resend available.
    const unknown = hooks()
    const UnknownComponent = load(unknown)
    ;[emailResend, phoneResend] = resendButtons(unknown, UnknownComponent, base)
    assert.equal(emailResend.props.disabled, false)
    assert.equal(phoneResend.props.disabled, false)
  } finally { globalThis.document = previousDocument }
})

test('customer dashboard: Retry repeats the page that failed, not the last page that loaded', async () => {
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
      '@/components/ui/select': ui,
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
    const bookingRequest = listRequests.find(r => r.url.includes('status=quote_accepted'))
    const quoteRequest = listRequests.find(r => r.url.includes('status=rfq'))
    quoteRequest.resolve({ ok: true, json: async () => ({ success: true, bookings: [], pagination: { page: 1, totalPages: 1, total: 0 } }) })
    bookingRequest.resolve({ ok: true, json: async () => ({ success: true, bookings: [{ _id: 'b1', status: 'booked' }], statusCounts: {}, serviceCounts: {}, distinctServices: [], pagination: { page: 1, totalPages: 3, total: 41 } }) })
    await settle()

    const next = findAll(render(), node => node.type === Button && node.props.children === 'common.next')[0]
    next.props.onClick()
    const pageTwo = listRequests.at(-1)
    assert.match(pageTwo.url, /page=2&limit=20/)
    pageTwo.resolve({ ok: false, json: async () => ({ success: false, msg: 'Bookings unavailable' }) })
    await settle()

    const alert = findAll(render(), node => node.props?.role === 'alert' && textOf(node).includes('Bookings unavailable'))[0]
    const retry = findAll(alert, node => node.type === Button && node.props.children === 'common.retry')[0]
    retry.props.onClick()
    assert.match(listRequests.at(-1).url, /page=2&limit=20/)
    // A thrown request (network) also remembers its page.
    listRequests.at(-1).reject(new Error('network'))
    await settle()
    const retryAgain = findAll(render(), node => node.type === Button && node.props.children === 'common.retry')[0]
    retryAgain.props.onClick()
    assert.match(listRequests.at(-1).url, /page=2&limit=20/)
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('professional payments: an ok response with success:false clears the previous rows and shows the error', async () => {
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
    const state = hooks()
    const Dashboard = loadComponent('../app/(pages)/dashboard/payments/page.tsx', {
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
    const ViewComponent = state.render(() => Dashboard()).type
    state.reset()
    const render = () => state.render(() => ViewComponent())
    const texts = tree => findAll(tree, node => typeof node.props?.children === 'string').map(node => node.props.children)
    render()
    state.flush()
    await settle()
    render()
    state.flush()
    txRequests[0].resolve({ ok: true, json: async () => ({ success: true, data: [{ _id: 't1', bookingNumber: 'BK-OLD-1', status: 'completed', amount: 10, currency: 'EUR', date: null }], pagination: { page: 1, totalPages: 1 } }) })
    await settle()
    assert.ok(textOf(render()).includes('BK-OLD-1'))

    const statusSelect = findAll(render(), node => node.type === Select && node.props.value === 'all')[0]
    statusSelect.props.onValueChange('transfer_failed')
    render()
    state.flush()
    txRequests.at(-1).resolve({ ok: true, json: async () => ({ success: false, error: { code: 'SERVER_ERROR' } }) })
    await settle()
    const tree = render()
    assert.ok(!textOf(tree).includes('BK-OLD-1'), 'rows of the previous filter are gone')
    assert.ok(texts(tree).includes('payments.loadFailed'))
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('warranty claims: a deep-linked claim is not injected into a service-filtered list that excludes it', async () => {
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  try {
    globalThis.window = { requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout, clearTimeout }
    const listRequests = []
    const highlighted = { _id: 'c1', claimNumber: 'WC-2026-000001', status: 'open', booking: { _id: 'b1', bookingNumber: 'BK-1' }, evidence: [] }
    globalThis.fetch = url => {
      url = String(url)
      if (url.includes('/api/warranty-claims/my')) {
        const d = deferred()
        listRequests.push({ url, ...d })
        return d.promise
      }
      if (url.includes('/api/warranty-claims/c1')) return Promise.resolve({ ok: true, json: async () => ({ success: true, claim: highlighted }) })
      return Promise.resolve({ ok: true, json: async () => ({ success: true, distinctServices: ['Plumbing'] }) })
    }
    const ui = stubModule()
    const Select = function Select() { return null }
    const SelectItem = function SelectItem() { return null }
    const t = key => key
    const router = { push() {}, replace() {} }
    const auth = { user: { role: 'customer' }, isAuthenticated: true, loading: false }
    const searchParams = new URLSearchParams('claimId=c1')
    const state = hooks()
    const Page = loadComponent('../app/(pages)/dashboard/warranty-claims/page.tsx', {
      react: state.api,
      'next/navigation': { useRouter: () => router, useSearchParams: () => searchParams },
      'next-intl': { useTranslations: () => t },
      '@/lib/apiErrors': apiErrors,
      '@/contexts/AuthContext': { useAuth: () => auth },
      '@/lib/utils': { getAuthToken: () => null },
      '@/components/ui/card': ui, '@/components/ui/input': ui, '@/components/ui/button': ui, '@/components/ui/badge': ui, '@/components/ui/skeleton': ui,
      '@/components/ui/select': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'Select' ? Select : key === 'SelectItem' ? SelectItem : function Stub() { return null }) }),
      'lucide-react': ui,
      '@/lib/warrantyClaim': await import('../lib/warrantyClaim.ts'),
      '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
      '@/lib/i18n/useErrorMessage': { useErrorMessage: () => (_e, fallback) => fallback },
    })
    const Content = state.render(() => Page()).props.children.type
    state.reset()
    const render = () => state.render(() => Content())
    // Mount, then let the claim lookup and the service facet settle.
    for (let i = 0; i < 4; i++) { render(); state.flush(); await settle() }
    const pendingList = listRequests.at(-1)
    pendingList.resolve({ ok: true, json: async () => ({ success: true, data: { claims: [], pagination: { total: 0, totalPages: 1 } } }) })
    await settle()
    // Unfiltered list: the deep-linked claim is shown on page 1.
    assert.ok(textOf(render()).includes('WC-2026-000001'))

    const serviceSelect = findAll(render(), node => node.type === Select && findAll(node, child => child.type === SelectItem && child.props.value === 'Plumbing').length > 0)[0]
    serviceSelect.props.onValueChange('Plumbing')
    render()
    state.flush()
    const filtered = listRequests.at(-1)
    assert.match(filtered.url, /service=Plumbing/)
    filtered.resolve({ ok: true, json: async () => ({ success: true, data: { claims: [], pagination: { total: 0, totalPages: 1 } } }) })
    await settle()
    const tree = render()
    assert.ok(!textOf(tree).includes('WC-2026-000001'), 'the server said no claim matches this service')
    state.unmount()
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow }
})

test('quotation tab: picking a historical version announces the hash change the booking page listens to', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  try {
    const listeners = new Map()
    const dispatched = []
    const pushed = []
    const location = { href: 'http://localhost/bookings/test?tab=quotation', hash: '', pathname: '/bookings/test', search: '?tab=quotation' }
    globalThis.document = { getElementById: () => null }
    globalThis.window = {
      location,
      history: {
        pushState(_state, _title, url) {
          pushed.push(url)
          const next = new URL(url, location.href)
          Object.assign(location, { href: next.href, hash: next.hash, pathname: next.pathname, search: next.search })
        },
      },
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]) },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(f => f !== fn)) },
      dispatchEvent(event) { dispatched.push([event.type, location.hash]); for (const fn of listeners.get(event.type) || []) fn(event) },
    }
    const bookingDetails = await import('../lib/bookingDetails.ts')
    // The booking page's pinned-version listener: it reads the hash on hashchange.
    let pinned = bookingDetails.resolveQuotationVersionFromUrl(location.hash, null, null)
    window.addEventListener('hashchange', () => { pinned = bookingDetails.resolveQuotationVersionFromUrl(location.hash, null, null) })

    const state = hooks()
    const ui = stubModule()
    const detailPrimitives = new Proxy({}, {
      get: (_, key) => key === '__esModule' ? true
        : key === 'useDetailT' ? () => (_key, fallback) => fallback
        : key === 'useDetailDisplayTimeZone' ? () => ({ timeZone: 'UTC' })
        : key === 'actorDisplayName' ? () => ''
        : function Stub() { return null },
    })
    const file = '../components/booking/details/QuotationPanel.tsx'
    const { code } = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
      filename: file, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
    })
    const mocks = {
      react: state.api,
      'next-intl': { useTranslations: () => key => key },
      '@/contexts/CurrencyContext': { useCurrency: () => ({ formatMoney: amount => String(amount) }) },
      '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
      '@/lib/bookingDetails': bookingDetails,
      './DetailPrimitives': detailPrimitives,
      './BookingDataPanel': ui,
    }
    const exports = {}
    new Function('require', 'exports', code)(name => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('@/') || name.startsWith('./')) throw new Error(`unmocked import ${name}`)
      return require(name)
    }, exports)
    const payload = JSON.parse(readFileSync(new URL('./fixtures/bookingDetails/quoted-customer.json', import.meta.url), 'utf8'))
    const props = { booking: payload.booking, details: payload.details, pathname: '/bookings/test', search: 'tab=quotation' }
    const render = () => state.render(() => exports.QuotationPanel(props))
    const versionLink = (tree, version) => findAll(tree, node => node.type === 'a' && typeof node.props.href === 'string' && node.props.href.endsWith(`#quotation-v${version}`) && typeof node.props.onClick === 'function')[0]

    render()
    state.flush()
    assert.equal(pinned, null)
    const event = { preventDefault() {} }
    versionLink(render(), 1).props.onClick(event)
    // pushState alone fires no event; the panel announces the new hash.
    assert.deepEqual(dispatched, [['hashchange', '#quotation-v1']])
    assert.equal(location.hash, '#quotation-v1')
    assert.equal(pinned, 1, 'the page now knows a historical version is shown (Accept & Pay gate)')
    // The panel itself follows the same URL.
    render()
    state.flush()
    assert.equal(pushed.length, 1)
    // Re-selecting the version already in the URL pushes and announces nothing:
    // no extra history entry, so one Back still leaves the version.
    versionLink(render(), 1).props.onClick(event)
    assert.equal(dispatched.length, 1)
    assert.equal(pushed.length, 1, 'no duplicate history entry for the same URL')
    versionLink(render(), 2).props.onClick(event)
    assert.deepEqual(dispatched.at(-1), ['hashchange', '#quotation-v2'])
    assert.equal(pushed.length, 2)
    assert.equal(pinned, 2)
    state.unmount()
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument }
})

function loadPinnedVersionModule(reactApi, bookingDetails) {
  const file = '../lib/booking/usePinnedQuoteVersion.ts'
  const exports = {}
  new Function('require', 'exports', transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'typescript' } }, module: { type: 'commonjs' },
  }).code)(name => (name === 'react' ? reactApi : name === '@/lib/bookingDetails' ? bookingDetails : require(name)), exports)
  return exports
}

// The booking page's Accept & Pay / Reject buttons (QuoteResponseActions).
function loadQuoteResponseActions() {
  const Button = function Button() { return null }
  const file = '../components/booking/details/QuoteResponseActions.tsx'
  const exports = {}
  new Function('require', 'exports', transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  }).code)(name => {
    if (name === '@/components/ui/button') return { Button }
    if (name === 'lucide-react') return stubModule()
    if (name.startsWith('@/')) throw new Error(`unmocked import ${name}`)
    return require(name)
  }, exports)
  const clicks = []
  return {
    clicks,
    disabled(props) {
      const tree = exports.QuoteResponseActions({ onAccept: () => clicks.push('accept'), onReject: () => clicks.push('reject'), acceptLabel: 'quotation.acceptAndPay', rejectLabel: 'quotation.rejectWithReason', ...props })
      const buttons = findAll(tree, node => node.type === Button)
      const byLabel = label => buttons.find(button => textOf(button).includes(label))
      const accept = byLabel('quotation.acceptAndPay')
      const reject = byLabel('quotation.rejectWithReason')
      assert.ok(accept && reject, 'both response buttons render')
      return { accept: accept.props.disabled === true, reject: reject.props.disabled === true, acceptButton: accept, rejectButton: reject }
    },
  }
}

test('booking page: the authoritative quote version is the canonical current one, never the hash-pinned version', async () => {
  const bookingDetails = await import('../lib/bookingDetails.ts')
  const { resolveAuthoritativeQuoteVersion, resolveQuoteVersionView } = loadPinnedVersionModule(hooks().api, bookingDetails)
  const v = (version) => ({ version, scope: `scope v${version}` })
  // Serialized out of order on purpose: never pick by array position.
  const versions = [v(3), v(1), v(2)]
  // A valid currentQuoteVersion is preserved, even when it is not the highest.
  assert.equal(resolveAuthoritativeQuoteVersion(versions, 2).version, 2)
  // Missing or unmatched: the latest by version number.
  assert.equal(resolveAuthoritativeQuoteVersion(versions, undefined).version, 3)
  assert.equal(resolveAuthoritativeQuoteVersion(versions, null).version, 3)
  assert.equal(resolveAuthoritativeQuoteVersion(versions, 9).version, 3)
  assert.equal(resolveAuthoritativeQuoteVersion([{ version: Number.NaN }, v(1)], undefined).version, 1)
  assert.equal(resolveAuthoritativeQuoteVersion([], 1), null)
  assert.equal(resolveAuthoritativeQuoteVersion(undefined, 1), null)

  // The page's view: a hash pin on v1 with currentQuoteVersion missing shows
  // v1 to the customer (Accept & Pay/Reject locked) while the pro summary and
  // edit wizard basis stay on v3.
  for (const currentQuoteVersion of [undefined, 9]) {
    const view = resolveQuoteVersionView({ quoteVersions: versions, currentQuoteVersion, pinnedVersion: 1 })
    assert.equal(view.displayedVersion.version, 1)
    assert.equal(view.authoritativeVersion.version, 3, `current ${currentQuoteVersion}`)
    assert.equal(view.viewingPinnedVersion, true)
  }
  // A valid current with a historical pin: current stays authoritative.
  const pinnedOld = resolveQuoteVersionView({ quoteVersions: versions, currentQuoteVersion: 2, pinnedVersion: 1 })
  assert.deepEqual([pinnedOld.displayedVersion.version, pinnedOld.authoritativeVersion.version, pinnedOld.viewingPinnedVersion], [1, 2, true])
  // No pin: displayed and authoritative are the same current version.
  const unpinned = resolveQuoteVersionView({ quoteVersions: versions, currentQuoteVersion: 2, pinnedVersion: null })
  assert.deepEqual([unpinned.displayedVersion.version, unpinned.authoritativeVersion.version, unpinned.viewingPinnedVersion], [2, 2, false])
  // A pin to a version that does not exist falls back to current, unlocked.
  const missingPin = resolveQuoteVersionView({ quoteVersions: versions, currentQuoteVersion: 2, pinnedVersion: 7 })
  assert.deepEqual([missingPin.displayedVersion.version, missingPin.viewingPinnedVersion], [2, false])
  const none = resolveQuoteVersionView({ quoteVersions: [], currentQuoteVersion: 2, pinnedVersion: 1 })
  assert.deepEqual(none, { hasQuotationVersions: false, displayedVersion: null, authoritativeVersion: null, viewingPinnedVersion: false })
})

test('booking page: a missing or unmatched currentQuoteVersion shows and gates on the same latest version', async () => {
  const bookingDetails = await import('../lib/bookingDetails.ts')
  const { resolveQuoteVersionView } = loadPinnedVersionModule(hooks().api, bookingDetails)
  const actions = loadQuoteResponseActions()
  const v = (version) => ({ version, scope: `scope v${version}` })
  const versions = [v(3), v(1), v(2)] // out of order: never by array position
  const view = (currentQuoteVersion, pinnedVersion) => {
    const result = resolveQuoteVersionView({ quoteVersions: versions, currentQuoteVersion, pinnedVersion })
    const disabled = actions.disabled({ responding: false, viewingPinnedVersion: result.viewingPinnedVersion })
    return [result.displayedVersion?.version, result.authoritativeVersion?.version, result.viewingPinnedVersion, disabled.accept, disabled.reject]
  }
  for (const current of [undefined, null, 9]) {
    // No hash pin: the customer card shows the latest version, buttons enabled.
    assert.deepEqual(view(current, null), [3, 3, false, false, false], `no pin, current ${current}`)
    // A #quotation-v3 pin on the version the page treats as current: not historical.
    assert.deepEqual(view(current, 3), [3, 3, false, false, false], `pin latest, current ${current}`)
    // A historical pin stays locked.
    assert.deepEqual(view(current, 1), [1, 3, true, true, true], `pin v1, current ${current}`)
    // A pin to a version that does not exist shows the latest, unlocked.
    assert.deepEqual(view(current, 7), [3, 3, false, false, false], `pin missing, current ${current}`)
  }
  // A valid current pointer is unchanged, even when it is not the highest.
  assert.deepEqual(view(2, null), [2, 2, false, false, false])
  assert.deepEqual(view(2, 2), [2, 2, false, false, false])
  assert.deepEqual(view(2, 3), [3, 2, true, true, true])
  assert.deepEqual(view(2, 1), [1, 2, true, true, true])
})

test('booking page: the responding spinner stops rotating for reduced-motion users and stays visible', () => {
  const actions = loadQuoteResponseActions()
  const spinners = (responding) => {
    const { acceptButton } = actions.disabled({ responding, viewingPinnedVersion: false })
    return findAll(acceptButton, node => typeof node.props?.className === 'string' && node.props.className.includes('animate-spin'))
  }
  const [spinner] = spinners(true)
  assert.ok(spinner, 'spinner renders while responding')
  const classes = spinner.props.className.split(/\s+/)
  assert.ok(classes.includes('animate-spin'), 'normal spinner still rotates')
  assert.ok(classes.includes('motion-reduce:animate-none'), 'reduced motion: no rotation')
  assert.ok(classes.includes('h-4') && classes.includes('w-4'), 'still visible')
  assert.equal(spinners(false).length, 0)
})

test('booking page: Accept & Pay and Reject are both disabled for a historical version or while responding', () => {
  const actions = loadQuoteResponseActions()
  assert.deepEqual(pick(actions.disabled({ responding: false, viewingPinnedVersion: true })), { accept: true, reject: true })
  assert.deepEqual(pick(actions.disabled({ responding: true, viewingPinnedVersion: false })), { accept: true, reject: true })
  const enabled = actions.disabled({ responding: false, viewingPinnedVersion: false })
  assert.deepEqual(pick(enabled), { accept: false, reject: false })
  enabled.acceptButton.props.onClick()
  enabled.rejectButton.props.onClick()
  assert.deepEqual(actions.clicks, ['accept', 'reject'])
  function pick({ accept, reject }) { return { accept, reject } }
})

test('booking page: the real pinned-version hook and Accept & Pay gate follow Overview links, version history and Back/Forward', async () => {
  const previousWindow = globalThis.window
  try {
    const listeners = new Map()
    const location = { href: 'http://localhost/bookings/test?tab=overview', hash: '', pathname: '/bookings/test', search: '?tab=overview' }
    const setUrl = (url) => {
      const next = new URL(url, location.href)
      Object.assign(location, { href: next.href, hash: next.hash, pathname: next.pathname, search: next.search })
    }
    const fire = (event) => { for (const fn of listeners.get(event.type) || []) fn(event) }
    globalThis.window = {
      location,
      // Like the browser: pushState changes the URL and fires no event.
      history: { pushState(_state, _title, url) { setUrl(url) } },
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]) },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(f => f !== fn)) },
      dispatchEvent(event) { fire(event) },
      scrollTo() {},
    }
    const bookingDetails = await import('../lib/bookingDetails.ts')
    const payload = JSON.parse(readFileSync(new URL('./fixtures/bookingDetails/quoted-customer.json', import.meta.url), 'utf8'))
    const CURRENT = payload.booking.currentQuoteVersion
    assert.equal(CURRENT, 2)
    // The booking page's own pinned-version hook, version view and response
    // buttons: bookings/[id]/page.tsx calls usePinnedQuoteVersion, takes
    // `viewingPinnedVersion` from resolveQuoteVersionView
    // (lib/booking/usePinnedQuoteVersion.ts) and passes it to
    // QuoteResponseActions, which renders Accept & Pay and Reject.
    const pinState = hooks()
    const pinExports = loadPinnedVersionModule(pinState.api, bookingDetails)
    const { usePinnedQuoteVersion, isViewingPinnedQuoteVersion, resolveQuoteVersionView } = pinExports
    const actions = loadQuoteResponseActions()
    const versions = payload.booking.quoteVersions
    // Accept & Pay / Reject `disabled` as the real component renders them.
    const pagePin = () => {
      const [pinnedVersion] = pinState.render(() => usePinnedQuoteVersion('booking-1'))
      const view = resolveQuoteVersionView({ quoteVersions: versions, currentQuoteVersion: CURRENT, pinnedVersion })
      const disabled = actions.disabled({ responding: false, viewingPinnedVersion: view.viewingPinnedVersion })
      assert.equal(disabled.accept, disabled.reject, 'Accept & Pay and Reject share the gate')
      return { pinnedVersion, viewing: disabled.accept }
    }
    pagePin()
    pinState.flush()
    assert.equal(listeners.get('hashchange').length, 1)
    assert.equal(listeners.get('popstate').length, 1)
    let pinned = null
    const acceptDisabled = () => { const r = pagePin(); pinned = r.pinnedVersion; return r.viewing }
    // A version that does not exist is not "viewing a pinned version".
    assert.equal(isViewingPinnedQuoteVersion({ hasQuotationVersions: true, pinnedVersion: 9, currentQuoteVersion: 2, displayedVersion: 2 }), false)
    // A native same-document `<a href="#quotation-vN">` click: the browser
    // updates the fragment and fires hashchange (version-history accordion).
    const nativeFragmentClick = (hash) => {
      const oldURL = location.href
      setUrl(hash)
      if (oldURL !== location.href) fire({ type: 'hashchange', oldURL, newURL: location.href })
    }

    // Next's router.push updates history with pushState: no hashchange/popstate.
    const pushes = []
    const router = { push(href) { pushes.push(href); window.history.pushState(null, '', href) } }
    const state = hooks()
    const file = '../components/booking/details/BookingDetailsTabs.tsx'
    const { code } = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
      filename: file, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
    })
    const mocks = {
      react: state.api,
      'next/navigation': {
        useRouter: () => router,
        usePathname: () => location.pathname,
        useSearchParams: () => new URLSearchParams(location.search),
      },
      'next-intl': { useTranslations: () => key => key },
      'lucide-react': stubModule(),
      '@/components/ui/tabs': stubModule(),
      '@/lib/utils': { cn: (...parts) => parts.filter(Boolean).join(' ') },
      '@/lib/bookingDetails': bookingDetails,
      './OverviewPanel': stubModule(),
      './BookingDataPanel': stubModule(),
      './QuotationPanel': stubModule(),
      './PaymentsPanel': stubModule(),
      './ActivityPanel': stubModule(),
      './DetailPrimitives': { useDetailT: () => (_key, fallback) => fallback },
    }
    const exports = {}
    new Function('require', 'exports', code)(name => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('@/') || name.startsWith('./')) throw new Error(`unmocked import ${name}`)
      return require(name)
    }, exports)
    const render = () => state.render(() => exports.BookingDetailsTabs({ booking: payload.booking, details: payload.details, viewerRole: 'customer' }))
    const tabs = () => findAll(render(), node => typeof node.props?.onValueChange === 'function')[0]
    const overviewLink = () => findAll(render(), node => typeof node.props?.onSelectTab === 'function')[0]
    // Exactly what OverviewPanel's quotation-number / "Open quotation
    // details" links pass: the current version's anchor hash.
    const overviewVersionHash = () => `#${bookingDetails.buildQuoteAnchors(location.pathname, location.search, CURRENT).version.split('#')[1]}`
    render()
    state.flush()
    assert.equal(acceptDisabled(), false)

    // 1. Version history (native anchors): current → old → current.
    nativeFragmentClick('#quotation-v2')
    assert.equal(acceptDisabled(), false); assert.equal(pinned, 2)
    nativeFragmentClick('#quotation-v1')
    assert.equal(acceptDisabled(), true); assert.equal(pinned, 1)
    nativeFragmentClick('#quotation-v2')
    assert.equal(acceptDisabled(), false); assert.equal(pinned, 2)

    // 2. Quotation tab picks an old version, then the Overview tab and its
    // current-version link bring the viewer back to the current version.
    bookingDetails.pushQuotationVersionUrl('/bookings/test?tab=quotation#quotation-v1')
    assert.equal(acceptDisabled(), true); assert.equal(pinned, 1)
    tabs().props.onValueChange('overview')
    assert.equal(location.hash, '')
    assert.equal(acceptDisabled(), false)
    assert.equal(pinned, null, 'the URL no longer pins a version, so neither does the page')
    bookingDetails.pushQuotationVersionUrl('/bookings/test?tab=quotation#quotation-v1')
    assert.equal(acceptDisabled(), true)
    overviewLink().props.onSelectTab('quotation', overviewVersionHash())
    assert.equal(location.hash, '#quotation-v2')
    assert.equal(location.search, '?tab=quotation')
    assert.equal(acceptDisabled(), false)
    assert.equal(pinned, 2, 'the Overview link to the current version re-enables Accept & Pay')

    // Back/Forward: the browser restores the URL and fires popstate only.
    const back = (url) => { setUrl(url); fire({ type: 'popstate' }) }
    back('/bookings/test?tab=quotation#quotation-v1')
    assert.equal(acceptDisabled(), true); assert.equal(pinned, 1)
    back('/bookings/test?tab=quotation#quotation-v2')
    assert.equal(acceptDisabled(), false); assert.equal(pinned, 2)

    // Same-URL tab selection pushes and announces nothing.
    const before = pushes.length
    let announced = 0
    window.addEventListener('hashchange', () => { announced += 1 })
    overviewLink().props.onSelectTab('quotation', '#quotation-v2')
    assert.equal(announced, 0)
    assert.equal(pushes.length, before)
    // Switching between tabs that carry no hash still uses the router only.
    tabs().props.onValueChange('payments')
    tabs().props.onValueChange('activity')
    assert.equal(location.search, '?tab=activity')
    assert.equal(announced, 1, 'only leaving #quotation-v2 announced a hash change')
    state.unmount()
    // Unmounting the page removes its listeners.
    pinState.unmount()
    assert.equal(listeners.get('popstate').length, 0)
    assert.equal(listeners.get('hashchange').length, 1, 'only the test counter is left')
  } finally { globalThis.window = previousWindow }
})

// ---------------------------------------------------------------------------
// CodeRabbit incremental review of 0769ef0 (round 2): request lifecycle
// regressions through the real components, with deferred responses.
// ---------------------------------------------------------------------------

function paymentsMocks(state, extra = {}) {
  const ui = stubModule()
  const t = key => key
  const auth = { user: { role: 'professional' }, isAuthenticated: true, loading: false }
  return {
    react: state.api,
    'next/link': { __esModule: true, default: () => null },
    'next/navigation': { useRouter: () => ({ push() {}, replace() {} }) },
    'next-intl': { useTranslations: () => t },
    '@/lib/apiErrors': apiErrors,
    '@/lib/i18n/useErrorMessage': { useErrorMessage: () => (_e, fallback) => fallback },
    '@/contexts/AuthContext': { useAuth: () => auth },
    '@/contexts/CurrencyContext': { useCurrency: () => ({ formatMoney: amount => String(amount) }) },
    '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
    '@/components/ui/card': ui, '@/components/ui/input': ui, '@/components/ui/badge': ui,
    'lucide-react': ui,
    ...extra,
  }
}

test('professional payments: a pending or failed query never shows the previous rows or page count; Refresh repeats the failed page', async () => {
  const previousFetch = globalThis.fetch
  try {
    const txRequests = []
    globalThis.fetch = (url, { signal } = {}) => {
      url = String(url)
      if (url.includes('/api/professional/transactions')) {
        const d = deferred()
        signal?.addEventListener('abort', () => d.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        txRequests.push({ url, signal, ...d })
        return d.promise
      }
      if (url.includes('/account-status')) return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { onboardingCompleted: true, chargesEnabled: true } }) })
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { totalEarnings: 0, pendingEarnings: 0, completedBookings: 0, pendingBookings: 0, currency: 'EUR' } }) })
    }
    const Select = function Select() { return null }
    const Button = function Button() { return null }
    const Skeleton = function Skeleton() { return null }
    const state = hooks()
    const Dashboard = loadComponent('../app/(pages)/dashboard/payments/page.tsx', paymentsMocks(state, {
      '@/components/ui/button': { Button },
      '@/components/ui/skeleton': { Skeleton },
      '@/components/ui/select': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'Select' ? Select : function Stub() { return null }) }),
    }))
    const ViewComponent = state.render(() => Dashboard()).type
    state.reset()
    const render = () => state.render(() => ViewComponent())
    const button = (tree, label) => findAll(tree, node => node.type === Button && textOf(node).includes(label))[0]
    const pager = tree => button(tree, 'common.next')
    const rows = (bookingNumber, page, totalPages) => ({ ok: true, json: async () => ({ success: true, data: [{ _id: bookingNumber, bookingNumber, status: 'completed', amount: 10, currency: 'EUR', date: null }], pagination: { page, totalPages } }) })
    const step = async () => { render(); state.flush(); await settle() }

    // Before the first answer nothing is known: no "no transactions yet".
    await step()
    let tree = render()
    assert.ok(!textOf(tree).includes('payments.professional.noTransactions'))
    assert.ok(findAll(tree, node => node.type === Skeleton).length > 0)
    txRequests[0].resolve(rows('BK-P1', 1, 3))
    await step()
    tree = render()
    assert.ok(textOf(tree).includes('BK-P1'))
    pager(tree).props.onClick()
    await step()
    assert.match(txRequests.at(-1).url, /page=2/)
    // Pending: the page-1 rows are hidden, not shown as page 2.
    tree = render()
    assert.ok(!textOf(tree).includes('BK-P1'))
    assert.equal(pager(tree), undefined)
    txRequests.at(-1).resolve(rows('BK-P2', 2, 3))
    await step()
    pager(render()).props.onClick()
    await step()
    const failedPage = txRequests.at(-1)
    assert.match(failedPage.url, /page=3/)
    failedPage.resolve({ ok: false, json: async () => ({ success: false }) })
    await step()
    tree = render()
    assert.ok(textOf(tree).includes('payments.loadFailed'))
    assert.ok(!textOf(tree).includes('BK-P2'), 'no stale rows under the error')
    assert.equal(pager(tree), undefined, 'no stale "page x of 3" pager under the error')
    // Refresh repeats exactly the failed request (page 3).
    button(tree, 'common.refresh').props.onClick()
    await step()
    assert.equal(txRequests.at(-1).url, failedPage.url)
    txRequests.at(-1).resolve(rows('BK-P3', 3, 3))
    await step()
    assert.ok(textOf(render()).includes('BK-P3'))

    // A status change while the old query is shown: the old rows and its
    // 3-page pager disappear until the filtered query answers.
    findAll(render(), node => node.type === Select && node.props.value === 'all')[0].props.onValueChange('refunded')
    await step()
    const filtered = txRequests.at(-1)
    assert.match(filtered.url, /page=1&limit=20&status=refunded/)
    tree = render()
    assert.ok(!textOf(tree).includes('BK-P3'))
    assert.equal(pager(tree), undefined)
    filtered.resolve({ ok: true, json: async () => ({ success: false }) })
    await step()
    tree = render()
    assert.ok(textOf(tree).includes('payments.loadFailed'))
    assert.equal(pager(tree), undefined)
    button(tree, 'common.refresh').props.onClick()
    await step()
    assert.equal(txRequests.at(-1).url, filtered.url, 'the selected filter is kept')
    txRequests.at(-1).resolve(rows('BK-R1', 1, 1))
    await step()
    tree = render()
    assert.ok(textOf(tree).includes('BK-R1'))
    assert.ok(!textOf(tree).includes('payments.loadFailed'))
    assert.equal(pager(tree), undefined, 'one page: no pager')
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('warranty claims: a slower Refresh response never overwrites a newer filtered list; a failed list shows no total', async () => {
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  try {
    globalThis.window = { requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout, clearTimeout }
    const listRequests = []
    globalThis.fetch = (url, { signal } = {}) => {
      url = String(url)
      if (url.includes('/api/warranty-claims/my')) {
        const d = deferred()
        listRequests.push({ url, signal, ...d })
        return d.promise
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, distinctServices: [] }) })
    }
    const ui = stubModule()
    const Select = function Select() { return null }
    const SelectItem = function SelectItem() { return null }
    const Button = function Button() { return null }
    const CardDescription = function CardDescription() { return null }
    const t = (key, values) => (values && 'count' in values ? `${key}:${values.count}` : key)
    const getErrorText = (_e, fallback) => fallback
    const auth = { user: { role: 'customer' }, isAuthenticated: true, loading: false }
    const searchParams = new URLSearchParams('')
    const state = hooks()
    const Page = loadComponent('../app/(pages)/dashboard/warranty-claims/page.tsx', {
      react: state.api,
      'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => searchParams },
      'next-intl': { useTranslations: () => t },
      '@/lib/apiErrors': apiErrors,
      '@/contexts/AuthContext': { useAuth: () => auth },
      '@/lib/utils': { getAuthToken: () => null },
      '@/components/ui/card': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'CardDescription' ? CardDescription : function Stub() { return null }) }),
      '@/components/ui/input': ui, '@/components/ui/button': { Button }, '@/components/ui/badge': ui, '@/components/ui/skeleton': ui,
      '@/components/ui/select': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'Select' ? Select : key === 'SelectItem' ? SelectItem : function Stub() { return null }) }),
      'lucide-react': ui,
      '@/lib/warrantyClaim': await import('../lib/warrantyClaim.ts'),
      '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
      // Stable, as the app's hook is: fetchClaims only changes with its inputs.
      '@/lib/i18n/useErrorMessage': { useErrorMessage: () => getErrorText },
    })
    const Content = state.render(() => Page()).props.children.type
    state.reset()
    const render = () => state.render(() => Content())
    const step = async () => { render(); state.flush(); await settle() }
    const claimsReply = (claimNumber, total) => ({ ok: true, json: async () => ({ success: true, data: { claims: [{ _id: claimNumber, claimNumber, status: 'open', evidence: [] }], pagination: { total, totalPages: 1 } } }) })
    const totalLabel = tree => findAll(tree, node => node.type === CardDescription).map(textOf)
    for (let i = 0; i < 3; i++) await step()
    listRequests.at(-1).resolve(claimsReply('WC-ALL', 4))
    await step()
    assert.deepEqual(totalLabel(render()), ['warranty.totalClaims:4'])

    // Refresh, then a filter change before Refresh answers.
    const refreshButton = findAll(render(), node => node.type === Button && textOf(node).includes('common.refresh'))[0]
    refreshButton.props.onClick()
    await step()
    const refresh = listRequests.at(-1)
    assert.doesNotMatch(refresh.url, /status=/)
    const statusSelect = findAll(render(), node => node.type === Select && node.props.value === 'all' && findAll(node, child => child.type === SelectItem && child.props.value === 'resolved').length > 0)[0]
    statusSelect.props.onValueChange('resolved')
    await step()
    const filtered = listRequests.at(-1)
    assert.match(filtered.url, /status=resolved/)
    assert.equal(refresh.signal.aborted, true, 'the filter change supersedes the Refresh request')
    filtered.resolve(claimsReply('WC-RESOLVED', 1))
    await step()
    // The superseded Refresh answers last (a fetch that ignores abort).
    refresh.resolve(claimsReply('WC-STALE', 9))
    await step()
    let tree = render()
    assert.ok(textOf(tree).includes('WC-RESOLVED'))
    assert.ok(!textOf(tree).includes('WC-STALE'))
    assert.deepEqual(totalLabel(tree), ['warranty.totalClaims:1'])

    // Two Refresh clicks: only the newer one may write.
    findAll(render(), node => node.type === Button && textOf(node).includes('common.refresh'))[0].props.onClick()
    const first = listRequests.at(-1)
    findAll(render(), node => node.type === Button && textOf(node).includes('common.refresh'))[0].props.onClick()
    const second = listRequests.at(-1)
    assert.notEqual(first, second)
    assert.equal(first.signal.aborted, true)
    // While a list is pending its old total is not presented as current.
    assert.deepEqual(totalLabel(render()), [])
    second.resolve({ ok: false, status: 500, json: async () => ({ success: false }) })
    await step()
    first.resolve(claimsReply('WC-STALE', 9))
    await step()
    tree = render()
    assert.ok(findAll(tree, node => node.props?.role === 'alert' && textOf(node) === 'warranty.loadClaimsFailed').length === 1)
    assert.ok(!textOf(tree).includes('WC-STALE'))
    assert.deepEqual(totalLabel(tree), [], 'a failed list has no known total (never "0 claims")')
    state.unmount()
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow }
})

async function mountProfile() {
  const suggestRequests = []
  const checkRequests = []
  globalThis.fetch = (url, opts = {}) => {
    url = String(url)
    const queue = url.includes('/generate-username') ? suggestRequests : url.includes('/check-username/') ? checkRequests : null
    if (queue) {
      const d = deferred()
      queue.push({ url, signal: opts.signal, ...d })
      return d.promise
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: {} }) })
  }
  const state = hooks()
  const ui = stubModule()
  const Button = function Button() { return null }
  const Input = function Input() { return null }
  const toasts = []
  const auth = { user: { _id: 'u1', role: 'professional', username: 'saved-name', name: 'Pro', email: 'p@example.com', businessInfo: { companyName: 'Acme', city: 'Gent' } }, isAuthenticated: true, loading: false, checkAuth: async () => {} }
  const router = { push() {}, replace() {} }
  const searchParams = new URLSearchParams('')
  const t = Object.assign(key => key, { rich: key => key, raw: key => key, has: () => true })
  const Page = loadComponent('../app/(pages)/profile/page.tsx', {
    react: state.api,
    'next-intl': { useTranslations: () => t },
    '@/contexts/AuthContext': { useAuth: () => auth },
    '@/components/ui/card': ui, '@/components/ui/button': { Button }, '@/components/ui/input': { Input }, '@/components/ui/label': ui,
    '@/components/ui/checkbox': ui, '@/components/ui/dialog': ui, 'lucide-react': ui,
    '@/components/TeamManagement': ui, '@/components/PasswordChange': ui, '@/components/PrivacyAndData': ui,
    '@/components/EmployeeAvailability': ui, '@/components/notifications/NotificationPreferences': ui, '@/components/AdminAvailability': ui,
    '@/components/calendar/WeeklyAvailabilityCalendar': ui,
    '@/lib/adminRbac': await import('../lib/adminRbac.ts'),
    'next/navigation': { useRouter: () => router, useSearchParams: () => searchParams },
    sonner: { toast: { success: m => toasts.push(['success', m]), error: m => toasts.push(['error', m]) } },
    '@/components/ui/skeleton': ui, '@/components/ui/tabs': ui, '@/components/ui/textarea': ui, '@/components/ui/select': ui,
    '@/lib/utils': { ...(await import('../lib/utils.ts')), getAuthToken: () => null },
    '@/lib/countries': await import('../lib/countries.ts'),
    '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
    '@/lib/i18n/useErrorMessage': { useErrorMessage: () => (_e, fallback) => fallback },
    '@/lib/defaults/companyAvailability': await import('../lib/defaults/companyAvailability.ts'),
    '@/lib/vatValidation': await import('../lib/vatValidation.ts'),
    '@/lib/dateUtils': await import('../lib/dateUtils.ts'),
    '@/lib/support': { listSupportAvailability: async () => [] },
    '@/lib/support/calendar': await import('../lib/support/calendar.ts'),
    '@/lib/support/dates': await import('../lib/support/dates.ts'),
    '@/lib/scheduleUtils': await import('../lib/scheduleUtils.ts'),
  })
  const Content = state.render(() => Page()).props.children.type
  state.reset()
  const render = () => state.render(() => Content())
  for (let i = 0; i < 4; i++) { render(); state.flush(); await settle() }
  const button = label => findAll(render(), node => node.type === Button && (node.props['aria-label'] === label || textOf(node) === label))[0]
  // The username block: the closed card's text, or the open editor's field.
  const usernameBlock = () => findAll(render(), node => node.type === 'div' && node.props?.className === 'space-y-2' && findAll(node, child => child.props?.children === 'business.usernameLabel').length > 0)[0]
  const usernameField = () => findAll(usernameBlock(), node => node.type === Input)[0]
  const closedName = () => {
    const block = usernameBlock()
    return findAll(block, node => node.type === 'span' && typeof node.props?.className === 'string' && node.props.className.includes('flex-1'))[0]?.props.children
  }
  const suggestionChips = () => findAll(usernameBlock(), node => node.type === 'button').map(textOf)
  const statusBox = () => findAll(usernameBlock(), node => node.type === 'div' && typeof node.props?.className === 'string' && node.props.className.includes('rounded-lg') && node.props.className.includes('text-xs')).map(textOf)
  return { state, render, button, usernameField, closedName, suggestionChips, statusBox, suggestRequests, checkRequests, toasts }
}

test('profile username: a Suggest response after Cancel never changes the shown name, chips or availability', async () => {
  const previousFetch = globalThis.fetch
  try {
    const p = await mountProfile()
    assert.equal(p.closedName(), 'saved-name')
    p.button('business.editUsername').props.onClick()
    p.render()
    p.button('business.suggest').props.onClick()
    const suggest = p.suggestRequests.at(-1)
    assert.match(suggest.url, /generate-username/)
    assert.ok(suggest.signal, 'the Suggest request is cancellable')
    // Cancel closes the editor while Suggest is in flight.
    p.button('common.cancel').props.onClick()
    assert.equal(suggest.signal.aborted, true)
    suggest.resolve({ ok: true, json: async () => ({ success: true, suggestions: ['acme-gent', 'acme-gent-2'] }) })
    await settle()
    assert.equal(p.closedName(), 'saved-name', 'the closed card shows the saved name, not an unsaved suggestion')
    // Reopening starts clean: no chips, no unchecked "available" status.
    p.button('business.editUsername').props.onClick()
    p.render()
    assert.equal(p.usernameField().props.value, 'saved-name')
    assert.deepEqual(p.suggestionChips(), [])
    assert.deepEqual(p.statusBox(), [''])
    const saveButton = p.button('business.saveUsername')
    assert.equal(saveButton.props.disabled, true, 'no availability without a new check')
    assert.deepEqual(p.toasts, [])
    p.state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('profile username: typing supersedes a pending Suggest; a newer Suggest wins; a failed Suggest keeps the typed name and its check', async () => {
  const previousFetch = globalThis.fetch
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  // Manual timers: the 500 ms availability debounce runs when the test says.
  const timers = new Map()
  let nextTimer = 1
  globalThis.setTimeout = (fn) => { const id = nextTimer++; timers.set(id, fn); return id }
  globalThis.clearTimeout = (id) => { timers.delete(id) }
  const runTimers = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()) }
  try {
    const p = await mountProfile()
    runTimers()
    p.button('business.editUsername').props.onClick()
    p.render()
    // 1. Suggest, then the user types their own name before it answers.
    p.button('business.suggest').props.onClick()
    const suggest = p.suggestRequests.at(-1)
    p.usernameField().props.onChange({ target: { value: 'My-Own' } })
    assert.equal(suggest.signal.aborted, true)
    runTimers()
    assert.match(p.checkRequests.at(-1).url, /check-username\/my-own$/)
    suggest.resolve({ ok: true, json: async () => ({ success: true, suggestions: ['acme-gent'] }) })
    await settle()
    p.render()
    assert.equal(p.usernameField().props.value, 'my-own', 'the typed (normalized) name is kept')
    assert.deepEqual(p.suggestionChips(), [])

    // 2. Two Suggest clicks: the older, slower answer is ignored.
    p.button('business.suggest').props.onClick()
    const older = p.suggestRequests.at(-1)
    p.button('business.suggest').props.onClick()
    const newer = p.suggestRequests.at(-1)
    assert.notEqual(older, newer)
    assert.equal(older.signal.aborted, true)
    newer.resolve({ ok: true, json: async () => ({ success: true, suggestions: ['acme-new'] }) })
    await settle()
    older.resolve({ ok: true, json: async () => ({ success: true, suggestions: ['acme-old'] }) })
    await settle()
    p.render()
    assert.equal(p.usernameField().props.value, 'acme-new')
    assert.deepEqual(p.suggestionChips(), ['acme-new'])
    assert.equal(p.button('business.saveUsername').props.disabled, false)

    // 3. A failed Suggest (here success:false) is reported and changes
    // nothing: the typed name keeps its own pending availability check.
    p.usernameField().props.onChange({ target: { value: 'typed-name' } })
    p.render()
    assert.deepEqual(p.statusBox(), ['business.checking'])
    p.button('business.suggest').props.onClick()
    p.suggestRequests.at(-1).resolve({ ok: false, json: async () => ({ success: false, msg: 'Only professionals can generate username suggestions' }) })
    await settle()
    assert.deepEqual(p.toasts, [['error', 'toasts.suggestionsFailed']])
    runTimers()
    const check = p.checkRequests.at(-1)
    assert.match(check.url, /check-username\/typed-name$/, 'the debounced check still runs')
    check.resolve({ ok: true, json: async () => ({ available: true }) })
    await settle()
    p.render()
    assert.equal(p.usernameField().props.value, 'typed-name')
    assert.deepEqual(p.statusBox(), ['business.usernameAvailable'])
    assert.equal(p.button('business.saveUsername').props.disabled, false)
    p.state.unmount()
  } finally { globalThis.fetch = previousFetch; globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout }
})

test('admin support panel: an invalid recorded currency never throws; valid buckets keep currency formatting', async () => {
  const cases = [
    [{ grossEur: 1200, grossByCurrency: [{ currency: 'EUR', gross: 1200 }] }, '€1,200'],
    [{ grossEur: null, grossByCurrency: [{ currency: 'EUR', gross: 120 }, { currency: 'USD', gross: 30 }] }, '€120 + US$30'],
    [{ grossEur: null, grossByCurrency: [{ currency: 'EUR', gross: 120 }, { currency: null, gross: 30 }, { currency: '€', gross: 5 }, { currency: 'EURO', gross: 7 }] }, '€120 + 30 + 5 € + 7 EURO'],
    [{ grossEur: null, grossByCurrency: [{ currency: 'eur', gross: 10 }, { currency: 'GBP', gross: Number.NaN }] }, '€10 + —'],
    [{ grossEur: null, grossByCurrency: [], financialAccess: false }, 'Restricted'],
  ]
  for (const [kpiPatch, expected] of cases) {
    const state = hooks()
    const authFetch = async () => ({ ok: true, json: async () => ({ success: true, data: { user: { _id: 'u1', name: 'Pro', role: 'professional', email: null, phone: null, username: null }, kpis: { level: null, reviewCount: 0, avgRating: null, projectCount: 0, bookingCount: 1, completedCount: 1, quotedCount: 0, disputeCount: 0, refundPercent: 0, ...kpiPatch } } }) })
    const Panel = loadComponent('../components/admin/AdminSupportInfoPanel.tsx', {
      react: state.api,
      '@/lib/apiErrors': apiErrors,
      'lucide-react': stubModule(),
      '@/components/ui/badge': stubModule(),
      '@/components/ui/card': stubModule(),
      '@/lib/utils': { authFetch },
      '@/lib/professionalLevel': { getLevelColor: () => '' },
      '@/lib/anonymizedUsers': { isAnonymizedIdentity: () => false },
    })
    state.render(() => Panel({ conversationId: 'c1' }))
    state.flush()
    await settle()
    const tree = state.render(() => Panel({ conversationId: 'c1' }))
    const gross = findAll(tree, node => node.props?.label === 'Gross')[0]
    assert.ok(gross, `panel rendered for ${JSON.stringify(kpiPatch)}`)
    assert.equal(gross.props.value, expected)
    state.unmount()
  }
})

function mountCustomerDashboard(state, listRequests) {
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
  const TabsTrigger = function TabsTrigger() { return null }
  const t = key => key
  const getErrorText = (err, fallback) => (err && typeof err.msg === 'string' ? err.msg : fallback)
  return {
    Select, SelectItem, Button, TabsTrigger,
    load: async () => loadComponent('../components/dashboard/CustomerDashboard.tsx', {
      react: state.api,
      'next/navigation': { useRouter: () => ({ push() {}, replace() {} }) },
      'next-intl': { useTranslations: () => t },
      '@/lib/i18n/useErrorMessage': { useErrorMessage: () => getErrorText },
      '@/components/ui/card': ui, '@/components/ui/button': { Button }, '@/components/ui/badge': ui,
      '@/components/ui/input': ui, '@/components/ui/skeleton': ui, '@/components/ui/checkbox': ui,
      '@/components/ui/tabs': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'TabsTrigger' ? TabsTrigger : function Stub() { return null }) }),
      '@/components/ui/select': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'Select' ? Select : key === 'SelectItem' ? SelectItem : function Stub() { return null }) }),
      'lucide-react': ui,
      '@/contexts/AuthContext': { useAuth: () => ({ user: { role: 'customer' } }) },
      '@/contexts/CurrencyContext': { useCurrency: () => ({ formatMoney: amount => String(amount) }) },
      '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB' }) },
      '@/lib/utils': { getAuthToken: () => null },
      '@/lib/dashboardBookingHelpers': dashboardBookingHelpers,
      '@/lib/dashboardOverview': dashboardOverview,
      '@/lib/actionNeededHelpers': await import('../lib/actionNeededHelpers.ts'),
      '@/components/dashboard/QuoteComparisonModal': ui,
      '@/components/dashboard/SharedBookingsTable': ui,
      '@/components/dashboard/SharedQuotesTable': ui,
    }),
  }
}

test('customer dashboard: unknown or failed totals and facet counts show "—" or no count, never 0 or the previous query', async () => {
  const previousFetch = globalThis.fetch
  try {
    const state = hooks()
    const listRequests = []
    const m = mountCustomerDashboard(state, listRequests)
    const Component = await m.load()
    const render = () => state.render(() => Component())
    const cards = tree => findAll(tree, node => node.type === 'p' && typeof node.props?.className === 'string' && node.props.className.includes('text-3xl')).map(textOf)
    const tabLabels = tree => findAll(tree, node => node.type === m.TabsTrigger).map(textOf).slice(0, 2)
    const bookingStatus = tree => findAll(tree, node => node.type === m.Select && findAll(node, child => child.type === m.SelectItem && child.props.value === 'completed').length > 0)[0]
    const optionText = (tree, value) => textOf(findAll(bookingStatus(tree), node => node.type === m.SelectItem && node.props.value === value)[0])
    const serviceOptions = tree => findAll(tree, node => node.type === m.SelectItem && node.props.value === 'Plumbing')

    render()
    state.flush()
    // First load pending: unknown, not zero.
    let tree = render()
    assert.deepEqual(cards(tree), ['—', '—', '—'])
    assert.equal(optionText(tree, 'completed'), 'status.completed')
    const bookings = () => listRequests.filter(r => r.url.includes('quote_accepted') || !r.url.includes('rfq')).at(-1)
    const quotes = listRequests.find(r => r.url.includes('status=rfq'))
    quotes.resolve({ ok: true, json: async () => ({ success: true, bookings: [], statusCounts: {}, pagination: { page: 1, totalPages: 1, total: 2 } }) })
    const loaded = { success: true, bookings: [{ _id: 'b1', status: 'completed' }], statusCounts: { completed: 3, cancelled: 1, booked: 6 }, serviceCounts: { Plumbing: 10 }, distinctServices: ['Plumbing'], pagination: { page: 1, totalPages: 2, total: 10 } }
    bookings().resolve({ ok: true, json: async () => loaded })
    await settle()
    tree = render()
    assert.deepEqual(cards(tree), ['12', '6', '3'])
    assert.deepEqual(tabLabels(tree), ['customerDashboard.tabs.myBookings (10)', 'customerDashboard.tabs.myQuotes (2)'])
    assert.equal(optionText(tree, 'completed'), 'status.completed (3)')

    // Another page of the same query keeps its totals while it loads.
    findAll(tree, node => node.type === m.Button && node.props.children === 'common.next')[0].props.onClick()
    tree = render()
    assert.match(bookings().url, /page=2/)
    assert.deepEqual(cards(tree), ['12', '6', '3'])
    bookings().resolve({ ok: true, json: async () => ({ ...loaded, pagination: { page: 2, totalPages: 2, total: 10 } }) })
    await settle()

    // A new filter: the previous query's numbers are not presented as its own.
    bookingStatus(render()).props.onValueChange('booked')
    render()
    state.flush()
    tree = render()
    assert.match(bookings().url, /page=1&limit=20&status=booked/)
    assert.deepEqual(cards(tree), ['—', '—', '—'])
    assert.equal(optionText(tree, 'completed'), 'status.completed')
    // The failure keeps that state, the selected filter and the service options.
    bookings().resolve({ ok: false, json: async () => ({ success: false, msg: 'Bookings unavailable' }) })
    await settle()
    tree = render()
    assert.deepEqual(cards(tree), ['—', '—', '—'])
    assert.deepEqual(tabLabels(tree), ['customerDashboard.tabs.myBookings ', 'customerDashboard.tabs.myQuotes (2)'])
    assert.equal(optionText(tree, 'completed'), 'status.completed')
    assert.equal(bookingStatus(tree).props.value, 'booked')
    assert.equal(serviceOptions(tree).length, 1, 'service filter options stay usable')
    assert.equal(findAll(tree, node => node.type === m.Button && node.props.children === 'common.next').length, 0, 'no stale pager')
    // Retry repeats the failed query; its answer restores real numbers.
    const alert = findAll(tree, node => node.props?.role === 'alert' && textOf(node).includes('Bookings unavailable'))[0]
    findAll(alert, node => node.type === m.Button && node.props.children === 'common.retry')[0].props.onClick()
    assert.match(bookings().url, /page=1&limit=20&status=booked/)
    bookings().resolve({ ok: true, json: async () => ({ ...loaded, statusCounts: { completed: 3, cancelled: 1, booked: 6 }, pagination: { page: 1, totalPages: 1, total: 6 } }) })
    await settle()
    tree = render()
    // The status facet ignores the status filter (the server counts every
    // status under the other filters), so the six booked rows are 6 active
    // and 0 completed in the filtered scope — not 6 − (3 + 1) = 2 active.
    assert.deepEqual(cards(tree), ['8', '6', '0'])
    assert.equal(optionText(tree, 'booked'), 'status.booked (6)')
    assert.equal(optionText(tree, 'completed'), 'status.completed (3)', 'filter options keep the facet counts')
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('customer dashboard: summary Active/Completed follow the filtered status scope, including the awaiting-payment alias', async () => {
  const previousFetch = globalThis.fetch
  try {
    const state = hooks()
    const listRequests = []
    const m = mountCustomerDashboard(state, listRequests)
    const Component = await m.load()
    const render = () => state.render(() => Component())
    const cards = tree => findAll(tree, node => node.type === 'p' && typeof node.props?.className === 'string' && node.props.className.includes('text-3xl')).map(textOf)
    const bookingStatus = tree => findAll(tree, node => node.type === m.Select && findAll(node, child => child.type === m.SelectItem && child.props.value === 'completed').length > 0)[0]
    const bookings = () => listRequests.filter(r => !r.url.includes('rfq')).at(-1)
    render()
    state.flush()
    listRequests.find(r => r.url.includes('status=rfq')).resolve({ ok: true, json: async () => ({ success: true, bookings: [], statusCounts: {}, serviceCounts: {}, pagination: { page: 1, totalPages: 1, total: 0 } }) })
    // Facets across every status (quote-phase ones included) under the other filters.
    const statusCounts = { rfq: 4, quote_accepted: 1, payment_pending: 2, booked: 6, in_progress: 2, completed: 3, cancelled: 1, refunded: 1 }
    bookings().resolve({ ok: true, json: async () => ({ success: true, bookings: [], statusCounts, serviceCounts: {}, pagination: { page: 1, totalPages: 1, total: 16 } }) })
    await settle()
    // "all" is the booking mode set: active = 1 + 2 + 6 + 2, never the rfq facet.
    assert.deepEqual(cards(render()), ['16', '11', '3'])
    const select = async (status, total) => {
      bookingStatus(render()).props.onValueChange(status)
      render()
      state.flush()
      bookings().resolve({ ok: true, json: async () => ({ success: true, bookings: [], statusCounts, serviceCounts: {}, pagination: { page: 1, totalPages: 1, total } }) })
      await settle()
      return cards(render())
    }
    assert.deepEqual(await select('payment_pending', 3), ['3', '3', '0'])
    assert.match(bookings().url, /status=quote_accepted%2Cpayment_pending/)
    assert.deepEqual(await select('completed', 3), ['3', '0', '3'])
    assert.deepEqual(await select('refunded', 1), ['1', '0', '0'])
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('customer dashboard: a successful response without totals or facets keeps them unknown; an explicit 0 stays 0', async () => {
  const previousFetch = globalThis.fetch
  try {
    const state = hooks()
    const listRequests = []
    const m = mountCustomerDashboard(state, listRequests)
    const Component = await m.load()
    const render = () => state.render(() => Component())
    const cards = tree => findAll(tree, node => node.type === 'p' && typeof node.props?.className === 'string' && node.props.className.includes('text-3xl')).map(textOf)
    const tabLabels = tree => findAll(tree, node => node.type === m.TabsTrigger).map(textOf).slice(0, 2)
    const bookingStatus = tree => findAll(tree, node => node.type === m.Select && findAll(node, child => child.type === m.SelectItem && child.props.value === 'completed').length > 0)[0]
    const optionText = (tree, value) => textOf(findAll(bookingStatus(tree), node => node.type === m.SelectItem && node.props.value === value)[0])
    const quotes = () => listRequests.filter(r => r.url.includes('status=rfq')).at(-1)
    const bookings = () => listRequests.filter(r => !r.url.includes('rfq')).at(-1)
    render()
    state.flush()
    // Partial (older/partial API) success: rows, but no total and no facets.
    quotes().resolve({ ok: true, json: async () => ({ success: true, bookings: [], pagination: { page: 1, totalPages: 1 } }) })
    bookings().resolve({ ok: true, json: async () => ({ success: true, bookings: [{ _id: 'b1', status: 'booked' }], pagination: { page: 1, totalPages: 1 } }) })
    await settle()
    let tree = render()
    assert.deepEqual(cards(tree), ['—', '—', '—'], 'not 0 completed, not "active = total"')
    assert.deepEqual(tabLabels(tree), ['customerDashboard.tabs.myBookings ', 'customerDashboard.tabs.myQuotes '])
    assert.equal(optionText(tree, 'completed'), 'status.completed', 'no "(0)" for an unknown facet')
    assert.equal(findAll(tree, node => node.props?.role === 'alert').length, 0, 'a partial success is not presented as an error')

    // Malformed facets / totals are unknown too.
    bookingStatus(render()).props.onValueChange('booked')
    render()
    state.flush()
    bookings().resolve({ ok: true, json: async () => ({ success: true, bookings: [], statusCounts: { booked: '6' }, pagination: { page: 1, totalPages: 1, total: Number.NaN } }) })
    await settle()
    tree = render()
    assert.deepEqual(cards(tree), ['—', '—', '—'])
    assert.equal(optionText(tree, 'booked'), 'status.booked')

    // Explicit zeros are real zeros: an empty facet object and total 0.
    bookingStatus(render()).props.onValueChange('all')
    render()
    state.flush()
    bookings().resolve({ ok: true, json: async () => ({ success: true, bookings: [], statusCounts: {}, serviceCounts: {}, pagination: { page: 1, totalPages: 0, total: 0 } }) })
    await settle()
    tree = render()
    assert.deepEqual(cards(tree), ['—', '0', '0'], 'total still waits for the unknown quote total')
    assert.equal(optionText(tree, 'completed'), 'status.completed (0)')
    state.unmount()
  } finally { globalThis.fetch = previousFetch }
})

test('quotation version URL: the same target (also written relatively) pushes no history entry; a new one pushes once and announces it', async () => {
  const { pushQuotationVersionUrl } = await import('../lib/bookingDetails.ts')
  const location = { href: 'http://localhost/bookings/test?tab=quotation#quotation-v1' }
  const pushes = []
  const dispatched = []
  const win = {
    location,
    history: { pushState(_s, _t, url) { pushes.push(url); location.href = new URL(url, location.href).href } },
    dispatchEvent(event) { dispatched.push(event.type) },
  }
  pushQuotationVersionUrl('/bookings/test?tab=quotation#quotation-v1', win)
  pushQuotationVersionUrl('http://localhost/bookings/test?tab=quotation#quotation-v1', win)
  pushQuotationVersionUrl('?tab=quotation#quotation-v1', win)
  assert.deepEqual(pushes, [])
  assert.deepEqual(dispatched, [])
  pushQuotationVersionUrl('/bookings/test?tab=quotation#quotation-v2', win)
  assert.deepEqual(pushes, ['/bookings/test?tab=quotation#quotation-v2'])
  assert.deepEqual(dispatched, ['hashchange'])
  pushQuotationVersionUrl('#quotation-v2', win)
  assert.equal(pushes.length, 1)
})

test('professional timeline: an older response never overwrites a newer filter; a failure shows an error with retry, not an empty board', async () => {
  const previousFetch = globalThis.fetch
  const previousConsoleError = console.error
  const logged = []
  console.error = (...args) => { logged.push(args) }
  try {
    const state = hooks()
    const timelineRequests = []
    globalThis.fetch = url => {
      url = String(url)
      if (url.includes('/api/bookings/my-bookings') && url.includes('limit=50')) {
        const d = deferred()
        timelineRequests.push({ url, ...d })
        return d.promise
      }
      if (url.includes('/api/bookings/my-bookings')) return Promise.resolve({ ok: true, json: async () => ({ success: true, bookings: [], statusCounts: {}, serviceCounts: {}, pagination: { page: 1, totalPages: 1, total: 0 } }) })
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) })
    }
    const ui = stubModule()
    const Select = function Select() { return null }
    const Button = function Button() { return null }
    const Board = function Board() { return null }
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
      '@/components/ui/card': ui, '@/components/ui/button': { Button }, '@/components/ui/input': ui,
      '@/components/ui/select': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key === 'Select' ? Select : function Stub() { return null }) }),
      '@/components/ui/dialog': ui, '@/components/ui/checkbox': ui, 'lucide-react': ui,
      '@/components/dashboard/QuoteComparisonModal': ui,
      '@/components/dashboard/BookingTimelineBoard': { __esModule: true, default: Board },
      '@/components/dashboard/RefundRequestsPanel': ui,
      '@/components/dashboard/SharedBookingsTable': ui,
      '@/components/dashboard/SharedQuotesTable': ui,
      '@/contexts/CurrencyContext': { useCurrency: () => ({ formatMoney: amount => String(amount) }) },
      '@/lib/dashboardOverview': dashboardOverview,
      '@/lib/dashboardBookingHelpers': dashboardBookingHelpers,
    })
    const render = () => state.render(() => Component({ mode: 'bookings' }))
    const step = async () => { render(); state.flush(); await settle() }
    const board = () => findAll(render(), node => node.type === Board)[0]
    const page = ids => ({ ok: true, json: async () => ({ success: true, bookings: ids.map(id => ({ _id: id, status: 'booked' })), pagination: { page: 1, totalPages: 1 } }) })
    await step(); await step()
    assert.equal(timelineRequests.length, 1)
    // While the first timeline loads, no empty board claims "no bookings".
    assert.equal(board(), undefined)
    const unfiltered = timelineRequests[0]
    findAll(render(), node => node.type === Select && node.props.value === 'all')[0].props.onValueChange('in_progress')
    await step(); await step()
    const filtered = timelineRequests.at(-1)
    assert.match(filtered.url, /status=in_progress/)
    filtered.resolve(page(['new']))
    await settle()
    unfiltered.resolve(page(['old-1', 'old-2']))
    await settle()
    assert.deepEqual(board().props.bookings.map(b => b._id), ['new'])

    // Refresh of the same query keeps the board mounted while it loads ...
    board().props.onBookingUpdated()
    await settle()
    assert.ok(board(), 'same-query refresh keeps the board')
    // ... and its failure replaces the board with an error and a retry.
    timelineRequests.at(-1).resolve({ ok: true, json: async () => ({ success: false }) })
    await settle()
    let tree = render()
    assert.equal(board(), undefined)
    const alert = findAll(tree, node => node.props?.role === 'alert' && textOf(node).includes('professionalManager.errors.loadBookings'))[0]
    assert.ok(alert)
    findAll(alert, node => node.type === Button && node.props.children === 'common.retry')[0].props.onClick()
    assert.match(timelineRequests.at(-1).url, /status=in_progress/, 'retry keeps the selected filter')
    timelineRequests.at(-1).resolve(page(['new', 'new-2']))
    await settle()
    assert.deepEqual(board().props.bookings.map(b => b._id), ['new', 'new-2'])
    assert.equal(logged.length, 1, 'only the one real failure is logged')
    state.unmount()
  } finally { globalThis.fetch = previousFetch; console.error = previousConsoleError }
})
