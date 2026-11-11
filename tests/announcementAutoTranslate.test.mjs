import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.test'

const tr = await import('../lib/admin/siteAnnouncementTranslations.ts')
const admin = await import('../lib/admin/siteAnnouncements.ts')
const campaign = await import('../lib/admin/campaignAutoTranslate.ts')
const publicApi = await import('../lib/marketing/siteAnnouncements/api.ts')
const { getErrorMessage } = await import('../lib/apiErrors.ts')

const statusPayload = (over = {}) => ({
  enabled: true,
  supported: true,
  sourceLocale: 'en',
  running: false,
  queued: false,
  locales: [
    { locale: 'en', state: 'source' },
    { locale: 'nl', state: 'up_to_date', translation: { title: 'Lentedeal', message: 'Boek nu', mode: 'machine' } },
    { locale: 'fr', state: 'manual', sourceChanged: true, translation: { title: 'Offre', message: 'Réservez', ctaLabel: 'Go', mode: 'manual' } },
  ],
  ...over,
})

function stubFetch(handler) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const { status = 200, body } = await handler(String(url), init)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

test('parseTranslationStatus keeps known states and drops malformed entries', () => {
  const parsed = tr.parseTranslationStatus({
    ...statusPayload(),
    locales: [...statusPayload().locales, { locale: 'de', state: 'bogus' }, null],
  })
  assert.deepEqual(parsed.locales.map((l) => [l.locale, l.state]), [['en', 'source'], ['nl', 'up_to_date'], ['fr', 'manual']])
  assert.equal(parsed.locales[2].sourceChanged, true)
  assert.equal(parsed.locales[2].translation.mode, 'manual')
  assert.equal(tr.parseTranslationStatus(null), null)
  assert.equal(tr.parseTranslationStatus({ locales: 'x' }), null)
})

test('polls only while a run is in flight or a locale is pending', () => {
  assert.equal(tr.shouldPollTranslationStatus(tr.parseTranslationStatus(statusPayload())), false)
  assert.equal(tr.shouldPollTranslationStatus(tr.parseTranslationStatus(statusPayload({ queued: true }))), true)
  assert.equal(tr.shouldPollTranslationStatus(tr.parseTranslationStatus(statusPayload({ locales: [{ locale: 'nl', state: 'pending' }] }))), true)
  assert.equal(tr.shouldPollTranslationStatus(null), false)
})

test('visitors see a translation only when it is current or manual', () => {
  assert.equal(tr.visitorTextSource({ locale: 'nl', state: 'up_to_date' }), 'translation')
  assert.equal(tr.visitorTextSource({ locale: 'nl', state: 'manual' }), 'translation')
  for (const state of ['stale', 'missing', 'failed', 'pending']) {
    assert.equal(tr.visitorTextSource({ locale: 'nl', state }), 'source')
  }
})

test('manual translation save sends trimmed text to the per-locale endpoint', async () => {
  const fetchStub = stubFetch(async () => ({ body: { success: true, data: { translationStatus: statusPayload() } } }))
  try {
    const status = await tr.saveAnnouncementTranslation('abc', 'fr', { title: ' Offre ', message: ' Réservez ', ctaLabel: ' ' })
    assert.equal(status.sourceLocale, 'en')
    const [call] = fetchStub.calls
    assert.equal(call.url, 'https://backend.test/api/admin/site-announcements/abc/translations/fr')
    assert.equal(call.init.method, 'PUT')
    assert.deepEqual(JSON.parse(call.init.body), { title: 'Offre', message: 'Réservez' })
  } finally {
    fetchStub.restore()
  }
})

test('force retranslate posts locales + force; errors surface the backend message', async () => {
  let fail = false
  const fetchStub = stubFetch(async () =>
    fail
      ? { status: 409, body: { success: false, msg: 'Auto-translation is not configured (AZURE_TRANSLATOR_KEY)' } }
      : { body: { success: true, data: { translationStatus: statusPayload({ queued: true }) } } },
  )
  try {
    await tr.runAnnouncementTranslations('abc', { locales: ['nl'], force: true })
    assert.deepEqual(JSON.parse(fetchStub.calls[0].init.body), { locales: ['nl'], force: true })
    await tr.runAnnouncementTranslations('abc')
    assert.deepEqual(JSON.parse(fetchStub.calls[1].init.body), {})
    fail = true
    let caught
    try {
      await tr.runAnnouncementTranslations('abc')
    } catch (err) {
      caught = err
    }
    assert.ok(caught)
    assert.match(getErrorMessage(caught, 'fallback'), /not configured/)
  } finally {
    fetchStub.restore()
  }
})

