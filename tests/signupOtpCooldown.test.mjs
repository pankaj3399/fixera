import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

const {
  SIGNUP_OTP_RESEND_COOLDOWN_SECONDS,
  initialOtpResendState,
  tickOtpResend,
  restartOtpResend,
  formatOtpCooldown,
} = await import('../lib/auth/signupOtpCooldown.ts')

test('cooldown window is 120s (resend only, not OTP validity)', () => {
  assert.equal(SIGNUP_OTP_RESEND_COOLDOWN_SECONDS, 120)
})

test('resend stays disabled until the full window elapses', () => {
  let state = initialOtpResendState()
  assert.equal(state.disabled, true)
  assert.equal(state.remainingSeconds, 120)
  for (let i = 0; i < 119; i++) {
    state = tickOtpResend(state)
    assert.equal(state.disabled, true)
  }
  assert.equal(state.remainingSeconds, 1)
  state = tickOtpResend(state)
  assert.deepEqual(state, { disabled: false, remainingSeconds: 0 })
  // Ticking past zero is stable, never negative.
  state = tickOtpResend(state)
  assert.deepEqual(state, { disabled: false, remainingSeconds: 0 })
})

test('resend restarts the full window and formats mm:ss', () => {
  const restarted = restartOtpResend()
  assert.deepEqual(restarted, { disabled: true, remainingSeconds: 120 })
  assert.equal(formatOtpCooldown(120), '2:00')
  assert.equal(formatOtpCooldown(61), '1:01')
  assert.equal(formatOtpCooldown(0), '0:00')
})
