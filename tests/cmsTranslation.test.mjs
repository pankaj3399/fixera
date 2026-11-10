// CMS auto-translation (admin UI) — behavioral tests.
//
// FIXTURE TESTS: every backend response here comes from a deterministic local
// fixture transport (stubbed `fetch`) that follows the draft backend contract
// (`feat-cms-auto-translate`: POST/PUT envelopes with `translations`, POST
// /:id/translate). "Translated" text in the fixture is a placeholder prefix,
// not a real translation. Nothing here exercises a live provider (Azure/OpenAI)
// or proves translation quality or live provider acceptance.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

process.env.NEXT_PUBLIC_BACKEND_URL = 'http://backend.fixture'
register('./swc-loader.mjs', import.meta.url)

const cms = await import('@/lib/cms.ts')
const state = await import('@/lib/cmsTranslationState.ts')
const { ApiRequestError, getErrorMessage } = await import('@/lib/apiErrors.ts')
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { default: CmsTranslationPanel } = await import('@/components/cms/CmsTranslationPanel.tsx')

const API = 'http://backend.fixture'
const LOCALES = ['en', 'nl', 'fr']

// ---------------------------------------------------------------------------
// Fixture backend: a small in-memory model of the draft sync semantics.
// ---------------------------------------------------------------------------
function createFixtureBackend({ configured = true, failLocales = [], localeVariants = false } = {}) {
  const docs = new Map()
  let seq = 0
  const calls = []
  const nextId = () => `doc${String(++seq).padStart(4, '0')}`
  const hashOf = (doc) => JSON.stringify([doc.title, doc.body, doc.excerpt])
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  function sync(source, { force = false } = {}) {
    if (source.autoTranslated || source.translatedFrom) return []
    const results = []
    for (const locale of LOCALES.filter((l) => l !== source.locale)) {
      const sibling = [...docs.values()].find(
        (d) => d.locale === locale && d.type === source.type && (d.translatedFrom === source._id || d.slug === source.slug)
      )
      if (sibling && !sibling.autoTranslated && !force) {
        results.push({ locale, status: 'skipped_manual' })
        continue
      }
      if (sibling && sibling.autoTranslated && sibling.sourceHash === hashOf(source) && !force) {
        sibling.status = source.status
        results.push({ locale, status: 'synced' })
        continue
      }
      if (!configured) {
        results.push({ locale, status: 'disabled' })
        continue
      }
      if (failLocales.includes(locale)) {
        results.push({ locale, status: 'failed', error: 'Translation failed. Check server logs for details.' })
        continue
      }
      const text = { title: `[fixture-${locale}] ${source.title}`, body: `[fixture-${locale}] ${source.body ?? ''}` }
      if (sibling) {
        Object.assign(sibling, text, { autoTranslated: true, sourceHash: hashOf(source), translatedFrom: source._id, status: source.status })
        results.push({ locale, status: 'updated' })
      } else {
        const _id = nextId()
        docs.set(_id, {
          _id, type: source.type, slug: source.slug, locale, ...text, status: source.status,
          autoTranslated: true, translatedFrom: source._id, sourceHash: hashOf(source), updatedAt: 'fixture',
        })
        results.push({ locale, status: 'created' })
      }
    }
    return results
  }

  // Mirrors backend loadCmsLocaleVariants: the family is the origin plus every
  // doc translatedFrom it (never by slug), one per locale, never self/own locale.
  function variantsOf(doc) {
    const originId = doc.translatedFrom ?? doc._id
    const seen = new Set([doc.locale])
    const rows = [...docs.values()].filter(
      (d) => d.type === doc.type && d._id !== doc._id && (d._id === originId || d.translatedFrom === originId)
    )
    rows.sort((a, b) => (a._id === originId ? -1 : b._id === originId ? 1 : 0))
    const out = []
    for (const d of rows) {
      if (seen.has(d.locale)) continue
      seen.add(d.locale)
      out.push({ _id: d._id, locale: d.locale, slug: d.slug, title: d.title, status: d.status, autoTranslated: d.autoTranslated === true, ...(d.translatedFrom ? { translatedFrom: d.translatedFrom } : {}) })
    }
    return LOCALES.flatMap((l) => out.filter((v) => v.locale === l))
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
      const doc = { _id, autoTranslated: false, updatedAt: 'fixture', ...body }
      docs.set(_id, doc)
      return json(201, { success: true, translations: sync(doc), data: { ...doc } })
    }
    if ((m = path.match(/^\/api\/admin\/cms\/(\w+)\/translate$/)) && method === 'POST') {
      const doc = docs.get(m[1])
      if (!doc) return json(404, { success: false, msg: 'Content not found' })
      const source = doc.translatedFrom ? docs.get(doc.translatedFrom) ?? doc : doc
      return json(200, { success: true, translations: sync(source, { force: body?.force === true }) })
    }
    if ((m = path.match(/^\/api\/admin\/cms\/(\w+)$/))) {
      const doc = docs.get(m[1])
      if (!doc) return json(404, { success: false, msg: 'Content not found' })
      if (method === 'GET') {
        return json(200, { success: true, data: { ...doc, ...(localeVariants ? { localeVariants: variantsOf(doc) } : {}) } })
      }
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
        Object.assign(doc, body)
        if (doc.autoTranslated) doc.autoTranslated = false // admin edit demotes to manual
        return json(200, { success: true, translations: sync(doc), data: { ...doc } })
      }
    }
    if (path.startsWith('/api/admin/cms?') && method === 'GET') {
      const qs = new URL(url).searchParams
      const items = [...docs.values()].filter(
        (d) => (!qs.get('type') || d.type === qs.get('type')) && (!qs.get('search') || d.slug.startsWith(qs.get('search')))
      )
      return json(200, { success: true, data: { items, pagination: { page: 1, limit: 50, total: items.length, totalPages: 1 } } })
    }
    return json(404, { success: false, msg: `fixture: no route ${method} ${path}` })
  }

  return { docs, calls, fetchImpl, setConfigured: (v) => { configured = v } }
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

