import assert from 'node:assert/strict'
import { test } from 'node:test'

// Resolve the viewer zone the same way a browser would, before importing the
// helper module (Intl reads TZ when the formatter is first constructed).
process.env.TZ = 'Europe/Amsterdam'
const {
  activityDayKey,
  formatInstant,
  formatTimeZoneLabel,
  groupActivityByDay,
  viewerTimeZone,
} = await import('../lib/bookingDetails.ts')

const item = (iso, id) => ({
  id,
  type: 'status_changed',
  occurredAt: iso,
  timestampRecorded: true,
})

test('viewer zone is used when no booking zone was recorded', () => {
  assert.equal(viewerTimeZone(), 'Europe/Amsterdam')
  const nearMidnight = item('2026-06-24T23:30:00.000Z', 'near-midnight')
  assert.equal(activityDayKey(nearMidnight), '2026-06-25')
  assert.match(formatInstant(nearMidnight.occurredAt, 'en-GB'), /01:30/)
  const groups = groupActivityByDay([nearMidnight])
  assert.deepEqual(groups.map((group) => group.key), ['2026-06-25'])
  assert.equal(groups[0].items[0].id, 'near-midnight')
})

test('recorded booking zone wins over the viewer zone', () => {
  const nearMidnight = item('2026-06-24T23:30:00.000Z', 'near-midnight')
  assert.equal(activityDayKey(nearMidnight, 'Europe/Brussels'), '2026-06-25')
  const groups = groupActivityByDay([nearMidnight], 'UTC')
  assert.deepEqual(groups.map((group) => group.key), ['2026-06-24'])
})

test('day grouping and the displayed instant stay on the same calendar day at DST boundaries', () => {
  // 2026-03-29 is the Europe/Amsterdam spring-forward date (02:00 -> 03:00).
  const beforeDst = item('2026-03-28T23:30:00.000Z', 'before-dst')
  const afterDst = item('2026-03-29T21:59:00.000Z', 'after-dst')
  const groups = groupActivityByDay([beforeDst, afterDst], 'Europe/Amsterdam')
  assert.deepEqual(
    groups.map((group) => [group.key, group.items.map((row) => row.id)]),
    [['2026-03-29', ['before-dst', 'after-dst']]]
  )
  assert.match(formatInstant(afterDst.occurredAt, 'en-GB', 'Europe/Amsterdam'), /23:59/)
})

test('timezone labels are localized and retain the IANA identifier', () => {
  const en = formatTimeZoneLabel('Europe/Brussels', 'en-GB')
  const nl = formatTimeZoneLabel('Europe/Brussels', 'nl-BE')
  const fr = formatTimeZoneLabel('Europe/Brussels', 'fr-FR')
  assert.match(en, /Europe\/Brussels/)
  assert.match(nl, /Europe\/Brussels/)
  assert.match(fr, /Europe\/Brussels/)
  assert.notEqual(en, 'Europe/Brussels')
  assert.equal(formatTimeZoneLabel(null, 'en-GB'), null)
  assert.equal(formatTimeZoneLabel('Not/AZone', 'en-GB'), 'Not/AZone')
})

test('C11-1x: a day-mode start stored as local midnight shows its own day', async () => {
  const { calendarDateKey, formatCalendarDate } = await import('../lib/bookingDetails.ts')
  // 23/11 00:00 in Brussels, stored as an instant.
  const stored = '2026-11-22T23:00:00.000Z'
  assert.equal(calendarDateKey(stored, 'Europe/Brussels'), '2026-11-23')
  assert.equal(formatCalendarDate(stored, 'en-GB', 'Europe/Brussels'), '23/11/2026')
  // No recorded zone: the viewer's zone (Europe/Amsterdam here), not UTC.
  assert.equal(formatCalendarDate(stored, 'en-GB'), '23/11/2026')
  // Date-only values and UTC midnights keep their own date in any zone.
  assert.equal(formatCalendarDate('2026-11-23', 'en-GB', 'America/New_York'), '23/11/2026')
  assert.equal(formatCalendarDate('2026-11-23T00:00:00.000Z', 'en-GB', 'America/New_York'), '23/11/2026')
  assert.equal(calendarDateKey('2026-11-23T00:00:00.000Z'), '2026-11-23')
  // Invalid recorded zone falls back to the viewer zone.
  assert.equal(calendarDateKey(stored, 'Not/AZone'), '2026-11-23')
  assert.equal(formatCalendarDate('not-a-date', 'en-GB'), null)
})
