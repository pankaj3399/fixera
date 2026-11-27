import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
import { componentHarness, elementText } from './helpers/componentHarness.mjs'

register('./swc-loader.mjs', import.meta.url)
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.test'

const file = new URL('../app/[ctx]/(pages)/projects/[id]/ProjectDetailView.tsx', import.meta.url)
const originalFetch = globalThis.fetch
const contentTranslations = await import('../lib/contentTranslations.ts')
const t = (key) => key
const toasts = []
const errorText = (_body, fallback) => fallback

const project = {
  _id: 'p1',
  title: 'Kitchen',
  description: 'Fit a kitchen',
  category: 'interior',
  service: 'kitchen',
  priceModel: 'fixed',
  timeMode: 'days',
  distance: { noBorders: true },
  media: { images: [] },
  certifications: [],
  termsConditions: [],
  subprojects: [],
  resources: [],
  faq: [],
  extraOptions: [],
  professionalId: { _id: 'pro1', name: 'Jan', companyAvailability: {}, companyBlockedRanges: [] },
}

const review = {
  _id: 'r1',
  customerReview: { communicationLevel: 5, valueOfDelivery: 5, qualityOfService: 5, comment: 'Great work', reviewedAt: '2026-01-01T00:00:00Z' },
  customer: { name: 'Ann' },
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const reviewsBody = { success: true, data: { reviews: [review], ratingsSummary: null, ordersInQueue: 0, pagination: { totalPages: 1 } } }

/** Reviews requests go to `respond`; every other backend read answers as an empty failure. */
function view(respond, options = {}) {
  globalThis.fetch = async (url, init) => {
    const href = String(url)
    if (href.includes('/reviews?')) return respond(href, init)
    return json({ success: false }, 404)
  }
  return componentHarness(file, {
    'next/navigation': { useParams: () => ({ id: 'p1' }), useRouter: () => ({ push() {} }) },
    'next-intl': { useTranslations: () => t },
    '@/contexts/AuthContext': { useAuth: () => options.auth ?? ({ user: null, isAuthenticated: false, loading: false }) },
    sonner: { toast: { error: (message) => toasts.push(message), success() {} } },
    '@/lib/utils': { authFetch: async () => json({ success: false }, 404) },
    'next/image': { __esModule: true, default: 'img' },
    '@/components/project/ProjectBookingForm': { __esModule: true, default: options.bookingForm ?? (() => null) },
    '@/components/project/SubprojectComparisonTable': { __esModule: true, default: () => null },
    '@/components/favorites/FavoriteButton': { __esModule: true, default: () => null },
    '@/lib/contentTranslations': contentTranslations,
    '@/components/i18n/ContentTranslationsProvider': { ContentTranslationsProvider: ({ children }) => children },
    '@/lib/projectHighlights': { formatPriceModelLabel: (value) => value, getCertificateGradient: () => '', isQualityCertificate: () => false },
    '@/lib/chatWidgetEvents': { emitChatWidgetOpen() {}, PENDING_CHAT_START_KEY: 'pending', LEGACY_PENDING_CHAT_START_KEY: 'legacy' },
    '@/lib/storageMigration': { setMigratedItem() {} },
    '@/lib/timezoneDisplay': { getViewerTimezone: () => 'UTC' },
    '@/hooks/useCustomerPricing': { useCustomerPricing: () => ({ customerPrice: () => null }) },
    '@/contexts/CurrencyContext': { useCurrency: () => ({ formatPrice: (value) => String(value) }) },
    '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-US' }) },
    '@/lib/publicProjectShape': { normalizePublicProject: (value) => value },
    '@/lib/booking/checkoutDraft': options.checkoutDraft ?? { loadCheckoutDraft: () => null, clearCheckoutDraft() {}, findDraftPackageIndex: () => null, RESUME_BOOKING_PARAM: 'resumeBooking' },
    '@/lib/professionalLevel': { getAdminTagStyle: () => '', formatAdminTagLabel: (value) => value, formatResponseTime: () => '' },
    '@/components/dashboard/TierBadge': { __esModule: true, default: () => null },
    '@/lib/tierColors': { useTierColors: () => ({ levelColor: () => '' }) },
    '@/lib/analytics': { trackBeginRfq() {}, trackEvent() {}, trackProfessionalContact() {}, trackProjectView() {} },
  })
}

