import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
import { componentHarness, elementText } from './helpers/componentHarness.mjs'
register('./swc-loader.mjs', import.meta.url)

// Runtime checks for the counting-since history toggle on the admin queues:
// switching only `?history=all` must restart the queue on page 1 and request the
// full history, and a response from the previous mode must never win.
const BACKEND = 'https://backend.test'
process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND

const apiErrors = await import('@/lib/apiErrors')
const cancelReasons = await import('@/lib/constants/cancelReasons')
const cancellationFilters = await import('@/lib/admin/cancellationRequestFilters')
const dashboardBaselines = await import('@/lib/admin/dashboardBaselines')
const disputeFilters = await import('@/lib/admin/disputeFilters')
const warrantyClaim = await import('@/lib/warrantyClaim')

const file = (path) => new URL(`../${path}`, import.meta.url)
const CANCELLATIONS = 'app/[ctx]/(pages)/admin/cancellation-requests/page.tsx'
const WARRANTY = 'app/[ctx]/(pages)/admin/warranty-claims/page.tsx'
const DISPUTES = 'app/[ctx]/(pages)/admin/disputes/page.tsx'

const OLD_RESET = '2026-10-01T09:00:00.000Z'
const NEW_RESET = '2026-11-01T09:00:00.000Z'
const admin = { role: 'admin', name: 'Admin' }
const authValue = { user: admin, loading: false, isAuthenticated: true }
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }

const baseline = (key, resetAt) => ({ key, resetAt, showAll: false, applied: resetAt !== null })

/** Records every request and lets the test decide when (and with what) each one resolves. */
function createNet() {
  const requests = []
  const send = (url) =>
    new Promise((resolve) => {
      const parsed = new URL(String(url))
      requests.push({
        url: parsed,
        params: parsed.searchParams,
        respond: (body, ok = true) => resolve({ ok, json: async () => body }),
      })
    })
  return { requests, send }
}

/** Mount a queue page with its navigation, auth, data and presentation edges replaced. */
function mount(relative, net, state) {
  return componentHarness(file(relative), {
    'next/navigation': {
      usePathname: () => state.pathname,
      useRouter: () => router,
      useSearchParams: () => state.params,
    },
    '@/contexts/AuthContext': { useAuth: () => authValue },
    '@/lib/utils': { authFetch: net.send, getAuthToken: () => 'token' },
    '@/lib/apiErrors': apiErrors,
    '@/lib/constants/cancelReasons': cancelReasons,
    '@/lib/admin/cancellationRequestFilters': cancellationFilters,
    '@/lib/admin/dashboardBaselines': dashboardBaselines,
    '@/lib/admin/disputeFilters': disputeFilters,
    '@/lib/warrantyClaim': warrantyClaim,
    '@/components/admin/DashboardBaselineIndicator': { default: () => null },
    '@/components/admin/disputes/DisputeOverviewSummary': {
      BookingDisputeCards: () => null,
      SeparateQueueCounts: () => null,
      REFUND_QUEUE_HREF: '/admin/disputes?status=refunds',
      WARRANTY_QUEUE_HREF: '/admin/warranty-claims',
    },
    sonner: { toast: { success() {}, error() {}, info() {} } },
  })
}

function newState(search = '') {
  return { pathname: '/admin/queue', search, params: new URLSearchParams(search) }
}

/** Change only the URL's history mode, then re-render the page as Next would. */
function setSearch(h, state, search) {
  state.search = search
  state.params = new URLSearchParams(search)
  h.render()
}

function clickButton(h, label) {
  const button = h.findAll((node) => typeof node.props.onClick === 'function' && elementText(node).trim() === label)[0]
  assert.ok(button, `button "${label}" is rendered`)
  button.props.onClick()
}

/** The baseline echo that the page hands to the shared indicator. */
function indicatorBaseline(h) {
  const indicator = h.findAll((node) => 'baseline' in node.props && 'toggleHref' in node.props)[0]
  assert.ok(indicator, 'indicator is rendered')
  return indicator.props.baseline
}

const lastFor = (net, pathSuffix) => net.requests.filter((request) => request.url.pathname.endsWith(pathSuffix)).at(-1)

// One row per list keeps the pagination controls (rendered beside items) on screen.
const cancellationRow = { _id: 'cr1', status: 'pending', reason: 'Schedule changed', booking: { _id: 'b1', bookingNumber: 'BK-1' } }
const cancellationBody = (resetAt) => ({
  success: true,
  data: { items: [cancellationRow], total: 45, baseline: baseline('cancellations', resetAt) },
})


