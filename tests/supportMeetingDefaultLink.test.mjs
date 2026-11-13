import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { componentHarness, elementText } from './helpers/componentHarness.mjs'
import { validateSupportMeetingLink } from '../lib/support/validation.ts'
import { supportMeetingSubmitOutcome } from '../lib/support/meetingState.ts'

const settingsFile = new URL('../components/admin/SupportMeetingLinkSettings.tsx', import.meta.url)
const ZOOM = 'https://us02web.zoom.us/j/1234567890'

const json = (locale) =>
  JSON.parse(readFileSync(new URL(`../messages/${locale}/support.json`, import.meta.url), 'utf8'))

function harness({ canWriteSupport = true, loaded, onUpdate } = {}) {
  const toasts = []
  const updates = []
  const h = componentHarness(settingsFile, {
    sonner: {
      toast: {
        success: (message) => toasts.push(['success', message]),
        error: (message) => toasts.push(['error', message]),
      },
    },
    '@/hooks/useAdminAccess': { useAdminAccess: () => ({ canWriteSupport }) },
    '@/lib/apiErrors': { getErrorMessage: (_error, fallback) => fallback },
    '@/lib/support': {
      adminGetSupportMeetingLinkSettings: async () => loaded,
      adminUpdateSupportMeetingLinkSettings: async (value) => {
        updates.push(value)
        return onUpdate(value)
      },
    },
    '@/lib/support/validation': { validateSupportMeetingLink },
  })
  return { h, toasts, updates }
}

const byTestId = (h, id) => h.findAll((n) => n.props['data-testid'] === id)
const input = (h) => h.findAll((n) => n.props.id === 'support-default-meeting-link')[0]
const form = (h) => h.findAll((n) => n.type === 'form')[0]
const button = (h, label) => h.findAll((n) => n.type === 'Button' && elementText(n) === label)[0]
const submit = async (h) => {
  form(h).props.onSubmit({ preventDefault() {} })
  await h.settle()
}

test('settings card warns when the admin has no default link and saves a valid https link', async () => {
  const { h, toasts, updates } = harness({
    loaded: { meetingLink: null, provider: null, updatedAt: null, receivesMeetings: true },
    onUpdate: (value) => ({ meetingLink: value.trim(), provider: 'zoom', updatedAt: '2026-11-12T10:00:00.000Z', receivesMeetings: true }),
  })
  h.render({})
  await h.settle()

  assert.equal(byTestId(h, 'support-meeting-link-missing').length, 1)
  assert.match(elementText(byTestId(h, 'support-meeting-link-missing')[0]), /You have no default meeting link/)
  assert.equal(button(h, 'Remove link'), undefined)
  assert.equal(button(h, 'Save link').props.disabled, true)

  // Invalid input is rejected client-side with an English message.
  input(h).props.onChange({ target: { value: 'http://zoom.us/j/1' } })
  await h.settle()
  await submit(h)
  assert.deepEqual(updates, [])
  assert.equal(input(h).props['aria-invalid'], true)
  assert.match(elementText(h.findAll((n) => n.props.role === 'alert')[0]), /^The meeting link must start with https:\/\/\.$/)

  input(h).props.onChange({ target: { value: ` ${ZOOM} ` } })
  await h.settle()
  assert.equal(input(h).props['aria-invalid'], false)
  await submit(h)

  assert.deepEqual(updates, [` ${ZOOM} `])
  assert.deepEqual(toasts, [['success', 'Default meeting link saved.']])
  assert.equal(byTestId(h, 'support-meeting-link-missing').length, 0)
  assert.equal(input(h).props.value, ZOOM)
  assert.ok(h.findAll((n) => elementText(n) === 'Saved link · Zoom').length > 0)
  h.unmount()
})

test('settings card clears an existing link and flags admins who cannot receive meetings', async () => {
  const { h, toasts, updates } = harness({
    loaded: { meetingLink: ZOOM, provider: 'zoom', updatedAt: null, receivesMeetings: false },
    onUpdate: () => ({ meetingLink: null, provider: null, updatedAt: null, receivesMeetings: false }),
  })
  h.render({})
  await h.settle()

  assert.equal(byTestId(h, 'support-meeting-link-missing').length, 0)
  assert.ok(h.findAll((n) => /^\s*Professionals cannot book meetings with you yet/.test(elementText(n))).length > 0)
  // Unchanged value cannot be re-saved; removing is explicit.
  assert.equal(button(h, 'Save link').props.disabled, true)
  button(h, 'Remove link').props.onClick()
  await h.settle()

  assert.deepEqual(updates, [''])
  assert.deepEqual(toasts, [['success', 'Default meeting link removed.']])
  assert.equal(byTestId(h, 'support-meeting-link-missing').length, 1)
  h.unmount()
})

test('settings card is hidden for admins without support write access', async () => {
  let loadedCalls = 0
  const h = componentHarness(settingsFile, {
    sonner: { toast: { success() {}, error() {} } },
    '@/hooks/useAdminAccess': { useAdminAccess: () => ({ canWriteSupport: false }) },
    '@/lib/apiErrors': { getErrorMessage: (_e, f) => f },
    '@/lib/support': {
      adminGetSupportMeetingLinkSettings: async () => { loadedCalls += 1; return null },
      adminUpdateSupportMeetingLinkSettings: async () => null,
    },
    '@/lib/support/validation': { validateSupportMeetingLink },
  })
  assert.equal(h.render({}), null)
  await h.settle()
  assert.equal(loadedCalls, 0)
})

