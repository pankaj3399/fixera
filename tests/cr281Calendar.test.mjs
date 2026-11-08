import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { transformSync } from '@swc/core'

for (const component of ['EmployeeAvailability', 'TeamManagement']) test(`${component} opens active bookings and preserves other event handlers`, () => {
  const source = readFileSync(new URL(`../components/${component}.tsx`, import.meta.url), 'utf8')
  const start = source.indexOf('onEventClick={(event) => {') + 'onEventClick={'.length
  const handler = source.slice(start, source.indexOf('\n              }}', start) + '\n              }'.length)
  const code = transformSync(`const handler = ${handler}`, { jsc: { parser: { syntax: 'typescript' } } }).code
  const paths = [], edits = []
  const click = new Function('router', 'openEditRange', `${code}; return handler;`)({ push: path => paths.push(path) }, index => edits.push(index))
  for (const type of ['booking', 'booking-active', 'booking-buffer']) click({ type, meta: { bookingId: 'b1' } })
  assert.deepEqual(paths, ['/bookings/b1', '/bookings/b1', '/bookings/b1'])
  for (const type of ['booking-completed', 'company', 'unsupported', 'booking-active']) click({ type, meta: type === 'booking-active' ? {} : { bookingId: 'b1' } })
  assert.equal(paths.length, 3)
  click({ type: 'personal', meta: { rangeIndex: 2 } })
  assert.deepEqual(edits, [2])
})
