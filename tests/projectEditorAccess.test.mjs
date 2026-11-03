import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const {
  STRIPE_SETUP_PATH,
  classifyProjectLoadStatus,
  createLatestLoadGuard,
  fetchProjectForEditor,
  projectWizardStripeRedirect,
  resolveProjectEditorView,
} = await import('../lib/projectEditorAccess.ts')

const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const tick = () => new Promise(resolve => setImmediate(resolve))
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// Shape of the local fixture professional exactly as `/api/auth/login` and
// `/api/auth/me` serialize it (values synthetic): approved and onboarded, but
// the payload carries no `stripe` object at all.
const approvedProWithoutStripe = Object.freeze({
  _id: 'pro1', role: 'professional', professionalStatus: 'approved',
  professionalOnboardingCompletedAt: '2026-11-03T08:00:00.000Z',
  isEmailVerified: true, isPhoneVerified: true, businessInfo: { city: 'Brussels', country: 'BE' },
})
const approvedProWithStripe = { ...approvedProWithoutStripe, stripe: { accountId: 'acct_x', onboardingCompleted: true } }
// Owned draft as GET /api/projects/:id returns it for that fixture.
const ownedDraft = Object.freeze({
  _id: 'draft1', professionalId: 'pro1', status: 'draft', currentStep: 6, title: 'QA draft wizard presence project',
  category: 'Interior', service: 'VAT Test Plumbing', priceModel: 'Fixed price', customerPresence: 'first_hour_only',
  media: { images: [], videos: [] },
})

test('editing an owned draft is not Stripe-gated: the reported fixture session reaches the editor', () => {
  // This redirect fired for the fixture and the onboarding page then bounced
  // the onboarded professional to /dashboard before the draft could render.
  assert.equal(projectWizardStripeRedirect(approvedProWithoutStripe, '/projects/create', '?id=draft1'), null)
  assert.equal(projectWizardStripeRedirect({ ...approvedProWithoutStripe, stripe: { accountId: 'acct_x', onboardingCompleted: false } }, '/projects/create', 'id=draft1'), null)
})

test('creating a new project still requires Stripe, and the target is reachable', () => {
  assert.equal(projectWizardStripeRedirect(approvedProWithoutStripe, '/projects/create', ''), STRIPE_SETUP_PATH)
  assert.equal(projectWizardStripeRedirect(approvedProWithoutStripe, '/projects/create', '?id='), STRIPE_SETUP_PATH)
  assert.equal(projectWizardStripeRedirect({ ...approvedProWithoutStripe, stripe: { accountId: 'acct_x' } }, '/projects/create', ''), STRIPE_SETUP_PATH)
  assert.equal(projectWizardStripeRedirect(approvedProWithStripe, '/projects/create', ''), null)
  assert.equal(STRIPE_SETUP_PATH.startsWith('/professional/onboarding'), false, 'onboarding redirects onboarded professionals to /dashboard')
  // Other roles and routes are left to the existing role/route guards.
  assert.equal(projectWizardStripeRedirect({ role: 'customer' }, '/projects/create', ''), null)
  assert.equal(projectWizardStripeRedirect(null, '/projects/create', ''), null)
  assert.equal(projectWizardStripeRedirect(approvedProWithoutStripe, '/dashboard', ''), null)
})

test('auth guard uses the shared rule instead of the self-defeating onboarding redirect', () => {
  const auth = readFileSync(new URL('../contexts/AuthContext.tsx', import.meta.url), 'utf8')
  const onboarding = readFileSync(new URL('../app/(pages)/professional/onboarding/page.tsx', import.meta.url), 'utf8')
  assert.match(auth, /projectWizardStripeRedirect\(currentUser, pathname, typeof window !== 'undefined' \? window\.location\.search : ''\)/)
  assert.doesNotMatch(auth, /onboarding\?step=\$\{ONBOARDING_STEPS\.STRIPE\}/)
  // Why onboarding cannot be the target: it pushes every onboarded professional away.
  assert.match(onboarding, /user\.professionalOnboardingCompletedAt \|\| \(user\.professionalStatus !== undefined && user\.professionalStatus !== 'draft'\)\)\s*\)\s*\{\s*router\.push\('\/dashboard'\)/)
})

