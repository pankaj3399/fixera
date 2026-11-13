// CMS auto-translation (admin UI + public note): behavioral tests for the
// backend contract v2 (async: save → `pending` → background run → poll).
//
// FIXTURE TESTS: every backend response here comes from a deterministic local
// fixture transport (stubbed `fetch`) that follows
// cr/cms-translate/API-CONTRACT.md v2. "Translated" text is a placeholder
// prefix, not a real translation. Nothing here calls a real backend or a
// translation provider, or proves translation quality.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

process.env.NEXT_PUBLIC_BACKEND_URL = 'http://backend.fixture'
register('./swc-loader.mjs', import.meta.url)

const cms = await import('@/lib/cms.ts')
const state = await import('@/lib/cmsTranslationState.ts')
const poller = await import('@/lib/cmsTranslationPoller.ts')
const { ApiRequestError, getErrorMessage } = await import('@/lib/apiErrors.ts')
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { default: CmsTranslationPanel } = await import('@/components/cms/CmsTranslationPanel.tsx')
const { default: MachineTranslatedNote } = await import('@/components/cms/MachineTranslatedNote.tsx')

const API = 'http://backend.fixture'
const LOCALES = ['en', 'nl', 'fr']
const ERROR_TEXT = {
  auth: "The translation service rejected the server's credentials.",
  quota_exceeded: 'The monthly translation quota is used up.',
  rate_limited: 'The translation service is rate limiting requests. Retry in a minute.',
}

// ---------------------------------------------------------------------------
// Fixture backend: an in-memory model of the v2 async semantics.
// ---------------------------------------------------------------------------
function createFixtureBackend({ configured = true, failLocales = {} } = {}) {
  const docs = new Map()
  const runs = new Map() // sourceId -> { queued, forceLocales, results: Map<locale, result> }
  let seq = 0
  let clock = 0
  const calls = []
  const nextId = () => `doc${String(++seq).padStart(4, '0')}`
  const tick = () => new Date(Date.UTC(2026, 10, 10, 12, 0, ++clock)).toISOString()
  const hashOf = (doc) => JSON.stringify([doc.title, doc.body, doc.excerpt])
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const runOf = (id) => {
    if (!runs.has(id)) runs.set(id, { queued: false, forceLocales: [], results: new Map() })
    return runs.get(id)
  }
  const targetsOf = (source) => LOCALES.filter((l) => l !== source.locale)
  const sourceOf = (doc) => (doc.translatedFrom ? docs.get(doc.translatedFrom) ?? doc : doc)
  const summary = (d) => ({
    _id: d._id, slug: d.slug, title: d.title, status: d.status, autoTranslated: d.autoTranslated === true,
    ...(d.translatedFrom ? { translatedFrom: d.translatedFrom } : {}), updatedAt: d.updatedAt,
  })
  const linkedOf = (source, locale) =>
    [...docs.values()].find((d) => d.locale === locale && d.translatedFrom === source._id)
  const sameSlugOf = (source, locale) =>
    [...docs.values()].find((d) => d.locale === locale && d.type === source.type && d.slug === source.slug && d._id !== source._id)

  function statusOf(id) {
    const source = sourceOf(docs.get(id))
    const run = runOf(source._id)
    const locales = LOCALES.map((locale) => {
      if (locale === source.locale) return { locale, state: 'source', document: summary(source) }
      const linked = linkedOf(source, locale)
      const row = linked ?? sameSlugOf(source, locale)
      let st = !row ? 'missing' : linked ? (linked.autoTranslated ? (linked.sourceHash === hashOf(source) ? 'up_to_date' : 'stale') : 'manual') : 'blocked'
      const lastResult = run.results.get(locale)
      if (run.queued && (st === 'missing' || st === 'stale')) st = 'pending'
      else if (run.queued && st === 'manual' && run.forceLocales.includes(locale)) st = 'pending'
      else if (lastResult?.status === 'failed' && (st === 'missing' || st === 'stale')) st = 'failed'
      return { locale, state: st, ...(row ? { document: summary(row) } : {}), ...(lastResult ? { lastResult } : {}) }
    })
    return { enabled: configured, sourceId: source._id, sourceLocale: source.locale, running: false, queued: run.queued, locales }
  }

  // Request-time step: never translates; queues the run when text is needed.
  function requestSync(source, forceLocales = []) {
    if (source.autoTranslated || source.translatedFrom) return []
    const run = runOf(source._id)
    const results = targetsOf(source).map((locale) => {
      const linked = linkedOf(source, locale)
      if (!linked && sameSlugOf(source, locale)) return { locale, status: 'skipped_manual' }
      if (linked && !linked.autoTranslated && !forceLocales.includes(locale)) return { locale, status: 'skipped_manual' }
      if (linked && linked.autoTranslated && linked.sourceHash === hashOf(source)) {
        linked.status = source.status
        return { locale, status: 'synced' }
      }
      if (!configured) return { locale, status: 'disabled' }
      return { locale, status: 'pending' }
    })
    if (results.some((r) => r.status === 'pending')) {
      run.queued = true
      run.forceLocales = forceLocales
    }
    return results
  }

  /** The background run (Vercel waitUntil in production). */
  function runQueue() {
    for (const [sourceId, run] of runs) {
      if (!run.queued) continue
      const source = docs.get(sourceId)
      for (const locale of targetsOf(source)) {
        const linked = linkedOf(source, locale)
        const needs = !linked ? !sameSlugOf(source, locale) : linked.autoTranslated ? linked.sourceHash !== hashOf(source) : run.forceLocales.includes(locale)
        if (!needs) continue
        const at = tick()
        if (failLocales[locale]) {
          run.results.set(locale, { locale, status: 'failed', errorCode: failLocales[locale], error: ERROR_TEXT[failLocales[locale]] ?? 'Translation failed.', at })
          continue
        }
        const text = { title: `[fixture-${locale}] ${source.title}`, body: `[fixture-${locale}] ${source.body ?? ''}` }
        if (linked) {
          Object.assign(linked, text, { autoTranslated: true, sourceHash: hashOf(source), status: source.status, updatedAt: at })
          run.results.set(locale, { locale, status: 'updated', at })
        } else {
          const _id = nextId()
          docs.set(_id, { _id, type: source.type, slug: source.slug, locale, ...text, status: source.status, autoTranslated: true, translatedFrom: source._id, sourceHash: hashOf(source), updatedAt: at })
          run.results.set(locale, { locale, status: 'created', at })
        }
      }
      run.queued = false
      run.forceLocales = []
    }
  }

  async function fetchImpl(input, init = {}) {
    const url = String(input)
    const method = (init.method || 'GET').toUpperCase()
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ url, method, body })
    if (url === '/api/cms/revalidate') return json(200, { ok: true })
    const path = url.replace(API, '')
    let m
    if (path === '/api/admin/cms' && method === 'POST') {
      const _id = nextId()
      const doc = { _id, autoTranslated: false, updatedAt: tick(), ...body }
      docs.set(_id, doc)
      const translations = requestSync(doc)
      return json(201, { success: true, translations, data: { ...doc, translationStatus: statusOf(_id) } })
    }
    if ((m = path.match(/^\/api\/admin\/cms\/(\w+)\/translate$/)) && method === 'POST') {
      const doc = docs.get(m[1])
      if (!doc) return json(404, { success: false, msg: 'Content not found' })
      const source = sourceOf(doc)
      const force = body?.force === true
      const forceLocales = force ? targetsOf(source).filter((l) => !body.locales || body.locales.includes(l)) : []
      const translations = requestSync(source, forceLocales)
      return json(200, { success: true, translations, data: statusOf(source._id) })
    }
    if ((m = path.match(/^\/api\/admin\/cms\/(\w+)\/translations$/)) && method === 'GET') {
      if (!docs.has(m[1])) return json(404, { success: false, msg: 'Content not found' })
      return json(200, { success: true, data: statusOf(m[1]) })
    }
    if ((m = path.match(/^\/api\/admin\/cms\/(\w+)$/))) {
      const doc = docs.get(m[1])
      if (!doc) return json(404, { success: false, msg: 'Content not found' })
      if (method === 'GET') return json(200, { success: true, data: { ...doc, translationStatus: statusOf(doc._id) } })
      if (method === 'DELETE') {
        docs.delete(doc._id)
        let deleted = 0
        let detached = 0
        for (const d of [...docs.values()]) {
          if (d.translatedFrom !== doc._id) continue
          if (d.autoTranslated) {
            docs.delete(d._id)
            deleted += 1
          } else {
            delete d.translatedFrom
            detached += 1
          }
        }
        return json(200, { success: true, msg: 'Content deleted', translationCleanup: { deleted, detached } })
      }
      if (method === 'PUT') {
        Object.assign(doc, body, { updatedAt: tick() })
        if (doc.autoTranslated) doc.autoTranslated = false // any admin save takes ownership
        const translations = requestSync(doc)
        return json(200, { success: true, translations, data: { ...doc, translationStatus: statusOf(doc._id) } })
      }
    }
    return json(404, { success: false, msg: `fixture: no route ${method} ${path}` })
  }

  return { docs, calls, fetchImpl, runQueue, statusOf, setConfigured: (v) => { configured = v } }
}

