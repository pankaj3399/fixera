import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
import { componentHarness, elementText } from './helpers/componentHarness.mjs'
register('./swc-loader.mjs', import.meta.url)
const emailLogs = await import('@/lib/admin/emailLogs')
const settings = await import('@/lib/admin/autoConversionSettings')
const file = (path) => new URL(`../${path}`, import.meta.url)
const button = (h, label) => h.findAll((n) => typeof n.props.onClick === 'function' && elementText(n).includes(label))[0]
const input = (h, id) => h.findAll((n) => n.props.id === id)[0]
const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
const toast = { success() {}, error() {} }

// A tiny hook harness executes effects and component event handlers; no browser/DOM dependency.
test('/admin redirect effect actually replaces the route with /dashboard', async () => {
  const calls = []
  const router = { replace: (path) => calls.push(path) }
  const h = componentHarness(file('app/(pages)/admin/page.tsx'), { 'next/navigation': { useRouter: () => router } })
  h.render()
  await h.settle()
  assert.deepEqual(calls, ['/dashboard'])
  assert.ok(elementText(h.render()).includes('Opening the admin dashboard'))
  h.unmount()
})

function emailPage(fetcher) {
  return componentHarness(file('app/(pages)/admin/email-logs/page.tsx'), {
    '@/lib/admin/emailLogs': emailLogs,
    '@/lib/utils': { authFetch: fetcher },
    '@/lib/apiErrors': { messageFromApiBody: (_body, fallback) => fallback },
  })
}
const log = { _id: 'a1', to: 'qa@example.test', createdAt: '2026-11-03T10:00:00Z', relatedBooking: 'b1' }
const emailResponse = (page = 1, totalPages = 3, logs = [log]) => ({
  ok: true, json: async () => ({ success: true, data: { logs, pagination: { page, totalPages, total: 51 } } }),
})

test('email filter effect debounces typing and requests page 1 after editing on page 2', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const urls = []
  const h = emailPage(async (url) => {
    urls.push(url)
    return emailResponse(Number(new URL(url).searchParams.get('page')))
  })
  const previous = process.env.NEXT_PUBLIC_BACKEND_URL
  process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.test'
  try {
    await h.settle()
    button(h, 'Next').props.onClick()
    await h.settle()
    assert.equal(new URL(urls.at(-1)).searchParams.get('page'), '2')
    input(h, 'email-log-to').props.onChange({ target: { value: 'jane@' } })
    await h.settle()
    const before = urls.length
    t.mock.timers.tick(399)
    await h.settle()
    assert.equal(urls.length, before)
    t.mock.timers.tick(1)
    await h.settle()
    assert.equal(new URL(urls.at(-1)).searchParams.get('page'), '1')
    assert.equal(new URL(urls.at(-1)).searchParams.get('to'), 'jane@')
  } finally { h.unmount(); process.env.NEXT_PUBLIC_BACKEND_URL = previous }
})

test('email logs refetch the last available page when refresh shrinks the result set', async () => {
  const pages = []
  let shrunk = false
  const h = emailPage(async (url) => {
    const page = Number(new URL(url, 'https://backend.test').searchParams.get('page'))
    pages.push(page)
    return emailResponse(page, shrunk ? 1 : 3, shrunk && page > 1 ? [] : [log])
  })
  await h.settle()
  button(h, 'Next').props.onClick()
  await h.settle()
  shrunk = true
  button(h, 'Refresh').props.onClick()
  await h.settle()
  assert.deepEqual(pages, [1, 2, 2, 1])
  assert.equal(h.findAll((n) => n.type === 'tr' && n.props.tabIndex === 0).length, 1)
  h.unmount()
})

test('row keyboard handling ignores booking-link keys and opens details for the focused row', async () => {
  const h = emailPage(async () => emailResponse())
  await h.settle()
  const row = h.findAll((n) => n.type === 'tr' && n.props.tabIndex === 0)[0]
  let prevented = false
  const currentTarget = {}
  row.props.onKeyDown({ key: 'Enter', currentTarget, target: {}, preventDefault() { prevented = true } })
  await h.settle()
  assert.equal(prevented, false)
  assert.equal(h.findAll((n) => n.type === 'Dialog')[0].props.open, false)
  row.props.onKeyDown({ key: 'Enter', currentTarget, target: currentTarget, preventDefault() { prevented = true } })
  await h.settle()
  assert.equal(prevented, true)
  assert.equal(h.findAll((n) => n.type === 'Dialog')[0].props.open, true)
  h.unmount()
})

