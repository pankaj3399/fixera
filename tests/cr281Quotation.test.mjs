import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hooks, loadComponent, findAll, textOf, common, ui, settle } from './reviewComponentHarness.mjs'
import * as quotationVat from '../lib/quotationVat.ts'
import * as vatPricing from '../lib/vatPricing.ts'
import { parseFlexibleNumber } from '../lib/numberInput.ts'
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const response = data => ({ ok: true, json: async () => ({ success: true, data }) })
const rc = { options: [{ rate: 0, country: 'BE', label: 'Reverse Charge', reverseCharge: true, source: 'b2b_exempt' }],
  vatDetermination: { customerType: 'B2B', article47Class: 'Movable', vatAddressType: 'Booking address', vatCountry: 'BE', reverseCharge: true } }
function wizard() {
  const state = hooks(), requests = [], errors = []
  const Component = loadComponent('../components/quotation/QuotationWizard.tsx', {
    ...common, react: state.api,
    '@/components/ui/textarea': ui, '@/components/ui/radio-group': ui,
    '@/lib/utils': { getAuthToken: () => null }, '@/contexts/CurrencyContext': { useCurrency: () => ({ formatMoney: String }) },
    '@/lib/vatPricing': vatPricing, '@/lib/numberInput': { parseFlexibleNumber }, '@/lib/quotationVat': quotationVat,
    './VatDeterminationPanel': { __esModule: true, default: () => null },
    sonner: { toast: { error: message => errors.push(message), success() {} } },
  })
  const fetch = (url, options) => { const d = deferred(); requests.push({ url, options, ...d }); return d.promise }
  let tree
  const render = () => { tree = state.render(() => Component({ bookingId: 'b1', onSuccess() {}, onCancel() {} })); state.flush(); return tree }
  const field = placeholder => findAll(tree, n => n.props.placeholder === `wizard.${placeholder}`)[0]
  const change = (placeholder, value) => { field(placeholder).props.onChange({ target: { value } }); render() }
  const submit = () => findAll(tree, n => n.props.onClick && textOf(n).includes('wizard.submitQuotation'))[0]
  const form = () => state.values().find(v => v?.pricingLines)
  return { state, requests, errors, fetch, render, field, change, submit, form }
}
function fill(h) {
  h.change('scopePlaceholder', 'Installation work')
  h.change('descriptionPlaceholder', 'Install the equipment')
  const radio = findAll(h.render(), n => typeof n.props.onValueChange === 'function' && n.props.value === '')[0]
  radio.props.onValueChange('no'); h.render()
  h.change('countryPlaceholder', 'BE')
  h.change('pricingLineDescriptionPlaceholder', 'Work')
  h.change('pricePlaceholder', '100')
}

test('reverse charge normalization precedes custom-rate validation after a racing pricing edit', async () => {
  const previousFetch = globalThis.fetch, h = wizard()
  globalThis.fetch = h.fetch
  try {
    h.render(); fill(h)
    const stalePriceHandler = h.field('pricePlaceholder').props.onChange
    h.requests.at(-1).resolve(response(rc)); await settle(); h.render()
    // A handler from the pre-response render restores a custom/unentered line.
    stalePriceHandler({ target: { value: '120' } }); h.render()
    assert.equal(h.form().pricingLines[0].vatRateExplicitlyEntered, false)
    const submitted = h.submit().props.onClick()
    const request = h.requests.at(-1)
    assert.equal(request.options.method, 'POST')
    const body = JSON.parse(request.options.body)
    assert.equal(body.pricingLines[0].price, 120)
    assert.equal(body.pricingLines[0].vatRate, 0)
    assert.equal(body.pricingLines[0].vatLabel, 'Reverse Charge')
    request.resolve(response({})); await submitted
    assert.deepEqual(h.errors, [])
  } finally { h.state.unmount(); globalThis.fetch = previousFetch }
})