function withFetch(fetchImpl, fn) {
  const original = globalThis.fetch
  globalThis.fetch = fetchImpl
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = original
    })
}

const SOURCE = { type: 'blog', title: 'Roof repair', slug: 'roof-repair', locale: 'en', body: '<p>Hello</p>', status: 'draft' }
const statesOf = (status) => status.locales.map((l) => [l.locale, l.state])

// ---------------------------------------------------------------------------
// Adapter: async save → pending → background run → status
// ---------------------------------------------------------------------------
test('fixture: create returns pending results and a queued status; nothing is translated yet', async () => {
  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content, translations, status } = await cms.adminCreateCmsWithTranslations(SOURCE)
    assert.equal(content.title, 'Roof repair')
    assert.deepEqual(translations, [{ locale: 'nl', status: 'pending' }, { locale: 'fr', status: 'pending' }])
    assert.equal(status.queued, true)
    assert.equal(status.enabled, true)
    assert.deepEqual(statesOf(status), [['en', 'source'], ['nl', 'pending'], ['fr', 'pending']])
    assert.equal(cms.cmsTranslationInFlight(status), true)
    assert.equal([...backend.docs.values()].filter((d) => d.autoTranslated).length, 0, 'the save response precedes the run')
    assert.equal(backend.calls.filter((c) => c.url.endsWith('/translate')).length, 0, 'no extra translate call')
    assert.equal(backend.calls.filter((c) => c.url === '/api/cms/revalidate').length, 1)

    backend.runQueue()
    const settled = await cms.adminGetCmsTranslationStatus(content._id)
    assert.deepEqual(statesOf(settled), [['en', 'source'], ['nl', 'up_to_date'], ['fr', 'up_to_date']])
    assert.equal(cms.cmsTranslationInFlight(settled), false)
    assert.deepEqual(settled.locales.map((l) => l.lastResult?.status), [undefined, 'created', 'created'])
    assert.match(backend.calls.at(-1).url, /\/api\/admin\/cms\/doc0001\/translations$/)
  })
})

test('fixture: edits make translations stale → pending; manual translations are kept; machine save takes ownership', async () => {
  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    backend.runQueue()
    const again = await cms.adminUpdateCmsWithTranslations(content._id, { ...SOURCE })
    assert.deepEqual(again.translations.map((r) => r.status), ['synced', 'synced'])
    assert.equal(cms.cmsTranslationInFlight(again.status), false)

    const edited = await cms.adminUpdateCmsWithTranslations(content._id, { ...SOURCE, title: 'Roof repair guide' })
    assert.deepEqual(edited.translations.map((r) => r.status), ['pending', 'pending'])
    backend.runQueue()

    const nl = [...backend.docs.values()].find((d) => d.locale === 'nl')
    const nlSave = await cms.adminUpdateCmsWithTranslations(nl._id, { title: 'Dakreparatie (handmatig)' })
    assert.equal(nlSave.content.autoTranslated, false)
    assert.deepEqual(nlSave.translations, [], 'a translation is never a sync source')
    assert.equal(state.cmsTranslationRole(nlSave.content), 'manual')
    assert.equal(nlSave.status.sourceId, content._id, 'a translation reports its family status')
    assert.deepEqual(statesOf(nlSave.status), [['en', 'source'], ['nl', 'manual'], ['fr', 'up_to_date']])

    const afterManual = await cms.adminUpdateCmsWithTranslations(content._id, { ...SOURCE, title: 'Roof repair 2027' })
    assert.deepEqual(afterManual.translations, [{ locale: 'nl', status: 'skipped_manual' }, { locale: 'fr', status: 'pending' }])
    backend.runQueue()
    assert.equal(backend.docs.get(nl._id).title, 'Dakreparatie (handmatig)', 'manual text preserved')
  })
})

test('force payload: plain retry sends {force:false}; per-locale force sends its locales; never blocked ones', async () => {
  assert.deepEqual(cms.cmsTranslateRequestBody(), { force: false })
  assert.deepEqual(cms.cmsTranslateRequestBody({ locales: ['fr'] }), { force: false }, 'locales only travel with a force')
  assert.deepEqual(cms.cmsTranslateRequestBody({ force: true }), { force: true })
  assert.deepEqual(cms.cmsTranslateRequestBody({ force: true, locales: ['fr', 'xx', 'nl'] }), { force: true, locales: ['nl', 'fr'] })

  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    backend.runQueue()
    const nl = [...backend.docs.values()].find((d) => d.locale === 'nl')
    const fr = [...backend.docs.values()].find((d) => d.locale === 'fr')
    await cms.adminUpdateCmsWithTranslations(nl._id, { title: 'Handmatig NL' })
    await cms.adminUpdateCmsWithTranslations(fr._id, { title: 'Manuel FR' })

    const plain = await cms.adminTranslateCms(content._id)
    assert.deepEqual(backend.calls.findLast((c) => c.url.endsWith('/translate')).body, { force: false })
    assert.deepEqual(plain.translations.map((r) => r.status), ['skipped_manual', 'skipped_manual'])
    assert.deepEqual(state.cmsForceableLocales(plain.status), ['nl', 'fr'])

    // Per-row force on FR only.
    const forced = await cms.adminTranslateCms(content._id, { force: true, locales: ['fr'] })
    assert.deepEqual(backend.calls.findLast((c) => c.url.endsWith('/translate')).body, { force: true, locales: ['fr'] })
    assert.deepEqual(forced.translations, [{ locale: 'nl', status: 'skipped_manual' }, { locale: 'fr', status: 'pending' }])
    assert.deepEqual(statesOf(forced.status), [['en', 'source'], ['nl', 'manual'], ['fr', 'pending']])
    backend.runQueue()
    assert.match(backend.docs.get(fr._id).title, /^\[fixture-fr\]/)
    assert.equal(backend.docs.get(nl._id).title, 'Handmatig NL')
    // Retrying from a translation id runs from its origin (origin text untouched).
    await cms.adminTranslateCms(nl._id)
    assert.equal(backend.docs.get(content._id).title, 'Roof repair')
  })

  // A blocked locale is never in the force list, even when every other one is manual.
  const blocked = {
    enabled: true, sourceId: 's', sourceLocale: 'en', running: false, queued: false,
    locales: [
      { locale: 'en', state: 'source' },
      { locale: 'nl', state: 'blocked', document: { _id: 'x', slug: 'roof', title: 'Other', status: 'published', autoTranslated: false } },
      { locale: 'fr', state: 'manual', document: { _id: 'f', slug: 'roof', title: 'Toit', status: 'draft', autoTranslated: false, translatedFrom: 's' } },
    ],
  }
  assert.deepEqual(state.cmsForceableLocales(blocked), ['fr'])
  assert.deepEqual(state.cmsLocaleRowActions(blocked.locales[1], blocked, true), { retry: false, force: false })
  assert.deepEqual(state.cmsLocaleRowActions(blocked.locales[2], blocked, true), { retry: false, force: true })
  const html = renderPanel({ status: blocked })
  assert.match(html, /Overwrite manual translations \(FR\)/)
  assert.equal(html.match(/data-row-action="force"/g)?.length, 1, 'only the manual row offers a force')
})

