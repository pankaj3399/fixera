import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'

register('./swc-loader.mjs', import.meta.url)

const React = (await import('react')).default
const { renderToStaticMarkup } = await import('react-dom/server')
const intl = await import('next-intl')
const { loadComponent } = await import('./reviewComponentHarness.mjs')
const { componentHarness } = await import('./helpers/componentHarness.mjs')
const popularLib = await import('../lib/popularProject.ts')
const publicCache = await import('../lib/publicCache.ts')
const enHome = (await import('../messages/en/home.json')).default

const h = React.createElement
const DATA_COVER = 'data:image/jpeg;base64,' + 'A'.repeat(5000)
const DATA_AVATAR = 'data:image/png;base64,' + 'B'.repeat(3000)
const HTTPS_COVER = 'https://cdn.example.com/covers/kitchen.jpg'
const HTTPS_AVATAR = 'https://cdn.example.com/avatars/jo.jpg'

const backendProject = (id, image, profileImage, extra = {}) => ({
  _id: id, title: `Project ${id}`, category: 'Renovation', service: 'Kitchen', image, location: 'Gent',
  startingPrice: 1500, priceType: 'fixed', avgRating: 4.5, totalReviews: 3,
  professional: { name: `Pro ${id}`, profileImage, city: 'Gent', country: 'BE' }, ...extra,
})
const backendBody = {
  projects: [
    backendProject('p-inline', DATA_COVER, DATA_AVATAR),
    backendProject('p-remote', HTTPS_COVER, HTTPS_AVATAR),
    backendProject('p-none', null, null),
  ],
}

function loadServerModule() {
  const cacheCalls = []
  const mod = loadComponent('../lib/server/popular.ts', {
    'server-only': {},
    react: { cache: (fn) => fn },
    'next/cache': {
      unstable_cache: (fn, keyParts, options) => {
        const call = { keyParts, options, results: [] }
        cacheCalls.push(call)
        return async (...args) => {
          const value = await fn(...args)
          call.results.push(value)
          return value
        }
      },
    },
    '@/lib/popularProject': popularLib,
    '@/lib/publicCache': publicCache,
  }, 'getPopularProjects')
  return { getPopularProjects: mod, cacheCalls }
}

async function withFetch(impl, run) {
  const original = globalThis.fetch
  const previousUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  const calls = []
  process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com'
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return impl(url, init) }
  try {
    return await run(calls)
  } finally {
    globalThis.fetch = original
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL
    else process.env.NEXT_PUBLIC_BACKEND_URL = previousUrl
  }
}

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('the server list drops data: images, keeps https ones and caches only the trimmed list', async () => {
  const { getPopularProjects, cacheCalls } = loadServerModule()
  await withFetch(() => jsonResponse(backendBody), async (calls) => {
    const projects = await getPopularProjects({ limit: 10 })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.example.com/api/search/popular-projects?limit=10')
    assert.equal(calls[0].init.cache, 'no-store')
    assert.equal(calls[0].init.next, undefined, 'the raw response must not enter the fetch Data Cache')

    assert.equal(cacheCalls.length, 1)
    assert.deepEqual(cacheCalls[0].options, { revalidate: 21600, tags: ['popular-projects'] })
    assert.ok(cacheCalls[0].keyParts.includes('/api/search/popular-projects?limit=10'))
    assert.doesNotMatch(JSON.stringify(cacheCalls[0].results), /data:/)
    assert.doesNotMatch(JSON.stringify(projects), /data:/)

    const byId = Object.fromEntries(projects.map((p) => [p._id, p]))
    assert.equal(byId['p-inline'].image, null)
    assert.equal(byId['p-inline'].professional.profileImage, null)
    assert.equal(byId['p-inline'].imagesDeferred, true)
    assert.equal(byId['p-inline'].title, 'Project p-inline')
    assert.equal(byId['p-inline'].startingPrice, 1500)
    assert.equal(byId['p-remote'].image, HTTPS_COVER)
    assert.equal(byId['p-remote'].professional.profileImage, HTTPS_AVATAR)
    assert.equal(byId['p-remote'].imagesDeferred, undefined)
    assert.equal(byId['p-none'].imagesDeferred, undefined)
  })
})

test('service carousels keep their per-service tag and query', async () => {
  const { getPopularProjects, cacheCalls } = loadServerModule()
  await withFetch(() => jsonResponse(backendBody), async (calls) => {
    await getPopularProjects({ limit: 50, service: '  Kitchen fitting ' })
    assert.equal(calls[0].url, 'https://api.example.com/api/search/popular-projects?limit=20&service=Kitchen+fitting')
    assert.deepEqual(cacheCalls[0].options.tags, ['popular-projects', 'popular-projects:Kitchen fitting'])
  })
})

test('a failed backend call returns no projects and is not cached', async () => {
  for (const impl of [() => jsonResponse({}, 503), () => { throw new Error('network down') }]) {
    const { getPopularProjects, cacheCalls } = loadServerModule()
    const originalError = console.error
    console.error = () => {}
    try {
      await withFetch(impl, async () => {
        assert.deepEqual(await getPopularProjects({ limit: 10 }), [])
        // The cached function threw, so unstable_cache stored nothing.
        assert.deepEqual(cacheCalls[0].results, [])
      })
    } finally {
      console.error = originalError
    }
  }
})

