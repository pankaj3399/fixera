// Sprint close (part A) regressions for Final Touches 1–3 gaps found on main.
// Page components here are client-heavy (auth, fetch, router), so wiring is
// asserted at the source level, like freshReviewFixes; pure helpers are
// exercised directly.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

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

test('FT1 #3/#8: a detailed project is fitted under the copy endpoint body limit, keeping the key facts', async () => {
  const { fitProjectCopyRequest } = await import('../lib/projectCopyApi.ts')
  const big = {
    kind: 'faqs', locale: 'nl', projectId: 'p1',
    context: {
      service: 'Badkamerrenovatie',
      description: 'p'.repeat(1300),
      keywords: Array.from({ length: 15 }, (_, i) => `trefwoord ${i} ${'k'.repeat(100)}`),
      subprojects: Array.from({ length: 9 }, (_, i) => ({
        name: `Pakket ${i}`,
        description: 'd'.repeat(900),
        included: Array.from({ length: 14 }, (_, j) => ({ name: `Item ${j}`, description: 'i'.repeat(500) })),
        materials: Array.from({ length: 14 }, (_, j) => ({ name: `Materiaal ${j}`, description: 'm'.repeat(500) })),
      })),
      extraOptions: Array.from({ length: 12 }, (_, i) => ({ name: `Optie ${i}`, description: 'o'.repeat(500) })),
      faq: Array.from({ length: 9 }, (_, i) => ({ question: `Vraag ${i}?`, answer: 'a'.repeat(1000) })),
    },
  }
  const fitted = fitProjectCopyRequest(big)
  assert.ok(JSON.stringify(fitted).length <= 14_000, `request is ${JSON.stringify(fitted).length} chars`)
  assert.equal(fitted.context.keywords.length, 10)
  assert.ok(fitted.context.keywords.every((k) => k.length <= 80))
  assert.equal(fitted.context.service, 'Badkamerrenovatie')
  assert.ok(fitted.context.subprojects.length >= 1)
  assert.equal(fitted.context.subprojects[0].name, 'Pakket 0')
  assert.equal(fitted.context.extraOptions.length, 10)
  // A small request passes through unchanged.
  const small = { kind: 'title', locale: 'en', context: { service: 'Plumbing', description: 'Replace the shower.', keywords: ['shower'] } }
  assert.deepEqual(JSON.parse(JSON.stringify(fitProjectCopyRequest(small))), small)
})
