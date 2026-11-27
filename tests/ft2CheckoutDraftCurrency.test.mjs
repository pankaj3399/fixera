import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const {
  CHECKOUT_DRAFT_MAX_AGE_MS,
  clearCheckoutDraft,
  loadCheckoutDraft,
  saveCheckoutDraft,
  wizardResumeHref,
} = await import('../lib/booking/checkoutDraft.ts')
const { formatDisplayMoney } = await import('../lib/currency/convert.ts')

const memoryStorage = () => {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    size: () => map.size,
  }
}

const values = {
  selectedPackageIndex: 1,
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
  saveCheckoutDraft('p1', values, 'chk1', storage, 1_000)
  const draft = loadCheckoutDraft('p1', storage, 2_000)
  assert.equal(draft.checkoutId, 'chk1')
  assert.deepEqual({ ...draft, version: undefined, projectId: undefined, checkoutId: undefined, savedAt: undefined }, {
    ...values, version: undefined, projectId: undefined, checkoutId: undefined, savedAt: undefined,
  })
  // Drafts are per project.
  assert.equal(loadCheckoutDraft('p2', storage, 2_000), null)
  clearCheckoutDraft('p1', storage)
  assert.equal(loadCheckoutDraft('p1', storage, 2_000), null)
})

test('FT2-4B: a stale or malformed draft is ignored and removed', () => {
  const storage = memoryStorage()
  saveCheckoutDraft('p1', values, undefined, storage, 0)
  assert.equal(loadCheckoutDraft('p1', storage, CHECKOUT_DRAFT_MAX_AGE_MS + 1), null)
  assert.equal(storage.size(), 0)
  storage.setItem('fixera:checkout-draft:p1', '{not json')
  assert.equal(loadCheckoutDraft('p1', storage, 0), null)
  assert.equal(loadCheckoutDraft('p1', null, 0), null)
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
