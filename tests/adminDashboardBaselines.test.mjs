import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const require = createRequire(import.meta.url)
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')

const helpers = await import('@/lib/admin/dashboardBaselines')
const { DashboardBaselineSettingsView } = await import('@/components/admin/DashboardBaselineSettingsCard')
const { default: DashboardBaselineSettingsCard } = await import('@/components/admin/DashboardBaselineSettingsCard')
const { default: DashboardBaselineIndicator } = await import('@/components/admin/DashboardBaselineIndicator')

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const messagesFor = (locale) => ({
  adminDashboards: JSON.parse(readFileSync(new URL(`../messages/${locale}/adminDashboards.json`, import.meta.url), 'utf8')),
})
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
const withIntl = (element, locale = 'en') =>
  renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: router },
      React.createElement(NextIntlClientProvider, { locale, messages: messagesFor(locale), timeZone: 'UTC' }, element),
    ),
  )
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const RESET_AT = '2026-11-01T10:00:00.000Z'
const snapshot = {
  dashboards: [
    { key: 'disputes', resetAt: RESET_AT, resetBy: { id: 'u1', name: 'Sara Super' }, note: 'clear tests', canUndo: true },
    { key: 'warrantyClaims', resetAt: null, resetBy: null, note: '', canUndo: false },
    { key: 'cancellations', resetAt: null, resetBy: null, note: '', canUndo: false },
    { key: 'bookingKpis', resetAt: null, resetBy: null, note: '', canUndo: false },
  ],
  history: [
    { dashboardKey: 'disputes', action: 'reset', resetAt: RESET_AT, previousResetAt: null, actorName: 'Sara Super', note: 'clear tests', batchId: null, createdAt: RESET_AT },
  ],
  generatedAt: RESET_AT,
}

const viewProps = (overrides = {}) => ({
  snapshot,
  loading: false,
  loadFailed: false,
  pending: null,
  note: '',
  busy: false,
  locale: 'en',
  onRequestReset() {},
  onCancelReset() {},
  onNoteChange() {},
  onConfirmReset() {},
  onUndo() {},
  ...overrides,
})

const renderView = (overrides = {}, locale = 'en') =>
  withIntl(React.createElement(DashboardBaselineSettingsView, viewProps(overrides)), locale)

test('only a super admin can manage dashboard baselines', () => {
  assert.equal(helpers.canManageDashboardBaselines({ adminRole: 'super' }), true)
  for (const adminRole of ['care', 'marketing', 'quality', 'finance', 'operations', 'content_creator', null, undefined]) {
    assert.equal(helpers.canManageDashboardBaselines({ adminRole }), false, String(adminRole))
  }
  assert.equal(helpers.canManageDashboardBaselines(null), false)
})

test('show-all is read only from history=all, in any case', () => {
  assert.equal(helpers.isShowAllHistory('?history=all'), true)
  assert.equal(helpers.isShowAllHistory('history=ALL'), true)
  assert.equal(helpers.isShowAllHistory(new URLSearchParams('status=open&history=all')), true)
  assert.equal(helpers.isShowAllHistory('?history=open'), false)
  assert.equal(helpers.isShowAllHistory(''), false)
  assert.equal(helpers.isShowAllHistory(null), false)
})

test('the show-all toggle keeps filters, drops the page, and flips the flag', () => {
  assert.equal(helpers.buildHistoryToggleHref('/admin/disputes', '?status=resolved&page=3', false), '/admin/disputes?status=resolved&history=all')
  assert.equal(helpers.buildHistoryToggleHref('/admin/disputes', '?status=resolved&history=all&page=2', true), '/admin/disputes?status=resolved')
  assert.equal(helpers.buildHistoryToggleHref('/admin/kpi', '', false), '/admin/kpi?history=all')
  assert.equal(helpers.buildHistoryToggleHref('/admin/kpi', new URLSearchParams('history=all'), true), '/admin/kpi')
})

test('history query is empty unless show-all is on', () => {
  assert.equal(helpers.historyQuery(true), 'history=all')
  assert.equal(helpers.historyQuery(false), '')
})

test('formatBaselineDate formats valid dates and returns empty text otherwise', () => {
  const formatted = helpers.formatBaselineDate(RESET_AT, 'en')
  assert.ok(formatted.includes('2026'), formatted)
  assert.ok(helpers.formatBaselineDate(RESET_AT, 'fr').includes('2026'))
  assert.equal(helpers.formatBaselineDate(null, 'en'), '')
  assert.equal(helpers.formatBaselineDate('not a date', 'en'), '')
})