// ---------------------------------------------------------------------------
// Adapter: automatic translation flows on create and update (fixture transport)
// ---------------------------------------------------------------------------
test('fixture: create returns content plus per-locale created statuses, revalidates once', async () => {
  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content, translations } = await cms.adminCreateCmsWithTranslations(SOURCE)
    assert.equal(content.title, 'Roof repair')
    assert.deepEqual(translations, [
      { locale: 'nl', status: 'created' },
      { locale: 'fr', status: 'created' },
    ])
    // Auto mode stays a server-side side effect of the save: no extra translate call.
    assert.equal(backend.calls.filter((c) => c.url.endsWith('/translate')).length, 0)
    assert.equal(backend.calls.filter((c) => c.url === '/api/cms/revalidate').length, 1)
    // Draft source ⇒ draft machine variants (fixture mirrors status, never publishes on its own).
    const variants = [...backend.docs.values()].filter((d) => d.autoTranslated)
    assert.deepEqual(variants.map((d) => [d.locale, d.status]), [['nl', 'draft'], ['fr', 'draft']])
    // Legacy wrapper is unchanged.
    const plain = await cms.adminCreateCms({ ...SOURCE, slug: 'second' })
    assert.equal(plain.slug, 'second')
  })
})

test('fixture: repeated saves report synced, then updated after a text edit, manual variants kept', async () => {
  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    const again = await cms.adminUpdateCmsWithTranslations(content._id, { ...SOURCE })
    assert.deepEqual(again.translations.map((r) => r.status), ['synced', 'synced'])

    const edited = await cms.adminUpdateCmsWithTranslations(content._id, { ...SOURCE, title: 'Roof repair guide' })
    assert.deepEqual(edited.translations.map((r) => r.status), ['updated', 'updated'])

    // An admin edits the NL machine translation → it becomes manual.
    const nl = [...backend.docs.values()].find((d) => d.locale === 'nl')
    const nlSave = await cms.adminUpdateCmsWithTranslations(nl._id, { title: 'Dakreparatie (handmatig)' })
    assert.equal(nlSave.content.autoTranslated, false)
    assert.deepEqual(nlSave.translations, [], 'a translation is never a sync source')
    assert.equal(state.cmsTranslationRole(nlSave.content), 'manual')

    const afterManual = await cms.adminUpdateCmsWithTranslations(content._id, { ...SOURCE, title: 'Roof repair 2027' })
    assert.deepEqual(afterManual.translations, [
      { locale: 'nl', status: 'skipped_manual' },
      { locale: 'fr', status: 'updated' },
    ])
    assert.equal(backend.docs.get(nl._id).title, 'Dakreparatie (handmatig)', 'manual text preserved')
  })
})