test('editor view: delayed role hydration never exposes a blank form for an existing id', () => {
  const view = (authLoading, user, projectId, load) => resolveProjectEditorView({ authLoading, user, projectId, load })
  const idle = { status: 'idle' }
  // Boot: AuthProvider starts loading with no user.
  assert.equal(view(true, null, 'draft1', idle), 'checking-access')
  // A stale/partial user while /me is still running is not trusted either.
  assert.equal(view(true, { role: 'professional' }, 'draft1', idle), 'checking-access')
  // /me resolved: approved professional, load effect not committed yet.
  assert.equal(view(false, approvedProWithoutStripe, 'draft1', idle), 'loading-project')
  assert.equal(view(false, approvedProWithoutStripe, 'draft1', { status: 'loading', projectId: 'draft1' }), 'loading-project')
  // A finished load for another id does not count.
  assert.equal(view(false, approvedProWithoutStripe, 'draft1', { status: 'loaded', projectId: 'other' }), 'loading-project')
  assert.equal(view(false, approvedProWithoutStripe, 'draft1', { status: 'loaded', projectId: 'draft1' }), 'ready')
  assert.equal(view(false, approvedProWithoutStripe, 'draft1', { status: 'error', projectId: 'draft1', kind: 'failed' }), 'load-error')
  // New project: nothing to load.
  assert.equal(view(false, approvedProWithStripe, null, idle), 'ready')
})

