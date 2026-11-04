import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bookedSubprojectIndex, bookedUnitPricing, canonicalUnit, resolveBookingUnit } from '../lib/bookingUnits.ts'

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

test('F7: the immutable booking snapshot unit wins over the live, editable project', () => {
  // Professional changed the booked package from m² to hours after booking.
  assert.equal(resolveBookingUnit({ snapshotSubprojectUnit: 'm2', subprojectUnit: 'hour', priceModel: 'hour' }), 'm2')
  // Quotation/legacy bookings have no checkout snapshot unit (or a generic one).
  assert.equal(resolveBookingUnit({ checkoutSnapshotUnit: 'unit', snapshotSubprojectUnit: 'm3', subprojectUnit: 'room' }), 'm3')
  assert.equal(resolveBookingUnit({ checkoutSnapshotUnit: 'day', snapshotSubprojectUnit: 'm3' }), 'day', 'checkout snapshot stays first')
  assert.equal(resolveBookingUnit({ snapshotSubprojectUnit: null, subprojectUnit: 'hour' }), 'hour', 'live project only as fallback')
  assert.match(PAGE, /snapshotSubprojectUnit: details\?\.bookingSnapshot\?\.selectedSubproject\?\.pricing\?\.unit/)
})

test('booked subproject index: explicit index, else the only package', () => {
  assert.equal(bookedSubprojectIndex(1, 3), 1)
  assert.equal(bookedSubprojectIndex(5, 3), null)
  assert.equal(bookedSubprojectIndex(undefined, 1), 0)
  assert.equal(bookedSubprojectIndex(null, 1), 0)
  assert.equal(bookedSubprojectIndex(undefined, 2), null)
})

test('an explicit but invalid booked index never falls back to the only remaining package', () => {
  // Booked package 2 of 3, two packages deleted since: the survivor is not the booked one.
  assert.equal(bookedSubprojectIndex(2, 1), null)
  assert.equal(bookedSubprojectIndex(-1, 1), null)
  assert.equal(bookedSubprojectIndex(0.5, 1), null)
  assert.equal(bookedSubprojectIndex(Number.NaN, 1), null)
  assert.equal(bookedSubprojectIndex(0, 1), 0)
})

test('completion adjustment prices from the booking-time snapshot, like its unit label', () => {
  // Booked at €12 per m²; the professional later re-priced the live package to €45 per hour.
  const live = [{ pricing: { type: 'unit', amount: 45, unit: 'hour' } }]
  const snapshotPricing = { type: 'unit', amount: 12, unit: 'm2' }
  const priced = bookedUnitPricing({ snapshotPricing, liveSubprojects: live, selectedIndex: 0 })
  assert.deepEqual(priced, { ok: true, unitPrice: 12, liveSubprojectIndex: 0 })
  assert.equal(resolveBookingUnit({ snapshotSubprojectUnit: snapshotPricing.unit, subprojectUnit: live[0].pricing.unit }), 'm2', 'label from the same snapshot')
  // Live package turned fixed after booking: the snapshot still prices it per unit.
  assert.equal(bookedUnitPricing({ snapshotPricing, liveSubprojects: [{ pricing: { type: 'fixed', amount: 900 } }], selectedIndex: 0 }).unitPrice, 12)
  // Package deleted after booking: the snapshot is enough.
  assert.deepEqual(bookedUnitPricing({ snapshotPricing, liveSubprojects: [], selectedIndex: 3 }), { ok: true, unitPrice: 12, liveSubprojectIndex: null })
})

test('without a snapshot the live package is the fallback, with the old error outcomes', () => {
  const live = [{ pricing: { type: 'unit', amount: 30, unit: 'm2' } }, { pricing: { type: 'fixed', amount: 500 } }]
  assert.deepEqual(bookedUnitPricing({ snapshotPricing: undefined, liveSubprojects: live, selectedIndex: 0 }), { ok: true, unitPrice: 30, liveSubprojectIndex: 0 })
  assert.deepEqual(bookedUnitPricing({ snapshotPricing: null, liveSubprojects: live, selectedIndex: undefined }), { ok: false, reason: 'noSubproject' })
  assert.deepEqual(bookedUnitPricing({ snapshotPricing: null, liveSubprojects: live, selectedIndex: 1 }), { ok: false, reason: 'notUnitPriced' })
  assert.deepEqual(bookedUnitPricing({ snapshotPricing: null, liveSubprojects: [live[0]], selectedIndex: 4 }), { ok: false, reason: 'noSubproject' }, 'stale index')
  assert.deepEqual(bookedUnitPricing({ snapshotPricing: { type: 'unit', amount: 0 }, liveSubprojects: live, selectedIndex: 0 }), { ok: false, reason: 'unitPriceMissing' })
})

test('completion pop-up wiring: the adjustment price comes from bookedUnitPricing with the snapshot', () => {
  assert.match(PAGE, /bookedUnitPricing\(\{\s*snapshotPricing: details\?\.bookingSnapshot\?\.selectedSubproject\?\.pricing,\s*liveSubprojects: bookingSubprojects,\s*selectedIndex: booking\?\.selectedSubprojectIndex,/)
  assert.match(PAGE, /const \{ unitPrice \} = pricing/)
  assert.doesNotMatch(PAGE, /const unitPrice = Number\(sub\?\.pricing\?\.amount\)/)
  for (const locale of ['en', 'nl', 'fr']) {
    for (const reason of ['noSubproject', 'notUnitPriced', 'unitPriceMissing']) {
      assert.ok(messages(locale).extraCosts.toasts[reason], `${locale}.${reason}`)
    }
  }
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
