import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

const { bookingCalendarEventType } = await import('../lib/calendar/bookingEvents.ts')
const { filterDisputeOverviewRows, isDisputeOverviewRow } = await import('../lib/admin/disputeFilters.ts')

test('pending bookings stay blue, booked/in-progress stay coherent, completed is new', () => {
  for (const status of ['booked', 'payment_pending', 'quoted', 'rescheduling_requested', 'dispute', undefined, null, '']) {
    assert.equal(bookingCalendarEventType(status), 'booking', `pending blue for ${String(status)}`)
  }
  assert.equal(bookingCalendarEventType('in_progress'), 'booking-active')
  assert.equal(bookingCalendarEventType('professional_completed'), 'booking-active')
  assert.equal(bookingCalendarEventType('completed'), 'booking-completed')
})

test('cancelled, refunded and rejected bookings are hidden from the calendar', () => {
  for (const status of ['cancelled', 'refunded', 'quote_rejected']) {
    assert.equal(bookingCalendarEventType(status), null)
  }
})

test('dispute overview keeps only dispute-status bookings plus external escalations', () => {
  const rows = [
    { _id: 'a', status: 'dispute' },
    { _id: 'b', status: 'professional_completed' },
    { _id: 'c', status: 'completed' },
    { _id: 'd', status: 'booked' },
    { _id: 'e', status: 'completed', source: 'warranty' },
    { _id: 'f', status: 'booked', source: 'refund' },
  ]
  assert.ok(isDisputeOverviewRow(rows[0]))
  assert.ok(!isDisputeOverviewRow(rows[1]))
  assert.ok(!isDisputeOverviewRow(rows[2]))
  assert.ok(isDisputeOverviewRow(rows[4]))
  assert.deepEqual(filterDisputeOverviewRows(rows).map((row) => row._id), ['a', 'e', 'f'])
  assert.deepEqual(filterDisputeOverviewRows(null), [])
})

test('chat open/select flow loads lists and threads, admin reselect forces reload', async () => {
  const { readFileSync } = await import('node:fs')
  const widget = readFileSync(new URL('../components/chat/ChatWidget.tsx', import.meta.url), 'utf8')
  // Opening from the floating button refreshes the conversation list.
  assert.match(widget, /void loadConversationList\(true\)/)
  // Clicking a conversation selects it through a single handler...
  assert.match(widget, /onSelect=\{\(conversationId\) => \{\s+selectConversation\(conversationId\);\s+\}\}/)
  // ...which reloads messages even when re-selecting the open conversation.
  assert.match(widget, /selectedConversationIdRef\.current === conversationId/)
  assert.match(widget, /void loadMessages\(conversationId, true\)/)
  // Launcher opens with a conversation id ensure the list resolves it.
  assert.match(widget, /if \(detail\.conversationId\) \{[\s\S]*?void loadConversationList\(false\)/)

  const adminChat = readFileSync(new URL('../app/(pages)/admin/chat/page.tsx', import.meta.url), 'utf8')
  assert.match(adminChat, /setReloadKey\(\(key\) => key \+ 1\)/)
  assert.match(adminChat, /}, \[conversationId, reloadKey\]\)/)
  assert.doesNotMatch(adminChat, /if \(id === selectedId\) return/)
})

test('search page wires relevance sort, keyword field, and dispute/calendar consumers', async () => {
  const { readFileSync } = await import('node:fs')
  const page = readFileSync(new URL('../app/(pages)/search/page.tsx', import.meta.url), 'utf8')
  // Server owns relevance order globally (pre-pagination slice): the client
  // must send the param and keep backend order untouched.
  assert.match(page, /if \(filters\.sortBy\) params\.append\('sortBy', filters\.sortBy\)/)
  assert.match(page, /sortBy: 'relevant'/)
  assert.doesNotMatch(page, /rankResultsByRelevance/)
  assert.doesNotMatch(page, /lib\/search\/relevance/)

  const filters = readFileSync(new URL('../components/search/SearchFilters.tsx', import.meta.url), 'utf8')
  assert.match(filters, /if \(keywordDraft\.trim\(\) === filters\.query\) return/)
  assert.match(filters, /onFilterChange\('query', keywordDraft\.trim\(\)\)/)
  assert.match(filters, /onFilterChange\('query', ''\)/)
  assert.match(filters, /filters\.keyword/)

  const disputes = readFileSync(new URL('../app/(pages)/admin/disputes/page.tsx', import.meta.url), 'utf8')
  assert.match(disputes, /filterDisputeOverviewRows\(disputes\)/)
  assert.match(disputes, /visibleDisputes\.length === 0/)
  assert.match(disputes, /visibleDisputes\.map\(\(d\) => \{/)
  // List-scoped count derives from the filtered list; analytics cards stay server-driven.
  assert.match(disputes, /Showing \{visibleDisputes\.length\}/)

  const employeeAvailability = readFileSync(new URL('../components/EmployeeAvailability.tsx', import.meta.url), 'utf8')
  assert.match(employeeAvailability, /bookingCalendarEventType\(range\.status\)/)
  assert.match(employeeAvailability, /status\?: string/)

  const teamManagement = readFileSync(new URL('../components/TeamManagement.tsx', import.meta.url), 'utf8')
  assert.match(teamManagement, /bookingCalendarEventType\(range\.status\)/)
  assert.match(teamManagement, /status\?: string/)

  const professionalProject = readFileSync(new URL('../app/(pages)/professional/projects/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(professionalProject, /bookingCalendarEventType\(booking\.status\)/)
  assert.doesNotMatch(professionalProject, /type: 'booking',\n\s+title: booking\.project/)

  const calendar = readFileSync(
    new URL('../components/calendar/WeeklyAvailabilityCalendar.tsx', import.meta.url),
    'utf8',
  )
  assert.match(calendar, /booking-active/)
  assert.match(calendar, /booking-completed/)
  assert.match(calendar, /eventTitles\.bookingPending/)
  assert.match(calendar, /eventTitles\.bookingActive/)
  assert.match(calendar, /eventTitles\.bookingCompleted/)

  const profile = readFileSync(new URL('../app/(pages)/profile/page.tsx', import.meta.url), 'utf8')
  assert.match(profile, /bookingCalendarEventType\(booking\?\.status\)/)
  assert.doesNotMatch(profile, /!\['completed', 'cancelled', 'refunded'\]/)
})