test('fixture: unconfigured translator → disabled results, enabled:false status, banner, no retry', async () => {
  const backend = createFixtureBackend({ configured: false })
  await withFetch(backend.fetchImpl, async () => {
    const { content, translations, status } = await cms.adminCreateCmsWithTranslations(SOURCE)
    assert.ok(content._id, 'content is saved even without a provider')
    assert.deepEqual(translations.map((r) => r.status), ['disabled', 'disabled'])
    assert.equal(status.enabled, false)
    assert.equal(cms.cmsTranslationInFlight(status), false, 'nothing to poll')
    const outcome = state.summarizeCmsTranslationOutcome(translations, { trigger: 'save', expectResults: true })
    assert.equal(outcome.tone, 'info')
    assert.match(outcome.message, /^Content saved\. Automatic translation is not configured/)
    assert.match(outcome.message, /NL, FR were not translated/)
    assert.doesNotMatch(outcome.message, /AZURE|KEY|OPENAI/i, 'no secret names in UI copy')
    assert.deepEqual(state.cmsTranslationActions(status), { retry: false, forceLocales: [] })

    // GET-by-id carries translationStatus.enabled at load (the "disabled flag at load").
    const loaded = await cms.adminGetCms(content._id)
    assert.equal(cms.normalizeCmsTranslationStatus(loaded.translationStatus).enabled, false)
  })
})

test('fixture: a provider failure is persisted per locale with its code and the admin-safe text', async () => {
  const backend = createFixtureBackend({ failLocales: { fr: 'rate_limited' } })
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    backend.runQueue()
    const status = await cms.adminGetCmsTranslationStatus(content._id)
    assert.deepEqual(statesOf(status), [['en', 'source'], ['nl', 'up_to_date'], ['fr', 'failed']])
    const fr = status.locales[2].lastResult
    assert.equal(fr.errorCode, 'rate_limited')
    assert.equal(fr.error, ERROR_TEXT.rate_limited)
    assert.deepEqual(state.summarizeCmsTranslationSettled(status), {
      tone: 'warning', message: 'Translation failed for FR. See Translations for details.',
    })
    assert.deepEqual(state.cmsLocaleRowActions(status.locales[2], status, true), { retry: true, force: false })
  })
})

test('fixture: rejected save/translate/status throw ApiRequestError with the status and never revalidate', async () => {
  const calls = []
  const respond = (status, body, type = 'application/json') => async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' })
    if (String(url).endsWith('/api/admin/cms/abc') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({ success: true, data: { _id: 'abc', type: 'blog', slug: 's' } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } })
  }

  await withFetch(respond(403, { success: false, msg: 'You do not have permission to manage CMS' }), async () => {
    await assert.rejects(cms.adminTranslateCms('abc', { force: true }), (err) => {
      assert.ok(err instanceof ApiRequestError)
      assert.equal(err.status, 403)
      return true
    })
  })
  await withFetch(respond(404, { success: false, msg: 'Content not found' }), async () => {
    await assert.rejects(cms.adminGetCmsTranslationStatus('gone'), (err) => err.status === 404)
  })
  await withFetch(respond(200, { success: true, data: { nope: true } }), async () => {
    await assert.rejects(cms.adminGetCmsTranslationStatus('abc'), (err) => err.kind === 'invalidResponse')
  })
  await withFetch(respond(502, '<html>Bad gateway</html>', 'text/html'), async () => {
    await assert.rejects(cms.adminUpdateCmsWithTranslations('abc', { title: 'x' }), (err) => err.kind === 'invalidResponse')
  })
  await withFetch(respond(201, { success: true, translations: [] }), async () => {
    await assert.rejects(cms.adminCreateCmsWithTranslations(SOURCE), (err) => err.kind === 'invalidResponse')
  })
  assert.equal(calls.filter((c) => c.url === '/api/cms/revalidate').length, 0)
  assert.equal(
    getErrorMessage(new TypeError('Failed to fetch'), 'Translation request failed. Your content and unsaved edits are unchanged.').includes('Failed to fetch'),
    false
  )
})

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------
test('normalizeCmsTranslationResults is defensive and never upgrades unknown statuses', () => {
  assert.deepEqual(cms.normalizeCmsTranslationResults(undefined), [])
  assert.deepEqual(cms.normalizeCmsTranslationResults({ nl: 'created' }), [])
  assert.deepEqual(
    cms.normalizeCmsTranslationResults([
      null,
      { locale: ' NL ', status: 'pending' },
      { status: 'failed', errorCode: 'internal', error: 'Translation sync crashed' },
      { locale: 'fr', status: 'translated' },
      { locale: 'fr', status: 'failed', errorCode: 'quota_exceeded', error: '  ' },
      { locale: 'fr', status: 'failed', errorCode: 'made_up', error: 'x' },
      { locale: 'nl', status: 'created', errorCode: 'auth' },
    ]),
    [
      { locale: 'nl', status: 'pending' },
      { locale: '*', status: 'failed', errorCode: 'internal', error: 'Translation sync crashed' },
      { locale: 'fr', status: 'failed', error: 'Unexpected translation response' },
      { locale: 'fr', status: 'failed', errorCode: 'quota_exceeded' },
      { locale: 'fr', status: 'failed', error: 'x' },
      { locale: 'nl', status: 'created' },
    ]
  )
})