test('new-project path without Stripe stays blocked, also after a query-only ?id= → no id navigation', () => {
  const idle = { status: 'idle' }
  // Editing an owned draft is allowed without Stripe...
  assert.equal(resolveProjectEditorView({ authLoading: false, user: approvedProWithoutStripe, projectId: 'draft1', load: { status: 'loaded', projectId: 'draft1' } }), 'ready')
  // ...the same pathname without ?id= is a new project and is not.
  assert.equal(resolveProjectEditorView({ authLoading: false, user: approvedProWithoutStripe, projectId: null, load: { status: 'loaded', projectId: 'draft1' } }), 'blocked')
  assert.equal(resolveProjectEditorView({ authLoading: false, user: approvedProWithoutStripe, projectId: null, load: idle }), 'blocked')
  assert.equal(resolveProjectEditorView({ authLoading: false, user: approvedProWithStripe, projectId: null, load: idle }), 'ready')
  // The page re-checks the redirect whenever the query id changes.
  const page = readFileSync(new URL('../app/(pages)/projects/create/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /const stripeRedirect = projectWizardStripeRedirect\(user, '\/projects\/create', projectId \? `\?id=\$\{encodeURIComponent\(projectId\)\}` : ''\)\s*if \(stripeRedirect\) router\.replace\(stripeRedirect\)\s*\}, \[loading, isAuthenticated, user, canCreateProjects, projectId, router, t\]\)/)
  assert.equal(projectWizardStripeRedirect(approvedProWithoutStripe, '/projects/create', ''), STRIPE_SETUP_PATH)
  assert.equal(projectWizardStripeRedirect(approvedProWithoutStripe, '/projects/create', '?id=draft1'), null)
})

test('editor view: non-professionals, unapproved professionals and signed-out visitors stay blocked', () => {
  const loaded = { status: 'loaded', projectId: 'draft1' }
  for (const user of [null, { role: 'customer' }, { role: 'admin' }, { role: 'employee' }, { role: 'professional', professionalStatus: 'pending' }, { role: 'professional', professionalStatus: 'suspended' }, { role: 'professional' }]) {
    assert.equal(resolveProjectEditorView({ authLoading: false, user, projectId: 'draft1', load: loaded }), 'blocked', JSON.stringify(user))
    assert.equal(resolveProjectEditorView({ authLoading: false, user, projectId: null, load: { status: 'idle' } }), 'blocked', JSON.stringify(user))
  }
})

test('draft GET sends cookie and bearer, and classifies failures', async () => {
  const calls = []
  const ok = await fetchProjectForEditor({ apiBase: 'http://api.test', projectId: 'draft1', token: 'tkn', fetchImpl: async (url, init) => { calls.push([url, init]); return json(ownedDraft) } })
  assert.deepEqual(ok, { ok: true, project: ownedDraft })
  assert.equal(calls[0][0], 'http://api.test/api/projects/draft1')
  assert.equal(calls[0][1].credentials, 'include')
  assert.equal(calls[0][1].headers.Authorization, 'Bearer tkn')
  // Cookie-only session (no stored token) still asks with credentials.
  await fetchProjectForEditor({ apiBase: '', projectId: 'draft1', token: null, fetchImpl: async (url, init) => { calls.push([url, init]); return json(ownedDraft) } })
  assert.equal('Authorization' in calls[1][1].headers, false)
  assert.equal(calls[1][1].credentials, 'include')

  for (const [status, kind] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [500, 'failed'], [502, 'failed']]) {
    const result = await fetchProjectForEditor({ apiBase: '', projectId: 'x', token: null, fetchImpl: async () => json({ error: 'nope' }, status) })
    assert.equal(result.ok, false); assert.equal(result.kind, kind); assert.equal(result.status, status)
    assert.equal(classifyProjectLoadStatus(status), kind)
  }
  const network = await fetchProjectForEditor({ apiBase: '', projectId: 'x', token: null, fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
  assert.equal(network.ok, false); assert.equal(network.kind, 'failed'); assert.ok(network.error instanceof TypeError)
  const unusable = await fetchProjectForEditor({ apiBase: '', projectId: 'x', token: null, fetchImpl: async () => json([]) })
  assert.equal(unusable.ok, false); assert.equal(unusable.kind, 'failed')
})

/**
 * Stand-in for the wizard page's load wiring: the same guard, fetch and view
 * resolver, with React's functional setState and effect mount/cleanup.
 */
function editorPage({ user, authLoading = false, projectId, fetchImpl }) {
  const page = { state: { load: { status: 'idle' }, projectData: { title: '' } }, auth: { user, authLoading }, guard: createLatestLoadGuard(), mounted: true, cleanups: [] }
  page.set = (key, value) => { page.state = { ...page.state, [key]: typeof value === 'function' ? value(page.state[key]) : value } }
  page.view = () => resolveProjectEditorView({ authLoading: page.auth.authLoading, user: page.auth.user, projectId, load: page.state.load })
  page.runEffect = () => {
    const canCreate = page.auth.user?.professionalStatus === 'approved'
    if (!projectId || !canCreate) return
    const isCurrent = page.guard.begin()
    page.set('load', { status: 'loading', projectId })
    const done = fetchProjectForEditor({ apiBase: '', projectId, token: null, fetchImpl }).then((result) => {
      if (!isCurrent() || !page.mounted) return
      if (!result.ok) { page.set('load', { status: 'error', projectId, kind: result.kind }); return }
      page.set('projectData', { ...result.project })
      page.set('load', { status: 'loaded', projectId })
    })
    page.cleanups.push(() => page.guard.invalidate())
    return done
  }
  page.cleanup = () => { page.cleanups.splice(0).forEach(fn => fn()) }
  return page
}

test('StrictMode double effect / remount: a late stale response cannot overwrite the current load', async () => {
  const responses = []
  const fetchImpl = () => { const d = deferred(); responses.push(d); return d.promise }
  const page = editorPage({ user: approvedProWithoutStripe, projectId: 'draft1', fetchImpl })
  const first = page.runEffect()
  page.cleanup() // StrictMode simulated unmount
  const second = page.runEffect()
  assert.equal(responses.length, 2)
  assert.equal(page.view(), 'loading-project')
  // Second (current) answer arrives first with the real draft.
  responses[1].resolve(json(ownedDraft))
  await second
  assert.equal(page.view(), 'ready')
  assert.equal(page.state.projectData.title, ownedDraft.title)
  // Then the superseded request returns stale/blank data: ignored.
  responses[0].resolve(json({ ...ownedDraft, title: '', customerPresence: undefined, currentStep: 1 }))
  await first; await tick()
  assert.equal(page.state.projectData.title, ownedDraft.title)
  assert.equal(page.state.projectData.customerPresence, 'first_hour_only')
  assert.equal(page.state.projectData.currentStep, 6)
})

test('auth hydrates after mount: the load starts only once approval is known, then the draft renders', async () => {
  const gets = []
  const page = editorPage({ user: null, authLoading: true, projectId: 'draft1', fetchImpl: async (url) => { gets.push(url); return json(ownedDraft) } })
  assert.equal(page.runEffect(), undefined)
  assert.equal(page.view(), 'checking-access')
  assert.equal(gets.length, 0)
  page.auth = { user: approvedProWithoutStripe, authLoading: false }
  assert.equal(page.view(), 'loading-project')
  await page.runEffect()
  assert.equal(gets.length, 1)
  assert.equal(page.view(), 'ready')
  assert.equal(page.state.projectData.customerPresence, 'first_hour_only')
})

test('a failed load is recoverable: error view, then retry loads the draft', async () => {
  let attempt = 0
  const page = editorPage({ user: approvedProWithoutStripe, projectId: 'draft1', fetchImpl: async () => (++attempt === 1 ? json({ error: 'boom' }, 500) : json(ownedDraft)) })
  await page.runEffect()
  assert.equal(page.view(), 'load-error')
  assert.equal(page.state.load.kind, 'failed')
  assert.equal(page.state.projectData.title, '', 'no partial data was applied')
  page.cleanup(); await page.runEffect() // retry bumps the effect dependency
  assert.equal(page.view(), 'ready')
  assert.equal(page.state.projectData.title, ownedDraft.title)
})

test("another owner's draft (404) and a revoked session (401/403) end in an error state, not a form", async () => {
  for (const [status, kind] of [[404, 'not_found'], [403, 'forbidden'], [401, 'unauthorized']]) {
    const page = editorPage({ user: approvedProWithoutStripe, projectId: 'theirs', fetchImpl: async () => json({ error: 'x' }, status) })
    await page.runEffect()
    assert.equal(page.view(), 'load-error', kind)
    assert.equal(page.state.load.kind, kind)
  }
})

test('unmounted before the answer: nothing is applied', async () => {
  const d = deferred()
  const page = editorPage({ user: approvedProWithoutStripe, projectId: 'draft1', fetchImpl: () => d.promise })
  const done = page.runEffect()
  page.mounted = false; page.cleanup()
  d.resolve(json(ownedDraft)); await done
  assert.equal(page.state.load.status, 'loading')
  assert.equal(page.state.projectData.title, '')
})

test('wizard page wiring: form gated on the editor view, latest-wins load, retry and back, self-assigned id stays loaded', () => {
  const page = readFileSync(new URL('../app/(pages)/projects/create/page.tsx', import.meta.url), 'utf8')
  const gate = page.indexOf("if (editorView !== 'ready') {")
  assert.ok(gate > 0, 'non-ready views return before the wizard renders')
  assert.ok(gate < page.indexOf('<WizardLayout'), 'gate precedes the wizard')
  assert.match(page, /resolveProjectEditorView\(\{\s*authLoading: loading,\s*user,\s*projectId,\s*load: projectLoad,/)
  const effect = page.slice(page.indexOf('const projectLoadGuardRef'), page.indexOf('const editorView = '))
  assert.match(effect, /projectId !== selfAssignedProjectIdRef\.current/)
  assert.match(effect, /const isCurrent = guard\.begin\(\)/)
  assert.match(effect, /if \(!isCurrent\(\) \|\| !mountedRef\.current\) return/)
  assert.match(effect, /return \(\) => guard\.invalidate\(\)/)
  assert.match(effect, /\[projectId, canCreateProjects, projectLoadAttempt\]/)
  assert.match(effect, /setStep1HydrationKey\(key => key \+ 1\)/)
  assert.doesNotMatch(effect, /setIsLoading/, 'the load no longer shares the save/submit busy flag')
  assert.match(page, /setProjectLoadAttempt\(attempt => attempt \+ 1\)/)
  assert.match(page, /router\.push\(PROJECT_MANAGE_PATH\)/)
  assert.match(page, /selfAssignedProjectIdRef\.current = savedProjectId\s+setProjectLoad\(\{ status: 'loaded', projectId: savedProjectId \}\)/)
})