test('all four background-check buttons POST to their corresponding endpoints and retain parent-owned running flags', async () => {
  const realFetch = globalThis.fetch
  const requests = []
  const completed = []
  const h = componentHarness(file('components/admin/BackgroundChecksPanel.tsx'), {
    'next-intl': { useTranslations: () => (key) => key },
    sonner: { toast },
    '@/lib/apiErrors': { apiErrorFromBody: () => new Error('failed') },
    '@/lib/utils': { getAuthToken: () => null },
    '@/lib/i18n/useErrorMessage': { useErrorMessage: () => () => 'failed' },
    '@/hooks/useAdminAccess': { useAdminAccess: () => ({ can: () => true }) },
  })
  const flags = {}
  const state = { ...Object.fromEntries(['WarrantyCheck', 'RfqCheck', 'NotifReminders', 'AutoAccept'].flatMap((key) => [
    [`isRunning${key}`, false], [`setIsRunning${key}`, (value) => { flags[key] = value; state[`isRunning${key}`] = value }],
  ])) }
  globalThis.fetch = async (url, init) => {
    const d = deferred(); requests.push({ url, init, ...d }); return d.promise
  }
  try {
    h.render({ runningState: state, onCompleted: () => completed.push(true) })
    const jobs = [
      ['warranty', 'WarrantyCheck', 'run-warranty-checks'], ['rfq', 'RfqCheck', 'run-rfq-checks'],
      ['notifications', 'NotifReminders', 'run-notification-reminders'], ['autoAccept', 'AutoAccept', 'run-completion-auto-accept'],
    ]
    const pending = jobs.map(([label]) => button(h, `maintenance.${label}Button`).props.onClick())
    assert.deepEqual(requests.map((r) => r.url.split('/').at(-1)), jobs.map((j) => j[2]))
    assert.ok(requests.every((r) => r.init.method === 'POST'))
    h.unmount() // Overview tab unmounts while its parent still owns state.
    h.render({ runningState: state })
    for (const [label, key] of jobs) {
      assert.equal(flags[key], true)
      assert.equal(button(h, `maintenance.${label}Button`).props.disabled, true)
    }
    for (const r of requests) r.resolve({ ok: true, json: async () => ({ success: true, data: {} }) })
    await Promise.all(pending)
    assert.ok(Object.values(flags).every((flag) => flag === false))
    assert.equal(completed.length, 4)
    const helpButtons = h.findAll((n) => n.props['aria-describedby'])
    assert.equal(helpButtons.length, 4)
    for (const b of helpButtons) assert.equal(h.findAll((n) => n.props.id === b.props['aria-describedby'] && n.props.role === 'tooltip').length, 1)
  } finally { globalThis.fetch = realFetch; h.unmount() }
})

test('auto-conversion rejects malformed saves and keeps edits made during a valid save pending', async () => {
  let response = { success: true }
  let pending
  const errors = []
  const h = componentHarness(file('components/admin/AutoConversionSettingsCard.tsx'), {
    '@/lib/admin/autoConversionSettings': settings,
    '@/lib/utils': { authFetch: async () => pending ? pending.promise : ({ ok: true, json: async () => response }) },
    '@/lib/apiErrors': { messageFromApiBody: (_body, fallback) => fallback },
    sonner: { toast: { ...toast, error: (message) => errors.push(message) } },
  })
  h.render({ initial: { enabledCountries: ['NL'], defaultCountry: 'BE' } })
  const selectCountry = (country) => h.findAll((n) => n.type === 'Select')[0].props.onValueChange(country)
  selectCountry('FR'); await h.settle()
  for (const body of [null, {}, { success: true }, { success: true, data: [] }, { success: true, data: 'bad' }, { success: true, data: {} }]) {
    response = body
    await button(h, 'Save auto-conversion').props.onClick()
    await h.settle()
    assert.ok(h.findAll((n) => n.props.role === 'status').length)
  }
  assert.equal(errors.length, 6)
  pending = deferred()
  const saving = button(h, 'Save auto-conversion').props.onClick()
  await h.settle()
  selectCountry('US'); await h.settle()
  pending.resolve({ ok: true, json: async () => ({ success: true, data: { enabledCountries: ['NL'], defaultCountry: 'FR' } }) })
  await saving; await h.settle()
  assert.equal(h.findAll((n) => n.type === 'Select')[0].props.value, 'US')
  assert.ok(h.findAll((n) => n.props.role === 'status').length)
  h.unmount()
})

