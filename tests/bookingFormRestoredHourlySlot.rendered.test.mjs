import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { componentHarness, elementText } from './helpers/componentHarness.mjs'

const require = createRequire(import.meta.url)

register('./swc-loader.mjs', import.meta.url)
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.test'

const file = new URL('../components/project/ProjectBookingForm.tsx', import.meta.url)
const originalFetch = globalThis.fetch
const originalWindow = globalThis.window

const pricing = {
  customerPrice: () => null,
  customerPackagePrice: async () => null,
  pricingReady: true,
  pricingError: false,
  retryPricing() {},
  loyaltyLoaded: true,
}
const translate = Object.assign((key, values) => (values ? `${key}${JSON.stringify(values)}` : key), { rich: (key) => key, has: () => true, raw: (key) => key, markup: (key) => key })
const lib = async (path) => import(new URL(`../lib/${path}`, import.meta.url))
const imports = {
  'next/navigation': { useRouter: () => ({ push() {}, replace() {} }) },
  'next-intl': { useTranslations: () => translate },
  '@/components/i18n/ContentTranslationsProvider': { useContentText: () => (value) => value },
  '@/lib/i18n/useErrorMessage': { useErrorMessage: () => (_error, fallback) => fallback },
  '@/lib/packageDuration': await lib('packageDuration.ts'),
  '@/lib/bookingSchedule': await lib('bookingSchedule.ts'),
  '@/components/professional/project-wizard/AddressAutocomplete': { __esModule: true, default: () => null },
  '@/lib/serviceAddress': await lib('serviceAddress.ts'),
  '@/components/chat/StartChatButton': { __esModule: true, default: () => null },
  sonner: { toast: { error() {}, success() {}, warning() {} } },
  'date-fns': require('date-fns'),
  'date-fns-tz': require('date-fns-tz'),
  'react-day-picker': { DayPicker: () => null },
  'react-day-picker/dist/style.css': {},
  '@/contexts/AuthContext': { useAuth: () => ({ user: { _id: 'u1', role: 'customer' }, isAuthenticated: true, loading: false }) },
  '@/lib/booking/checkoutDraft': await lib('booking/checkoutDraft.ts'),
  '@/lib/booking/vatPreviewTotal': await lib('booking/vatPreviewTotal.ts'),
  '@/contexts/CurrencyContext': { useCurrency: () => ({ formatPrice: String, formatMoney: String, currency: 'EUR' }) },
  '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-GB', dateFns: undefined }) },
  '@/lib/timezoneDisplay': await lib('timezoneDisplay.ts'),
  '@/lib/projectPricing': await lib('projectPricing.ts'),
  '@/lib/customerPricing': await lib('customerPricing.ts'),
  '@/lib/utils': { getAuthToken: () => null },
  '@/hooks/useCustomerPricing': { useCustomerPricing: () => pricing },
  '@/lib/analytics': { trackBeginCheckout() {}, trackCompleteRfq() {}, trackEvent() {} },
  '@/lib/calendar/dayAvailability': await lib('calendar/dayAvailability.ts'),
  '@/lib/calendar/calendarDateKey': await lib('calendar/calendarDateKey.ts'),
  '@/lib/dashboardOverview': await lib('dashboardOverview.ts'),
}

const DATE = '2027-01-11'
const project = {
  _id: 'p1',
  title: 'Repair',
  category: 'repair',
  service: 'repair',
  priceModel: 'fixed',
  subprojects: [{
    _id: 'pkg-a',
    name: 'Hour visit',
    pricing: { type: 'fixed', amount: 100 },
    executionDuration: { value: 1, unit: 'hours' },
  }],
  extraOptions: [],
  rfqQuestions: [],
  postBookingQuestions: [],
  professionalId: { _id: 'pro1', name: 'Jan' },
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * Working hours fail to load, so the client falls back to its default 09:00-17:00 day.
 * The server offers a longer day: its slot list differs from the client-generated one.
 */
function mount(serverSlots) {
  const slotRequests = []
  globalThis.window = { setTimeout, clearTimeout, location: { href: 'https://fixera.test/projects/p1' }, addEventListener() {}, removeEventListener() {} }
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/working-hours')) return json({ success: false }, 500)
    if (href.includes('/availability')) return json({ success: true, blockedDates: [], blockedRanges: [], timezone: 'UTC' })
    if (href.includes('/schedule-proposals')) return json({ success: true, proposals: { mode: 'hours', earliestBookableDate: `${DATE}T00:00:00.000Z` } })
    if (href.includes('/available-slots')) {
      return new Promise((resolve) => slotRequests.push({ href, answer: () => resolve(json({ success: true, slots: serverSlots })) }))
    }
    return json({ success: false }, 404)
  }
  const h = componentHarness(file, imports)
  const draft = {
    version: 2, projectId: 'p1', userId: 'u1', savedAt: Date.now(),
    selectedPackageIndex: 0, selectedPackageId: 'pkg-a', selectedPackageName: 'Hour visit',
    selectedDate: DATE, selectedTime: '18:00',
  }
  h.render({ project, onBack() {}, selectedSubprojectIndex: 0, resumeDraft: draft })
  return { h, slotRequests }
}

/** The start time the review step shows for the booking (the time the form will submit). */
const shownStartTime = (h) => {
  const text = elementText(h.render())
  const match = text.match(/schedule\.timeRange\{"start":"(\d{1,2}):(\d\d)"/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
}

test('CR: the restored hourly time is kept when the server offers it, even if the client-generated slots do not', async () => {
  const { h, slotRequests } = mount(['09:00', '10:00', '18:00'])
  try {
    await h.settle()
    assert.ok(slotRequests.length >= 1, 'the server slots for the restored date are requested')
    assert.match(slotRequests.at(-1).href, /date=2027-01-11/)
    // Before the server answers, the client-generated default day (09:00-17:00)
    // does not offer 18:00, so a client slot stands in.
    assert.equal(shownStartTime(h), '09:00')
    slotRequests.at(-1).answer()
    await h.settle()
    // The server offers both 09:00 and 18:00: its list is authoritative, so the restored 18:00 wins.
    assert.equal(shownStartTime(h), '18:00')
    await h.settle()
    assert.equal(shownStartTime(h), '18:00', 'the client slots do not switch it back')
  } finally {
    h.unmount()
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  }
})

test('CR: a restored hourly time the server no longer offers is replaced by a server slot', async () => {
  const { h, slotRequests } = mount(['10:00', '11:00'])
  try {
    await h.settle()
    slotRequests.at(-1).answer()
    await h.settle()
    assert.equal(shownStartTime(h), '10:00')
  } finally {
    h.unmount()
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  }
})