test('fixture: resync sends force only when asked; forced resync overwrites manual text', async () => {
  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    const nl = [...backend.docs.values()].find((d) => d.locale === 'nl')
    await cms.adminUpdateCmsWithTranslations(nl._id, { title: 'Handmatig' })

    const plain = await cms.adminTranslateCms(content._id)
    assert.deepEqual(backend.calls.findLast((c) => c.url.endsWith('/translate')).body, { force: false })
    assert.deepEqual(plain.translations.map((r) => r.status), ['skipped_manual', 'synced'])
    assert.equal(backend.docs.get(nl._id).title, 'Handmatig')

    const forced = await cms.adminTranslateCms(content._id, { force: true })
    assert.deepEqual(backend.calls.findLast((c) => c.url.endsWith('/translate')).body, { force: true })
    assert.deepEqual(forced.translations.map((r) => r.status), ['updated', 'updated'])
    assert.match(backend.docs.get(nl._id).title, /^\[fixture-nl\]/)
    // Resync from a translation id runs from its origin (origin text untouched).
    await cms.adminTranslateCms(nl._id)
    assert.equal(backend.docs.get(content._id).title, 'Roof repair')
  })
})

test('fixture: unconfigured provider is a truthful, recoverable 2xx (disabled) and retry recovers', async () => {
  const backend = createFixtureBackend({ configured: false })
  await withFetch(backend.fetchImpl, async () => {
    const { content, translations } = await cms.adminCreateCmsWithTranslations(SOURCE)
    assert.ok(content._id, 'content is saved even without a provider')
    assert.deepEqual(translations.map((r) => r.status), ['disabled', 'disabled'])
    assert.equal(state.hasRetryableCmsTranslations(translations), true)
    const outcome = state.summarizeCmsTranslationOutcome(translations, { trigger: 'save', expectResults: true })
    assert.equal(outcome.tone, 'info')
    assert.match(outcome.message, /^Content saved\. Automatic translation is not configured/)
    assert.match(outcome.message, /NL, FR were not translated/)
    assert.doesNotMatch(outcome.message, /AZURE|KEY|OPENAI/i, 'no secret names in UI copy')

    backend.setConfigured(true)
    const retry = await cms.adminTranslateCms(content._id)
    assert.deepEqual(retry.translations.map((r) => r.status), ['created', 'created'])
    assert.equal(state.hasRetryableCmsTranslations(retry.translations), false)
  })
})

test('fixture: partial provider failure keeps the save and names the failed locale', async () => {
  const backend = createFixtureBackend({ failLocales: ['fr'] })
  await withFetch(backend.fetchImpl, async () => {
    const { content, translations } = await cms.adminCreateCmsWithTranslations(SOURCE)
    assert.ok(content._id)
    assert.deepEqual(translations, [
      { locale: 'nl', status: 'created' },
      { locale: 'fr', status: 'failed', error: 'Translation failed. Check server logs for details.' },
    ])
    const outcome = state.summarizeCmsTranslationOutcome(translations, { trigger: 'save' })
    assert.equal(outcome.tone, 'warning')
    assert.equal(outcome.message, 'Content saved, but translation failed for FR. Your saved content is kept; use Retry translations.')
  })
})

// ---------------------------------------------------------------------------
// Adapter: rejections and malformed responses
// ---------------------------------------------------------------------------
test('fixture: rejected save/translate throw ApiRequestError and never revalidate', async () => {
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
  await withFetch(respond(503, { success: false, code: 'TRANSLATOR_NOT_CONFIGURED', msg: 'Automatic translation is not configured.' }), async () => {
    await assert.rejects(cms.adminTranslateCms('abc'), (err) => {
      assert.equal(err.code, 'TRANSLATOR_NOT_CONFIGURED')
      assert.equal(err.status, 503)
      return true
    })
  })
  await withFetch(respond(502, '<html>Bad gateway</html>', 'text/html'), async () => {
    await assert.rejects(cms.adminUpdateCmsWithTranslations('abc', { title: 'x' }), (err) => {
      assert.equal(err.kind, 'invalidResponse')
      return true
    })
  })
  await withFetch(respond(201, { success: true, translations: [] }), async () => {
    await assert.rejects(cms.adminCreateCmsWithTranslations(SOURCE), (err) => err.kind === 'invalidResponse')
  })
  assert.equal(calls.filter((c) => c.url === '/api/cms/revalidate').length, 0)
  // The form shows this fallback; raw transport text is never surfaced.
  assert.equal(
    getErrorMessage(new TypeError('Failed to fetch'), 'Translation request failed. Your content and unsaved edits are unchanged.').includes('Failed to fetch'),
    false
  )
})