test('settings-load failure hides the editor; retry loads it and unrelated PUT responses cannot replace its initial value', async () => {
  const realFetch = globalThis.fetch
  const auth = { user: { role: 'admin', adminRole: 'super' }, isAuthenticated: true, loading: false }
  const router = { push() {} }
  let failGet = true
  let putResponse
  let pricingInvalidations = 0
  const stored = { enabledCountries: ['NL'], defaultCountry: 'BE' }
  const data = {
    autoConversion: stored,
    companyVatNumber: 'BE0123456789',
    companyAddress: { name: 'Fixtract', street: 'Street 1', city: 'Brussels', postalCode: '1000', country: 'BE' },
  }
  const h = componentHarness(file('app/(pages)/admin/settings/page.tsx'), {
    '@/lib/apiErrors': { getErrorMessage: (_e, fallback) => fallback, messageFromApiBody: (_b, fallback) => fallback },
    '@/contexts/AuthContext': { useAuth: () => auth },
    'next/navigation': { useRouter: () => router },
    sonner: { toast },
    '@/lib/vatValidation': { formatVATNumber: (value) => value, validateVATFormat: () => ({ valid: true }) },
    '@/lib/utils': { getAuthToken: () => null },
    '@/lib/countries': { EU_COUNTRIES: [{ code: 'BE', name: 'Belgium' }] },
    '@/lib/clientRequestCache': { invalidateClientRequest() {} },
    '@/lib/customerPricePreview': { invalidateCustomerPrices() { pricingInvalidations++ } },
    '@/lib/support': { adminSetSupportChatEnabled() {} },
    '@/lib/admin/autoConversionSettings': settings,
    '@/components/admin/AutoConversionSettingsCard': { __esModule: true, default: 'AutoConversionSettingsCard' },
  })
  globalThis.fetch = async (_url, init) => {
    if (init.method === 'PUT') return putResponse.promise
    return { ok: !failGet, json: async () => ({ success: true, data }) }
  }
  try {
    await h.settle()
    assert.equal(h.findAll((n) => n.type === 'AutoConversionSettingsCard').length, 0)
    assert.ok(h.findAll((n) => n.props.role === 'alert').length)
    failGet = false
    await button(h, 'Retry').props.onClick()
    await h.settle()
    assert.equal(h.findAll((n) => n.type === 'AutoConversionSettingsCard')[0].props.initial, stored)
    // A delayed general save must never supply its stale rollout to the dedicated editor.
    putResponse = deferred()
    const saving = button(h, 'Save Changes').props.onClick()
    await h.settle()
    putResponse.resolve({ ok: true, json: async () => ({ success: true, data: { ...data, autoConversion: { enabledCountries: ['DE'], defaultCountry: 'FR' } } }) })
    await saving; await h.settle()
    assert.equal(h.findAll((n) => n.type === 'AutoConversionSettingsCard')[0].props.initial, stored)
    // A projected PUT without autoConversion also leaves the dedicated card alone.
    putResponse = deferred()
    const projectedSave = button(h, 'Save Changes').props.onClick()
    const projection = { ...data }
    delete projection.autoConversion
    putResponse.resolve({ ok: true, json: async () => ({ success: true, data: projection }) })
    await projectedSave; await h.settle()
    assert.equal(pricingInvalidations, 2, 'each settings save invalidates cached customer amounts')
    assert.equal(h.findAll((n) => n.type === 'AutoConversionSettingsCard')[0].props.initial, stored)
  } finally { globalThis.fetch = realFetch; h.unmount() }
})
