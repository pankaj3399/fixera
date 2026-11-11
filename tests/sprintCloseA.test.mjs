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

test('FT3 #14a: a manual customer level reads as set by Fixtract, not as the top level', () => {
  const src = read('app/(pages)/dashboard/benefits/page.tsx')
  assert.match(src, /levelSource === 'manual'/)
  assert.match(src, /manualCustomerLevel\s*\?\s*t\("benefits\.manualLevelTitle"\)/)
  for (const locale of ['en', 'nl', 'fr']) {
    const benefits = JSON.parse(read(`messages/${locale}/dashboard.json`)).benefits
    assert.ok(benefits.manualLevelTitle && benefits.manualLevelDescription, `${locale} manual level strings`)
  }
})

test('FT1 #10: reached wizard steps whose saved data is valid show as done; invalidated or unreached ones do not', async () => {
  const { wizardStepCompletion } = await import('../lib/projectWizardValidation.ts')
  const t = (key) => key
  const step1Done = {
    category: 'Interior', service: 'Painting', title: 'Interior wall painting for apartments in Ghent',
    description: 'd'.repeat(120), priceModel: 'fixed',
    distance: { address: 'Main street 1, Ghent', maxKmRange: 20 }, resources: ['pro-1'],
    customerPresence: 'not_required', extraOptions: [], termsConditions: [],
  }
  const reopened = [true, true, true, false, false, false, false, false]
  const marks = wizardStepCompletion(new Array(8).fill(false), reopened, step1Done, t)
  assert.equal(marks[0], true, 'step 1 done on a reopened draft without revisiting it')
  assert.equal(marks[2], true, 'step 3 done (customer presence set)')
  assert.equal(marks[4], false, 'an unreached step is never marked')
  // Editing step 1 into an invalid state removes its mark.
  assert.equal(wizardStepCompletion(new Array(8).fill(false), reopened, { ...step1Done, title: 'Too short' }, t)[0], false)
  // Review step keeps the page's submit-readiness result.
  assert.equal(wizardStepCompletion([false, false, false, false, false, false, false, true], reopened, step1Done, t)[7], true)
  const page = read('app/(pages)/projects/create/page.tsx')
  assert.match(page, /index <= \(project\.currentStep \|\| 1\) - 1/)
  assert.match(page, /stepValidation=\{completedSteps\}/)
})

test('FT1 #9: no post-booking template asks for a start date, a contact time or a contact medium', () => {
  const src = read('components/professional/project-wizard/Step6PostBookingQuestions.tsx')
  const templates = src.slice(src.indexOf('POST_BOOKING_QUESTION_TEMPLATES'), src.indexOf('\n}\n', src.indexOf('POST_BOOKING_QUESTION_TEMPLATES')))
  const questions = [...templates.matchAll(/question:\s*'([^']*)'/g)].map((m) => m[1])
  assert.ok(questions.length > 0)
  for (const question of questions) {
    assert.doesNotMatch(question, /best time to contact|contact you|start date|preferred start|when .*start|WhatsApp|phone or email/i)
  }
})

test('FT3 #16: declining the final warranty resolution opens the clarification dialog before escalating', () => {
  const src = read('app/(pages)/bookings/[id]/page.tsx')
  // The resolved-state decline button no longer escalates directly.
  assert.doesNotMatch(src, /onClick=\{\(\) =>\s*handleEscalateWarrantyClaim\("Customer declined final warranty resolution"\)\s*\}/)
  assert.match(src, /setDeclineDialogMode\("resolution"\)/)
  // The clarification is validated (3–1000) and sent as the escalation note.
  assert.match(src, /handleEscalateWarrantyClaim\("Customer declined final warranty resolution", text\)/)
  assert.match(src, /\.\.\.\(note \? \{ note \} : \{\}\)/)
  for (const locale of ['en', 'nl', 'fr']) {
    const warranty = JSON.parse(read(`messages/${locale}/bookings.json`)).warranty
    assert.ok(warranty.resolutionDeclineTitle && warranty.resolutionDeclineDescription, `${locale} resolution decline strings`)
  }
})

test('FT3 #19a: the payment page shows the quotation-recorded saving for quotation bookings', async () => {
  const src = read('app/bookings/[id]/payment/page.tsx')
  assert.match(src, /recordedQuotationPricing\(currentQuoteVersion/)
  assert.match(src, /data-testid="quotation-recorded-saving"/)
  // The live loyalty estimate is not shown for quotation bookings.
  assert.match(src, /\{!isQuotationBooking && loyaltyLoaded && loyalty/)
  assert.match(src, /\{!isQuotationBooking && \(!loyaltyLoaded/)
  const { recordedQuotationPricing } = await import('../lib/booking/quotationPricing.ts')
  const version = { customerTotals: { customerNetAmount: 236.02, vatAmount: 49.56, totalWithVat: 285.58, discount: { totalDiscountWithVat: 16.92 } } }
  assert.equal(recordedQuotationPricing(version).saving, 16.92)
})

test('FT3 #12: customers redeem points at checkout and professionals spend them on level credits', () => {
  const payment = read('app/bookings/[id]/payment/page.tsx')
  // Points travel with every payment-intent request, next to any code.
  assert.match(payment, /\.\.\.\(pointsToRedeem > 0 \? \{ pointsToRedeem \} : \{\}\)/)
  assert.match(payment, /ensurePaymentIntent\(bookingId, booking, code, requestedPointsRef\.current\)/)
  assert.match(payment, /ensurePaymentIntent\(bookingId, booking, currentCodeLabel\(\), requested\)/)
  assert.match(payment, /\/api\/user\/points\/balance/)
  assert.match(payment, /data-testid="checkout-points"/)
  // Points chosen on the booking page reach checkout.
  const bookingPage = read('app/(pages)/bookings/[id]/page.tsx')
  assert.equal((bookingPage.match(/\/payment\$\{pointsToRedeem > 0 \? `\?points=\$\{Math\.floor\(pointsToRedeem\)\}` : ''\}/g) || []).length, 2)
  const benefits = read('app/(pages)/dashboard/benefits/page.tsx')
  assert.match(benefits, /\/api\/user\/professional-level\/boost/)
  assert.match(benefits, /professionalData\?\.points\?\.points/)
  assert.match(benefits, /result\.leveledUp && result\.newLevel/)
  for (const locale of ['en', 'nl', 'fr']) {
    const checkout = JSON.parse(read(`messages/${locale}/checkout.json`)).paymentPage.points
    assert.ok(checkout.title && checkout.applied && checkout.invalidAmount, `${locale} checkout points strings`)
    const wallet = JSON.parse(read(`messages/${locale}/dashboard.json`)).benefits.wallet
    assert.ok(wallet.boost.action && wallet.boost.success, `${locale} boost strings`)
    assert.doesNotMatch(wallet.bodyProfessional, /not currently available|niet mogelijk|pas encore possible/)
  }
})

test('FT2 #1a: the hero headline is one line from lg up and the hero spacing stays compact', () => {
  const hero = read('components/HeroSection.tsx')
  assert.match(hero, /<br className="lg:hidden" \/>/)
  assert.doesNotMatch(hero, /lg:text-6xl/)
  assert.match(read('components/PopularProjectsCarousel.tsx'), /className="mt-4 max-w-5xl mx-auto text-left"/)
})
