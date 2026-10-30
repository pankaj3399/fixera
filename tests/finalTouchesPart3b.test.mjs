import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const require = createRequire(import.meta.url)
const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { NextIntlClientProvider } = await import('next-intl')
const { CurrencyProvider } = await import('@/contexts/CurrencyContext')
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime')
const TierBadge = (await import('@/components/dashboard/TierBadge')).default
const { TIER_BADGE_FALLBACK_COLOR } = await import('@/components/dashboard/TierBadge')
const CancellationRequestCard = (await import('@/components/booking/CancellationRequestCard')).default
const RescheduleRequestCard = (await import('@/components/booking/RescheduleRequestCard')).default
const LevelUpPopup = (await import('@/components/dashboard/LevelUpPopup')).default

const readSource = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const bookingsEn = JSON.parse(readFileSync(new URL('../messages/en/bookings.json', import.meta.url), 'utf8'))
const commonEn = JSON.parse(readFileSync(new URL('../messages/en/common.json', import.meta.url), 'utf8'))
const checkoutEn = JSON.parse(readFileSync(new URL('../messages/en/checkout.json', import.meta.url), 'utf8'))
const dashboardEn = JSON.parse(readFileSync(new URL('../messages/en/dashboard.json', import.meta.url), 'utf8'))
const dashboardWidgetsEn = JSON.parse(
  readFileSync(new URL('../messages/en/dashboardWidgets.json', import.meta.url), 'utf8')
)

function renderCard(element) {
  return renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale: 'en', messages: { bookings: bookingsEn, common: commonEn }, timeZone: 'UTC' },
      React.createElement(
        CurrencyProvider,
        { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false },
        element
      )
    )
  )
}