function loadCarousel(hook) {
  return loadComponent('../components/PopularProjectsCarousel.tsx', {
    react: React,
    'next-intl': intl,
    'next/image': { __esModule: true, default: (props) => h('img', { src: props.src, alt: props.alt }) },
    'next/link': { __esModule: true, default: ({ href, children, className }) => h('a', { href, className }, children) },
    'lucide-react': new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : () => null) }),
    '@/components/ui/badge': { Badge: ({ children }) => h('span', null, children) },
    '@/contexts/CurrencyContext': { useCurrency: () => ({ formatPrice: (n) => `€${n}` }) },
    '@/components/home/useDeferredPopularImages': hook,
  })
}

const renderCarousel = (Carousel, projects) => renderToStaticMarkup(
  h(intl.NextIntlClientProvider, { locale: 'en', timeZone: 'UTC', messages: { home: enHome } },
    h(Carousel, { projects, imageQuery: { limit: 10, service: '' } })))

test('the server-rendered carousel has titles, links and prices but no data: URIs', async () => {
  const { getPopularProjects } = loadServerModule()
  const projects = await withFetch(() => jsonResponse(backendBody), () => getPopularProjects({ limit: 10 }))
  const hook = await import('../components/home/useDeferredPopularImages.ts')
  const html = renderCarousel(loadCarousel(hook), projects)
  assert.doesNotMatch(html, /data:/)
  assert.match(html, /Project p-inline/)
  assert.match(html, /href="\/projects\/p-inline"/)
  assert.match(html, /€1500/)
  assert.ok(html.includes(`src="${HTTPS_COVER}"`), 'https cover kept')
  assert.ok(html.includes(`src="${HTTPS_AVATAR}"`), 'https avatar kept')
  // The stripped card shows its existing no-image placeholder until the browser fills it in.
  assert.equal(html.split(enHome.popularProjects.noPreview).length - 1, 2)
})

function runHook(projects, query, backendUrl) {
  const harness = componentHarness(new URL('../components/home/useDeferredPopularImages.ts', import.meta.url), {
    '@/lib/popularProject': popularLib,
  })
  harness.useComponent(() => harness.exports.useDeferredPopularImages(projects, query, backendUrl))
  return harness
}

const trimmed = backendBody.projects.map((p) => popularLib.withoutInlineImages({ ...p, professional: { ...p.professional } }))

test('the browser fills in stripped images from the same endpoint, matched by id', async () => {
  const fresh = {
    projects: [
      // Order changed and an extra record: matching is by id only.
      backendProject('p-other', DATA_COVER, null),
      backendProject('p-remote', 'https://cdn.example.com/changed.jpg', null),
      backendProject('p-inline', DATA_COVER, DATA_AVATAR),
    ],
  }
  await withFetch(() => jsonResponse(fresh), async (calls) => {
    const harness = runHook(trimmed, { limit: 10, service: '' }, 'https://api.example.com')
    assert.equal(harness.render()[0].image, null, 'placeholder until loaded')
    await harness.settle()
    await setImmediate()
    await harness.settle()
    const result = harness.render()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.example.com/api/search/popular-projects?limit=10')
    assert.equal(calls[0].init.credentials, undefined)
    const byId = Object.fromEntries(result.map((p) => [p._id, p]))
    assert.equal(byId['p-inline'].image, DATA_COVER)
    assert.equal(byId['p-inline'].professional.profileImage, DATA_AVATAR)
    // Images the server sent are never replaced.
    assert.equal(byId['p-remote'].image, HTTPS_COVER)
    assert.equal(byId['p-remote'].professional.profileImage, HTTPS_AVATAR)
    assert.equal(byId['p-none'].image, null)
    assert.equal(result.length, 3)
  })
})

test('no request when nothing was stripped; placeholders stay when the request fails', async () => {
  const remoteOnly = trimmed.filter((p) => !p.imagesDeferred)
  await withFetch(() => jsonResponse(backendBody), async (calls) => {
    const harness = runHook(remoteOnly, { limit: 10, service: '' }, 'https://api.example.com')
    harness.render()
    await harness.settle()
    assert.equal(calls.length, 0)
  })
  for (const impl of [() => jsonResponse({}, 500), () => { throw new Error('offline') }, () => jsonResponse({ projects: 'nope' })]) {
    await withFetch(impl, async (calls) => {
      const harness = runHook(trimmed, { limit: 10, service: '' }, 'https://api.example.com')
      harness.render()
      await harness.settle()
      await setImmediate()
      await harness.settle()
      const result = harness.render()
      assert.equal(calls.length, 1)
      assert.equal(result.find((p) => p._id === 'p-inline').image, null)
      assert.equal(result.find((p) => p._id === 'p-remote').image, HTTPS_COVER)
    })
  }
})
