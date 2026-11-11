import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { useTranslations } = await import('next-intl')
const { default: PackageDurationLabel } = await import('@/components/search/PackageDurationLabel')
const { packageDurationDisplay } = await import('@/lib/packageDuration.ts')

const messages = (locale) => ({
  search: JSON.parse(readFileSync(new URL(`../messages/${locale}/search.json`, import.meta.url), 'utf8')),
  projectBooking: JSON.parse(readFileSync(new URL(`../messages/${locale}/projectBooking.json`, import.meta.url), 'utf8')),
})

const hourly = {
  name: 'Painting help',
  description: 'Customer picks the hours',
  pricing: { type: 'unit', amount: 45, unit: 'hour', durationBasis: 'per_unit' },
  executionDuration: { unit: 'hours' },
}
const perM2 = {
  name: 'Floor tiles',
  description: 'Per square metre',
  pricing: { type: 'unit', amount: 12, unit: 'm²', durationBasis: 'per_unit' },
  executionDuration: { value: 0.5, unit: 'days' },
}
const fixed = {
  name: 'Kitchen repaint',
  description: 'Whole job',
  pricing: { type: 'fixed', amount: 900 },
  executionDuration: { value: 3, unit: 'hours' },
}

const CARD = readFileSync(new URL('../components/search/ProjectCard.tsx', import.meta.url), 'utf8')

const withIntl = (locale, element) =>
  renderToStaticMarkup(React.createElement(NextIntlClientProvider, { locale, messages: messages(locale), timeZone: 'UTC' }, element))

/** The package rows exactly as the search card renders them. */
const render = (subprojects, locale) =>
  withIntl(locale, React.createElement(React.Fragment, null, ...subprojects.map((subproject, key) => React.createElement(PackageDurationLabel, { subproject, key }))))

test('control: the card\'s old ICU call turns an absent hourly value into NaN', () => {
  // What ProjectCard did before: pass executionDuration.value straight to the plural formatter.
  const Old = ({ subproject }) => {
    const t = useTranslations('search')
    return React.createElement('span', null, t('units.hours', { count: subproject.executionDuration.value }))
  }
  assert.match(withIntl('nl', React.createElement(Old, { subproject: hourly })), /NaN uur/)
})

test('search card: a customer-set hourly package shows "determined by customer", never NaN', () => {
  const expected = { en: 'Hours (determined by customer)', nl: 'Uren (bepaald door de klant)', fr: 'Heures (déterminées par le client)' }
  for (const locale of ['en', 'nl', 'fr']) {
    const html = render([hourly], locale)
    assert.doesNotMatch(html, /NaN/, locale)
    assert.ok(html.includes(expected[locale]), `${locale}: ${expected[locale]}`)
  }
})

test('search card: finite durations of other packages still render with their unit', () => {
  const html = render([perM2, fixed], 'nl')
  assert.doesNotMatch(html, /NaN/)
  assert.ok(html.includes('0,5 dagen') || html.includes('0.5 dagen'), 'per-unit days')
  assert.ok(html.includes('3 uur'), 'fixed hours')
  // A package without a finite value shows no duration rather than NaN.
  const missing = render([{ ...fixed, executionDuration: { unit: 'hours' } }], 'nl')
  assert.equal(missing, '')
})

test('search card wiring: package rows use the guarded label and the DTO carries the duration mode', () => {
  assert.match(CARD, /<PackageDurationLabel subproject=\{subproject\} \/>/)
  assert.doesNotMatch(CARD, /count: subproject\.executionDuration\.value/)
  assert.match(CARD, /unit\?: string;\s*durationBasis\?: 'per_booking' \| 'per_unit';/)
  assert.match(CARD, /project\.executionDuration && Number\.isFinite\(project\.executionDuration\.value\)/)
})

test('package duration display mirrors the duration mode', () => {
  assert.deepEqual(packageDurationDisplay(hourly), { kind: 'customer_hours' })
  // Even a stale stored value is not shown as the professional's duration.
  assert.deepEqual(packageDurationDisplay({ ...hourly, executionDuration: { value: 5, unit: 'days' } }), { kind: 'customer_hours' })
  assert.deepEqual(packageDurationDisplay(perM2), { kind: 'duration', value: 0.5, unit: 'days' })
  assert.deepEqual(packageDurationDisplay(fixed), { kind: 'duration', value: 3, unit: 'hours' })
  // FT1 6A: a legacy hour-unit package without a basis is determined by the customer too.
  assert.deepEqual(packageDurationDisplay({ pricing: { type: 'unit', unit: 'hour' }, executionDuration: { value: 2, unit: 'hours' } }), { kind: 'customer_hours' })
  // A legacy non-hour unit package keeps its stored (per-booking) duration.
  assert.deepEqual(packageDurationDisplay({ pricing: { type: 'unit', unit: 'm²' }, executionDuration: { value: 2, unit: 'days' } }), { kind: 'duration', value: 2, unit: 'days' })
  for (const value of [undefined, null, Number.NaN, Infinity, '3']) {
    assert.equal(packageDurationDisplay({ pricing: { type: 'fixed' }, executionDuration: { value, unit: 'hours' } }), null, String(value))
  }
  assert.equal(packageDurationDisplay(undefined), null)
})
