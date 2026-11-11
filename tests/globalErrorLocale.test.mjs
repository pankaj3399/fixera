import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const { GLOBAL_ERROR_COPY, resolveGlobalErrorLocale } = await import('../lib/i18n/globalErrorLocale.ts')

test('global error copy follows the locale cookie, then URL prefix, then browser language', () => {
  assert.equal(resolveGlobalErrorLocale({ cookie: 'a=1; NEXT_LOCALE=nl', pathname: '/fr/x', languages: ['en'] }), 'nl')
  assert.equal(resolveGlobalErrorLocale({ cookie: 'NEXT_LOCALE=de', pathname: '/fr/projects', languages: ['en'] }), 'fr')
  assert.equal(resolveGlobalErrorLocale({ cookie: '', pathname: '/projects', languages: ['de-DE', 'fr-BE'] }), 'fr')
  assert.equal(resolveGlobalErrorLocale({}), 'en')
})

test('every locale has the same copy keys', () => {
  const keys = Object.keys(GLOBAL_ERROR_COPY.en).sort()
  for (const locale of ['nl', 'fr']) assert.deepEqual(Object.keys(GLOBAL_ERROR_COPY[locale]).sort(), keys)
  assert.notEqual(GLOBAL_ERROR_COPY.nl.title, GLOBAL_ERROR_COPY.en.title)
})
