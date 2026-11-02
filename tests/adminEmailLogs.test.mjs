import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  EMPTY_EMAIL_LOG_FILTERS,
  buildEmailLogQuery,
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
  assert.equal(qs.get('from'), '2026-11-01')
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
