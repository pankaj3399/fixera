import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const {
  CHECKOUT_DRAFT_MAX_AGE_MS,
  clearAllCheckoutDrafts,
  clearCheckoutDraft,
  findDraftPackageIndex,
  loadCheckoutDraft,
  pickHourlySlot,
  saveCheckoutDraft,
  vatInputsKey,
  wizardResumeHref,
} = await import('../lib/booking/checkoutDraft.ts')
const { vatInclusiveTotal } = await import('../lib/booking/vatPreviewTotal.ts')
const { formatDisplayMoney } = await import('../lib/currency/convert.ts')

const memoryStorage = () => {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
    size: () => map.size,
  }
}

const values = {
  selectedPackageIndex: 1,
  selectedPackageId: 'pkg-b',
  selectedPackageName: 'Premium',
  vatInputsKey: '{"vatAnswers":[],"serviceCountry":"BE"}',
  estimatedUsage: 12,
  selectedDate: '2027-01-11',
  selectedTime: '09:00',
  rfqAnswers: [{ question: 'Colour?', answer: 'Blue', type: 'text' }],
  vatAnswers: { residential: { fieldName: 'residential', value: true } },
  proceedAtStandardVat: false,
  selectedExtraOptions: [0, 2],
  additionalNotes: 'Ring twice',
  rfqAttachments: [{ url: 'https://files.example/a.pdf', name: 'a.pdf' }],
  useProfileAddress: false,
  manualAddress: 'Main street 1, Brussels',
  isServiceAddressValid: true,
  servicePlace: { formatted_address: 'Main street 1, Brussels', coordinates: { lat: 50.85, lng: 4.35 } },
}

test('FT2-4B: the wizard answers survive the trip to the payment page and back', () => {
  const storage = memoryStorage()
  saveCheckoutDraft('p1', 'userA', values, 'chk1', storage, 1_000)
  const draft = loadCheckoutDraft('p1', 'userA', storage, 2_000)
  assert.equal(draft.checkoutId, 'chk1')
  assert.equal(draft.userId, 'userA')
  const strip = (d) => ({ ...d, version: undefined, projectId: undefined, userId: undefined, checkoutId: undefined, savedAt: undefined })
  assert.deepEqual(strip(draft), strip(values))
  // Drafts are per project.
  assert.equal(loadCheckoutDraft('p2', 'userA', storage, 2_000), null)
  clearCheckoutDraft('p1', storage)
  assert.equal(loadCheckoutDraft('p1', 'userA', storage, 2_000), null)
})

test('FT2-4B: a stale or malformed draft is ignored and removed', () => {
  const storage = memoryStorage()
  saveCheckoutDraft('p1', 'userA', values, undefined, storage, 0)
  assert.equal(loadCheckoutDraft('p1', 'userA', storage, CHECKOUT_DRAFT_MAX_AGE_MS + 1), null)
  assert.equal(storage.size(), 0)
  storage.setItem('fixera:checkout-draft:p1', '{not json')
  assert.equal(loadCheckoutDraft('p1', 'userA', storage, 0), null)
  assert.equal(loadCheckoutDraft('p1', 'userA', null, 0), null)
  // A version-1 draft (no owner) is never restored.
  storage.setItem('fixera:checkout-draft:p1', JSON.stringify({ ...values, version: 1, projectId: 'p1', savedAt: 0 }))
  assert.equal(loadCheckoutDraft('p1', 'userA', storage, 0), null)
  assert.equal(storage.size(), 0)
})

test('CR: a draft is restored only for the account that saved it', () => {
  const storage = memoryStorage()
  // Without a signed-in customer nothing is saved or restored.
  saveCheckoutDraft('p1', null, values, undefined, storage, 0)
  assert.equal(storage.size(), 0)
  saveCheckoutDraft('p1', 'userA', values, undefined, storage, 0)
  assert.equal(loadCheckoutDraft('p1', undefined, storage, 0), null)
  assert.equal(storage.size(), 1, 'an anonymous read leaves the owner draft alone')
  // Another customer in the same tab never sees customer A's answers.
  assert.equal(loadCheckoutDraft('p1', 'userB', storage, 0), null)
  assert.equal(storage.size(), 0, 'a foreign draft is removed')
})

test('CR: logout or an account switch removes every checkout draft', () => {
  const storage = memoryStorage()
  saveCheckoutDraft('p1', 'userA', values, undefined, storage, 0)
  saveCheckoutDraft('p2', 'userA', values, undefined, storage, 0)
  storage.setItem('redirectAfterAuth', '/x')
  clearAllCheckoutDrafts(storage)
  assert.equal(loadCheckoutDraft('p1', 'userA', storage, 0), null)
  assert.equal(loadCheckoutDraft('p2', 'userA', storage, 0), null)
  assert.equal(storage.getItem('redirectAfterAuth'), '/x', 'other session keys stay')
  assert.equal(storage.size(), 1)
  assert.doesNotThrow(() => clearAllCheckoutDrafts(null))
})