test('normalizeCmsTranslationResults is defensive and never upgrades unknown statuses', () => {
  assert.deepEqual(cms.normalizeCmsTranslationResults(undefined), [])
  assert.deepEqual(cms.normalizeCmsTranslationResults({ nl: 'created' }), [])
  assert.deepEqual(
    cms.normalizeCmsTranslationResults([
      null,
      { locale: ' NL ', status: 'created' },
      { status: 'failed', error: 'Translation sync crashed' },
      { locale: 'fr', status: 'translated' },
      { locale: 'fr', status: 'failed', error: '  ' },
    ]),
    [
      { locale: 'nl', status: 'created' },
      { locale: '*', status: 'failed', error: 'Translation sync crashed' },
      { locale: 'fr', status: 'failed', error: 'Unexpected translation response' },
      { locale: 'fr', status: 'failed' },
    ]
  )
})

// ---------------------------------------------------------------------------
// Form state: stale results, concurrent edits / language changes, copy
// ---------------------------------------------------------------------------
test('panel state: results from a save are stale when the form changed during the request', () => {
  const results = [{ locale: 'nl', status: 'created' }]
  // Save started at revision 3; the admin switched the language (revision 4) meanwhile.
  const concurrent = state.cmsTranslationPanelAfterRun(results, 'save', { current: 4, saved: 3 })
  assert.deepEqual(concurrent, { results, source: 'save', stale: true })
  const clean = state.cmsTranslationPanelAfterRun(results, 'save', { current: 3, saved: 3 })
  assert.equal(clean.stale, false)
  // A resync while unsaved edits exist describes the saved doc, not the screen.
  assert.equal(state.cmsTranslationPanelAfterRun(results, 'retranslate', { current: 7, saved: 5 }).stale, true)
  // Editing marks fresh results stale; with no results nothing changes (same object, no re-render).
  assert.equal(state.cmsTranslationPanelAfterEdit(clean).stale, true)
  assert.equal(state.cmsTranslationPanelAfterEdit(state.INITIAL_CMS_TRANSLATION_PANEL), state.INITIAL_CMS_TRANSLATION_PANEL)
  assert.equal(state.cmsTranslationPanelAfterEdit(concurrent), concurrent)
})

test('outcome copy follows server statuses exactly', () => {
  const s = (results, options) => state.summarizeCmsTranslationOutcome(results, options)
  assert.equal(s([{ locale: 'nl', status: 'created' }, { locale: 'fr', status: 'synced' }], { trigger: 'save' }), null)
  assert.equal(s([], { trigger: 'save' }), null, 'translations are silent for non-source docs')
  assert.match(s([], { trigger: 'save', expectResults: true }).message, /did not report any automatic translation/)
  assert.equal(s([], { trigger: 'retranslate' }).tone, 'info')
  assert.equal(s([{ locale: '*', status: 'failed', error: 'x' }], { trigger: 'retranslate' }).message,
    'Translation failed for all locales. Your saved content is kept; use Retry translations.')
  assert.deepEqual(s([{ locale: 'nl', status: 'skipped_manual' }, { locale: 'fr', status: 'updated' }], { trigger: 'retranslate' }),
    { tone: 'info', message: 'Translations synced. Manual translations kept for NL.' })
  assert.deepEqual(s([{ locale: 'nl', status: 'updated' }], { trigger: 'retranslate', force: true }),
    { tone: 'success', message: 'Translations overwritten' })
  // Failure wins over disabled; disabled is never shown as success.
  assert.equal(s([{ locale: 'nl', status: 'disabled' }, { locale: 'fr', status: 'failed' }], { trigger: 'save' }).tone, 'warning')
  assert.match(s([{ locale: 'fr', status: 'disabled' }], { trigger: 'retranslate' }).message, /^Automatic translation is not configured on the server, so FR was not translated/)
})

test('translation role and targets', () => {
  assert.equal(state.cmsTranslationRole({}), 'source')
  assert.equal(state.cmsTranslationRole({ autoTranslated: true, translatedFrom: 'a' }), 'machine')
  assert.equal(state.cmsTranslationRole({ autoTranslated: false, translatedFrom: { _id: 'a' } }), 'manual')
  assert.equal(state.cmsTranslationRole({ translatedFrom: '' }), 'source')
  assert.deepEqual(state.cmsTranslationTargets('nl'), ['en', 'fr'])
  assert.deepEqual(state.cmsTranslationTargets('xx'), ['nl', 'fr'])
})