test('admin list shows which languages have translations', () => {
  assert.deepEqual(
    admin.translatedLocaleCodes({ locale: 'en', translations: { fr: { title: 'x' }, nl: { title: 'y' }, en: { title: 'z' } } }),
    ['FR', 'NL'],
  )
  assert.deepEqual(admin.translatedLocaleCodes({ locale: 'en' }), [])
})

test('public announcements are requested in the visitor UI language', async () => {
  const fetchStub = stubFetch(async () => ({ body: { success: true, data: { announcements: [] } } }))
  try {
    await publicApi.fetchPublicSiteAnnouncements(undefined, 'fr')
    assert.match(fetchStub.calls[0].url, /locale=fr/)
    await publicApi.fetchPublicSiteAnnouncements(undefined, 'not a locale!')
    assert.match(fetchStub.calls[1].url, /locale=en/)
  } finally {
    fetchStub.restore()
  }
})

test('campaign auto-translate targets, overwrite detection and merge', () => {
  assert.deepEqual(campaign.campaignAutoTranslateTargets(['en', 'nl', 'fr', 'nl'], 'en'), ['nl', 'fr'])
  assert.equal(campaign.hasTranslatableSource({ subject: 'Hi', htmlContent: '<p>Body</p>' }), true)
  assert.equal(campaign.hasTranslatableSource({ subject: 'Hi', htmlContent: '<p></p>' }), false)
  assert.equal(campaign.hasTranslatableSource({ subject: 'Hi', htmlContent: '<p>x</p>', brevoTemplateId: 4 }), false)
  const content = {
    en: { subject: 'Hi {{firstName}}', htmlContent: '<p>Body</p>' },
    nl: { subject: 'Oud', htmlContent: '<p>Oud</p>', brevoTemplateId: 9 },
    fr: { subject: '', htmlContent: '<p></p>' },
  }
  assert.deepEqual(campaign.targetsWithExistingContent(content, ['nl', 'fr']), ['nl'])
  const merged = campaign.mergeCampaignTranslations(content, [
    { locale: 'nl', status: 'translated', content: { subject: 'Hoi {{firstName}}', htmlContent: '<p>Tekst</p>' } },
    { locale: 'fr', status: 'failed', errorCode: 'placeholder_lost', error: 'x' },
  ])
  assert.equal(merged.nl.subject, 'Hoi {{firstName}}')
  assert.equal(merged.nl.brevoTemplateId, undefined)
  assert.deepEqual(merged.fr, content.fr)
  assert.deepEqual(merged.en, content.en)
})

test('campaign auto-translate request never saves: it only posts to the translate endpoint', async () => {
  const fetchStub = stubFetch(async () => ({
    body: {
      success: true,
      data: {
        translations: [
          { locale: 'nl', status: 'translated', content: { subject: 'Hoi {{firstName}}', htmlContent: '<p>x</p>', previewText: 'p' } },
          { locale: 'fr', status: 'failed', errorCode: 'placeholder_lost', error: 'kept' },
          { bogus: true },
        ],
      },
    },
  }))
  try {
    const outcomes = await campaign.requestCampaignAutoTranslate({
      sourceLocale: 'en',
      targetLocales: ['nl', 'fr'],
      content: { subject: 'Hi {{firstName}}', htmlContent: '<p>x</p>', brevoTemplateId: undefined },
    })
    assert.equal(fetchStub.calls.length, 1)
    assert.equal(fetchStub.calls[0].url, 'https://backend.test/api/admin/marketing-campaigns/auto-translate')
    assert.equal(fetchStub.calls[0].init.method, 'POST')
    assert.deepEqual(outcomes.map((o) => [o.locale, o.status]), [['nl', 'translated'], ['fr', 'failed']])
    assert.equal(outcomes[0].content.subject, 'Hoi {{firstName}}')
  } finally {
    fetchStub.restore()
  }
})
