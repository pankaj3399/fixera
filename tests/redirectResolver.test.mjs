import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

const {
  isSafeRedirectPath,
  defaultPathForRole,
  resolvePostAuthRedirect,
} = await import('../lib/auth/redirectResolver.ts')

test('role defaults: customers land on homepage, pros and staff on dashboard', () => {
  assert.equal(defaultPathForRole('customer'), '/')
  assert.equal(defaultPathForRole('professional'), '/dashboard')
  assert.equal(defaultPathForRole('admin'), '/dashboard')
  assert.equal(defaultPathForRole('employee'), '/dashboard')
  assert.equal(defaultPathForRole(undefined), '/dashboard')
})

test('explicit safe workflow redirect wins over the role default', () => {
  assert.equal(
    resolvePostAuthRedirect({ role: 'customer', explicitRedirect: '/checkout/abc' }),
    '/checkout/abc',
  )
  assert.equal(
    resolvePostAuthRedirect({ role: 'customer', explicitRedirect: '/bookings/1?tab=chat' }),
    '/bookings/1?tab=chat',
  )
  assert.equal(
    resolvePostAuthRedirect({ role: 'professional', explicitRedirect: null, onboardingPath: '/professional/onboarding' }),
    '/professional/onboarding',
  )
  assert.equal(resolvePostAuthRedirect({ role: 'customer' }), '/')
})

test('open-redirect attacks fall back to the role default', () => {
  const attacks = [
    '//evil.com',
    '///evil.com',
    '/\\evil.com',
    '\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/javascript:alert(1)',
    '/\n/evil.com',
    '',
    null,
    undefined,
    42,
  ]
  for (const malicious of attacks) {
    assert.equal(isSafeRedirectPath(malicious), false, JSON.stringify(malicious))
    assert.equal(
      resolvePostAuthRedirect({ role: 'customer', explicitRedirect: malicious }),
      '/',
      JSON.stringify(malicious),
    )
  }
  assert.equal(isSafeRedirectPath('/dashboard?welcome=true'), true)
})

test('incomplete professional onboarding wins over every explicit workflow intent', () => {
  for (const explicitRedirect of ['/dashboard', '/bookings/abc', '//evil.com', null]) {
    assert.equal(resolvePostAuthRedirect({ role: 'professional', explicitRedirect, onboardingPath: '/professional/onboarding' }), '/professional/onboarding')
  }
  assert.equal(resolvePostAuthRedirect({ role: 'professional', explicitRedirect: '/bookings/abc' }), '/bookings/abc')
})