// ---------------------------------------------------------------------------
// Locale variant links
// ---------------------------------------------------------------------------
test('variant selection: origin, linked and same-slug, one per locale, never self', () => {
  const doc = { _id: 'nl1', type: 'blog', slug: 'dak', locale: 'nl', translatedFrom: 'en1' }
  const variants = cms.selectCmsLocaleVariants(doc, [
    { _id: 'nl1', locale: 'nl', slug: 'dak', title: 'self', status: 'draft' },
    { _id: 'fr-same', type: 'blog', locale: 'fr', slug: 'dak', title: 'same slug', status: 'published' },
    { _id: 'fr1', type: 'blog', locale: 'fr', slug: 'toit', title: 'Toit', status: 'draft', translatedFrom: { _id: 'en1' } },
    { _id: 'en1', type: 'blog', locale: 'en', slug: 'roof', title: 'Roof', status: 'published' },
    { _id: 'faq', type: 'faq', locale: 'en', slug: 'dak', title: 'other type', status: 'draft' },
    { _id: 'x', type: 'blog', locale: 'fr', slug: 'unrelated', title: 'nope', status: 'draft' },
    { bogus: true },
  ])
  assert.deepEqual(variants.map((v) => [v.locale, v._id, v.relation, v.status]), [
    ['en', 'en1', 'origin', 'published'],
    ['fr', 'fr1', 'linked', 'draft'],
  ])
})

test('fixture: variant links prefer server localeVariants, else fall back to slug search', async () => {
  const backend = createFixtureBackend()
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    const fallback = await cms.adminListCmsLocaleVariants(content)
    assert.equal(fallback.source, 'slug-search')
    assert.deepEqual(fallback.variants.map((v) => [v.locale, v.relation, v.autoTranslated]), [
      ['nl', 'linked', true],
      ['fr', 'linked', true],
    ])
    const listCall = backend.calls.find((c) => c.url.includes('/api/admin/cms?'))
    assert.match(listCall.url, /type=blog/)
    assert.match(listCall.url, /search=roof-repair/)

    const before = backend.calls.length
    const server = await cms.adminListCmsLocaleVariants({
      ...content,
      localeVariants: [{ _id: 'srv-fr', locale: 'fr', slug: 'x', title: 'Toit', status: 'published', translatedFrom: content._id }],
    })
    assert.equal(server.source, 'server')
    assert.deepEqual(server.variants.map((v) => v._id), ['srv-fr'])
    assert.equal(backend.calls.length, before, 'no extra request when the server supplied the group')
  })
})

test('force-overwrite dialog lists linked manual locales (and the doc itself when manual)', () => {
  const variants = [
    { _id: 'a', locale: 'en', relation: 'origin', autoTranslated: false },
    { _id: 'b', locale: 'fr', relation: 'linked', autoTranslated: false },
    { _id: 'c', locale: 'nl', relation: 'same-slug', autoTranslated: false },
  ]
  assert.deepEqual(state.manualCmsVariantLocales(variants, { locale: 'en' }), ['fr'])
  assert.deepEqual(state.manualCmsVariantLocales(variants, { locale: 'nl', translatedFrom: 'a' }), ['nl', 'fr'])
  assert.deepEqual(state.manualCmsVariantLocales([], { locale: 'en', autoTranslated: true, translatedFrom: 'a' }), [])
})

test('resync from a translation: detects when the server rewrote the open document', () => {
  const manualNl = { locale: 'nl', translatedFrom: 'en1', autoTranslated: false }
  assert.equal(state.resyncRewroteCurrentDoc(manualNl, [{ locale: 'nl', status: 'updated' }, { locale: 'fr', status: 'synced' }]), true)
  assert.equal(state.resyncRewroteCurrentDoc(manualNl, [{ locale: 'nl', status: 'skipped_manual' }]), false)
  assert.equal(state.resyncRewroteCurrentDoc(manualNl, [{ locale: 'fr', status: 'updated' }]), false)
  assert.equal(state.resyncRewroteCurrentDoc({ locale: 'en' }, [{ locale: 'en', status: 'updated' }]), false, 'a source is never rewritten')
})

test('create→edit stash is one-shot and survives broken storage', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  state.stashCmsTranslationResults('id1', [{ locale: 'nl', status: 'created' }], storage)
  assert.deepEqual(state.takeStashedCmsTranslationResults('id1', storage), [{ locale: 'nl', status: 'created' }])
  assert.deepEqual(state.takeStashedCmsTranslationResults('id1', storage), [])
  state.stashCmsTranslationResults('id2', [], storage)
  assert.equal(store.size, 0)
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') }, removeItem() {} }
  assert.doesNotThrow(() => state.stashCmsTranslationResults('id3', [{ locale: 'fr', status: 'failed' }], broken))
  assert.deepEqual(state.takeStashedCmsTranslationResults('id3', broken), [])
  assert.deepEqual(state.takeStashedCmsTranslationResults('id3', null), [])
})

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------
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
const renderPanel = (props) =>
  renderToStaticMarkup(
    React.createElement(CmsTranslationPanel, {
      mode: 'edit', role: 'source', targets: ['nl', 'fr'], panel: state.INITIAL_CMS_TRANSLATION_PANEL,
      saving: false, translating: false, busy: false, canManage: true, variants: [], variantsState: 'ready',
      onRetry() {}, onForce() {}, ...props,
    })
  )

