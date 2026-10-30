import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestBookingDetailsRefresh } from '../lib/bookingDetailsRefresh.ts'

test('successful refresh returns the authoritative body', async () => {
  const calls = []
  const result = await requestBookingDetailsRefresh({
    url: '/api/bookings/b1',
    headers: { Authorization: 'Bearer token' },
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ success: true, booking: { _id: 'b1' } }), { status: 200 })
    },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.data.booking, { _id: 'b1' })
  assert.equal(calls[0].init.credentials, 'include')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token')
})

test('a non-OK refresh is a reported failure, not a silent success', async () => {
  const result = await requestBookingDetailsRefresh({
    url: '/api/bookings/b1',
    fetchImpl: async () => new Response('{}', { status: 500 }),
  })
  assert.deepEqual(result, { ok: false, reason: 'http' })
})

test('an invalid refresh body is a reported failure', async () => {
  const result = await requestBookingDetailsRefresh({
    url: '/api/bookings/b1',
    fetchImpl: async () => new Response(JSON.stringify({ success: false }), { status: 200 }),
  })
  assert.deepEqual(result, { ok: false, reason: 'invalid' })
})

test('a network refresh failure is reported for retry', async () => {
  const result = await requestBookingDetailsRefresh({
    url: '/api/bookings/b1',
    fetchImpl: async () => {
      throw new Error('offline')
    },
  })
  assert.deepEqual(result, { ok: false, reason: 'network' })
})