test('snapshot parsing keeps known dashboards and rejects malformed bodies', () => {
  const parsed = helpers.parseDashboardBaselineSnapshot({ success: true, data: { ...snapshot, dashboards: [...snapshot.dashboards, { key: 'kpi' }] } })
  assert.equal(parsed.dashboards.length, 4)
  assert.deepEqual(parsed.dashboards[0].resetBy, { id: 'u1', name: 'Sara Super' })
  assert.equal(parsed.history[0].action, 'reset')
  assert.equal(helpers.parseDashboardBaselineSnapshot(null), null)
  assert.equal(helpers.parseDashboardBaselineSnapshot({ data: { dashboards: 'nope' } }), null)
  assert.equal(helpers.parseDashboardBaselineSnapshot({ data: { dashboards: [null] } }), null)
})

test('baseline echo on list and KPI responses is parsed, and bad echoes are ignored', () => {
  assert.deepEqual(
    helpers.parseDashboardBaselineInfo({ key: 'disputes', resetAt: RESET_AT, showAll: false, applied: true }),
    { key: 'disputes', resetAt: RESET_AT, showAll: false, applied: true },
  )
  assert.equal(helpers.parseDashboardBaselineInfo({ key: 'nope' }), null)
  assert.equal(helpers.parseDashboardBaselineInfo(undefined), null)
})

test('request paths target one dashboard, all dashboards, or undo', () => {
  assert.equal(helpers.resetRequestPath('disputes'), '/api/admin/platform-settings/dashboard-baselines/disputes/reset')
  assert.equal(helpers.resetRequestPath('all'), '/api/admin/platform-settings/dashboard-baselines/reset-all')
  assert.equal(helpers.undoRequestPath('bookingKpis'), '/api/admin/platform-settings/dashboard-baselines/bookingKpis/undo')
  assert.deepEqual(helpers.keysForReset('all'), ['disputes', 'warrantyClaims', 'cancellations', 'bookingKpis'])
  assert.deepEqual(helpers.keysForReset('cancellations'), ['cancellations'])
})

test('reset notes are trimmed and capped at the server limit', () => {
  assert.equal(helpers.normalizeResetNote('  clear test data  '), 'clear test data')
  assert.equal(helpers.normalizeResetNote('x'.repeat(900)).length, helpers.DASHBOARD_BASELINE_NOTE_MAX_LENGTH)
})

test('super admin sees the reset list, baselines, who set them, reset buttons and history', () => {
  const html = renderView()
  const plain = text(html)
  assert.match(plain, /Reset dashboards/)
  assert.match(plain, /Booking disputes/)
  assert.match(plain, /Warranty claims/)
  assert.match(plain, /Cancellations and refunds/)
  assert.match(plain, /Booking KPIs/)
  assert.match(plain, /Reset all/)
  assert.match(plain, /Counting since .*2026.* · set by Sara Super/)
  assert.match(plain, /Not reset yet\. Counting all history\./)
  assert.equal((html.match(/data-dashboard=/g) || []).length, 4)
  // Undo is offered only where the latest event is a reset.
  assert.equal((plain.match(/Undo last reset/g) || []).length, 1)
  assert.match(plain, /Reset history/)
  assert.match(plain, /Reset · .*2026.* · Sara Super — clear tests/)
})

test('no confirmation panel is shown until a reset is requested', () => {
  const html = renderView()
  assert.doesNotMatch(html, /role="alertdialog"/)
})

test('confirming a single-dashboard reset explains that nothing is deleted', () => {
  const html = renderView({ pending: { target: 'cancellations' }, note: 'draft note' })
  assert.match(html, /role="alertdialog"/)
  const plain = text(html)
  assert.match(plain, /Reset Cancellations and refunds\?/)
  assert.match(plain, /Nothing is deleted\./)
  assert.match(plain, /Open and pending items are never hidden by a reset/)
  assert.match(plain, /Confirm reset/)
  assert.match(plain, /Cancel/)
  assert.match(html, /maxLength="500"/)
  assert.match(html, />draft note<\/textarea>/)
})

test('confirming reset-all uses the all-dashboards title and call to action', () => {
  const plain = text(renderView({ pending: { target: 'all' } }))
  assert.match(plain, /Reset all booking dashboards\?/)
  assert.match(plain, /Nothing is deleted\./)
  assert.match(plain, /Reset all dashboards/)
})

