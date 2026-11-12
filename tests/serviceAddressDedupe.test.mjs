import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { joinServiceAddress } from '../lib/dashboardOverview.ts'

// Booking and quotation tables showed "Meir 1, 2000 Antwerpen, Belgium,
// Antwerpen, 2000, Belgium, Antwerpen, 2000, BE": the wizard appended the
// profile's city/postcode/country to a Google-formatted address, and the
// table appended them again.
test('the service address shows each part once', () => {
  const stored = { address: 'Meir 1, 2000 Antwerpen, Belgium, Antwerpen, 2000, Belgium', city: 'Antwerpen', postalCode: '2000', country: 'BE' }
  assert.equal(joinServiceAddress(stored), 'Meir 1, 2000 Antwerpen, Belgium')
  // A formatted profile address joined by the wizard stays as formatted.
  assert.equal(joinServiceAddress({ address: 'Meir 1, 2000 Antwerpen, Belgium', city: 'Antwerpen', postalCode: '2000', country: 'Belgium' }), 'Meir 1, 2000 Antwerpen, Belgium')
  assert.equal(joinServiceAddress({ address: 'Rue de la Loi 16, 1000 Bruxelles, Belgique', city: 'Bruxelles', postalCode: '1000', country: 'BE' }), 'Rue de la Loi 16, 1000 Bruxelles, Belgique')
  // Separate parts are joined as before.
  assert.equal(joinServiceAddress({ address: 'Meir 1', city: 'Antwerpen', postalCode: '2000', country: 'BE' }), 'Meir 1, Antwerpen, 2000, BE')
  assert.equal(joinServiceAddress({ city: 'Gent' }), 'Gent')
  assert.equal(joinServiceAddress({}), null)
  assert.equal(joinServiceAddress(null), null)
})

// A city or postcode that only appears inside the street name was dropped,
// also from the profile address the wizard sends with the booking.
test('a city or postal code inside the street name is kept', () => {
  assert.equal(joinServiceAddress({ address: 'Rue de Namur 12', city: 'Namur', postalCode: '5000', country: 'BE' }), 'Rue de Namur 12, Namur, 5000, BE')
  assert.equal(joinServiceAddress({ address: 'Kerkstraat 1000', city: 'Brussel', postalCode: '1000', country: 'BE' }), 'Kerkstraat 1000, Brussel, 1000, BE')
  // Repeats of a later segment are still dropped, whitespace and case ignored.
  assert.equal(joinServiceAddress({ address: 'Rue de Namur 12, 5000  NAMUR', city: 'Namur', postalCode: '5000', country: 'BE' }), 'Rue de Namur 12, 5000  NAMUR, BE')
  assert.equal(joinServiceAddress({ address: 'Meir 1, Antwerpen', city: ' antwerpen ', postalCode: '2000', country: 'Belgium' }), 'Meir 1, Antwerpen, 2000, Belgium')
})

test('the booking wizard builds the profile service address with the same join', () => {
  const source = readFileSync(new URL('../components/project/ProjectBookingForm.tsx', import.meta.url), 'utf8')
  assert.match(source, /const profileAddress = useMemo\(\(\) => joinServiceAddress\(user\?\.location\) \?\? ''/)
  for (const table of ['SharedBookingsTable', 'SharedQuotesTable']) {
    const tableSource = readFileSync(new URL(`../components/dashboard/${table}.tsx`, import.meta.url), 'utf8')
    assert.match(tableSource, /joinServiceAddress\(booking\.location\)/)
  }
})
