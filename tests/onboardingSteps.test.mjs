import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { register } from 'node:module'
import { transformSync } from '@swc/core'

register('./swc-loader.mjs', import.meta.url)

const require = createRequire(import.meta.url)
const React = require('react')

const resumeStep = await import('../lib/onboarding/resumeStep.ts')
const { normalizeOnboardingStep, deriveOnboardingResumeStep } = resumeStep

test('legacy removed step 5 maps to the next real step, others clamp', () => {
  assert.equal(normalizeOnboardingStep(5), 6)
  assert.equal(normalizeOnboardingStep(1), 1)
  assert.equal(normalizeOnboardingStep(7), 7)
  assert.equal(normalizeOnboardingStep(99), 7)
  assert.equal(normalizeOnboardingStep(0), 1)
  assert.equal(normalizeOnboardingStep(NaN), 1)
  assert.equal(normalizeOnboardingStep(-Infinity), 1)
  assert.equal(normalizeOnboardingStep(Infinity), 7)
})

const completeId = { idProofUrl: 'x', idCountryOfIssue: 'BE', idExpirationDate: '2030-01-01' }
const completeBusiness = {
  vatNumber: 'BE0123456789',
  username: 'acme',
  businessInfo: { companyName: 'Acme', address: 'Main 1', city: 'Gent', country: 'Belgium', postalCode: '9000' },
}

test('resume derivation never skips business validation or Stripe verification', () => {
  assert.equal(deriveOnboardingResumeStep(null), 1)
  assert.equal(deriveOnboardingResumeStep({}), 1)
  // The ID step requires proof, issuing country and expiry.
  assert.equal(deriveOnboardingResumeStep({ idProofUrl: 'x' }), 1)
  assert.equal(deriveOnboardingResumeStep({ idCountryOfIssue: 'BE', businessInfo: { companyName: 'Acme' } }), 1)
  assert.equal(deriveOnboardingResumeStep(completeId), 2)
  // Partial business profiles stay on the business step.
  assert.equal(deriveOnboardingResumeStep({ ...completeId, businessInfo: { companyName: 'Acme' } }), 2)
  assert.equal(deriveOnboardingResumeStep({ ...completeId, vatNumber: 'BE123' }), 2)
  assert.equal(
    deriveOnboardingResumeStep({ ...completeId, businessInfo: { companyName: 'Acme' }, username: 'acme' }),
    2,
  )
  assert.equal(deriveOnboardingResumeStep({ ...completeId, ...completeBusiness, vatNumber: '' }), 2)
  assert.equal(deriveOnboardingResumeStep({ ...completeId, ...completeBusiness, username: 'ab' }), 2)
  assert.equal(
    deriveOnboardingResumeStep({ ...completeId, ...completeBusiness, businessInfo: { ...completeBusiness.businessInfo, postalCode: ' ' } }),
    2,
  )
  // Even a complete profile resumes at Stripe, never past it.
  assert.equal(deriveOnboardingResumeStep({ ...completeId, ...completeBusiness }), 3)
})

// Minimal hook runtime: re-renders and flushes effects until state settles,
// so the real useOnboardingStepSync effects run in React's commit order.
function hooks() {
  const slots = []
  let index = 0
  let effects = []
  const api = {
    ...React,
    useRef(value) { const i = index++; return slots[i] ??= { current: value } },
    useState(value) {
      const i = index++
      if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v }]
    },
    useEffect(fn, deps) {
      const i = index++
      if (!slots[i] || deps?.some((v, j) => v !== slots[i][j])) effects.push(fn)
      slots[i] = deps
    },
  }
  return {
    api,
    render(fn) { index = 0; return fn() },
    flush() { const pending = effects; effects = []; pending.forEach(fn => fn()); return pending.length },
  }
}

function loadStepSyncHook(reactApi) {
  const file = '../lib/onboarding/useOnboardingStepSync.ts'
  const { code } = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'typescript' } }, module: { type: 'commonjs' },
  })
  const exports = {}
  const mocks = { react: reactApi, './resumeStep': resumeStep }
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), exports)
  return exports.useOnboardingStepSync
}