// Task 14b: tier colour from admin configuration with a safe fallback.
test('TierBadge renders the configured colour and falls back safely', () => {
  const configured = renderToStaticMarkup(
    React.createElement(TierBadge, { level: 'Gold', color: '#FFD700' })
  )
  assert.match(configured, /Gold/)
  assert.match(configured, /background-color:#FFD700/i)

  for (const color of [null, undefined, '', 'not-a-color', '#zzz']) {
    const html = renderToStaticMarkup(React.createElement(TierBadge, { level: 'Gold', color }))
    assert.match(html, new RegExp(`background-color:${TIER_BADGE_FALLBACK_COLOR}`, 'i'))
  }

  assert.equal(
    renderToStaticMarkup(React.createElement(TierBadge, { level: null, color: '#FFD700' })),
    ''
  )
})

// Task 3: cancellation request visible on the booking page with action.
test('CancellationRequestCard renders status, reason, actor and professional actions', () => {
  const request = {
    id: 'c1',
    status: 'pending',
    reason: 'Customer asked to cancel',
    reasonCategory: 'schedule',
    requestedBy: { id: 'cust1', name: 'Jane', role: 'customer' },
    requestedRole: 'customer',
    createdAt: '2026-10-20T10:00:00.000Z',
    responseDeadline: '2026-10-27T10:00:00.000Z',
    counterOfferAmount: 50,
  }
  const html = renderCard(
    React.createElement(CancellationRequestCard, {
      bookingId: 'b1',
      request,
      viewerRole: 'professional',
      currency: 'EUR',
    })
  )
  assert.match(html, /Cancellation request/)
  assert.match(html, /Pending/)
  assert.match(html, /Customer asked to cancel/)
  assert.match(html, /Jane/)
  assert.match(html, /Approve cancellation/)
  assert.match(html, /Reject request/)

  const customerHtml = renderCard(
    React.createElement(CancellationRequestCard, { bookingId: 'b1', request, viewerRole: 'customer' })
  )
  assert.doesNotMatch(customerHtml, /Approve cancellation/)
})

// Review item 3: the admin-authored resolution note renders for admins only.
test('CancellationRequestCard shows the admin note to admins only', () => {
  const request = {
    id: 'c2',
    status: 'denied',
    reason: 'Customer asked to cancel',
    requestedBy: { id: 'cust1', name: 'Jane', role: 'customer' },
    requestedRole: 'customer',
    createdAt: '2026-10-20T10:00:00.000Z',
    denyReason: 'Outside the free cancellation window',
    adminResolutionNote: 'Internal: keep for audit',
  }
  // denyReason is participant-safe (backend emails it to the requester).
  const customerHtml = renderCard(
    React.createElement(CancellationRequestCard, { bookingId: 'b1', request, viewerRole: 'customer' })
  )
  assert.match(customerHtml, /Outside the free cancellation window/)
  assert.doesNotMatch(customerHtml, /Internal: keep for audit/)

  const adminHtml = renderCard(
    React.createElement(CancellationRequestCard, { bookingId: 'b1', request, viewerRole: 'admin' })
  )
  assert.match(adminHtml, /Outside the free cancellation window/)
  assert.match(adminHtml, /Internal: keep for audit/)
})

// Tasks 9a/9c: full reschedule info, terminal state disables actions.
test('RescheduleRequestCard renders schedules, reason, requester and history', () => {
  const reschedules = [
    {
      id: 'r1',
      requestedAt: '2026-10-20T10:00:00.000Z',
      requestedBy: { id: 'pro1', name: 'Pro Joe', role: 'professional' },
      reason: 'Double booked',
      description: 'Need next week instead',
      status: 'pending',
      canRespond: true,
      previousSchedule: { scheduledStartDate: '2026-11-01', scheduledStartTime: '09:00' },
      proposedSchedule: { scheduledStartDate: '2026-11-08', scheduledStartTime: '10:00' },
    },
    {
      id: 'r0',
      requestedAt: '2026-10-10T10:00:00.000Z',
      requestedBy: { id: 'pro1', name: 'Pro Joe', role: 'professional' },
      reason: 'First try',
      status: 'declined',
      canRespond: false,
      previousSchedule: null,
      proposedSchedule: null,
    },
  ]
  const html = renderCard(
    React.createElement(RescheduleRequestCard, {
      bookingId: 'b1',
      reschedules,
      viewerUserId: 'cust1',
      viewerRole: 'customer',
    })
  )
  assert.match(html, /Reschedule request/)
  assert.match(html, /Double booked/)
  assert.match(html, /Need next week instead/)
  assert.match(html, /Pro Joe/)
  assert.match(html, /Original schedule/)
  assert.match(html, /New schedule/)
  assert.match(html, /2026/)
  assert.match(html, /Earlier requests/)
  assert.match(html, /First try/)
})

test('RescheduleRequestCard hides actions once the request is disputed/terminal', () => {
  const disputed = [
    {
      id: 'r9',
      requestedAt: '2026-10-20T10:00:00.000Z',
      requestedBy: { id: 'pro1', name: 'Pro Joe', role: 'professional' },
      reason: 'Double booked',
      status: 'disputed',
      canRespond: false,
      previousSchedule: null,
      proposedSchedule: null,
    },
  ]
  const html = renderCard(
    React.createElement(RescheduleRequestCard, {
      bookingId: 'b1',
      reschedules: disputed,
      viewerUserId: 'cust1',
      viewerRole: 'customer',
    })
  )
  assert.match(html, /Disputed/)
  assert.match(html, /can no longer be accepted or declined/)
  assert.doesNotMatch(html, /common\.accept/)
})

test('LevelUpPopup stays hidden without a level-up notification', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale: 'en', messages: { dashboardWidgets: dashboardWidgetsEn }, timeZone: 'UTC' },
      React.createElement(
        AppRouterContext.Provider,
        {
          value: {
            push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {},
          },
        },
        React.createElement(LevelUpPopup, null)
      )
    )
  )
  assert.equal(html, '')
})

test('booking page wires cancellation/reschedule cards, warranty clarification and RFQ titles', () => {
  const page = readSource('../app/(pages)/bookings/[id]/page.tsx')
  assert.match(page, /<CancellationRequestCard/)
  assert.match(page, /details\?\.cancellations\?\.\[0\]/)
  assert.match(page, /<RescheduleRequestCard/)
  assert.match(page, /RESCHEDULE_DISPUTED/)
  assert.match(page, /proposalDeclineClarification/)
  assert.match(page, /warranty\.proposalDeclineTitle/)
  assert.match(page, /warranty\.clarificationRequired/)
  assert.match(page, /page\.titleRfq/)
  assert.match(page, /page\.typeRfq/)
  assert.match(page, /recordedMilestoneCharges/)
  assert.match(page, /discountPreview\.originalAmount/)
})

