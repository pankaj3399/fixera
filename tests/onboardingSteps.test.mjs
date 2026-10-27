import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

const {
  normalizeOnboardingStep,
  deriveOnboardingResumeStep,
} = await import('../lib/onboarding/resumeStep.ts')

test('legacy removed step 5 maps to the next real step, others clamp', () => {
  assert.equal(normalizeOnboardingStep(5), 6)
  assert.equal(normalizeOnboardingStep(1), 1)
  assert.equal(normalizeOnboardingStep(7), 7)
  assert.equal(normalizeOnboardingStep(99), 7)
  assert.equal(normalizeOnboardingStep(0), 1)
  assert.equal(normalizeOnboardingStep(NaN), 1)
})

test('resume derivation never skips business validation or Stripe verification', () => {
  assert.equal(deriveOnboardingResumeStep(null), 1)
  assert.equal(deriveOnboardingResumeStep({}), 1)
  assert.equal(deriveOnboardingResumeStep({ idProofUrl: 'x' }), 2)
  assert.equal(deriveOnboardingResumeStep({ idCountryOfIssue: 'BE', businessInfo: { companyName: 'Acme' } }), 3)
  assert.equal(deriveOnboardingResumeStep({ idProofUrl: 'x', vatNumber: 'BE123' }), 3)
  // Even a nearly complete profile resumes at Stripe, never past it.
  assert.equal(
    deriveOnboardingResumeStep({ idProofUrl: 'x', businessInfo: { companyName: 'Acme' }, username: 'acme' }),
    3,
  )
})