/** Mounts the hook with a URL, then lets auth resolve; returns the settled step and URL writes. */
function mountStepSync({ initialSearch, user, loadingFirst }) {
  const state = hooks()
  const useOnboardingStepSync = loadStepSyncHook(state.api)
  let search = initialSearch
  const replaces = []
  const router = { replace: href => { replaces.push(href); search = href.split('?')[1] ?? '' } }
  let loading = loadingFirst
  let step
  // Like Next's useSearchParams: one stable object per URL.
  let params = new URLSearchParams(search)
  const settle = () => {
    for (let i = 0; i < 10; i++) {
      if (params.toString() !== search) params = new URLSearchParams(search)
      ;[step] = state.render(() => useOnboardingStepSync({
        loading,
        user: loading ? null : user,
        searchParams: params,
        pathname: '/professional/onboarding',
        router,
      }))
      if (state.flush() === 0) return
    }
    throw new Error('step sync did not settle')
  }
  settle()
  const beforeAuth = { step, replaces: [...replaces] }
  loading = false
  settle()
  return { beforeAuth, step, replaces, search }
}

test('a deep-linked ?step=3 survives mount and URL synchronization', () => {
  for (const loadingFirst of [false, true]) {
    const result = mountStepSync({ initialSearch: 'step=3', user: { ...completeId }, loadingFirst })
    assert.equal(result.step, 3)
    // The URL already says step=3, so nothing is rewritten — never to step=1.
    assert.deepEqual(result.replaces, [])
    assert.equal(result.search, 'step=3')
  }
})

test('without ?step the saved profile decides the step before the URL is written', () => {
  const result = mountStepSync({ initialSearch: '', user: { ...completeId, ...completeBusiness }, loadingFirst: true })
  // Nothing is written while the profile is still loading.
  assert.deepEqual(result.beforeAuth.replaces, [])
  assert.equal(result.step, 3)
  assert.deepEqual(result.replaces, ['/professional/onboarding?step=3'])
})

test('a legacy ?step=5 deep link normalizes to the employees step in the URL', () => {
  const result = mountStepSync({ initialSearch: 'step=5', user: { ...completeId }, loadingFirst: false })
  assert.equal(result.step, 6)
  assert.deepEqual(result.replaces, ['/professional/onboarding?step=6'])
})

test('a malformed ?step= value is treated as absent, so the saved profile still resumes', () => {
  // A numeric prefix (`7junk`) or any other non-integer is not a step either.
  for (const initialSearch of ['step=abc', 'step=', 'step=7junk', 'step=3.5', 'step=-1', 'step=1e2', 'step=+3', 'step=0x3']) {
    const result = mountStepSync({ initialSearch, user: { ...completeId, ...completeBusiness }, loadingFirst: true })
    assert.deepEqual(result.beforeAuth.replaces, [])
    assert.equal(result.step, 3)
    assert.deepEqual(result.replaces, ['/professional/onboarding?step=3'], initialSearch)
  }
})

test('an all-digit ?step= is a deep link and is clamped to a real step', () => {
  const { parseOnboardingStepParam } = resumeStep
  assert.equal(parseOnboardingStepParam('7'), 7)
  assert.equal(parseOnboardingStepParam('03'), 3)
  assert.equal(parseOnboardingStepParam('7junk'), null)
  assert.equal(parseOnboardingStepParam(' 3'), null)
  assert.equal(parseOnboardingStepParam(''), null)
  assert.equal(parseOnboardingStepParam(null), null)
  for (const [initialSearch, step] of [['step=7', 7], ['step=03', 3], ['step=99', 7], ['step=0', 1]]) {
    // Profile alone would resume at 3: a valid deep link wins instead.
    const result = mountStepSync({ initialSearch, user: { ...completeId, ...completeBusiness }, loadingFirst: true })
    assert.equal(result.step, step, initialSearch)
    assert.equal(result.search, `step=${step}`, initialSearch)
  }
})

test('an all-digit ?step= too long for a finite number clamps to the last step, not step 1', () => {
  const { parseOnboardingStepParam } = resumeStep
  const huge = '9'.repeat(400)
  assert.equal(parseOnboardingStepParam(huge), Infinity)
  const result = mountStepSync({ initialSearch: `step=${huge}`, user: { ...completeId, ...completeBusiness }, loadingFirst: true })
  assert.equal(result.step, 7)
  assert.equal(result.search, 'step=7')
  // A malformed long value is still absent: the saved profile resumes at 3.
  const malformed = mountStepSync({ initialSearch: `step=${huge}x`, user: { ...completeId, ...completeBusiness }, loadingFirst: true })
  assert.equal(malformed.step, 3)
})
