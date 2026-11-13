import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = (await import('react')).default
const { renderToStaticMarkup } = await import('react-dom/server')
const intl = await import('next-intl')
const { NextIntlClientProvider, useTranslations, useFormatter, useLocale, useTimeZone, useNow } = intl
const ScopedMessagesProvider = (await import('../components/i18n/ScopedMessagesProvider.tsx')).default
const { loadComponent } = await import('./reviewComponentHarness.mjs')
const { ROOT_CLIENT_NAMESPACES, scopeNamespaces } = await import('../i18n/clientNamespaces.ts')
const { NAMESPACES } = await import('../i18n/namespaces.ts')

const h = React.createElement
const now = new Date('2026-03-01T10:00:00.000Z')

function Probe() {
  const common = useTranslations('common')
  const home = useTranslations('home')
  const format = useFormatter()
  return h('p', null, [
    common('greeting'), home('title'), useLocale(), useTimeZone(), useNow().toISOString(),
    format.number(1234.5, 'money'), format.dateTime(now, { hour: 'numeric', minute: 'numeric' }),
  ].join('|'))
}

function MissingProbe() {
  const t = useTranslations('search')
  return h('p', null, t('title'))
}

const renderTree = (child, onError) => renderToStaticMarkup(
  h(NextIntlClientProvider, {
    locale: 'nl', timeZone: 'Asia/Tokyo', now,
    formats: { number: { money: { style: 'currency', currency: 'EUR' } } },
    messages: { common: { greeting: 'Hallo' } },
    onError, getMessageFallback: ({ namespace, key }) => `fallback:${namespace}.${key}`,
  }, h(ScopedMessagesProvider, { messages: { home: { title: 'Welkom' } } }, child)))

test('a scoped provider adds its namespaces and inherits locale, formats, timeZone and now', () => {
  const html = renderTree(h(Probe))
  const [greeting, title, locale, timeZone, nowIso, money, time] = html.replace(/<\/?p>/g, '').split('|')
  assert.equal(greeting, 'Hallo')
  assert.equal(title, 'Welkom')
  assert.equal(locale, 'nl')
  assert.equal(timeZone, 'Asia/Tokyo')
  assert.equal(nowIso, now.toISOString())
  assert.match(money, /€\s?1\.234,50/)
  assert.equal(time, '19:00')
})

test('a namespace no provider supplies goes through the parent onError and getMessageFallback', () => {
  const errors = []
  const html = renderTree(h(MissingProbe), (error) => errors.push(error.code))
  assert.match(html, /fallback:search\.title/)
  assert.deepEqual(errors, ['MISSING_MESSAGE'])
})

test('ScopedIntlProvider sends only the scope namespaces that the root set lacks', async () => {
  const locale = 'fr'
  const full = Object.fromEntries(NAMESPACES.map((ns) => [ns, JSON.parse(readFileSync(new URL(`../messages/${locale}/${ns}.json`, import.meta.url), 'utf8'))]))
  const ScopedIntlProvider = loadComponent('../components/i18n/ScopedIntlProvider.tsx', {
    'next-intl/server': { getMessages: async () => full },
    '@/i18n/clientNamespaces': await import('../i18n/clientNamespaces.ts'),
    './ScopedMessagesProvider': { __esModule: true, default: 'scoped-messages' },
  })
  for (const scope of ['home', 'projectDetail', 'authenticated']) {
    const element = await ScopedIntlProvider({ scope, children: 'child' })
    assert.equal(element.type, 'scoped-messages')
    assert.equal(element.props.children, 'child')
    assert.deepEqual(Object.keys(element.props.messages).sort(), [...scopeNamespaces(scope)].sort())
    for (const ns of Object.keys(element.props.messages)) {
      assert.ok(!ROOT_CLIENT_NAMESPACES.includes(ns))
      assert.equal(element.props.messages[ns], full[ns])
    }
  }
})
