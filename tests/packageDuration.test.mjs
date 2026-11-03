import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
const {
  effectiveExecutionDuration,
  isHourUnit,
  packageDurationMode,
  pricingTypeChangeUpdates,
  withChosenDurationBasis,
  withSyncedPricingUnit,
  withoutRetainedDurations,
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

const validBase = {
  name: 'Package', description: 'A described package scope',
  included: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], materialsIncluded: false,
  preparationDuration: { value: 0 },
}

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

// Wizard package helpers. `typeChange` stands in for the Step 2 type select and
// auto-repair: withChosenDurationBasis, then the pricing unit, then the updates.
const typeChange = (pkg, type, unit) => ({
  ...pkg,
  ...pricingTypeChangeUpdates(pkg, { ...withChosenDurationBasis({ ...pkg.pricing, type }), unit: type === 'unit' ? unit : undefined }),
})

test('a whole-job duration is not carried into unit pricing, where it would be read per unit', () => {
  const fixed = { pricing: { type: 'fixed', amount: 900 }, executionDuration: { value: 3, unit: 'days' } }
  const unit = typeChange(fixed, 'unit', 'm²')
  assert.equal(packageDurationMode(unit.pricing), 'per_unit')
  assert.equal(unit.executionDuration.value, undefined, '3 days must not become 3 days per m²')
  assert.equal(unit.executionDuration.unit, 'days', 'the unit choice is kept')
  // Without the reset, 10 booked m² would block 30 days.
  assert.equal(effectiveExecutionDuration(unit, undefined, 10).value, undefined)
  const rfq = { pricing: { type: 'rfq' }, executionDuration: { value: 2, unit: 'hours', range: { min: 1, max: 4 } } }
  assert.equal(typeChange(rfq, 'unit', 'room').executionDuration.value, undefined)
  // Other type changes keep the duration.
  assert.equal(typeChange(fixed, 'rfq').executionDuration.value, 3)
  const perUnit = { pricing: { type: 'unit', unit: 'm²', durationBasis: 'per_unit' }, executionDuration: { value: 0.5, unit: 'days' } }
  assert.equal(typeChange(perUnit, 'fixed').executionDuration.value, 0.5)
})

test('per-unit option → hourly option → same per-unit option restores the value and its unit', () => {
  const perM2 = { pricing: { type: 'unit', unit: 'm²', durationBasis: 'per_unit' }, executionDuration: { value: 0.5, unit: 'days' } }
  const hourly = withSyncedPricingUnit(perM2, 'hour')
  assert.equal(packageDurationMode(hourly.pricing), 'customer_hours')
  assert.deepEqual(hourly.executionDuration, { value: undefined, unit: 'hours' })
  const back = withSyncedPricingUnit(hourly, 'm²')
  assert.deepEqual(back.executionDuration, { value: 0.5, unit: 'days' })
  assert.equal(back.retainedPerUnitDuration, undefined)
  assert.deepEqual(collectSubprojectErrors({ ...validBase, ...back, pricing: { ...back.pricing, amount: 12 } }, 0, t), [])
  // A different per-unit option does not inherit the m² value.
  assert.equal(withSyncedPricingUnit(hourly, 'room').executionDuration.value, undefined)
  // Unchanged unit is a no-op.
  assert.equal(withSyncedPricingUnit(perM2, 'm²'), perM2)
})

test('an old fixed duration is never restored as a per-unit duration', () => {
  const fixed = { pricing: { type: 'fixed', amount: 900 }, executionDuration: { value: 3, unit: 'days' } }
  // Fixed → unit while the option is hourly, then the option changes to m².
  const hourly = typeChange(fixed, 'unit', 'hour')
  assert.equal(packageDurationMode(hourly.pricing), 'customer_hours')
  assert.equal(hourly.retainedPerUnitDuration, undefined)
  assert.equal(withSyncedPricingUnit(hourly, 'm²').executionDuration.value, undefined)
  // A type change also drops a value kept from an earlier per-unit option.
  const perM2 = { pricing: { type: 'unit', unit: 'm²', durationBasis: 'per_unit' }, executionDuration: { value: 0.5, unit: 'days' } }
  const kept = withSyncedPricingUnit(perM2, 'hour')
  assert.ok(kept.retainedPerUnitDuration)
  const viaFixed = typeChange(typeChange(kept, 'fixed'), 'unit', 'hour')
  assert.equal(viaFixed.retainedPerUnitDuration, undefined)
  assert.equal(withSyncedPricingUnit(viaFixed, 'm²').executionDuration.value, undefined)
})

test('a saved hourly package has no duration value and no wizard-only field', () => {
  const perM2 = { id: 'a', pricing: { type: 'unit', unit: 'm²', durationBasis: 'per_unit' }, executionDuration: { value: 0.5, unit: 'days' } }
  const hourly = withSyncedPricingUnit(perM2, 'hour')
  const [saved] = JSON.parse(JSON.stringify(withoutRetainedDurations([hourly])))
  assert.deepEqual(saved.executionDuration, { unit: 'hours' })
  assert.equal('retainedPerUnitDuration' in saved, false)
  assert.equal(withoutRetainedDurations(undefined), undefined)
  const untouched = { id: 'b', pricing: { type: 'fixed' } }
  assert.equal(withoutRetainedDurations([untouched])[0], untouched)
})

test('wizard wiring: type select, auto-repair, option sync and saving use the duration helpers', () => {
  const step2 = source('components/professional/project-wizard/Step2Subprojects.tsx')
  assert.match(step2, /\.\.\.pricingTypeChangeUpdates\(sub, withPricingUnit\(withChosenDurationBasis\(\{ \.\.\.sub\.pricing, type: defaultType \}\), unitLabel\)\)/, 'auto-repair')
  assert.match(step2, /updateSubproject\(\s*subproject\.id,\s*pricingTypeChangeUpdates\(subproject, withPricingUnit\(withChosenDurationBasis\(\{ \.\.\.subproject\.pricing, type: value \}\), unitLabel\)\),/, 'type select')
  assert.match(step2, /return withSyncedPricingUnit\(sub, resolvedUnit\);/, 'option sync')
  const page = source('app/(pages)/projects/create/page.tsx')
  assert.match(page, /subprojects: normalizePreparationDuration\(withoutRetainedDurations\(projectData\.subprojects\)\)/)
})
