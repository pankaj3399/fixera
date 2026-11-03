import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
const {
  effectiveExecutionDuration,
  isHourUnit,
  packageDurationMode,
  withChosenDurationBasis,
} = await import('../lib/packageDuration.ts')
const { collectSubprojectErrors } = await import('../lib/projectWizardValidation.ts')

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const messages = (locale) => JSON.parse(source(`messages/${locale}/projectWizard.json`))
const t = (key) => key

test('duration mode mirrors the backend: hourly per-unit is customer-determined, other units scale, legacy stays per booking', () => {
  for (const unit of ['h', 'hr', 'hrs', 'hour', 'Hours', 'HUR']) {
    assert.equal(isHourUnit(unit), true, unit)
    assert.equal(packageDurationMode({ type: 'unit', unit, durationBasis: 'per_unit' }), 'customer_hours', unit)
  }
  for (const unit of ['m²', 'm2', 'day', 'room', 'window']) {
    assert.equal(packageDurationMode({ type: 'unit', unit, durationBasis: 'per_unit' }), 'per_unit', unit)
  }
  // Saved before the duration basis existed: the backend keeps one booking-wide duration.
  assert.equal(packageDurationMode({ type: 'unit', unit: 'hour' }), 'per_booking')
  assert.equal(packageDurationMode({ type: 'unit', unit: 'm²', durationBasis: 'per_booking' }), 'per_booking')
  assert.equal(packageDurationMode({ type: 'fixed', unit: 'hour', durationBasis: 'per_unit' }), 'per_booking')
  assert.equal(packageDurationMode(undefined), 'per_booking')
})

test('choosing a pricing type sets the per-unit basis only for unit pricing', () => {
  assert.deepEqual(withChosenDurationBasis({ type: 'unit', amount: 0 }), { type: 'unit', amount: 0, durationBasis: 'per_unit' })
  assert.equal(withChosenDurationBasis({ type: 'fixed', durationBasis: 'per_unit' }).durationBasis, undefined)
  assert.equal(withChosenDurationBasis({ type: 'rfq' }).durationBasis, undefined)
})

test('6.A: the booked hours are the execution duration of an hourly package', () => {
  const pkg = { pricing: { type: 'unit', unit: 'hour', durationBasis: 'per_unit' }, executionDuration: { value: undefined, unit: 'hours' } }
  assert.deepEqual(effectiveExecutionDuration(pkg, undefined, 1), { value: 1, unit: 'hours', range: undefined })
  assert.deepEqual(effectiveExecutionDuration(pkg, undefined, 6), { value: 6, unit: 'hours', range: undefined })
  // A duration saved before the wizard cleared it is ignored, as the backend does.
  const saved = { ...pkg, executionDuration: { value: 5, unit: 'days' } }
  assert.deepEqual(effectiveExecutionDuration(saved, undefined, 2.5), { value: 2.5, unit: 'hours', range: undefined })
})

test('6.B: a per-unit duration scales by the booked quantity, legacy and fixed packages do not', () => {
  const perM2 = { pricing: { type: 'unit', unit: 'm²', durationBasis: 'per_unit' }, executionDuration: { value: 0.5, unit: 'days' } }
  assert.deepEqual(effectiveExecutionDuration(perM2, undefined, 1), { value: 0.5, unit: 'days' })
  assert.deepEqual(effectiveExecutionDuration(perM2, undefined, 40), { value: 20, unit: 'days' })
  const legacy = { pricing: { type: 'unit', unit: 'm²' }, executionDuration: { value: 2, unit: 'days' } }
  assert.deepEqual(effectiveExecutionDuration(legacy, undefined, 40), { value: 2, unit: 'days' })
  const fixed = { pricing: { type: 'fixed' }, executionDuration: { value: 3, unit: 'hours' } }
  assert.deepEqual(effectiveExecutionDuration(fixed, undefined, 1), { value: 3, unit: 'hours' })
  assert.deepEqual(effectiveExecutionDuration(null, { value: 4, unit: 'days' }, 1), { value: 4, unit: 'days' })
  // An invalid quantity never invents a duration.
  assert.deepEqual(effectiveExecutionDuration(perM2, undefined, 0), perM2.executionDuration)
})

test('wizard validation does not ask a duration for hourly packages but still does for per-unit ones', () => {
  const base = {
    name: 'Package', description: 'A described package scope',
    included: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], materialsIncluded: false,
    preparationDuration: { value: 0 },
  }
  const hourly = { ...base, pricing: { type: 'unit', amount: 50, unit: 'hour', durationBasis: 'per_unit' }, executionDuration: { unit: 'hours' } }
  assert.deepEqual(collectSubprojectErrors(hourly, 0, t), [])
  const perM2 = { ...base, pricing: { type: 'unit', amount: 50, unit: 'm²', durationBasis: 'per_unit' }, executionDuration: { unit: 'days' } }
  assert.deepEqual(collectSubprojectErrors(perM2, 0, t), ['validation.executionDurationRequired'])
  const legacyHourly = { ...base, pricing: { type: 'unit', amount: 50, unit: 'hour' }, executionDuration: { unit: 'hours' } }
  assert.deepEqual(collectSubprojectErrors(legacyHourly, 0, t), ['validation.executionDurationRequired'])
})

test('wizard wiring: new and re-typed packages get a basis; hourly shows "determined by customer"; per-unit is labelled', () => {
  const step2 = source('components/professional/project-wizard/Step2Subprojects.tsx')
  assert.match(step2, /withPricingUnit\(\s*withChosenDurationBasis\(\{\s*type: defaultPricingType,/, 'addSubproject')
  assert.match(step2, /withPricingUnit\(withChosenDurationBasis\(\{ \.\.\.sub\.pricing, type: defaultType \}\), unitLabel\)/, 'default type repair')
  assert.match(step2, /withPricingUnit\(withChosenDurationBasis\(\{ \.\.\.subproject\.pricing, type: value \}\), unitLabel\)/, 'type select')
  assert.match(step2, /=== 'customer_hours' \? \(\s*<div>[\s\S]*?step2\.timing\.determinedByCustomer/)
  assert.match(step2, /step2\.timing\.executionPerUnitLabel/)
  assert.match(step2, /value: undefined, unit: 'hours' as const/, 'hourly packages store no professional value')
  const review = source('app/(pages)/projects/create/page.tsx')
  assert.match(review, /packageDurationMode\(sub\.pricing\) === 'customer_hours'/)
})

test('booking form uses the booked-quantity duration everywhere it times or blocks the calendar', () => {
  const form = source('components/project/ProjectBookingForm.tsx')
  assert.doesNotMatch(form, /selectedPackage\?\.executionDuration \|\| project\.executionDuration/)
  assert.match(form, /effectiveExecutionDuration<AnyExecutionDuration>\(\s*selectedPackage,\s*project\.executionDuration,\s*isUnitPricing \? estimatedUsage : 1,/)
  assert.ok((form.match(/= bookedExecution;/g) || []).length >= 6)
})

test('new duration strings exist in every locale with their placeholders', () => {
  for (const locale of ['en', 'nl', 'fr']) {
    const { timing, summary } = messages(locale).step2
    assert.ok(timing.determinedByCustomer && timing.determinedByCustomerHint, locale)
    assert.match(timing.executionPerUnitLabel, /\{unit\}/, locale)
    assert.match(timing.executionPerUnitHint, /\{unit\}/, locale)
    assert.match(summary.durationPerUnit, /\{value\}.*\{unit\}.*\{pricingUnit\}/, locale)
  }
})
