import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isBackendRequest,
  normalizeBackendLocale,
  withBackendLocale,
} from '../lib/i18n/backendLocale.ts'
import { apiErrorFromBody, classifyApiError, getErrorMessage } from '../lib/apiErrors.ts'
import { supportChatBlockReasonFromError } from '../lib/support/chatAccess.ts'

const API = 'https://api.example.test'

test('normalizeBackendLocale keeps en/nl/fr and defaults to en', () => {
  assert.equal(normalizeBackendLocale('nl'), 'nl')
  assert.equal(normalizeBackendLocale('fr-BE'), 'fr')
  assert.equal(normalizeBackendLocale('de'), 'en')
  assert.equal(normalizeBackendLocale(undefined), 'en')
})

test('only requests to the API origin are recognised', () => {
  assert.equal(isBackendRequest(`${API}/api/support`, API), true)
  assert.equal(isBackendRequest('/api/local', API, 'https://www.example.test/nl'), false)
  assert.equal(isBackendRequest('https://maps.example.test/x', API), false)
  assert.equal(isBackendRequest(`${API}/api/x`, undefined), false)
})

test('withBackendLocale adds Accept-Language to API requests only', () => {
  const [, init] = withBackendLocale(`${API}/api/support`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
    backendUrl: API,
    locale: 'nl',
  })
  const headers = new Headers(init.headers)
  assert.equal(headers.get('accept-language'), 'nl')
  assert.equal(headers.get('content-type'), 'application/json')
  assert.equal(init.method, 'POST')

  const other = { headers: { a: '1' } }
  assert.equal(withBackendLocale('https://elsewhere.test/x', other, { backendUrl: API, locale: 'fr' })[1], other)
})

test('an explicit Accept-Language from the caller wins', () => {
  const init = { headers: { 'Accept-Language': 'en' } }
  assert.equal(withBackendLocale(`${API}/api/admin`, init, { backendUrl: API, locale: 'fr' })[1], init)
})

test('localized API copy is shown while classification uses the English source', () => {
  const body = {
    success: false,
    msg: 'Onderwerp is verplicht.',
    message: 'Onderwerp is verplicht.',
    code: 'VALIDATION',
    messageKey: 'support.label_required',
    messageEn: 'Subject is required.',
  }
  assert.equal(getErrorMessage({ response: { status: 400, data: body } }, 'fallback'), 'Onderwerp is verplicht.')
  assert.equal(getErrorMessage(apiErrorFromBody(body, 'fallback', { status: 400 }), 'fallback'), 'Onderwerp is verplicht.')
})

test('a localized generic server message still maps to the localized category copy', () => {
  const body = {
    success: false,
    msg: 'Meld je aan om verder te gaan.',
    messageEn: 'Please sign in to continue.',
  }
  const error = apiErrorFromBody(body, 'fallback', { status: 401 })
  assert.equal(classifyApiError(error).kind, 'signInRequired')
  assert.equal(getErrorMessage(error, 'fallback', { signInRequired: 'UI copy' }), 'UI copy')
})

test('support-chat 403 detection works on localized copy via messageEn', () => {
  const error = apiErrorFromBody(
    {
      success: false,
      msg: 'Supportchat is enkel beschikbaar voor vakmensen.',
      messageEn: 'Support chat is only available for professional accounts.',
    },
    'fallback',
    { status: 403 },
  )
  assert.equal(supportChatBlockReasonFromError(error), 'role')
})