const disputeRow = { _id: 'bk1', bookingNumber: 'BK-1', status: 'dispute', dispute: { type: 'extra_costs', reason: 'Extra hours' } }
const disputesBody = (resetAt, pages = 2) => ({
  success: true,
  data: { disputes: [disputeRow], externalDisputes: [], pagination: { total: 30, pages }, baseline: baseline('disputes', resetAt) },
})

const disputesAnalyticsBody = (resetAt) => ({ success: true, data: { baseline: baseline('disputes', resetAt) } })

test('cancellation queue: switching only the history mode restarts on page 1 and requests the full history', async () => {
  const net = createNet()
  const state = newState('')
  const h = mount(CANCELLATIONS, net, state)
  h.render()
  await h.settle()
  net.requests[0].respond(cancellationBody(OLD_RESET))
  await h.settle()
  clickButton(h, 'Next')
  await h.settle()
  assert.equal(lastFor(net, '/api/admin/cancellation-requests').params.get('page'), '2')

  setSearch(h, state, 'history=all')
  await h.settle()
  const request = lastFor(net, '/api/admin/cancellation-requests')
  assert.equal(request.params.get('page'), '1')
  assert.equal(request.params.get('history'), 'all')
  assert.equal(request.params.get('limit'), '20')
})

test('cancellation queue ignores a response from the previous history mode', async () => {
  const net = createNet()
  const state = newState('')
  const h = mount(CANCELLATIONS, net, state)
  h.render()
  await h.settle()
  setSearch(h, state, 'history=all')
  await h.settle()
  const [previousMode, currentMode] = net.requests
  assert.equal(previousMode.params.get('history'), null)
  assert.equal(currentMode.params.get('history'), 'all')

  currentMode.respond(cancellationBody(NEW_RESET))
  await h.settle()
  previousMode.respond(cancellationBody(OLD_RESET))
  await h.settle()
  assert.equal(indicatorBaseline(h).resetAt, NEW_RESET)
})

test('warranty claims have no reset of their own: history=all in the URL is not sent', async () => {
  const previousFetch = globalThis.fetch
  const net = createNet()
  globalThis.fetch = net.send
  try {
    const h = mount(WARRANTY, net, newState('history=all'))
    h.render()
    await h.settle()
    assert.ok(lastFor(net, '/admin/list'), 'claims are requested')
    assert.ok(lastFor(net, '/admin/analytics'), 'analytics are requested')
    for (const request of net.requests) assert.equal(request.params.get('history'), null, request.url.href)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('disputes: switching only the history mode restarts on page 1 and requests history=all', async () => {
  const net = createNet()
  const state = newState('')
  const h = mount(DISPUTES, net, state)
  h.render()
  await h.settle()
  for (const request of net.requests) {
    request.respond(request.url.pathname.endsWith('/analytics') ? disputesAnalyticsBody(OLD_RESET) : disputesBody(OLD_RESET))
  }
  await h.settle()
  clickButton(h, 'Next')
  await h.settle()
  assert.equal(lastFor(net, '/api/admin/disputes').params.get('page'), '2')

  setSearch(h, state, 'history=all')
  await h.settle()
  const list = lastFor(net, '/api/admin/disputes')
  const analytics = lastFor(net, '/api/admin/disputes/analytics')
  assert.equal(list.params.get('page'), '1')
  assert.equal(list.params.get('history'), 'all')
  assert.equal(analytics.params.get('history'), 'all')
})

test('disputes ignores responses from the previous history mode, for both the list and analytics', async () => {
  const net = createNet()
  const state = newState('')
  const h = mount(DISPUTES, net, state)
  h.render()
  await h.settle()
  const previousMode = [...net.requests]
  setSearch(h, state, 'history=all')
  await h.settle()
  const currentMode = net.requests.slice(previousMode.length)
  assert.equal(currentMode.length, 2)

  for (const request of currentMode) {
    request.respond(request.url.pathname.endsWith('/analytics') ? disputesAnalyticsBody(NEW_RESET) : disputesBody(NEW_RESET))
  }
  await h.settle()
  for (const request of previousMode) {
    request.respond(request.url.pathname.endsWith('/analytics') ? disputesAnalyticsBody(OLD_RESET) : disputesBody(OLD_RESET))
  }
  await h.settle()
  assert.equal(indicatorBaseline(h).resetAt, NEW_RESET)
})

test('a fresh mount with ?history=all requests the full history, so the mode lives in the URL', async () => {
  const net = createNet()
  const h = mount(DISPUTES, net, newState('history=all'))
  h.render()
  await h.settle()
  assert.ok(net.requests.length > 0)
  for (const request of net.requests) assert.equal(request.params.get('history'), 'all', request.url.href)
})