test('normalizeCmsTranslationStatus: contract shape, CMS order, unknown state → failed, enabled only when true', () => {
  assert.equal(cms.normalizeCmsTranslationStatus(undefined), undefined)
  assert.equal(cms.normalizeCmsTranslationStatus({ locales: [] }), undefined, 'needs sourceId')
  const status = cms.normalizeCmsTranslationStatus({
    enabled: 'yes', sourceId: 's1', sourceLocale: 'NL', running: 1, queued: true, lastRunAt: '2026-11-10T00:00:00.000Z',
    locales: [
      { locale: 'fr', state: 'weird', lastResult: { locale: 'fr', status: 'failed', errorCode: 'auth', error: 'Bad key', at: '2026-11-10T00:00:00.000Z' } },
      { locale: 'nl', state: 'source', document: { _id: 's1', slug: 'dak', title: 'Dak', status: 'published', autoTranslated: false } },
      { locale: 'en', state: 'manual', document: { _id: 'e1', slug: 'roof', title: 'Roof', status: 'nope', autoTranslated: 0, translatedFrom: 's1' } },
      { locale: 'de', state: 'missing' },
      { locale: 'en', state: 'missing' },
    ],
  })
  assert.equal(status.enabled, false)
  assert.equal(status.running, false)
  assert.equal(status.queued, true)
  assert.equal(status.sourceLocale, 'nl')
  assert.deepEqual(status.locales.map((l) => [l.locale, l.state]), [['en', 'manual'], ['nl', 'source'], ['fr', 'failed']])
  assert.deepEqual(status.locales[0].document, { _id: 'e1', slug: 'roof', title: 'Roof', status: 'draft', autoTranslated: false, translatedFrom: 's1' })
  assert.deepEqual(status.locales[2].lastResult, { locale: 'fr', status: 'failed', errorCode: 'auth', error: 'Bad key', at: '2026-11-10T00:00:00.000Z' })
})

