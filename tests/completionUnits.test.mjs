import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bookedSubprojectIndex, canonicalUnit, resolveBookingUnit } from '../lib/bookingUnits.ts'

const messages = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}/bookings.json`, import.meta.url), 'utf8'))
const PAGE = readFileSync(new URL('../app/(pages)/bookings/[id]/page.tsx', import.meta.url), 'utf8')

test('configured units map to a canonical unit; generic words do not', () => {
  for (const [raw, unit] of [['m2', 'm2'], ['m²', 'm2'], ['per m2', 'm2'], ['sqm', 'm2'], ['hour', 'hour'], ['Hours', 'hour'], ['h', 'hour'], ['day', 'day'], ['dagen', 'day'], ['meter', 'meter'], ['room', 'room'], ['m3', 'm3']]) {
    assert.equal(canonicalUnit(raw), unit, raw)
  }
  assert.equal(canonicalUnit('window'), null)
  assert.equal(canonicalUnit(undefined), null)
})

test('unit resolution prefers the most authoritative configured source', () => {
  assert.equal(resolveBookingUnit({ costUnit: 'day', checkoutSnapshotUnit: 'hour', subprojectUnit: 'm2' }), 'day')
  assert.equal(resolveBookingUnit({ checkoutSnapshotUnit: 'hour', subprojectUnit: 'm2' }), 'hour')
  assert.equal(resolveBookingUnit({ checkoutSnapshotUnit: 'unit', subprojectUnit: 'm2', priceModel: 'unit' }), 'm2', 'generic "unit" never wins')
  assert.equal(resolveBookingUnit({ subprojectUnit: '', priceModel: 'hour' }), 'hour')
  assert.equal(resolveBookingUnit({ priceModel: 'rfq' }), null)
  assert.equal(resolveBookingUnit({ subprojectUnit: 'window' }), 'window', 'custom service units are shown as configured')
})

test('booked subproject index: explicit index, else the only package', () => {
  assert.equal(bookedSubprojectIndex(1, 3), 1)
  assert.equal(bookedSubprojectIndex(5, 3), null)
  assert.equal(bookedSubprojectIndex(undefined, 1), 0)
  assert.equal(bookedSubprojectIndex(undefined, 2), null)
})

test('completion pop-up strings name the configured unit in every locale', () => {
  for (const locale of ['en', 'nl', 'fr']) {
    const extra = messages(locale).extraCosts
    for (const key of ['addUnit', 'unitAdjustmentName', 'unitPrice', 'estimatedUnits', 'actualUnits']) {
      assert.match(extra[key], /\{unit\}/, `${locale}.${key}`)
    }
    assert.match(extra.unitDetail, /\{estimated\} \{unit\}.*\{actual\} \{unit\}/, `${locale}.unitDetail`)
    for (const form of ['one', 'other']) {
      for (const unit of ['hour', 'day', 'meter', 'm2', 'm3', 'room', 'piece', 'unit']) {
        assert.ok(extra.unitNames[form][unit], `${locale}.unitNames.${form}.${unit}`)
      }
    }
  }
  const en = messages('en').extraCosts
  const render = (template, values) => template.replace(/\{(\w+)\}/g, (_, name) => values[name])
  assert.equal(render(en.estimatedUnits, { unit: en.unitNames.other.m2 }), 'Estimated m²')
  assert.equal(render(en.unitPrice, { unit: en.unitNames.one.hour }), 'Price per hour')
  assert.equal(render(en.addUnit, { unit: en.unitNames.other.day }), '+ days adj.')
})

test('completion pop-up resolves the unit from the booked subproject instead of a generic label', () => {
  assert.match(PAGE, /subprojectUnit: bookedSubIdx != null \? bookingSubprojects\[bookedSubIdx\]\?\.pricing\?\.unit/)
  assert.match(PAGE, /t\("extraCosts\.addUnit", \{ unit: unitWord\(configuredUnit, 'other'\) \}\)/)
  assert.match(PAGE, /t\("extraCosts\.unitPrice", \{ unit: unitWord\(costUnit, 'one'\) \}\)/)
  assert.doesNotMatch(PAGE, /extraCosts\.unitsFallback/)
})
