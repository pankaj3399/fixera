// Sprint close (part A) regressions for Final Touches 1–3 gaps found on main.
// Page components here are client-heavy (auth, fetch, router), so wiring is
// asserted at the source level, like freshReviewFixes; pure helpers are
// exercised directly.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('FT2 #10a/#10b: payments pages send the service filter and render server facet counts', () => {
  const src = read('app/(pages)/dashboard/payments/page.tsx')
  // Customer view: counts from my-payments.
  assert.match(src, /setStatusCounts\(readFacetCounts\(payload\.data\.statusCounts\)\)/)
  assert.match(src, /setServiceCounts\(readFacetCounts\(payload\.data\.serviceCounts\)\)/)
  assert.match(src, /withFacetCount\(svc, serviceCounts, svc\)/)
  // Professional view: service filter goes to the API and has its own counts.
  assert.match(src, /if \(service !== 'all'\) params\.set\('service', service\)/)
  assert.match(src, /setTxServices\(/)
  assert.match(src, /withFacetCount\(svc, txServiceCounts, svc\)/)
  assert.match(src, /withFacetCount\(t\('payments\.professional\.transferPending'\), txStatusCounts, 'transfer_pending'\)/)
  // A failed request never keeps another query's counts.
  assert.match(src, /setTxStatusCounts\(null\); setTxServiceCounts\(null\)/)
})

test('FT2 #10a: warranty, customer dashboard and manage projects show service counts', () => {
  const warranty = read('app/(pages)/dashboard/warranty-claims/page.tsx')
  assert.match(warranty, /setStatusCounts\(readFacetCounts\(data\.statusCounts\)\)/)
  assert.match(warranty, /facetCount\(serviceCounts, svc\)/)
  assert.match(warranty, /facetCount\(statusCounts, option\.value\)/)
  const customer = read('components/dashboard/CustomerDashboard.tsx')
  assert.match(customer, /bookings\.serviceCounts,/)
  assert.match(customer, /quotes\.serviceCounts,/)
  assert.match(customer, /facetCount\(serviceCounts, svc\)/)
  const manage = read('app/(pages)/professional/projects/manage/page.tsx')
  assert.match(manage, /setServiceCounts\(readFacetCounts\(responseData\.serviceCounts\)\)/)
  assert.match(manage, /facetCount\(serviceCounts, svc\)/)
})
