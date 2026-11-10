import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
import { componentHarness, elementText } from './helpers/componentHarness.mjs'

register('./swc-loader.mjs', import.meta.url)
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.test'

const file = new URL('../app/(pages)/professional/[id]/ProfessionalProfileView.tsx', import.meta.url)
const originalFetch = globalThis.fetch

/** Keys are rendered as text, so assertions name the translation key. */
const t = (key) => key
// The real hook returns a stable function; a new one per render would re-run the load effect forever.
const errorText = (_body, fallback) => fallback

function view(reviewsResponse) {
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/reviews?')) return reviewsResponse()
    return new Response(JSON.stringify({ success: false }), { status: 404, headers: { 'content-type': 'application/json' } })
  }
  return componentHarness(file, {
    'next/navigation': { useParams: () => ({ id: 'pro1' }), useRouter: () => ({ push() {} }) },
    'next-intl': { useTranslations: () => t },
    '@/contexts/AuthContext': { useAuth: () => ({ user: null, loading: false }) },
    sonner: { toast: { error() {}, success() {} } },
    '@/lib/utils': { getAuthToken: () => null },
    '@/components/chat/StartChatButton': { __esModule: true, default: () => null },
    '@/components/favorites/FavoriteButton': { __esModule: true, default: () => null },
    '@/hooks/useFavoriteStatus': { useFavoriteStatus: () => ({}) },
    '@/contexts/CurrencyContext': { useCurrency: () => ({ formatPrice: (value) => String(value) }) },
    '@/components/currency/CurrencySymbol': { CurrencySymbol: () => null },
    '@/lib/i18n/useFormatLocale': { useFormatLocale: () => ({ intl: 'en-US' }) },
    '@/lib/i18n/useErrorMessage': { useErrorMessage: () => errorText },
  })
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const professionalBody = { _id: 'pro1', name: 'Jan Peeters', businessInfo: { city: 'Gent', country: 'BE' } }

test('a 429 on the first profile load shows a retry state, never the not-found state', async () => {
  const h = view(() => json({ success: false, msg: 'Too many requests' }, 429))
  try {
    h.render({ initialProfessional: null })
    await h.settle()
    const text = elementText(h.render())
    assert.ok(text.includes('page.unavailableTitle'), 'the unavailable state is shown')
    assert.ok(text.includes('page.retry'), 'a retry action is offered')
    assert.ok(!text.includes('page.notFoundTitle'), 'a rate limit is not reported as a missing profile')
  } finally {
    h.unmount()
    globalThis.fetch = originalFetch
  }
})

test('a 404 on the profile load is the not-found state', async () => {
  const h = view(() => json({ success: false, msg: 'Not found' }, 404))
  try {
    h.render({ initialProfessional: null })
    await h.settle()
    const text = elementText(h.render())
    assert.ok(text.includes('page.notFoundTitle'))
    assert.ok(!text.includes('page.unavailableTitle'))
  } finally {
    h.unmount()
    globalThis.fetch = originalFetch
  }
})

test('the rating overview is pending until the first response, then shows "no reviews yet" for a completed empty summary', async () => {
  let respond
  const pending = new Promise((resolve) => { respond = resolve })
  const h = view(() => pending)
  try {
    h.render({ initialProfessional: professionalBody })
    await h.settle()
    assert.ok(h.findAll((n) => n.props['aria-busy'] === 'true').length === 1, 'pending ratings show a loading placeholder')
    assert.ok(!elementText(h.render()).includes('page.noReviewsYet'), 'pending is not reported as no reviews')

    respond(json({
      success: true,
      data: { professional: professionalBody, reviews: [], ratingsSummary: { overallAverage: 0, totalReviews: 0 }, pagination: { totalPages: 1 } },
    }))
    await h.settle()
    assert.ok(h.findAll((n) => n.props['aria-busy'] === 'true').length === 0)
    assert.ok(elementText(h.render()).includes('page.noReviewsYet'), 'a completed summary with no reviews says so')
  } finally {
    h.unmount()
    globalThis.fetch = originalFetch
  }
})

test('the project filter select has an accessible, localized name', async () => {
  const h = view(() => json({
    success: true,
    data: {
      professional: professionalBody,
      reviews: [],
      ratingsSummary: { overallAverage: 4, avgCommunication: 4, avgValueOfDelivery: 4, avgQualityOfService: 4, totalReviews: 2 },
      pagination: { totalPages: 1 },
      projects: [{ _id: 'a', title: 'Kitchen' }, { _id: 'b', title: 'Garden' }],
    },
  }))
  try {
    h.render({ initialProfessional: null })
    await h.settle()
    const selects = h.findAll((n) => n.type === 'select')
    assert.equal(selects.length, 1)
    assert.equal(selects[0].props['aria-label'], 'page.filterByProject')
  } finally {
    h.unmount()
    globalThis.fetch = originalFetch
  }
})