test('the reset section is localised in Dutch and French', () => {
  const nl = text(renderView({ pending: { target: 'disputes' } }, 'nl'))
  assert.match(nl, /Dashboards resetten/)
  assert.match(nl, /Er wordt niets verwijderd\./)
  assert.match(nl, /Resetten/)
  const fr = text(renderView({ pending: { target: 'disputes' } }, 'fr'))
  assert.match(fr, /Réinitialiser les tableaux de bord/)
  assert.match(fr, /Rien n'est supprimé\./)
  assert.match(fr, /Confirmer la réinitialisation/)
})

test('loading and failure states replace the list without a false empty state', () => {
  const loading = text(renderView({ snapshot: null, loading: true }))
  assert.match(loading, /Loading dashboard baselines/)
  assert.doesNotMatch(loading, /data-dashboard/)
  const failed = text(renderView({ snapshot: null, loading: false, loadFailed: true }))
  assert.match(failed, /Could not load dashboard baselines\./)
})

test('the container renders nothing for anyone but a super admin', () => {
  const html = withIntl(React.createElement(DashboardBaselineSettingsCard, { canManage: false }))
  assert.equal(html, '')
})

test('indicator is hidden when no baseline is set', () => {
  const html = withIntl(React.createElement(DashboardBaselineIndicator, { baseline: { key: 'disputes', resetAt: null, showAll: false, applied: false }, toggleHref: '/admin/disputes?history=all' }))
  assert.equal(html, '')
  assert.equal(withIntl(React.createElement(DashboardBaselineIndicator, { baseline: null, toggleHref: '/x' })), '')
})

test('indicator reads "Counting since <date> · Show all history" and links to the show-all view', () => {
  const html = withIntl(React.createElement(DashboardBaselineIndicator, {
    baseline: { key: 'disputes', resetAt: RESET_AT, showAll: false, applied: true },
    toggleHref: '/admin/disputes?history=all',
  }))
  assert.match(html, /data-state="counting"/)
  const plain = text(html)
  assert.match(plain, /Counting since .*2026/)
  assert.match(plain, /· Show all history/)
  assert.match(html, /href="\/admin\/disputes\?history=all"/)
})

test('indicator in show-all mode says so and offers to count from the reset again', () => {
  const html = withIntl(React.createElement(DashboardBaselineIndicator, {
    baseline: { key: 'warrantyClaims', resetAt: RESET_AT, showAll: true, applied: false },
    toggleHref: '/admin/warranty-claims',
  }))
  assert.match(html, /data-state="showing-all"/)
  assert.match(text(html), /Showing all history since the reset on .*2026/)
  assert.match(text(html), /Count from reset/)
  assert.match(html, /href="\/admin\/warranty-claims"/)
})

test('indicator is localised', () => {
  const html = withIntl(React.createElement(DashboardBaselineIndicator, {
    baseline: { key: 'bookingKpis', resetAt: RESET_AT, showAll: false, applied: true },
    toggleHref: '/admin/kpi?history=all',
  }), 'nl')
  assert.match(text(html), /Telt vanaf/)
  assert.match(text(html), /Toon volledige geschiedenis/)
})

test('every affected admin page wires show-all into its requests and shows the indicator', () => {
  const pages = {
    'app/(pages)/admin/disputes/page.tsx': ['historyQuery(showAll)', '<DashboardBaselineIndicator'],
    'app/(pages)/admin/warranty-claims/page.tsx': ['params.set("history", "all")', 'historyQuery(showAll)', '<DashboardBaselineIndicator'],
    'app/(pages)/admin/cancellation-requests/page.tsx': ["params.set('history', 'all')", '<DashboardBaselineIndicator'],
    'app/(pages)/admin/kpi/page.tsx': ['historyQuery(showAll)', '<DashboardBaselineIndicator'],
  }
  for (const [file, needles] of Object.entries(pages)) {
    const source = read(file)
    for (const needle of needles) assert.ok(source.includes(needle), `${file} missing ${needle}`)
    assert.ok(source.includes('isShowAllHistory(searchParams)'), `${file} reads show-all from the URL`)
  }
})

test('the KPI page applies show-all to every range request through appliedRange', () => {
  const source = read('app/(pages)/admin/kpi/page.tsx')
  assert.match(source, /appliedRange = useMemo\([\s\S]*historyQuery\(showAll\)[\s\S]*\[appliedFrom, appliedTo, country, showAll\]/)
})

test('the reset section is mounted on platform settings for super admins only', () => {
  const source = read('app/(pages)/admin/settings/page.tsx')
  assert.match(source, /canManageDashboardBaselines\(user\)/)
  assert.match(source, /<DashboardBaselineSettingsCard canManage \/>/)
})
