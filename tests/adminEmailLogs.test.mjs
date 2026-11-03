import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
// Belgian admin: rows render in local time, so date filters use local days.
process.env.TZ = 'Europe/Brussels'
import {
  EMPTY_EMAIL_LOG_FILTERS,
  buildEmailLogQuery,
  emailLogDateRangeProblem,
  localDayBoundary,
  normalizeEmailLog,
  parseEmailLogsResponse,
  sameEmailLogFilters,
} from '../lib/admin/emailLogs.ts'
import { canAccessAdminPage, permissionForAdminPage } from '../lib/adminRbac.ts'

const PAGE = new URL('../app/(pages)/admin/email-logs/page.tsx', import.meta.url)

test('the /admin/email-logs route exists (previously a framework 404)', () => {
  assert.ok(existsSync(PAGE), 'email logs page must exist')
  const source = readFileSync(PAGE, 'utf8')
  assert.match(source, /\/api\/admin\/email-logs\?/)
  assert.match(source, /parseEmailLogsResponse/)
})

test('email logs page is gated by email_logs.read, not the super-only fallback', () => {
  assert.equal(permissionForAdminPage('/admin/email-logs'), 'email_logs.read')
  const reader = {
    role: 'admin',
    adminRole: 'care',
    adminPermissions: ['email_logs.read'],
    adminAccessLevels: { email_logs: 'read' },
  }
  const outsider = { role: 'admin', adminRole: 'care', adminPermissions: ['bookings.read'], adminAccessLevels: { bookings: 'read' } }
  assert.equal(canAccessAdminPage(reader, '/admin/email-logs'), true)
  assert.equal(canAccessAdminPage(outsider, '/admin/email-logs'), false)
})

test('query builder sends only filters the backend applies', () => {
  const qs = new URLSearchParams(buildEmailLogQuery({
    ...EMPTY_EMAIL_LOG_FILTERS,
    template: '  booking-confirmation ',
    status: 'failed',
    to: 'j',
    relatedBooking: '64b7f1c2a9e1',
    from: '2026-11-01',
    until: 'not-a-date',
  }, 2))
  assert.equal(qs.get('template'), 'booking-confirmation')
  assert.equal(qs.get('status'), 'failed')
  assert.equal(qs.has('to'), false, 'one-character recipient is ignored server-side')
  assert.equal(qs.has('relatedBooking'), false, 'partial booking ids are not sent')
  assert.equal(qs.get('from'), '2026-10-31T23:00:00.000Z', 'local (CET) midnight, not UTC midnight')
  assert.equal(qs.has('until'), false)
  assert.equal(qs.get('page'), '2')
  assert.equal(qs.get('limit'), '25')

  const full = new URLSearchParams(buildEmailLogQuery({
    ...EMPTY_EMAIL_LOG_FILTERS,
    to: 'jane@',
    relatedBooking: '64b7f1c2a9e1d3f4a5b6c7d8',
  }, 0))
  assert.equal(full.get('to'), 'jane@')
  assert.equal(full.get('relatedBooking'), '64b7f1c2a9e1d3f4a5b6c7d8')
  assert.equal(full.get('page'), '1')
  assert.equal(full.has('status'), false)
})

test('response parser normalizes rows and pagination from the backend envelope', () => {
  const page = parseEmailLogsResponse({
    success: true,
    data: {
      logs: [
        { _id: 'a1', to: 'qa@example.test', subject: 'Booking confirmed', template: 'booking-confirmation', status: 'sent', relatedBooking: { _id: 'b1' }, createdAt: '2026-11-03T10:00:00.000Z' },
        { _id: 'a2', to: 'x@example.test', subject: 'Ticket', template: 'support-ack', status: 'weird', errorMessage: 'SMTP 550', createdAt: '2026-11-03T11:00:00.000Z' },
        { _id: 'broken' },
      ],
      pagination: { page: 3, limit: 25, total: 51, totalPages: 3 },
    },
  })
  assert.equal(page.logs.length, 2)
  assert.equal(page.logs[0].relatedBooking, 'b1')
  assert.equal(page.logs[1].status, 'failed', 'unknown status is shown as failed, never as sent')
  assert.equal(page.logs[1].errorMessage, 'SMTP 550')
  assert.deepEqual({ page: page.page, totalPages: page.totalPages, total: page.total }, { page: 3, totalPages: 3, total: 51 })
  assert.throws(() => parseEmailLogsResponse({ success: false, msg: 'nope' }))
  assert.equal(normalizeEmailLog({ _id: 'x', createdAt: 'garbage' }), null)
})

test('filter equality drives debounce/reset', () => {
  assert.equal(sameEmailLogFilters(EMPTY_EMAIL_LOG_FILTERS, { ...EMPTY_EMAIL_LOG_FILTERS }), true)
  assert.equal(sameEmailLogFilters(EMPTY_EMAIL_LOG_FILTERS, { ...EMPTY_EMAIL_LOG_FILTERS, status: 'sent' }), false)
})

test('F10: date filters are local-day boundaries that match the displayed local times', () => {
  // CET (UTC+1) in November, CEST (UTC+2) in July.
  assert.equal(localDayBoundary('2026-11-03', 'start'), '2026-11-02T23:00:00.000Z')
  assert.equal(localDayBoundary('2026-11-03', 'end'), '2026-11-03T22:59:59.999Z')
  assert.equal(localDayBoundary('2026-07-01', 'start'), '2026-06-30T22:00:00.000Z')
  assert.equal(localDayBoundary('2026-13-01', 'start'), null)
  assert.equal(localDayBoundary('', 'end'), null)
  // An email sent at 00:30 local on 3 Nov (23:30Z on 2 Nov) is inside a 3 Nov filter.
  const sentAt = new Date('2026-11-02T23:30:00.000Z').toISOString()
  const qs = new URLSearchParams(buildEmailLogQuery({ ...EMPTY_EMAIL_LOG_FILTERS, from: '2026-11-03', until: '2026-11-03' }, 1))
  assert.ok(qs.get('from') <= sentAt && sentAt <= qs.get('until'))
  // The backend widens `until` only at exact UTC midnight; a local day end never is.
  assert.notEqual(new Date(qs.get('until')).getUTCMilliseconds(), 0)
})

test('F10: an inverted range is called out instead of silently matching nothing', () => {
  assert.match(emailLogDateRangeProblem({ from: '2026-11-04', until: '2026-11-03' }), /after/)
  assert.equal(emailLogDateRangeProblem({ from: '2026-11-03', until: '2026-11-03' }), null)
  assert.equal(emailLogDateRangeProblem({ from: '2026-11-03', until: '' }), null)
  const page = readFileSync(new URL('../app/(pages)/admin/email-logs/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /emailLogDateRangeProblem\(filters\)/)
})