test('ticket display marks a link that came from the assigned admin default', () => {
  const h = componentHarness(settingsFile, {
    sonner: { toast: {} },
    '@/hooks/useAdminAccess': { useAdminAccess: () => ({ canWriteSupport: true }) },
    '@/lib/apiErrors': { getErrorMessage: () => '' },
    '@/lib/support': {},
    '@/lib/support/validation': { validateSupportMeetingLink },
  })
  h.useComponent(h.exports.SupportMeetingLinkSourceNote)
  assert.match(elementText(h.render({ linkSource: 'admin_default' })), /Default link of the assigned admin/)
  assert.equal(h.render({ linkSource: 'manual' }), null)
  assert.equal(h.render({ linkSource: null }), null)

  const inbox = readFileSync(new URL('../components/admin/SupportInbox.tsx', import.meta.url), 'utf8')
  assert.match(inbox, /<SupportMeetingLinkSourceNote linkSource=\{meeting\.linkSource\} \/>/)
  const page = readFileSync(new URL('../app/(pages)/admin/support/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /<SupportMeetingLinkSettings \/>/)
})

// The admin UI is English-only: an admin with a nl/fr locale cookie saw this
// card and the ticket badge in Dutch/French inside the English inbox. The
// harness provides no next-intl, so a locale-following import would fail above.
test('the admin meeting-link card and ticket badge are English regardless of the visitor locale', () => {
  const source = readFileSync(settingsFile, 'utf8')
  assert.doesNotMatch(source, /from "(next-intl|@\/lib\/i18n\/useErrorMessage)"/)
  assert.match(source, /getErrorMessage\(error, "Your meeting link could not be saved\."\)/)
})

test('a meeting confirmed on submit shows the confirmation copy, a pending one the acknowledgement', () => {
  const base = {
    legacy: false,
    scheduledAt: '2031-03-04T09:00:00.000Z',
    durationMinutes: 30,
  }
  assert.equal(
    supportMeetingSubmitOutcome({ ...base, status: 'scheduled', meetingLink: ZOOM, linkActive: true }),
    'confirmed',
  )
  assert.equal(
    supportMeetingSubmitOutcome({ ...base, status: 'pending', meetingLink: null, linkActive: false }),
    'reserved',
  )
  assert.equal(
    supportMeetingSubmitOutcome({ ...base, status: 'scheduled', meetingLink: null, linkActive: false }),
    'reserved',
  )
  assert.equal(supportMeetingSubmitOutcome(null), 'reserved')

  const panel = readFileSync(new URL('../components/support/SupportMeetingsPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /meeting\.createdConfirmed/)
  assert.match(panel, /meeting\.confirmedEmailSent/)
  assert.match(panel, /meeting\.confirmedEmailFailed/)
  // The pending flow keeps its truthful acknowledgement copy.
  assert.match(panel, /meeting\.ackEmailSent/)
})

test('default link client uses the admin settings endpoint with a trimmed PUT body', () => {
  const source = readFileSync(new URL('../lib/support.ts', import.meta.url), 'utf8')
  assert.match(source, /SUPPORT_MEETING_LINK_SETTINGS_PATH =\s*"\/api\/admin\/support\/meeting-link-settings"/)
  const update = source.slice(source.indexOf('export async function adminUpdateSupportMeetingLinkSettings'))
  assert.match(update, /method: "PUT"/)
  assert.match(update, /JSON\.stringify\(\{ meetingLink: meetingLink\.trim\(\) \}\)/)
  const read = source.slice(
    source.indexOf('export async function adminGetSupportMeetingLinkSettings'),
    source.indexOf('export async function adminUpdateSupportMeetingLinkSettings'),
  )
  assert.match(read, /SUPPORT_MEETING_LINK_SETTINGS_PATH/)
  assert.doesNotMatch(read, /method:/)
  // The meeting DTO carries the link source for the ticket display.
  assert.match(source, /linkSource\?: "admin_default" \| "manual" \| null/)
})

test('default meeting link copy exists in en, nl and fr', () => {
  const locales = { en: json('en'), nl: json('nl'), fr: json('fr') }
  const keys = [
    'title', 'description', 'label', 'save', 'clear', 'saved', 'cleared', 'missingHint',
    'notReceivingHint', 'overrideNote', 'ticketDefaultBadge', 'current',
    'errors.required', 'errors.invalid', 'errors.https', 'errors.credentials', 'errors.length',
    'provider.zoom', 'provider.teams', 'provider.other',
  ]
  const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object)
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of keys) assert.ok(at(messages.adminMeetingLink, key), `${locale}: adminMeetingLink.${key}`)
    for (const key of ['createdConfirmed', 'createdConfirmedGeneric', 'confirmedEmailSent', 'confirmedEmailFailed']) {
      assert.ok(messages.meeting[key], `${locale}: meeting.${key}`)
    }
  }
  assert.match(locales.nl.adminMeetingLink.missingHint, /afwachting/)
  assert.match(locales.fr.adminMeetingLink.missingHint, /en attente/)
  assert.notEqual(locales.nl.adminMeetingLink.title, locales.en.adminMeetingLink.title)
  assert.notEqual(locales.fr.adminMeetingLink.title, locales.en.adminMeetingLink.title)
})
