import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { vatLineLabel } from '../lib/booking/vatLineLabel.ts'

test('F1-8: a VAT line recorded with a raw option id shows the option name', () => {
  const options = [{ _id: '6b000132fa98d2c30dbce71d', name: 'Integrated Lighting' }]
  assert.equal(vatLineLabel('6b000132fa98d2c30dbce71d', options), 'Integrated Lighting')
  assert.equal(vatLineLabel('Kitchen installation (QA-R)', options), 'Kitchen installation (QA-R)')
  assert.equal(vatLineLabel('6b000132fa98d2c30dbce71e', options), '6b000132fa98d2c30dbce71e')
  assert.equal(vatLineLabel(undefined, options), '')
})

test('F1-8: the quote checkout payment page labels VAT lines through vatLineLabel', async () => {
  const page = await readFile(new URL('../app/[ctx]/bookings/[id]/payment/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /vatLineLabel\(line\.description, booking\.project\?\.extraOptions\)/)
})
