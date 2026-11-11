import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
const {
  effectiveExecutionDuration,
  isHourUnit,
  isLegacyPerBookingUnitPackage,
  packageDurationMode,
  scheduledExecutionDuration,
  withPerUnitDurationBasis,
  pricingTypeChangeUpdates,
  withChosenDurationBasis,
  withOptionPricingUnit,
  withSyncedPricingUnit,
  withoutRetainedDurations,
} = await import('../lib/packageDuration.ts')
const { collectSubprojectErrors } = await import('../lib/projectWizardValidation.ts')

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const messages = (locale) => JSON.parse(source(`messages/${locale}/projectWizard.json`))
const t = (key) => key

test('duration mode mirrors the backend: hourly unit pricing is customer-determined, other units scale, legacy stays per booking', () => {
  for (const unit of ['h', 'hr', 'hrs', 'hour', 'Hours', 'HUR']) {
    assert.equal(isHourUnit(unit), true, unit)
    assert.equal(packageDurationMode({ type: 'unit', unit, durationBasis: 'per_unit' }), 'customer_hours', unit)
  }
  for (const unit of ['m²', 'm2', 'day', 'room', 'window']) {
    assert.equal(packageDurationMode({ type: 'unit', unit, durationBasis: 'per_unit' }), 'per_unit', unit)
  }
  // FT1 6A: an hour unit is always customer-determined, also for legacy
  // packages saved without (or with another) duration basis.
  assert.equal(packageDurationMode({ type: 'unit', unit: 'hour' }), 'customer_hours')
  assert.equal(packageDurationMode({ type: 'unit', unit: 'hours', durationBasis: 'per_booking' }), 'customer_hours')
  // Other legacy units keep one booking-wide duration.
  assert.equal(packageDurationMode({ type: 'unit', unit: 'm²' }), 'per_booking')
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
  // FT1 6A: a legacy hour package (no basis) is customer-determined too.
  const legacyHourly = { ...base, pricing: { type: 'unit', amount: 50, unit: 'hour' }, executionDuration: { unit: 'hours' } }
  assert.deepEqual(collectSubprojectErrors(legacyHourly, 0, t), [])
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
  assert.match(form, /scheduledExecutionDuration<AnyExecutionDuration>\(\s*selectedPackage,\s*project\.executionDuration,\s*isUnitPricing \? estimatedUsage : 1,/)
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
  assert.match(step2, /\.\.\.withOptionPricingUnit\(sub, data\.selectedPricingOption\?\.unit, unitLabel\),\n\s*preparationDuration:/, 'mount initializer')
  assert.match(step2, /prev\.map\(\(sub\) => withOptionPricingUnit\(sub, data\.selectedPricingOption\?\.unit, unitLabel\)\)/, 'option sync')
  assert.doesNotMatch(step2, /pricing: withPricingUnit\(sub\.pricing, unitLabel\)/, 'mount must not overwrite the unit before the transition')
  const page = source('app/(pages)/projects/create/page.tsx')
  assert.match(page, /subprojects: normalizePreparationDuration\(withoutRetainedDurations\(projectData\.subprojects\)\)/)
})

// Step 2 is unmounted while Step 1 changes the option. Each mount runs the
// useState initializer over the parent's stored packages, then the hourly
// clearing effect; onChange writes the result back to the parent store.
const mountStep2 = (store, optionUnit) => {
  const mounted = store.map((sub) => withOptionPricingUnit(sub, optionUnit, 'unit'))
  return mounted.map((sub) =>
    packageDurationMode(sub.pricing) === 'customer_hours' &&
    (sub.executionDuration?.value !== undefined || sub.executionDuration?.unit !== 'hours')
      ? { ...sub, executionDuration: { ...sub.executionDuration, value: undefined, unit: 'hours' } }
      : sub,
  )
}

test('remount: per m² 0.5 days → Step 1 hourly → Step 1 back to per m² restores 0.5 days', () => {
  let store = [{ id: 'a', pricing: { type: 'unit', unit: 'm²', durationBasis: 'per_unit', amount: 12 }, executionDuration: { value: 0.5, unit: 'days' } }]
  store = mountStep2(store, 'm²')
  assert.deepEqual(store[0].executionDuration, { value: 0.5, unit: 'days' })
  // Unmount; Step 1 picks the hourly option; Step 2 mounts again.
  store = mountStep2(store, 'hour')
  assert.equal(store[0].pricing.unit, 'hour')
  assert.equal(packageDurationMode(store[0].pricing), 'customer_hours')
  assert.deepEqual(store[0].executionDuration, { value: undefined, unit: 'hours' })
  const [savedHourly] = JSON.parse(JSON.stringify(withoutRetainedDurations(store)))
  assert.equal(savedHourly.executionDuration.value, undefined)
  assert.equal('retainedPerUnitDuration' in savedHourly, false)
  // Unmount; Step 1 picks per m² again; Step 2 mounts again.
  store = mountStep2(store, 'm²')
  assert.equal(store[0].pricing.unit, 'm²')
  assert.deepEqual(store[0].executionDuration, { value: 0.5, unit: 'days' })
  assert.equal(store[0].retainedPerUnitDuration, undefined)
  assert.deepEqual(collectSubprojectErrors({ ...validBase, ...store[0] }, 0, t), [])
})

test('remount: legacy and fixed packages keep their behaviour; fixed → unit still clears', () => {
  const legacy = { pricing: { type: 'unit', unit: 'm²', amount: 5 }, executionDuration: { value: 4, unit: 'days' } }
  const [mountedLegacy] = mountStep2([legacy], 'm²')
  assert.equal(packageDurationMode(mountedLegacy.pricing), 'per_booking')
  assert.deepEqual(mountedLegacy.executionDuration, { value: 4, unit: 'days' })
  // FT1 6A: moved to an hourly option it becomes customer-determined.
  const [legacyHourly] = mountStep2([legacy], 'hour')
  assert.equal(packageDurationMode(legacyHourly.pricing), 'customer_hours')
  assert.deepEqual(legacyHourly.executionDuration, { value: undefined, unit: 'hours' })
  const fixed = { pricing: { type: 'fixed', unit: 'm²', amount: 900 }, executionDuration: { value: 3, unit: 'days' } }
  const [mountedFixed] = mountStep2([fixed], 'm²')
  assert.equal(mountedFixed.pricing.unit, undefined)
  assert.equal(mountedFixed.executionDuration.value, 3)
  const [unit] = mountStep2([typeChange(mountedFixed, 'unit', 'm²')], 'm²')
  assert.equal(unit.executionDuration.value, undefined)
  // An unchanged package keeps its identity, so the sync effect does not loop.
  const stable = { pricing: { type: 'unit', unit: 'm²', durationBasis: 'per_unit' }, executionDuration: { value: 1, unit: 'days' } }
  assert.equal(withOptionPricingUnit(stable, 'm²', 'unit'), stable)
  assert.equal(withOptionPricingUnit(fixed, undefined, 'unit').pricing.unit, undefined)
  assert.equal(withOptionPricingUnit(mountedFixed, undefined, 'unit'), mountedFixed)
})

test('FT1 6A: a legacy hour package without a duration basis books the customer hours', () => {
  const legacy = { pricing: { type: 'unit', unit: 'hour' }, executionDuration: { value: 2, unit: 'days' } }
  assert.deepEqual(effectiveExecutionDuration(legacy, undefined, 6), { value: 6, unit: 'hours', range: undefined })
  assert.equal(isLegacyPerBookingUnitPackage(legacy.pricing), false, 'no per-unit notice for hours')
})

test('FT1 6B: quantity hours above the longest working day are scheduled in days', () => {
  const hourly = { pricing: { type: 'unit', unit: 'hour', durationBasis: 'per_unit' }, executionDuration: { unit: 'hours' } }
  assert.deepEqual(scheduledExecutionDuration(hourly, undefined, 16, 8), { value: 2, unit: 'days', range: undefined })
  assert.deepEqual(scheduledExecutionDuration(hourly, undefined, 17, 8), { value: 3, unit: 'days', range: undefined })
  assert.deepEqual(scheduledExecutionDuration(hourly, undefined, 8, 8), { value: 8, unit: 'hours', range: undefined }, 'a full day stays hour mode')
  assert.deepEqual(scheduledExecutionDuration(hourly, undefined, 4, 8), { value: 4, unit: 'hours', range: undefined })
  assert.deepEqual(scheduledExecutionDuration(hourly, undefined, 16, 0), { value: 16, unit: 'hours', range: undefined }, 'no working day: unchanged')
  const perM2 = { pricing: { type: 'unit', unit: 'm²', durationBasis: 'per_unit' }, executionDuration: { value: 0.5, unit: 'hours' } }
  assert.deepEqual(scheduledExecutionDuration(perM2, undefined, 40, 8), { value: 3, unit: 'days', range: undefined })
  assert.deepEqual(scheduledExecutionDuration(perM2, undefined, 10, 8), { value: 5, unit: 'hours' })
  // Fixed packages and legacy per-booking units are not quantity-derived.
  const fixed = { pricing: { type: 'fixed' }, executionDuration: { value: 12, unit: 'hours' } }
  assert.deepEqual(scheduledExecutionDuration(fixed, undefined, 1, 8), { value: 12, unit: 'hours' })
  const legacy = { pricing: { type: 'unit', unit: 'm²' }, executionDuration: { value: 12, unit: 'hours' } }
  assert.deepEqual(scheduledExecutionDuration(legacy, undefined, 1000, 8), { value: 12, unit: 'hours' })
})

test('FT1 6C: legacy non-hour unit packages get a per-unit notice with a one-click fix', () => {
  assert.equal(isLegacyPerBookingUnitPackage({ type: 'unit', unit: 'm²' }), true)
  assert.equal(isLegacyPerBookingUnitPackage({ type: 'unit', unit: 'm²', durationBasis: 'per_booking' }), true)
  assert.equal(isLegacyPerBookingUnitPackage({ type: 'unit', unit: 'm²', durationBasis: 'per_unit' }), false)
  assert.equal(isLegacyPerBookingUnitPackage({ type: 'unit', unit: 'hour' }), false)
  assert.equal(isLegacyPerBookingUnitPackage({ type: 'fixed' }), false)
  const fixedUp = withPerUnitDurationBasis({ type: 'unit', unit: 'm²', amount: 5 })
  assert.deepEqual(fixedUp, { type: 'unit', unit: 'm²', amount: 5, durationBasis: 'per_unit' })
  assert.equal(packageDurationMode(fixedUp), 'per_unit')

  const step2 = source('components/professional/project-wizard/Step2Subprojects.tsx')
  assert.match(step2, /\{isLegacyPerBookingUnitPackage\(subproject\.pricing\) && \(/)
  assert.match(step2, /onClick=\{\(\) => updateSubproject\(subproject\.id, \{ pricing: withPerUnitDurationBasis\(subproject\.pricing\) \}\)\}/)
  assert.match(step2, /t\('step2\.timing\.legacyPerBookingNotice'/)
  assert.match(step2, /t\('step2\.timing\.legacyPerBookingAction'/)
  for (const locale of ['en', 'nl', 'fr']) {
    const timing = messages(locale).step2.timing
    for (const key of ['legacyPerBookingNotice', 'legacyPerBookingAction']) {
      assert.equal(typeof timing[key], 'string', `${locale} ${key}`)
      assert.match(timing[key], /\{unit\}/, `${locale} ${key} names the unit`)
    }
  }
})