test('CR: the package is restored by its id, never by its position', () => {
  const packages = [{ _id: 'pkg-a', name: 'Basic' }, { _id: 'pkg-b', name: 'Premium' }, { _id: 'pkg-c', name: 'Deluxe' }]
  assert.equal(findDraftPackageIndex(packages, values), 1)
  // Package A removed: Premium moved to index 0 and is still found.
  assert.equal(findDraftPackageIndex(packages.slice(1), values), 0)
  // Premium removed: the package now at index 1 is a different one, so nothing is restored.
  assert.equal(findDraftPackageIndex([packages[0], packages[2]], values), null)
  assert.equal(findDraftPackageIndex([packages[0]], values), null)
  // A record without ids: matched by a name only one package has.
  assert.equal(findDraftPackageIndex([{ name: 'Basic' }, { name: 'Premium' }], values), 1)
  assert.equal(findDraftPackageIndex([{ name: 'Premium' }, { name: 'Premium' }], values), null)
  assert.equal(findDraftPackageIndex(packages, {}), null)
})

test('CR: a same-named package with a different id is not the saved package', () => {
  // pkg-b "Premium" (the saved one) was removed and pkg-z, also named "Premium", was added.
  assert.equal(findDraftPackageIndex([{ _id: 'pkg-a', name: 'Basic' }, { _id: 'pkg-z', name: 'Premium' }], values), null)
  // A different-id package is not counted, so it cannot make an id-less name match ambiguous either.
  assert.equal(findDraftPackageIndex([{ _id: 'pkg-z', name: 'Premium' }, { name: 'Premium' }], values), 1)
  // The name fallback still applies when either side has no id.
  assert.equal(findDraftPackageIndex([{ name: 'Premium' }], values), 0)
  assert.equal(findDraftPackageIndex([{ _id: 'pkg-z', name: 'Premium' }], { selectedPackageName: 'Premium' }), 0)
})

test('CR: the restored hourly time survives slot initialization until the date changes', () => {
  const restored = { date: '2027-01-11', time: '14:00' }
  // Date initialization left no time (or the first slot): the restored time wins.
  assert.equal(pickHourlySlot(['09:00', '14:00'], '', '2027-01-11', restored), '14:00')
  assert.equal(pickHourlySlot(['09:00', '14:00'], '09:00', '2027-01-11', restored), '14:00')
  // Another date, or a date that no longer offers it: the normal choice.
  assert.equal(pickHourlySlot(['09:00', '14:00'], '', '2027-01-12', restored), '09:00')
  assert.equal(pickHourlySlot(['09:00', '10:00'], '', '2027-01-11', restored), '09:00')
  // Without a restored time the current choice is kept while offered.
  assert.equal(pickHourlySlot(['09:00', '10:00'], '10:00', '2027-01-11', null), '10:00')
  assert.equal(pickHourlySlot([], '10:00', '2027-01-11', restored), '')
})

test('CR: the standard-VAT choice is tied to the VAT inputs it was made for', () => {
  const answers = [{ fieldName: 'residential', value: true }]
  assert.equal(vatInputsKey(answers, 'BE'), vatInputsKey([{ fieldName: 'residential', value: true }], 'BE'))
  assert.notEqual(vatInputsKey(answers, 'BE'), vatInputsKey(answers, 'NL'))
  assert.notEqual(vatInputsKey(answers, 'BE'), vatInputsKey([{ fieldName: 'residential', value: false }], 'BE'))
  assert.equal(vatInputsKey(answers, undefined), vatInputsKey(answers, ''))
})

test('CR: the EUR charge includes standard VAT when the customer proceeds at standard VAT', () => {
  const rfq = { action: 'rfq', standardRate: 21, appliedRate: 6, reverseCharge: false }
  assert.equal(vatInclusiveTotal(100, rfq, true), 121)
  assert.equal(vatInclusiveTotal(100, rfq, false), 100)
  assert.equal(vatInclusiveTotal(100, { ...rfq, reverseCharge: true }, true), 100)
  assert.equal(vatInclusiveTotal(100, { action: 'reduced_rate', standardRate: 21, appliedRate: 6, reverseCharge: false }, false), 106)
  assert.equal(vatInclusiveTotal(100, null, true), 100)
})

test('FT2-4B: the back button returns to the project wizard', () => {
  assert.equal(wizardResumeHref('p 1'), '/projects/p%201?resumeBooking=1')
})

test('CUR: pre-payment EUR amounts are shown in the display currency', () => {
  const rates = { EUR: 1, USD: 1.1 }
  assert.equal(formatDisplayMoney(100, 'EUR', { currency: 'USD', rates, locale: 'en-US' }), '$110.00')
  // Legacy "€" records are EUR too.
  assert.equal(formatDisplayMoney(100, '€', { currency: 'USD', rates, locale: 'en-US' }), '$110.00')
  assert.equal(formatDisplayMoney(100, null, { currency: 'USD', rates, locale: 'en-US' }), '$110.00')
  // EUR display, or no known rate: the EUR amount, never a guessed one.
  assert.equal(formatDisplayMoney(100, 'EUR', { currency: 'EUR', rates, locale: 'en-US' }), '€100.00')
  assert.equal(formatDisplayMoney(100, 'EUR', { currency: 'GBP', rates, locale: 'en-US' }), '€100.00')
  // A record in another currency is shown as stored.
  assert.equal(formatDisplayMoney(100, 'GBP', { currency: 'USD', rates, locale: 'en-US' }), '£100.00')
})