test('rendered panel: statuses, progress, retry wording, RBAC and variant links', () => {
  const disabled = renderPanel({
    panel: { results: [{ locale: 'nl', status: 'disabled' }, { locale: 'fr', status: 'failed', error: 'Boom' }], source: 'save', stale: false },
  })
  assert.match(disabled, /data-translation-locale="nl" data-translation-status="disabled"/)
  assert.match(disabled, /Translator not configured/)
  assert.match(disabled, /data-testid="cms-translation-disabled"/)
  assert.match(disabled, /Auto-translate is disabled on the server/)
  assert.match(disabled, /Boom/)
  assert.match(disabled, /Retry translations/)
  assert.match(disabled, /Overwrite manual translations/)

  assert.match(renderPanel({ saving: true }), /Saving and translating into NL, FR/)
  assert.doesNotMatch(renderPanel({ saving: true, role: 'manual' }), /Saving and translating/)
  assert.match(renderPanel({ translating: true }), /Syncing translations/)
  assert.match(renderPanel({ panel: { results: [{ locale: 'nl', status: 'synced' }], source: 'retranslate', stale: true } }),
    /Last resync — content changed since/)
  assert.match(renderPanel({ panel: { results: [], source: 'save', stale: false } }), /server reported no translation results for the last save/)
  assert.match(renderPanel({ role: 'machine' }), /Resync from original/)
  assert.match(renderPanel({ role: 'manual' }), /Manual translation\. Saving the original/)

  const readOnly = renderPanel({ canManage: false })
  assert.doesNotMatch(readOnly, /Retry translations|Resync|Overwrite manual/)

  const links = renderPanel({
    role: 'manual',
    locale: 'nl',
    variants: [
      { _id: 'en1', locale: 'en', slug: 'roof', title: 'Roof', status: 'published', autoTranslated: false, relation: 'origin' },
      { _id: 'fr1', locale: 'fr', slug: 'toit', title: 'Toit', status: 'draft', autoTranslated: true, relation: 'linked' },
    ],
    variantsSource: 'slug-search',
  })
  assert.match(links, /href="\/admin\/cms\/en1\/edit" target="_blank"/)
  assert.match(links, /Original/)
  assert.match(links, /Machine/)
  assert.match(links, />draft</)
  assert.match(links, /manual versions saved under another slug may not be listed/)

  const create = renderPanel({ mode: 'create' })
  assert.match(create, /requested when you first save/)
  assert.doesNotMatch(create, /cms-locale-variants|Retry translations/)
})