// ---------------------------------------------------------------------------
// Polling (fake timers, injected visibility)
// ---------------------------------------------------------------------------
function fakeTimers() {
  let nextHandle = 0
  const pending = new Map()
  return {
    set(fn, ms) { const h = ++nextHandle; pending.set(h, { fn, ms }); return h },
    clear(h) { pending.delete(h) },
    get size() { return pending.size },
    get delays() { return [...pending.values()].map((t) => t.ms) },
    /** Fires every timer due now and lets the resulting fetch settle. */
    async fire() {
      const due = [...pending.entries()]
      pending.clear()
      for (const [, t] of due) t.fn()
      await flush()
    },
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

const inFlight = (extra = {}) => ({
  enabled: true, sourceId: 's', sourceLocale: 'en', running: true, queued: false,
  locales: [{ locale: 'en', state: 'source' }, { locale: 'nl', state: 'pending' }, { locale: 'fr', state: 'pending' }],
  ...extra,
})
const settledStatus = () => ({
  enabled: true, sourceId: 's', sourceLocale: 'en', running: false, queued: false,
  locales: [{ locale: 'en', state: 'source' }, { locale: 'nl', state: 'up_to_date' }, { locale: 'fr', state: 'up_to_date' }],
})

function makePoller({ responses, visibility, maxAttempts } = {}) {
  const timers = fakeTimers()
  const events = []
  const signals = []
  let fetches = 0
  const queue = [...(responses ?? [])]
  const p = poller.createCmsTranslationPoller({
    timers,
    visibility,
    maxAttempts,
    fetchStatus(signal) {
      fetches += 1
      signals.push(signal)
      const next = queue.shift()
      if (typeof next === 'function') return next()
      if (next instanceof Error) return Promise.reject(next)
      return Promise.resolve(next ?? inFlight())
    },
    onStatus: (s) => events.push(['status', cms.cmsTranslationInFlight(s) ? 'pending' : 'done']),
    onSettled: (s, info) => events.push(['settled', info.observedWork]),
    onTimeout: () => events.push(['timeout']),
    onFatal: (err) => events.push(['fatal', err.status]),
  })
  return { p, timers, events, signals, get fetches() { return fetches } }
}

test('polling: starts from an in-flight save status, polls every 2s, stops and reports once settled', async () => {
  assert.equal(poller.CMS_TRANSLATION_POLL_INTERVAL_MS, 2000)
  assert.equal(poller.CMS_TRANSLATION_POLL_INTERVAL_MS * poller.CMS_TRANSLATION_POLL_MAX_ATTEMPTS, 120000, '~2 min budget')
  const h = makePoller({ responses: [inFlight(), inFlight({ running: false, queued: true }), settledStatus()] })
  h.p.start(inFlight())
  assert.equal(h.fetches, 0, 'the save already returned a status; first poll after the interval')
  assert.deepEqual(h.timers.delays, [2000])
  await h.timers.fire()
  await h.timers.fire()
  await h.timers.fire()
  assert.equal(h.fetches, 3)
  assert.deepEqual(h.events, [['status', 'pending'], ['status', 'pending'], ['status', 'done'], ['settled', true]])
  assert.equal(h.timers.size, 0, 'nothing scheduled after settling')
  assert.equal(h.p.isActive(), false)
})

test('polling: nothing to poll for a settled status; load without a status fetches at once', async () => {
  const idle = makePoller()
  idle.p.start(settledStatus())
  assert.equal(idle.fetches, 0)
  assert.equal(idle.timers.size, 0)

  const load = makePoller({ responses: [settledStatus()] })
  load.p.start()
  await flush()
  assert.equal(load.fetches, 1)
  assert.deepEqual(load.events, [['status', 'done'], ['settled', false]], 'no run observed → no cache flush')

  const expected = makePoller({ responses: [settledStatus()] })
  expected.p.start(undefined, { expectWork: true })
  await flush()
  assert.deepEqual(expected.events.at(-1), ['settled', true], 'a save that queued work still flushes')
})

test('polling: gives up after the attempt budget with a timeout, and transient 5xx keep it going', async () => {
  const err5xx = Object.assign(new Error('Bad gateway'), { status: 502 })
  const h = makePoller({ maxAttempts: 3, responses: [inFlight(), err5xx, inFlight(), inFlight()] })
  h.p.start(inFlight())
  for (let i = 0; i < 5; i += 1) await h.timers.fire()
  assert.equal(h.fetches, 3)
  assert.deepEqual(h.events, [['status', 'pending'], ['status', 'pending'], ['timeout']])
  assert.equal(h.timers.size, 0)
  assert.equal(h.p.isActive(), false)
  // "Check again" restarts a fresh budget.
  h.p.start(undefined, { expectWork: true })
  await flush()
  assert.equal(h.fetches, 4)
  assert.equal(h.p.isActive(), true)
  h.p.dispose()
})

test('polling: a 4xx stops it for good', async () => {
  const gone = Object.assign(new Error('Content not found'), { status: 404 })
  const h = makePoller({ responses: [gone] })
  h.p.start(inFlight())
  await h.timers.fire()
  assert.deepEqual(h.events, [['fatal', 404]])
  assert.equal(h.timers.size, 0)
  assert.equal(h.p.isActive(), false)
})

test('polling: never overlaps requests; stop/dispose aborts the one in flight and ignores its late answer', async () => {
  let release
  const slow = () => new Promise((resolve) => { release = resolve })
  const h = makePoller({ responses: [slow] })
  h.p.start(inFlight())
  await h.timers.fire()
  assert.equal(h.fetches, 1)
  assert.equal(h.timers.size, 0, 'no timer while a request is in flight → no overlap')
  h.p.stop()
  assert.equal(h.signals[0].aborted, true)
  release(settledStatus())
  await flush()
  assert.deepEqual(h.events, [], 'a stopped poller reports nothing')

  // Restarting mid-request abandons the old request too.
  let releaseOld
  const r = makePoller({ responses: [() => new Promise((resolve) => { releaseOld = resolve }), settledStatus()] })
  r.p.start()
  r.p.start()
  assert.equal(r.signals[0].aborted, true)
  await flush()
  releaseOld(inFlight())
  await flush()
  assert.deepEqual(r.events, [['status', 'done'], ['settled', false]])
})

test('polling: pauses while the tab is hidden and polls at once when it is visible again; unmount unsubscribes', async () => {
  let hidden = false
  const listeners = new Set()
  const visibility = {
    isHidden: () => hidden,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
  const h = makePoller({ visibility, responses: [inFlight(), settledStatus()] })
  h.p.start(inFlight())
  hidden = true
  await h.timers.fire()
  assert.equal(h.fetches, 0, 'no request while hidden')
  assert.equal(h.timers.size, 0, 'no busy loop while hidden')
  hidden = false
  for (const l of listeners) l()
  await flush()
  assert.equal(h.fetches, 1, 'polls right away on return')
  await h.timers.fire()
  assert.deepEqual(h.events.at(-1), ['settled', true])
  h.p.dispose()
  assert.equal(listeners.size, 0)
})

test('hook wiring: the status hook disposes its poller on unmount and only flushes after observed work', () => {
  const src = readFileSync(new URL('../components/cms/useCmsTranslationStatus.ts', import.meta.url), 'utf8')
  assert.match(src, /return \(\) => \{\s*poller\.dispose\(\);/)
  assert.match(src, /if \(observedWork\) onSettledRef\.current\(next\)/)
  assert.match(src, /visibility: documentVisibility\(\)/)
})

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
test('badge mapping covers every LocaleTranslationState', () => {
  assert.deepEqual([...cms.CMS_LOCALE_TRANSLATION_STATES].sort(), Object.keys(state.CMS_LOCALE_STATE_BADGES).sort())
  const expected = {
    source: ['Original', 'neutral'],
    pending: ['Translating…', 'progress'],
    up_to_date: ['Up to date', 'success'],
    stale: ['Out of date', 'warning'],
    missing: ['Not translated', 'neutral'],
    failed: ['Failed', 'error'],
    manual: ['Manual', 'info'],
    blocked: ['Blocked: unlinked page uses this slug', 'warning'],
  }
  for (const [st, [label, tone]] of Object.entries(expected)) {
    assert.deepEqual(state.cmsLocaleStateBadge(st), { label, tone }, st)
  }
  assert.equal(state.cmsLocaleStateBadge('nonsense').label, 'Failed', 'unknown never reads as success')
})

test('row actions: retry for missing/stale/failed, force for manual, nothing for blocked, auth/quota, disabled or in flight', () => {
  const base = settledStatus()
  const row = (st, lastResult) => ({ locale: 'fr', state: st, ...(lastResult ? { lastResult } : {}) })
  const failedWith = (errorCode) => ({ locale: 'fr', status: 'failed', errorCode, error: ERROR_TEXT[errorCode] ?? 'x', at: '' })
  assert.deepEqual(state.cmsLocaleRowActions(row('missing'), base, true), { retry: true, force: false })
  assert.deepEqual(state.cmsLocaleRowActions(row('stale'), base, true), { retry: true, force: false })
  assert.deepEqual(state.cmsLocaleRowActions(row('failed', failedWith('timeout')), base, true), { retry: true, force: false })
  assert.deepEqual(state.cmsLocaleRowActions(row('manual'), base, true), { retry: false, force: true })
  for (const st of ['source', 'up_to_date', 'blocked', 'pending']) {
    assert.deepEqual(state.cmsLocaleRowActions(row(st), base, true), { retry: false, force: false }, st)
  }
  for (const code of ['auth', 'quota_exceeded']) {
    assert.equal(state.isNonRetryableCmsTranslationError(code), true)
    assert.deepEqual(state.cmsLocaleRowActions(row('failed', failedWith(code)), base, true), { retry: false, force: false }, code)
  }
  assert.deepEqual(state.cmsLocaleRowActions(row('manual'), { ...base, enabled: false }, true), { retry: false, force: false })
  assert.deepEqual(state.cmsLocaleRowActions(row('manual'), { ...base, queued: true }, true), { retry: false, force: false })
  assert.deepEqual(state.cmsLocaleRowActions(row('missing'), base, false), { retry: false, force: false }, 'RBAC')
})

test('family actions: retry hidden for auth/quota failures and when disabled; shown without a status', () => {
  const withFailure = (errorCode) => ({
    ...settledStatus(),
    locales: [
      { locale: 'en', state: 'source' },
      { locale: 'nl', state: 'failed', lastResult: { locale: 'nl', status: 'failed', errorCode, error: ERROR_TEXT[errorCode], at: '' } },
      { locale: 'fr', state: 'missing' },
    ],
  })
  for (const code of ['auth', 'quota_exceeded']) {
    const actions = state.cmsTranslationActions(withFailure(code))
    assert.equal(actions.retry, false, code)
    assert.equal(actions.retryBlockedBy.errorCode, code)
    assert.deepEqual(state.cmsLocaleRowActions(withFailure(code).locales[2], withFailure(code), true).retry, false,
      `${code} is provider-wide: no row retry either`)
  }
  assert.equal(state.cmsTranslationActions(withFailure('rate_limited')).retry, true)
  assert.deepEqual(state.cmsTranslationActions(undefined), { retry: true, forceLocales: [] })
})

test('outcome copy follows server statuses exactly', () => {
  const s = (results, options) => state.summarizeCmsTranslationOutcome(results, options)
  assert.deepEqual(s([{ locale: 'nl', status: 'pending' }, { locale: 'fr', status: 'synced' }], { trigger: 'save' }),
    { tone: 'info', message: 'Content saved. Translating NL in the background…' })
  assert.deepEqual(s([{ locale: 'fr', status: 'pending' }], { trigger: 'retranslate', force: true }),
    { tone: 'info', message: 'Overwriting FR in the background…' })
  assert.equal(s([{ locale: 'nl', status: 'synced' }], { trigger: 'save' }), null)
  assert.equal(s([], { trigger: 'save' }), null, 'translations are silent for non-source docs')
  assert.match(s([], { trigger: 'save', expectResults: true }).message, /did not report any automatic translation/)
  assert.equal(s([{ locale: '*', status: 'failed', error: 'x' }], { trigger: 'retranslate' }).message,
    'Translation failed for all locales. Your saved content is kept; see Translations.')
  assert.deepEqual(s([{ locale: 'nl', status: 'skipped_manual' }, { locale: 'fr', status: 'synced' }], { trigger: 'retranslate' }),
    { tone: 'info', message: 'Translations are up to date. Manual translations kept for NL.' })
  assert.equal(s([{ locale: 'nl', status: 'disabled' }, { locale: 'fr', status: 'failed' }], { trigger: 'save' }).tone, 'warning')
  assert.deepEqual(state.summarizeCmsTranslationSettled(settledStatus()), { tone: 'success', message: 'Translations finished' })
})

test('panel state: results from a save are stale when the form changed during the request', () => {
  const results = [{ locale: 'nl', status: 'pending' }]
  const concurrent = state.cmsTranslationPanelAfterRun(results, 'save', { current: 4, saved: 3 })
  assert.deepEqual(concurrent, { results, source: 'save', stale: true })
  const clean = state.cmsTranslationPanelAfterRun(results, 'save', { current: 3, saved: 3 })
  assert.equal(clean.stale, false)
  assert.equal(state.cmsTranslationPanelAfterEdit(clean).stale, true)
  assert.equal(state.cmsTranslationPanelAfterEdit(state.INITIAL_CMS_TRANSLATION_PANEL), state.INITIAL_CMS_TRANSLATION_PANEL)
})

test('translation role and targets', () => {
  assert.equal(state.cmsTranslationRole({}), 'source')
  assert.equal(state.cmsTranslationRole({ autoTranslated: true, translatedFrom: 'a' }), 'machine')
  assert.equal(state.cmsTranslationRole({ autoTranslated: false, translatedFrom: { _id: 'a' } }), 'manual')
  assert.equal(state.cmsTranslationRole({ translatedFrom: '' }), 'source')
  assert.deepEqual(state.cmsTranslationTargets('nl'), ['en', 'fr'])
  assert.deepEqual(state.cmsTranslationTargets('xx'), ['nl', 'fr'])
})

test('after a run: detects when the server rewrote the open translation (by updatedAt), never a source', () => {
  const status = {
    ...settledStatus(),
    locales: [
      { locale: 'en', state: 'source', document: { _id: 'en1', updatedAt: 'T9' } },
      { locale: 'nl', state: 'up_to_date', document: { _id: 'nl1', updatedAt: 'T2' } },
      { locale: 'fr', state: 'manual', document: { _id: 'fr1', updatedAt: 'T1' } },
    ],
  }
  assert.equal(state.cmsStatusRewroteDoc(status, { _id: 'nl1', autoTranslated: true, translatedFrom: 'en1', updatedAt: 'T1' }), true)
  assert.equal(state.cmsStatusRewroteDoc(status, { _id: 'fr1', translatedFrom: 'en1', updatedAt: 'T1' }), false)
  assert.equal(state.cmsStatusRewroteDoc(status, { _id: 'en1', updatedAt: 'T1' }), false, 'a source is never rewritten')
})

test('create→edit stash is one-shot and survives broken storage', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  state.stashCmsTranslationResults('id1', [{ locale: 'nl', status: 'pending' }], storage)
  assert.deepEqual(state.takeStashedCmsTranslationResults('id1', storage), [{ locale: 'nl', status: 'pending' }])
  assert.deepEqual(state.takeStashedCmsTranslationResults('id1', storage), [])
  state.stashCmsTranslationResults('id2', [], storage)
  assert.equal(store.size, 0)
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') }, removeItem() {} }
  assert.doesNotThrow(() => state.stashCmsTranslationResults('id3', [{ locale: 'fr', status: 'failed' }], broken))
  assert.deepEqual(state.takeStashedCmsTranslationResults('id3', broken), [])
  assert.deepEqual(state.takeStashedCmsTranslationResults('id3', null), [])
})

test('RBAC: translation actions need cms write access and fail closed', () => {
  const can = state.canManageCmsTranslations
  assert.equal(can(null), false)
  assert.equal(can({ role: 'customer', adminRole: 'super' }), false)
  assert.equal(can({ role: 'admin', adminRole: 'super' }), true)
  assert.equal(can({ role: 'admin', adminRole: 'marketing', adminAccessLevels: { cms: 'write' } }), true)
  assert.equal(can({ role: 'admin', adminRole: 'marketing', adminAccessLevels: { cms: 'read' } }), false)
  assert.equal(can({ role: 'admin', adminRole: 'care', adminAccessLevels: { bookings: 'write' } }), false)
  assert.equal(can({ role: 'admin', adminRole: 'content_creator', adminPermissions: ['cms.manage'] }), true)
  assert.equal(can({ role: 'admin', adminRole: 'care', adminPermissions: ['bookings.read'] }), false)
  assert.equal(can({ role: 'admin', adminRole: 'marketing' }), false, 'missing payload is not access')
})

// ---------------------------------------------------------------------------
// Rendered panel (server-rendered markup of the real component)
// ---------------------------------------------------------------------------
function renderPanel(props) {
  return renderToStaticMarkup(
    React.createElement(CmsTranslationPanel, {
      mode: 'edit', type: 'blog', role: 'source', currentId: 'en1', targets: ['nl', 'fr'],
      panel: state.INITIAL_CMS_TRANSLATION_PANEL, status: undefined, loadState: 'ready', phase: 'idle',
      saving: false, translating: false, busy: false, canManage: true,
      onRetry() {}, onForce() {}, onRefresh() {}, ...props,
    })
  )
}

const doc = (id, slug, extra = {}) => ({ _id: id, slug, title: `T-${id}`, status: 'draft', autoTranslated: false, ...extra })

test('rendered panel: a badge for every state, this-page marker, edit and live links', () => {
  const statuses = [
    ['source', 'pending', 'up_to_date'],
    ['source', 'stale', 'missing'],
    ['source', 'failed', 'manual'],
    ['source', 'blocked', 'missing'],
  ]
  const seen = new Set()
  for (const [en, nl, fr] of statuses) {
    const status = {
      ...settledStatus(),
      queued: nl === 'pending',
      locales: [
        { locale: 'en', state: en, document: doc('en1', 'roof', { status: 'published' }) },
        { locale: 'nl', state: nl, ...(nl !== 'missing' ? { document: doc('nl1', 'roof', { status: 'published', autoTranslated: nl !== 'blocked' }) } : {}) },
        { locale: 'fr', state: fr, ...(fr !== 'missing' ? { document: doc('fr1', 'roof') } : {}) },
      ],
    }
    const html = renderPanel({ status })
    for (const [locale, st] of [['en', en], ['nl', nl], ['fr', fr]]) {
      assert.match(html, new RegExp(`data-locale-row="${locale}" data-locale-state="${st}"`))
      assert.match(html, new RegExp(`data-state-badge="${st}"[^>]*>(<svg[\\s\\S]*?</svg>)?${state.CMS_LOCALE_STATE_BADGES[st].label}<`), `${st} badge`)
      seen.add(st)
    }
    assert.match(html, /· this page/)
    assert.doesNotMatch(html, /href="\/admin\/cms\/en1\/edit"/, 'no edit link to the page itself')
  }
  assert.deepEqual([...seen].sort(), [...cms.CMS_LOCALE_TRANSLATION_STATES].sort())

  const links = renderPanel({ status: {
    ...settledStatus(),
    locales: [
      { locale: 'en', state: 'source', document: doc('en1', 'roof') },
      { locale: 'nl', state: 'up_to_date', document: doc('nl1', 'roof', { status: 'published', autoTranslated: true }) },
      { locale: 'fr', state: 'up_to_date', document: doc('fr1', 'roof', { autoTranslated: true }) },
    ],
  } })
  assert.match(links, /href="\/admin\/cms\/nl1\/edit" target="_blank"/)
  assert.match(links, /href="\/nl\/blog\/roof"/, 'published version links to its language-prefixed live page')
  assert.doesNotMatch(links, /href="\/fr\/blog\/roof"/, 'drafts have no live page')
  assert.doesNotMatch(links, /\?lang=/, 'live links use the language prefix, not ?lang=')
  assert.match(links, /never overwritten without your confirmation/)
})

test('rendered panel: disabled banner comes from status.enabled (results only as a fallback)', () => {
  const off = renderPanel({ status: { ...settledStatus(), enabled: false } })
  assert.match(off, /data-testid="cms-translation-disabled"/)
  assert.match(off, /Auto-translate is disabled on the server/)
  assert.doesNotMatch(off, /cms-translation-retry"/, 'no retry while disabled')

  const on = renderPanel({ status: settledStatus(), panel: { results: [{ locale: 'nl', status: 'disabled' }], source: 'save', stale: false } })
  assert.doesNotMatch(on, /cms-translation-disabled/, 'the status is the source of truth')

  const fallback = renderPanel({ status: undefined, loadState: 'error', panel: { results: [{ locale: 'nl', status: 'disabled' }], source: 'save', stale: false } })
  assert.match(fallback, /cms-translation-disabled/)
})

test('rendered panel: Retry hidden for auth and quota errors (text verbatim), shown for retryable ones', () => {
  for (const code of ['auth', 'quota_exceeded']) {
    const status = {
      ...settledStatus(),
      locales: [
        { locale: 'en', state: 'source', document: doc('en1', 'roof') },
        { locale: 'nl', state: 'failed', lastResult: { locale: 'nl', status: 'failed', errorCode: code, error: ERROR_TEXT[code], at: '2026-11-10T12:00:00.000Z' } },
        { locale: 'fr', state: 'up_to_date', document: doc('fr1', 'roof', { autoTranslated: true }) },
      ],
    }
    const html = renderPanel({ status })
    assert.doesNotMatch(html, /data-testid="cms-translation-retry"/, code)
    assert.doesNotMatch(html, /data-row-action="retry"/, code)
    assert.match(html, /data-testid="cms-translation-retry-blocked"/)
    assert.match(html, new RegExp(`data-translation-error="${code}"`))
    const escaped = ERROR_TEXT[code].replace("'", '&#x27;')
    assert.ok(html.includes(escaped), `${code} error shown verbatim`)
  }
  const retryable = renderPanel({ status: {
    ...settledStatus(),
    locales: [
      { locale: 'en', state: 'source' },
      { locale: 'nl', state: 'failed', lastResult: { locale: 'nl', status: 'failed', errorCode: 'rate_limited', error: ERROR_TEXT.rate_limited, at: '' } },
      { locale: 'fr', state: 'missing' },
    ],
  } })
  assert.match(retryable, /data-testid="cms-translation-retry"/)
  assert.equal(retryable.match(/data-row-action="retry"/g)?.length, 2)
  assert.ok(retryable.includes(ERROR_TEXT.rate_limited))
})

test('rendered panel: polling, timeout and load states never claim "Not translated" without data', () => {
  const polling = renderPanel({ status: inFlight(), phase: 'polling' })
  assert.match(polling, /data-testid="cms-translation-polling"/)
  assert.match(polling, /cms-translation-retry"[^>]*disabled=""/, 'retry disabled while a run is pending')
  assert.doesNotMatch(polling, /data-row-action=/)

  const timedOut = renderPanel({ status: inFlight(), phase: 'timed_out' })
  assert.match(timedOut, /data-testid="cms-translation-timeout"/)
  assert.match(timedOut, /Still translating\. Refresh later/)
  assert.match(timedOut, /Check again/)

  const loading = renderPanel({ status: undefined, loadState: 'loading', phase: 'polling' })
  assert.match(loading, /Loading…/)
  assert.doesNotMatch(loading, /Not translated/)
  const failed = renderPanel({ status: undefined, loadState: 'error' })
  assert.match(failed, /Couldn&#x27;t load the translation status/)
  assert.doesNotMatch(failed, /Not translated/)
  assert.doesNotMatch(failed, /cms-translation-force/, 'no force without knowing the manual locales')

  const crash = renderPanel({
    status: settledStatus(),
    panel: { results: [{ locale: 'nl', status: 'pending' }, { locale: '*', status: 'failed', errorCode: 'internal', error: 'Translation sync crashed' }], source: 'save', stale: false },
  })
  assert.match(crash, /data-translation-locale="\*" data-translation-status="failed"/)
  assert.match(crash, /All locales/)
  assert.doesNotMatch(crash, /data-translation-locale="nl" data-translation-status="pending"/, 'pending lives in the status rows')

  assert.doesNotMatch(renderPanel({ canManage: false, status: settledStatus() }), /cms-translation-retry|cms-translation-force|data-row-action/)
  const create = renderPanel({ mode: 'create' })
  assert.match(create, /start in the background when you first save/)
  assert.doesNotMatch(create, /cms-locale-variants|cms-translation-retry/)
  assert.match(renderPanel({ role: 'machine', status: settledStatus() }), /Retry from original/)
})

// ---------------------------------------------------------------------------
// Delete cascade, cache flushes
// ---------------------------------------------------------------------------
test('delete impact (from the status): only an original cascades; machine deleted, manual kept, blocked ignored', () => {
  const status = {
    ...settledStatus(), sourceId: 'en1',
    locales: [
      { locale: 'en', state: 'source', document: doc('en1', 'roof') },
      { locale: 'nl', state: 'up_to_date', document: doc('nl1', 'roof', { autoTranslated: true, translatedFrom: 'en1' }) },
      { locale: 'fr', state: 'manual', document: doc('fr1', 'toit', { translatedFrom: 'en1' }) },
    ],
  }
  assert.deepEqual(state.cmsDeleteImpact({ _id: 'en1' }, status), { machineLocales: ['nl'], manualLocales: ['fr'] })
  const blocked = { ...status, locales: [status.locales[0], { locale: 'nl', state: 'blocked', document: doc('x', 'roof', { autoTranslated: true, translatedFrom: 'other' }) }] }
  assert.deepEqual(state.cmsDeleteImpact({ _id: 'en1' }, blocked), { machineLocales: [], manualLocales: [] })
  assert.deepEqual(state.cmsDeleteImpact({ _id: 'nl1', translatedFrom: 'en1' }, status), { machineLocales: [], manualLocales: [] })
  assert.equal(state.cmsDeleteImpact({ _id: 'en1' }, undefined), null, 'unknown without a status')
  assert.equal(state.summarizeCmsDeleteCleanup({ deleted: 0, detached: 0 }), 'Deleted')
  assert.equal(state.summarizeCmsDeleteCleanup({ deleted: 2, detached: 1 }), 'Deleted with 2 machine translations. 1 manual translation kept and unlinked')
  assert.deepEqual(cms.normalizeCmsTranslationCleanup({ deleted: -1, detached: '3' }), { deleted: 0, detached: 0 })
})

test('fixture: deleting an original reports the server cleanup and flushes every family slug', async () => {
  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    backend.runQueue()
    const fr = [...backend.docs.values()].find((d) => d.locale === 'fr')
    await cms.adminUpdateCmsWithTranslations(fr._id, { title: 'Toiture', slug: 'toiture' })
    const { translationCleanup } = await cms.adminDeleteCms(content._id)
    assert.deepEqual(translationCleanup, { deleted: 1, detached: 1 })
    assert.equal(backend.docs.get(fr._id).title, 'Toiture', 'manual translation survives')
    const flush = backend.calls.findLast((c) => c.url === '/api/cms/revalidate')
    assert.deepEqual(flush.body, { type: 'blog', slugs: ['roof-repair', 'toiture'] })
  })
})

test('settled run: the family cache flush posts every status slug once and never throws', async () => {
  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    backend.runQueue()
    const fr = [...backend.docs.values()].find((d) => d.locale === 'fr')
    await cms.adminUpdateCmsWithTranslations(fr._id, { slug: 'toiture' })
    const status = await cms.adminGetCmsTranslationStatus(content._id)
    const before = backend.calls.length
    await cms.revalidateCmsTranslationFamily('blog', status, ['roof-repair', undefined])
    const posted = backend.calls.slice(before)
    assert.equal(posted.length, 1)
    assert.deepEqual(posted[0].body, { type: 'blog', slugs: ['roof-repair', 'toiture'] })
    await cms.revalidateCmsTranslationFamily(undefined, status)
    assert.equal(backend.calls.length, before + 1, 'no type → no flush')
  })
  const originalError = console.error
  const logged = []
  console.error = (...args) => logged.push(args)
  try {
    await withFetch(async () => { throw new TypeError('offline') }, async () => {
      await assert.doesNotReject(cms.revalidateCmsTranslationFamily('blog', settledStatus(), ['x']))
    })
  } finally {
    console.error = originalError
  }
  assert.equal(logged.length, 1, 'a failed flush is logged, not thrown')
  assert.deepEqual(cms.cmsFamilySlugs({ slug: 'a', localeVariants: [{ slug: 'a' }, { slug: 'b' }, {}], translationStatus: { sourceId: 's', locales: [{ locale: 'fr', state: 'manual', document: { _id: 'f', slug: 'c' } }] } }), ['a', 'b', 'c'])
})

// ---------------------------------------------------------------------------
// Form wiring (source assertions; behavior is covered by the modules above)
// ---------------------------------------------------------------------------
test('form wiring: saves and retries track the returned status; a retry never writes the form', () => {
  const src = readFileSync(new URL('../components/cms/CmsContentForm.tsx', import.meta.url), 'utf8')
  const run = src.slice(src.indexOf('const runTranslate'), src.indexOf('const deleteImpact'))
  assert.ok(run.length > 0)
  assert.doesNotMatch(run, /setForm\(/)
  assert.match(run, /adminTranslateCms\(\s*initial\._id,\s*force \? \{ force, locales: options\.locales \} : \{\}\s*\)/)
  assert.match(run, /translation\.track\(status, \{ expectWork: queued \}\)/)
  assert.match(src, /translation\.track\(savedStatus, \{ expectWork: queued \}\)/)
  assert.match(src, /onRetry=\{\(\) => runTranslate\(\)\}/)
  assert.match(src, /onClick=\{\(\) => runTranslate\(\{ force: true, locales: forceLocales \?\? \[\] \}\)\}/)
  const settled = src.slice(src.indexOf('const handleTranslationSettled'), src.indexOf('const [initialTranslationStatus]'))
  assert.match(settled, /revalidateCmsTranslationFamily\(doc\?\.type, settled, \[doc\?\.slug\]\)/)
  // The only form write after a run is guarded twice by "no unsaved edits".
  assert.equal(settled.match(/setForm\(/g)?.length, 1)
  const beforeWrite = settled.slice(0, settled.indexOf('setForm('))
  assert.match(beforeWrite, /formRevision\.current !== savedRevision\.current/)
  assert.match(beforeWrite, /formRevision\.current === savedRevision\.current/)
  assert.match(src, /cmsDeleteImpact\(savedDoc \?\? \{\}, translation\.status\)/)
  assert.match(src, /toast\.success\(summarizeCmsDeleteCleanup\(translationCleanup\)\)/)
  assert.match(src, /setForm\(\(prev\) => \(\{ \.\.\.prev, status: updated\.status \}\)\)/)
})

// ---------------------------------------------------------------------------
// Public pages: machine-translated note, served-locale SEO
// ---------------------------------------------------------------------------
test('public: "machine translated" note only for autoTranslated === true, via public i18n messages', () => {
  const note = (autoTranslated) =>
    renderToStaticMarkup(React.createElement(MachineTranslatedNote, { autoTranslated, label: 'Auto label' }))
  assert.match(note(true), /data-testid="cms-machine-translated"/)
  assert.match(note(true), /Auto label/)
  for (const value of [false, undefined, 'true', 1]) assert.equal(note(value), '', String(value))

  const messages = Object.fromEntries(
    LOCALES.map((l) => [l, JSON.parse(readFileSync(new URL(`../messages/${l}/content.json`, import.meta.url), 'utf8')).machineTranslatedNote])
  )
  for (const l of LOCALES) assert.ok(typeof messages[l] === 'string' && messages[l].trim(), `content.machineTranslatedNote in ${l}`)
  assert.equal(new Set(Object.values(messages)).size, 3, 'nl and fr are translated, not copies of en')

  for (const page of ['blog/[slug]', 'news/[slug]', 'pages/[slug]', 'privacy-policy', 'about']) {
    const code = readFileSync(new URL(`../app/(pages)/${page}/page.tsx`, import.meta.url), 'utf8')
    assert.match(code, /<MachineTranslatedNote\s+autoTranslated=\{(post|content)\.autoTranslated\}\s+label=\{t\("machineTranslatedNote"\)\}/, page)
  }
})

test('public SEO: OpenGraph follows the served document locale (en fallback stays en)', () => {
  const src = readFileSync(new URL('../lib/seo/metadata.ts', import.meta.url), 'utf8')
  assert.match(src, /export function servedContentLocale/)
  for (const page of ['blog/[slug]', 'news/[slug]', 'pages/[slug]', 'privacy-policy', 'about']) {
    const code = readFileSync(new URL(`../app/(pages)/${page}/page.tsx`, import.meta.url), 'utf8')
    assert.match(code, /locale: servedContentLocale\((post|content\??)\.locale\)/, `${page} metadata locale`)
    assert.match(code, /lang=\{servedContentLocale\((post|content)\.locale\)\}/, `${page} body lang`)
    // Canonical and hreflang come from buildMetadata (main's locale URLs); pages must not override them.
    assert.doesNotMatch(code, /languages:/, `${page} must not hand-roll hreflang alternates`)
  }
})

test('public SEO: CMS pages keep locale-prefixed canonical + hreflang, OpenGraph follows the served doc', async () => {
  const { assembleMetadata } = await import('../lib/seo/metadataAssembly.ts')
  const { servedContentLocale } = await import('../lib/seo/metadata.ts')
  // /nl/blog/roof whose nl translation is missing: the backend served the en document.
  const served = servedContentLocale('EN')
  assert.equal(served, 'en')
  assert.equal(servedContentLocale('de'), undefined, 'unknown locale defers to the request locale')
  assert.equal(servedContentLocale(undefined), undefined)
  const meta = assembleMetadata({ title: 'Roof', path: '/blog/roof', type: 'article', locale: served }, served, 'desc', 'nl')
  assert.match(String(meta.alternates.canonical), /\/nl\/blog\/roof$/, 'canonical follows the URL prefix')
  assert.deepEqual(Object.keys(meta.alternates.languages).sort(), ['en', 'fr', 'nl', 'x-default'])
  assert.match(String(meta.alternates.languages.fr), /\/fr\/blog\/roof$/, 'same slug in every language')
  assert.equal(meta.openGraph.locale, 'en_US', 'OpenGraph says what was served, not the URL language')
  assert.equal(meta.openGraph.url, meta.alternates.canonical)
  for (const path of ['/news/roof', '/pages/roof', '/privacy-policy', '/about']) {
    const m = assembleMetadata({ path, locale: 'fr' }, 'fr', 'desc', 'fr')
    assert.ok(m.alternates.languages, `${path} has hreflang`)
    assert.equal(m.openGraph.locale, 'fr_BE')
  }
})

test('admin live links use the language-prefixed public URL', () => {
  assert.equal(cms.cmsLiveUrl('/blog/roof', 'nl'), '/nl/blog/roof')
  assert.equal(cms.cmsLiveUrl('/pages/terms', 'FR'), '/fr/pages/terms')
  assert.equal(cms.cmsLiveUrl('/privacy-policy', 'en'), '/en/privacy-policy')
  assert.equal(cms.cmsLiveUrl('/faq#billing', 'fr'), '/fr/faq#billing')
  assert.equal(cms.cmsLiveUrl('/services/roofing', 'nl'), '/nl/services/roofing')
  assert.equal(cms.cmsLiveUrl('/not-localized/x/y', 'nl'), '/not-localized/x/y?lang=nl', 'no prefixed twin: ?lang= fallback')
  assert.equal(cms.cmsLiveUrl('', 'nl'), '')
})
