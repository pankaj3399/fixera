import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
const { PRICE_MODEL_KEYS, priceModelKey } = await import('../lib/priceModel.ts')
const { activityQualityNoteKey } = await import('../lib/bookingDetails.ts')
const { tablePriceModelKey } = await import('../components/dashboard/sharedTableText.tsx')

const LOCALES = ['en', 'nl', 'fr']
const read = (locale, ns) => JSON.parse(readFileSync(new URL(`../messages/${locale}/${ns}.json`, import.meta.url), 'utf8'))
const at = (tree, dotted) => dotted.split('.').reduce((node, key) => node?.[key], tree)

test('the RFQ submission quality note has copy in every locale', () => {
  const key = activityQualityNoteKey('RFQ_SUBMISSION_ACTOR_NOT_RECORDED')
  const texts = LOCALES.map(locale => at(read(locale, 'bookings'), `details.${key}`))
  for (const text of texts) assert.equal(typeof text, 'string')
  assert.equal(new Set(texts).size, 3, 'nl and fr are translated, not English')
})

test('free-text project price models map to a translated token in details and tables', () => {
  assert.equal(priceModelKey('Fixed Price'), 'fixed')
  assert.equal(priceModelKey('Fixed price'), 'fixed')
  assert.equal(priceModelKey('fixed_price'), 'fixed')
  assert.equal(priceModelKey('price_per_unit'), 'unit')
  assert.equal(priceModelKey('Price per m²'), 'm2')
  assert.equal(priceModelKey('Per hour'), 'hour')
  assert.equal(priceModelKey('Request for quote'), 'rfq')
  assert.equal(priceModelKey('rfq'), 'rfq')
  assert.equal(priceModelKey('Something bespoke'), null)
  assert.equal(priceModelKey(''), null)
  assert.equal(tablePriceModelKey('Fixed Price'), 'fixed')

  for (const locale of LOCALES) {
    const bookings = read(locale, 'bookings')
    const widgets = read(locale, 'dashboardWidgets')
    for (const token of PRICE_MODEL_KEYS) {
      assert.equal(typeof at(bookings, `details.enums.pricingType.${token}`), 'string', `${locale} details ${token}`)
      assert.equal(typeof at(widgets, `tables.priceModels.${token}`), 'string', `${locale} tables ${token}`)
    }
  }
  assert.equal(read('nl', 'bookings').details.enums.pricingType[priceModelKey('Fixed Price')], 'Vaste prijs')
  assert.equal(read('fr', 'bookings').details.enums.pricingType[priceModelKey('Fixed Price')], 'Prix fixe')
})

test('the booking overview passes the normalised price model to its enum label', () => {
  const source = readFileSync(new URL('../components/booking/details/OverviewPanel.tsx', import.meta.url), 'utf8')
  assert.match(source, /prefix="details\.enums\.pricingType" value=\{priceModelKey\(details\?\.booking\?\.priceModel\) \?\? details\?\.booking\?\.priceModel\}/)
})

// The legacy service option "Total price or m² of material" was labelled
// "Fixed price"; text naming more than one model is now shown as recorded.
// Same cases as fixera-server's normalizePriceModel test.
test('a price model text naming several models has no single translated token', () => {
  for (const [text, key] of [
    ['Fixed Price', 'fixed'], ['Price per hour', 'hour'], ['m2', 'm2'], ['Price per square metre', 'm2'],
    ['Total price or m² of material', null], ['Total price or m² of material or per hour', null], ['Something bespoke', null],
  ]) assert.equal(priceModelKey(text), key, text)
  assert.equal(tablePriceModelKey('Total price or m² of material'), null)
})