test('new cards handle terminal states and validation', () => {
  const cancel = readSource('../components/booking/CancellationRequestCard.tsx')
  assert.match(cancel, /cancellation\/respond/)
  assert.match(cancel, /approve.*reject|decision.*approve/s)

  const reschedule = readSource('../components/booking/RescheduleRequestCard.tsx')
  assert.match(reschedule, /canRespond === false/)
  assert.match(reschedule, /409/)
  assert.match(reschedule, /RESCHEDULE_DISPUTED/)
  assert.match(reschedule, /proposedSchedule/)
  assert.match(reschedule, /previousSchedule/)

  const popup = readSource('../components/dashboard/LevelUpPopup.tsx')
  assert.match(popup, /customer\.loyalty_tier_up/)
  assert.match(popup, /professional\.leveling_up/)
  assert.match(popup, /markRead/)
  assert.match(popup, /levelup-seen/)
  // Review items 1-2: read items never re-pop; no reset-on-length-change.
  assert.match(popup, /!\s*item\.readAt/)
  assert.doesNotMatch(popup, /\[items\.length\]/)

  const wrapper = readSource('../components/notifications/FCMLayoutWrapper.tsx')
  assert.match(wrapper, /LevelUpPopup/)
})

test('payment page shows full price first and recorded milestone charges', () => {
  const page = readSource('../app/bookings/[id]/payment/page.tsx')
  assert.match(page, /paymentPage\.fullPrice/)
  assert.match(page, /originalServiceAmount/)
  assert.match(page, /expectedCustomerCharge/)
  assert.match(page, /includesSelectedOptions/)
  assert.match(page, /optionsFirstMilestoneNote/)
  assert.match(page, /previousToSchedule/)
  assert.doesNotMatch(page, /serviceOnlyAmount/)
  assert.doesNotMatch(page, /paymentPage\.originalServiceAmount/)
})

test('tier colours come from configuration everywhere tags appear', () => {
  for (const rel of [
    '../components/dashboard/TierBadge.tsx',
    '../lib/tierColors.ts',
    '../app/(pages)/dashboard/benefits/page.tsx',
    '../components/dashboard/BenefitsProgramCard.tsx',
    '../app/(pages)/admin/customers/page.tsx',
    '../app/(pages)/projects/[id]/page.tsx',
    '../components/chat/ChatInfoPanel.tsx',
    '../components/Navbar.tsx',
    // Review item 5: residual hardcoded colours migrated to config colours.
    '../components/search/ProjectCard.tsx',
    '../components/search/SearchFilters.tsx',
    '../components/admin/AdminSupportInfoPanel.tsx',
  ]) {
    const source = readSource(rel)
    assert.ok(source.length > 0, rel)
    if (rel !== '../components/dashboard/TierBadge.tsx' && rel !== '../lib/tierColors.ts') {
      assert.match(source, /TierBadge/, rel)
    }
  }
  const colors = readSource('../lib/tierColors.ts')
  assert.match(colors, /api\/public\/loyalty-tiers/)
  assert.match(colors, /api\/public\/professional-levels/)
  const benefits = readSource('../app/(pages)/dashboard/benefits/page.tsx')
  assert.match(benefits, /tierInfo\?\.color/)
  assert.match(benefits, /benefits\.wallet\.title/)
  assert.match(benefits, /#wallet-balance/)
  assert.match(benefits, /#wallet-history/)
  assert.match(benefits, /#wallet-benefits/)
  assert.equal(dashboardEn.benefits.wallet.title, 'How the points wallet works')
  assert.equal(dashboardWidgetsEn.levelUp.viewBenefits, 'View my benefits')
})

test('RFQ wording and milestone/price keys exist with placeholders intact', () => {
  assert.equal(bookingsEn.page.titleRfq, 'Quotation request')
  assert.equal(bookingsEn.page.typeRfq, 'Quotation request')
  assert.equal(bookingsEn.details.tabs.bookingRfq, 'Quotation request')
  assert.equal(bookingsEn.milestones.optionsFirstNote.slice(0, 8), 'Selected')
  assert.equal(bookingsEn.rescheduleRequest.toasts.disputed.slice(0, 4), 'This')
  assert.equal(checkoutEn.paymentPage.fullPrice, 'Full price')
  assert.equal(checkoutEn.paymentPage.selectedOptionsInfo, 'Selected options (included)')
  assert.ok(bookingsEn.cancellationRequest.professionalNote.includes('{note}'))
})