const setSearch = (h, value) => {
  const input = h.findAll((n) => n.props.placeholder === 'page.searchReviews')[0]
  input.props.onChange({ target: { value } })
}
const isLoadingReviews = (h) => h.findAll((n) => typeof n.props.className === 'string' && n.props.className.includes('animate-pulse')).length > 0

test('a failed review filter clears the previous reviews and reports the failure', async () => {
  toasts.length = 0
  const h = view((href) => (href.includes('search=kitchen') ? json({ success: false }, 500) : json(reviewsBody)))
  try {
    h.render({ initialProject: project, serverNow: '2026-11-09T00:00:00.000Z' })
    await h.settle()
    assert.ok(elementText(h.render()).includes('Great work'), 'the first filter shows its reviews')

    setSearch(h, 'kitchen')
    await h.settle()
    const text = elementText(h.render())
    assert.ok(!text.includes('Great work'), 'reviews from the previous filter are not shown as results for the new one')
    assert.ok(toasts.includes('page.loadFailed'), 'the failure is reported')
  } finally {
    h.unmount()
    globalThis.fetch = originalFetch
  }
})

test('an aborted review request does not clear the loading state of the request that replaced it', async () => {
  let secondRequest
  const h = view((href, init) => {
    if (!href.includes('search=kitchen')) {
      // The first request stays pending until it is aborted by the filter change.
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }
    return new Promise((resolve) => { secondRequest = () => resolve(json(reviewsBody)) })
  })
  try {
    h.render({ initialProject: project, serverNow: '2026-11-09T00:00:00.000Z' })
    await h.settle()
    assert.equal(isLoadingReviews(h), true, 'the first request is loading')

    setSearch(h, 'kitchen')
    await h.settle()
    assert.equal(isLoadingReviews(h), true, 'the replacing request still owns the loading state after the abort')

    secondRequest()
    await h.settle()
    assert.equal(isLoadingReviews(h), false)
    assert.ok(elementText(h.render()).includes('Great work'))
  } finally {
    h.unmount()
    globalThis.fetch = originalFetch
  }
})

test('CR: back from payment reopens the wizard with the saved package by id, for its owner only', async () => {
  const draftLib = await import('../lib/booking/checkoutDraft.ts')
  const previousWindow = globalThis.window
  const packages = [{ _id: 'pkg-a', name: 'Basic' }, { _id: 'pkg-c', name: 'Deluxe' }]
  const run = async (selectedPackageId) => {
    toasts.length = 0
    const loads = []
    const cleared = []
    const formProps = []
    const BookingForm = () => null
    globalThis.window = {
      location: { href: 'https://fixera.test/projects/p1?resumeBooking=1' },
      history: { state: null, replaceState() {} },
    }
    const h = view(() => json(reviewsBody), {
      auth: { user: { _id: 'u1', role: 'customer' }, isAuthenticated: true, loading: false },
      bookingForm: BookingForm,
      checkoutDraft: {
        ...draftLib,
        loadCheckoutDraft: (projectId, userId) => {
          loads.push([projectId, userId])
          return { selectedPackageIndex: 1, selectedPackageId, selectedPackageName: 'Premium' }
        },
        clearCheckoutDraft: (projectId) => cleared.push(projectId),
      },
    })
    try {
      h.render({ initialProject: { ...project, subprojects: packages }, serverNow: '2026-11-09T00:00:00.000Z' })
      await h.settle()
      h.render()
      formProps.push(...h.findAll((node) => node.type === BookingForm).map((node) => node.props))
      return { loads, cleared, formProps }
    } finally {
      h.unmount()
      globalThis.fetch = originalFetch
    }
  }
  try {
    // The saved package now sits at index 1 after another one was removed.
    const found = await run('pkg-c')
    assert.deepEqual(found.loads[0], ['p1', 'u1'], 'the draft is read for the signed-in customer')
    assert.equal(found.formProps.at(-1)?.selectedSubprojectIndex, 1)
    // The saved package was removed: index 1 is another package, so the wizard stays closed.
    const gone = await run('pkg-b')
    assert.equal(gone.formProps.length, 0, 'no wizard with a different package')
    assert.deepEqual(gone.cleared, ['p1'])
    assert.ok(toasts.includes('page.resumePackageUnavailable'))
  } finally {
    globalThis.window = previousWindow
  }
})
