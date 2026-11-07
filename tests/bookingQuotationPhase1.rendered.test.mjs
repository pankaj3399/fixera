import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { hooks, loadComponent, findAll, common, settle, textOf } from './reviewComponentHarness.mjs'
import { register } from 'node:module'
register('./swc-loader.mjs', import.meta.url)
const currency = await import('@/contexts/CurrencyContext')
const { CurrencyProvider } = currency
const detailsLib = await import('@/lib/bookingDetails')
const primitives = await import('@/components/booking/details/DetailPrimitives')
const localeLib = await import('@/lib/i18n/useFormatLocale')
const intl = await import('next-intl')

const messages = JSON.parse(readFileSync(new URL('../messages/en/bookings.json', import.meta.url)))
const payload = () => JSON.parse(readFileSync(new URL('./fixtures/bookingDetails/completed-customer.json', import.meta.url)))
function render(element) {
  return renderToStaticMarkup(React.createElement(NextIntlClientProvider, { locale: 'en', timeZone: 'UTC', messages: { bookings: messages } },
    React.createElement(CurrencyProvider, { initialCurrency: 'EUR', initialRates: { EUR: 1 }, refreshRates: false }, element)))
}
function activityPanel(areas = []) {
  return loadComponent('../components/booking/details/ActivityPanel.tsx', {
    react: React, 'next-intl': intl,
    '@/lib/bookingDetails': detailsLib, './DetailPrimitives': primitives,
    '@/contexts/CurrencyContext': currency, '@/lib/i18n/useFormatLocale': localeLib,
    '@/hooks/useAdminAccess': { useAdminAccess: () => ({ canReadArea: area => areas.includes(area) }) },
  }, 'ActivityPanel')
}
function activityPayload(canOpen = true) {
  const data = payload()
  data.details.activity = { complete: false, coverage: { status: 'unknown' }, items: [
    { id: 'claim:1', type: 'warranty_claim_opened', category: 'warranty', occurredAt: '', timestampRecorded: false, actorRecorded: false,
      metadata: { claimId: 'claim-1', claimNumber: 'WC-1', participantCanOpen: canOpen }, attachments: [] },
    { id: 'dispute:1', type: 'dispute_opened', category: 'dispute', occurredAt: '2026-02-10', actorRecorded: false, metadata: { disputeType: 'reschedule' }, attachments: [] },
  ] }
  data.details.adminLinks = { booking: '/admin/bookings/test', disputes: '/admin/disputes', warrantyClaims: '/admin/warranty-claims' }
  data.booking.dispute = { raisedAt: '2026-02-10' }
  return data
}

test('participants get only an authorized owned-claim deep link and an honest undated group', () => {
  const Panel = activityPanel()
  for (const viewerRole of ['customer', 'professional']) {
    const html = render(React.createElement(Panel, { ...activityPayload(), viewerRole, pathname: '/bookings/test', search: '' }))
    assert.match(html, /href="\/dashboard\/warranty-claims\?claimId=claim-1"/)
    assert.doesNotMatch(html, /href="\/admin\//)
    assert.match(html, /Undated|date not recorded/i)
    assert.match(html, /Historical coverage is unknown/)
  }
  const denied = render(React.createElement(Panel, { ...activityPayload(false), viewerRole: 'professional', pathname: '/bookings/test', search: '' }))
  assert.doesNotMatch(denied, /href="\/dashboard\/warranty-claims/)
})

test('admin activity navigation follows read areas and the backend area mask', () => {
  const Panel = activityPanel(['bookings', 'warranty', 'disputes'])
  const props = { ...activityPayload(), viewerRole: 'admin', pathname: '/admin/bookings/test', search: '' }
  const html = render(React.createElement(Panel, props))
  assert.match(html, /href="\/admin\/warranty-claims\?search=WC-1"/)
  assert.match(html, /href="\/admin\/disputes"/)
  delete props.details.adminLinks.disputes
  assert.doesNotMatch(render(React.createElement(Panel, props)), /href="\/admin\/disputes"/)
  const NoAreas = activityPanel(['bookings'])
  assert.doesNotMatch(render(React.createElement(NoAreas, props)), /href="\/admin\/(warranty|disputes)/)
})

test('admin booking renders server details in shared tabs while preserving gated admin tools', async () => {
  for (const write of [false, true]) {
    const state = hooks()
    const Tabs = () => null
    const data = payload()
    const Page = loadComponent('../app/(pages)/admin/bookings/[id]/page.tsx', {
      ...common, react: state.api,
      '@/lib/apiErrors': { messageFromApiBody: () => 'Error' },
      '@/components/booking/details/BookingDetailsTabs': { BookingDetailsTabs: Tabs },
      '@/contexts/AuthContext': { useAuth: () => ({ user: { role: 'admin' }, loading: false }) },
      'next/navigation': { useRouter: () => ({ push() {}, back() {} }), useParams: () => ({ id: 'test' }) },
      '@/lib/utils': { authFetch: async () => ({ json: async () => ({ success: true, data: { booking: data.booking, details: data.details, payment: null, cancellationRequests: [] } }) }) },
      '@/lib/constants/adminBookingStatus': { FORCEABLE_BOOKING_STATUSES: ['booked'] },
      '@/hooks/useAdminAccess': { useAdminAccess: () => ({ can: permission => write && permission === 'bookings.write' }) },
      '@/lib/anonymizedUsers': { isAnonymizedIdentity: () => false },
    })
    const draw = () => { const tree = state.render(() => Page()); state.flush(); return tree }
    try {
      draw(); await settle()
      const tree = draw()
      const tab = findAll(tree, node => node.type === Tabs)[0]
      assert.ok(tab)
      assert.equal(tab.props.viewerRole, 'admin')
      assert.equal(tab.props.details, data.details)
      assert.equal(textOf(tree).includes('Force status'), write)
    } finally { state.unmount() }
  }
})