// Supplementary wiring check (source assertions, not behavior): the form uses
// the tested modules and its resync path only reloads a form with no unsaved edits.
test('form wiring: resync writes the form only without unsaved edits; save keeps the status echo guard', () => {
  const src = readFileSync(new URL('../components/cms/CmsContentForm.tsx', import.meta.url), 'utf8')
  const run = src.slice(src.indexOf('const runTranslate'), src.indexOf('const forceLocales'))
  assert.ok(run.length > 0)
  // The only form write is the post-resync reload, guarded twice by "no unsaved edits".
  assert.equal(run.match(/setForm\(/g)?.length, 1)
  const beforeWrite = run.slice(0, run.indexOf('setForm('))
  assert.equal(beforeWrite.match(/formRevision\.current === savedRevision\.current/g)?.length, 2)
  assert.match(run, /adminTranslateCms\(initial\._id, \{ force \}\)/)
  assert.match(src, /setForm\(\(prev\) => \(\{ \.\.\.prev, status: updated\.status \}\)\)/)
  assert.match(src, /adminCreateCmsWithTranslations\(payload\)/)
  assert.match(src, /adminUpdateCmsWithTranslations\(\s*initial\._id,\s*payload\s*\)/)
  assert.match(src, /onClick=\{\(\) => runTranslate\(true\)\}/)
  assert.doesNotMatch(src, /setShowForceTranslateConfirm\(true\)[\s\S]{0,40}runTranslate\(true\)/)
})

// ---------------------------------------------------------------------------
// Per-locale coverage, disabled state, delete cascade, cache flushes, SEO
// ---------------------------------------------------------------------------
test('locale rows: every supported locale once, current/original/machine/manual/unlinked/missing', () => {
  const variants = [
    { _id: 'en1', locale: 'en', slug: 'roof', title: 'Roof', status: 'published', autoTranslated: false, relation: 'origin' },
    { _id: 'fr1', locale: 'fr', slug: 'toit', title: 'Toit', status: 'draft', autoTranslated: false, relation: 'linked' },
  ]
  const results = [{ locale: 'fr', status: 'skipped_manual' }, { locale: '*', status: 'failed', error: 'crash' }]
  const rows = state.cmsLocaleRows('nl', variants, results)
  assert.deepEqual(rows.map((r) => [r.locale, r.kind, r.variant?._id, r.result?.status]), [
    ['en', 'original', 'en1', undefined],
    ['nl', 'current', undefined, undefined],
    ['fr', 'manual', 'fr1', 'skipped_manual'],
  ])
  assert.deepEqual(state.unplacedCmsTranslationResults(results), [{ locale: '*', status: 'failed', error: 'crash' }])

  const source = state.cmsLocaleRows('en', [
    { _id: 'nl1', locale: 'nl', slug: 'roof', title: 'Dak', status: 'draft', autoTranslated: true, relation: 'linked' },
    { _id: 'x', locale: 'fr', slug: 'roof', title: 'Autre', status: 'draft', autoTranslated: false, relation: 'same-slug' },
  ], [])
  assert.deepEqual(source.map((r) => r.kind), ['current', 'machine', 'unlinked'])
  assert.deepEqual(state.cmsLocaleRows('en', [], []).map((r) => r.kind), ['current', 'missing', 'missing'])
})

test('auto-translate disabled is detected only from a server "disabled" result', () => {
  assert.equal(state.cmsAutoTranslateDisabled([{ locale: 'nl', status: 'disabled' }]), true)
  assert.equal(state.cmsAutoTranslateDisabled([{ locale: 'nl', status: 'failed' }]), false)
  assert.equal(state.cmsAutoTranslateDisabled([]), false)
})

test('rendered panel: per-locale rows, live links only for published versions, crash and disabled banner', () => {
  const html = renderPanel({
    type: 'blog',
    locale: 'en',
    variants: [
      { _id: 'nl1', locale: 'nl', slug: 'roof', title: 'Dak', status: 'published', autoTranslated: true, relation: 'linked' },
    ],
    panel: { results: [{ locale: 'fr', status: 'disabled' }, { locale: '*', status: 'failed', error: 'Translation sync crashed' }], source: 'save', stale: false },
  })
  assert.match(html, /data-locale-row="en" data-locale-kind="current"/)
  assert.match(html, /Original · this page/)
  assert.match(html, /data-locale-row="nl" data-locale-kind="machine"/)
  assert.match(html, /href="\/blog\/roof\?lang=nl"/, 'published variant links to its live page in its language')
  assert.match(html, /data-locale-row="fr" data-locale-kind="missing"/)
  assert.match(html, /Not translated/)
  assert.match(html, /data-translation-locale="fr" data-translation-status="disabled"/)
  assert.match(html, /data-translation-locale="\*" data-translation-status="failed"/)
  assert.match(html, /All locales/)
  assert.match(html, /Translation sync crashed/)
  assert.match(html, /Auto-translate is disabled on the server/)

  const draft = renderPanel({
    type: 'blog',
    locale: 'en',
    variants: [{ _id: 'nl1', locale: 'nl', slug: 'roof', title: 'Dak', status: 'draft', autoTranslated: true, relation: 'linked' }],
  })
  assert.doesNotMatch(draft, /\?lang=nl/, 'drafts have no live page')
  assert.doesNotMatch(draft, /cms-translation-disabled/)

  const loading = renderPanel({ locale: 'en', variantsState: 'loading' })
  assert.match(loading, /Loading…/)
  assert.doesNotMatch(loading, /Not translated/, 'missing is never claimed before the variants load')
  const failed = renderPanel({ locale: 'en', variantsState: 'error' })
  assert.match(failed, /Couldn&#x27;t load the other language versions/)
  assert.doesNotMatch(failed, /Not translated/)
})

test('delete impact: only an original cascades; machine deleted, manual kept', () => {
  const variants = [
    { _id: 'nl1', locale: 'nl', relation: 'linked', autoTranslated: true },
    { _id: 'fr1', locale: 'fr', relation: 'linked', autoTranslated: false },
    { _id: 'x', locale: 'fr', relation: 'same-slug', autoTranslated: true },
  ]
  assert.deepEqual(state.cmsDeleteImpact({}, variants), { machineLocales: ['nl'], manualLocales: ['fr'] })
  assert.deepEqual(state.cmsDeleteImpact({ translatedFrom: 'en1' }, variants), { machineLocales: [], manualLocales: [] })
  assert.equal(state.summarizeCmsDeleteCleanup({ deleted: 0, detached: 0 }), 'Deleted')
  assert.equal(
    state.summarizeCmsDeleteCleanup({ deleted: 2, detached: 1 }),
    'Deleted with 2 machine translations. 1 manual translation kept and unlinked'
  )
  assert.deepEqual(cms.normalizeCmsTranslationCleanup({ deleted: -1, detached: '3' }), { deleted: 0, detached: 0 })
  assert.deepEqual(cms.normalizeCmsTranslationCleanup(undefined), { deleted: 0, detached: 0 })
})

test('fixture: deleting an original reports the server cleanup and flushes the family slugs', async () => {
  const backend = createFixtureBackend({ localeVariants: true })
  await withFetch(backend.fetchImpl, async () => {
    const { content } = await cms.adminCreateCmsWithTranslations(SOURCE)
    const fr = [...backend.docs.values()].find((d) => d.locale === 'fr')
    await cms.adminUpdateCmsWithTranslations(fr._id, { title: 'Toiture', slug: 'toiture' })

    const { translationCleanup } = await cms.adminDeleteCms(content._id)
    assert.deepEqual(translationCleanup, { deleted: 1, detached: 1 })
    assert.equal(backend.docs.get(fr._id).title, 'Toiture', 'manual translation survives')
    const flush = backend.calls.findLast((c) => c.url === '/api/cms/revalidate')
    assert.deepEqual(flush.body, { type: 'blog', slugs: ['roof-repair', 'toiture'] })
  })
})

test('fixture: resync from a manual translation under its own slug flushes the origin slug too', async () => {
  const backend = createFixtureBackend({ localeVariants: true })
  await withFetch(backend.fetchImpl, async () => {
    await cms.adminCreateCmsWithTranslations(SOURCE)
    const fr = [...backend.docs.values()].find((d) => d.locale === 'fr')
    await cms.adminUpdateCmsWithTranslations(fr._id, { title: 'Toiture', slug: 'toiture' })
    await cms.adminTranslateCms(fr._id)
    const flush = backend.calls.findLast((c) => c.url === '/api/cms/revalidate')
    assert.deepEqual(flush.body.slugs.sort(), ['roof-repair', 'toiture'])

    const read = await cms.adminListCmsLocaleVariants(await cms.adminGetCms(fr._id))
    assert.equal(read.source, 'server')
    assert.deepEqual(read.variants.map((v) => [v.locale, v.relation]), [['en', 'origin'], ['nl', 'linked']])
  })
})

test('cmsFamilySlugs: distinct, non-empty, own slug first', () => {
  assert.deepEqual(
    cms.cmsFamilySlugs({ slug: 'a', localeVariants: [{ slug: 'a' }, { slug: 'b' }, { slug: '' }, {}] }),
    ['a', 'b']
  )
  assert.deepEqual(cms.cmsFamilySlugs({ slug: 'a' }), ['a'])
})

test('public SEO: OpenGraph follows the served document locale (en fallback stays en)', async () => {
  // lib/seo/metadata imports next-intl/server; the helper is pure, so check its source contract.
  const src = readFileSync(new URL('../lib/seo/metadata.ts', import.meta.url), 'utf8')
  assert.match(src, /export function servedContentLocale/)
  for (const page of ['blog/[slug]', 'news/[slug]', 'pages/[slug]', 'privacy-policy', 'about']) {
    const code = readFileSync(new URL(`../app/(pages)/${page}/page.tsx`, import.meta.url), 'utf8')
    assert.match(code, /locale: servedContentLocale\((post|content\??)\.locale\)/, `${page} metadata locale`)
    assert.match(code, /lang=\{servedContentLocale\((post|content)\.locale\)\}/, `${page} body lang`)
    assert.doesNotMatch(code, /languages:/, `${page} must not add hreflang alternates (one locale-free URL per page)`)
  }
})

test('form wiring: delete dialog states the translation cascade and the toast uses server counts', () => {
  const src = readFileSync(new URL('../components/cms/CmsContentForm.tsx', import.meta.url), 'utf8')
  assert.match(src, /cmsDeleteImpact\(savedDoc \?\? \{\}, variants\)/)
  assert.match(src, /data-testid="cms-delete-translation-impact"/)
  assert.match(src, /toast\.success\(summarizeCmsDeleteCleanup\(translationCleanup\)\)/)
  assert.match(src, /locale=\{savedDoc\?\.locale \?\? formLocale\}/)
})
