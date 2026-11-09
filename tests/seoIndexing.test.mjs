import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test'
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.test'

const { buildLlmsTxt } = await import('../lib/seo/llmsTxt.ts')
const { OG_DEFAULT_IMAGE } = await import('../lib/seo/site.ts')
const publicEntities = await import('../lib/server/publicEntities.ts')
const sitemapPlan = await import('../lib/server/sitemap.ts')
const { normalizePublicProject } = await import('../lib/publicProjectShape.ts')
const { serviceSchema } = await import('../lib/seo/jsonLd.ts')
const { isLocalizableRoute } = await import('../lib/seo/localeUrls.ts')
const { default: sitemap, generateSitemaps } = await import('../app/sitemap.ts')
const { GET: sitemapIndex } = await import('../app/sitemap.xml/route.ts')

const readSource = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

/** Stubs global fetch; `handler` returns a Response (or throws) for each request. */
function stubFetch(handler) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    return handler(url, init)
  }
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('llms.txt is built from the site origin and lists the public sections', () => {
  const body = buildLlmsTxt()
  assert.match(body, /^# Fixtract/)
  for (const path of ['/services', '/professionals', '/join', '/faq', '/about', '/blog', '/news', '/privacy-policy']) {
    assert.ok(body.includes(`https://example.test${path}`), `missing ${path}`)
  }
  assert.match(body, /https:\/\/example\.test\/projects\/\{id\}/)
  assert.match(body, /https:\/\/example\.test\/professional\/\{id\}/)
  assert.doesNotMatch(body, /localhost/)
})

test('default OG image is a real 1200x630 PNG', () => {
  assert.equal(OG_DEFAULT_IMAGE, '/og-default.png')
  const header = readFileSync(new URL('../public/og-default.png', import.meta.url)).subarray(0, 24)
  assert.deepEqual([...header.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(header.readUInt32BE(16), 1200)
  assert.equal(header.readUInt32BE(20), 630)
})

test('entity lookups map 404/400 to not_found, outages to unavailable, and cache by time', async () => {
  const project = stubFetch((url) => {
    if (url.includes('/projects/missing')) return json({ success: false }, 404)
    if (url.includes('/projects/broken')) return json({ success: false }, 500)
    if (url.includes('/projects/ok')) {
      return json({ success: true, project: { _id: 'ok', title: 'Kitchen', professionalId: { _id: 'pro1', name: 'Jan' } } })
    }
    throw new TypeError('network down')
  })
  try {
    assert.deepEqual(await publicEntities.getPublicProject('missing'), { status: 'not_found' })
    assert.deepEqual(await publicEntities.getPublicProject('broken'), { status: 'unavailable' })
    const ok = await publicEntities.getPublicProject('ok')
    assert.equal(ok.status, 'found')
    assert.equal(ok.data.title, 'Kitchen')
    // Every public read is cached by time, never no-store.
    for (const call of project.calls) {
      assert.equal(call.init.next.revalidate, publicEntities.PUBLIC_ENTITY_REVALIDATE_SECONDS)
      assert.equal(call.init.cache, undefined)
    }
  } finally {
    project.restore()
  }

  const network = stubFetch(() => {
    throw new TypeError('connect ECONNREFUSED')
  })
  try {
    assert.deepEqual(await publicEntities.getPublicProfessional('abc'), { status: 'unavailable' })
  } finally {
    network.restore()
  }
})

test('professional lookup reads only the public profile record, never the reviews endpoint', async () => {
  const stub = stubFetch((url) => {
    if (url === 'https://api.example.test/api/public/professionals/abc') {
      return json({ success: true, data: { professional: { _id: 'abc', name: 'Jan Peeters' } } })
    }
    return json({ success: false }, 404)
  })
  try {
    const lookup = await publicEntities.getPublicProfessional('abc')
    assert.equal(lookup.status, 'found')
    assert.equal(lookup.data.name, 'Jan Peeters')
    assert.equal(stub.calls.length, 1)
    assert.equal(stub.calls[0].url, 'https://api.example.test/api/public/professionals/abc')
    assert.equal(stub.calls[0].init.next.revalidate, publicEntities.PUBLIC_ENTITY_REVALIDATE_SECONDS)
  } finally {
    stub.restore()
  }
})

test('professional lookup accepts only a successful envelope with a professional', async () => {
  const stub = stubFetch(() => json({ success: true, data: { reviews: [] } }))
  try {
    assert.deepEqual(await publicEntities.getPublicProfessional('abc'), { status: 'unavailable' })
  } finally {
    stub.restore()
  }
})

test('429 and 5xx answers come back as unavailable for this render, never as a 404', async () => {
  // Next 15.4.10 stores a fetch response in the data cache only when it is HTTP 200, so
  // these failures are not held for the revalidate window. The runtime check covers that.
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    for (const status of [429, 500, 503]) {
      const stub = stubFetch(() => json({ success: false, msg: 'nope' }, status))
      try {
        assert.deepEqual(await publicEntities.getPublicProject('abc'), { status: 'unavailable' }, `project ${status}`)
        assert.deepEqual(await publicEntities.getPublicProfessional('abc'), { status: 'unavailable' }, `professional ${status}`)
        assert.equal(stub.calls.length, 2)
      } finally {
        stub.restore()
      }
    }
  } finally {
    console.warn = originalWarn
  }
})

test('sitemap entity pages throw on 429 so only that entity type is dropped', async () => {
  const stub = stubFetch(() => json({ success: false, msg: 'Too many requests' }, 429))
  try {
    await assert.rejects(publicEntities.fetchSitemapEntityPage('project', 1), /HTTP 429/)
  } finally {
    stub.restore()
  }
})


const cmsPage = (items, page, total, limit = 1000) =>
  json({
    success: true,
    data: {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total },
    },
  })

const entityPage = (type, items = []) =>
  json({
    success: true,
    data: { type, items, pagination: { page: 1, limit: 1000, total: items.length, totalPages: 1, hasMore: false } },
  })

test('sitemap lists only real routes, with honest dates, and a failed entity count marks the index incomplete', async () => {
  const errors = []
  const originalError = console.error
  console.error = (...args) => errors.push(args.map(String).join(' '))
  const stub = stubFetch((url) => {
    if (url.includes('/api/public/cms/sitemap')) {
      return cmsPage([{ type: 'blog', slug: 'hello', updatedAt: '2026-02-01T00:00:00.000Z' }], 1, 1)
    }
    if (url.includes('/api/public/sitemap/entities')) {
      if (url.includes('type=professional')) return json({ success: false }, 500)
      return entityPage('project', [{ id: '64b7f0c2a1b2c3d4e5f60720', updatedAt: '2026-03-01T00:00:00.000Z' }])
    }
    throw new TypeError(`unexpected request ${url}`)
  })
  try {
    const plan = await sitemapPlan.planSitemapFiles()
    assert.deepEqual(plan.files.map((file) => file.id), [0, 101], 'content file plus one project file')
    assert.equal(plan.complete, false, 'a failed professional count leaves the index incomplete')

    const entries = [...(await sitemap({ id: 0 })), ...(await sitemap({ id: 101 }))]
    const urls = entries.map((entry) => entry.url)

    for (const dead of ['/categories', '/projects', '/search']) {
      assert.ok(!urls.includes(`https://example.test${dead}`), `${dead} must not be listed`)
      assert.ok(!urls.includes(`https://example.test/en${dead}`), `/en${dead} must not be listed`)
    }
    assert.ok(urls.includes('https://example.test/en/services'))
    assert.ok(urls.includes('https://example.test/nl/professionals'))
    assert.ok(urls.includes('https://example.test/fr/blog/hello'), 'CMS page listed in every language')

    // Static and catalogue routes carry no fake build-time lastModified.
    const home = entries.find((entry) => entry.url === 'https://example.test/en')
    assert.equal(home.lastModified, undefined)

    // The project entity is listed with its own updatedAt, in every language.
    const project = entries.find((entry) => entry.url === 'https://example.test/nl/projects/64b7f0c2a1b2c3d4e5f60720')
    assert.ok(project, 'prefixed project URL listed')
    assert.equal(new Date(project.lastModified).toISOString(), '2026-03-01T00:00:00.000Z')
    assert.equal(project.alternates.languages['x-default'], 'https://example.test/projects/64b7f0c2a1b2c3d4e5f60720')

    assert.ok(!urls.some((url) => url.includes('/professional/')))
    assert.ok(errors.some((line) => line.includes('event=sitemap.entities.fetch_failure') && line.includes('professional')))
  } finally {
    stub.restore()
    console.error = originalError
  }
})

test('a failed CMS read fails the content file and leaves the index incomplete, so nothing partial is cached', async () => {
  const originalError = console.error
  console.error = () => {}
  const stub = stubFetch((url) => {
    if (url.includes('/api/public/cms/sitemap')) return json({ success: false, msg: 'boom' }, 500)
    return entityPage(url.includes('type=project') ? 'project' : 'professional')
  })
  try {
    const plan = await sitemapPlan.planSitemapFiles()
    assert.equal(plan.complete, false)
    assert.ok(!plan.files.some((file) => file.id === 0), 'no content file is listed while the CMS read fails')

    await assert.rejects(sitemap({ id: 0 }), /could not be read/, 'the content file fails instead of returning a partial list')

    const response = await sitemapIndex()
    assert.equal(response.headers.get('cache-control'), 'no-store', 'an incomplete index is never cached')
  } finally {
    stub.restore()
    console.error = originalError
  }
})

test('a complete sitemap index keeps the one-hour cache policy', async () => {
  const stub = stubFetch((url) => {
    if (url.includes('/api/public/cms/sitemap')) return cmsPage([], 1, 0)
    return entityPage(url.includes('type=project') ? 'project' : 'professional')
  })
  try {
    const plan = await sitemapPlan.planSitemapFiles()
    assert.equal(plan.complete, true)
    const response = await sitemapIndex()
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600, s-maxage=3600')
    const body = await response.text()
    assert.match(body, /<loc>https:\/\/example\.test\/sitemap\/0\.xml<\/loc>/)
  } finally {
    stub.restore()
  }
})

test('content paths split into files of at most 5,000 paths, with no URL listed twice', async () => {
  const total = 5500
  const stub = stubFetch((url) => {
    if (url.includes('/api/public/cms/sitemap')) {
      const page = Number(new URL(url).searchParams.get('page') || '1')
      const first = (page - 1) * 1000 + 1
      const last = Math.min(page * 1000, total)
      const items = []
      for (let n = first; n <= last; n += 1) items.push({ type: 'blog', slug: `post-${n}`, updatedAt: '2026-02-01T00:00:00.000Z' })
      return cmsPage(items, page, total)
    }
    return entityPage('project')
  })
  try {
    const plan = await sitemapPlan.planSitemapFiles()
    assert.deepEqual(plan.files.map((file) => file.id), [0, 1], 'two content files')

    const first = await sitemap({ id: 0 })
    const second = await sitemap({ id: 1 })
    assert.equal(first.length, sitemapPlan.SITEMAP_PATH_CHUNK_SIZE * 3, 'a full content file: 5,000 paths in 3 languages')
    assert.ok(first.length <= 50000 && second.length <= 50000)
    const urls = [...first, ...second].map((entry) => entry.url)
    assert.equal(new Set(urls).size, urls.length, 'no URL is listed in two files')
    assert.ok(urls.includes('https://example.test/en/blog/post-1'))
    assert.ok(urls.includes('https://example.test/en/blog/post-5500'), 'the last CMS page is in the second file')
  } finally {
    stub.restore()
  }
})

test('a stalled backend read is abandoned at the deadline and reads as unavailable', { timeout: 30000 }, async () => {
  const originalWarn = console.warn
  console.warn = () => {}
  // AbortSignal.timeout's timer is unref'd, so a ref'd timer keeps the test process alive until the deadline fires.
  const keepAlive = setTimeout(() => {}, 15000)
  const stub = stubFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  }))
  try {
    const lookup = await publicEntities.getPublicProject('slow')
    assert.deepEqual(lookup, { status: 'unavailable' })
    assert.ok(stub.calls[0].init.signal instanceof AbortSignal, 'every backend read carries a deadline')
  } finally {
    clearTimeout(keepAlive)
    stub.restore()
    console.warn = originalWarn
  }
})

test('project records are normalized, and an unusable one is rejected before the view', () => {
  assert.equal(normalizePublicProject(null), null)
  assert.equal(normalizePublicProject({ _id: 'p1', professionalId: null }), null, 'no professional, no project')
  assert.equal(normalizePublicProject({ _id: 'p1', professionalId: { name: 'x' } }), null, 'professional without an id')

  const normalized = normalizePublicProject({
    _id: 'p1',
    title: 'Kitchen',
    professionalId: { _id: 'pro1', name: 'Jan' },
  })
  assert.deepEqual(normalized.distance, { noBorders: false })
  assert.deepEqual(normalized.media, { images: [] })
  assert.deepEqual(normalized.subprojects, [])

  const cleaned = normalizePublicProject({
    _id: 'p2',
    professionalId: { _id: 'pro1' },
    media: { images: ['a.jpg', 3, '', null] },
    subprojects: [{ name: 'Basic' }, 'junk'],
    distance: { noBorders: 'yes', maxKmRange: 25 },
  })
  assert.deepEqual(cleaned.media.images, ['a.jpg'])
  assert.deepEqual(cleaned.subprojects, [{ name: 'Basic' }])
  assert.equal(cleaned.distance.noBorders, false, 'a non-boolean flag is not trusted')
  assert.equal(cleaned.distance.maxKmRange, 25)
})

test('a service has its professional as provider, or no provider when the professional is unknown', () => {
  const withPro = serviceSchema({ name: 'Kitchen', path: '/projects/p1', provider: { name: 'Jan', path: '/professional/pro1' } })
  assert.deepEqual(withPro.provider, { '@type': 'Organization', name: 'Jan', url: 'https://example.test/professional/pro1' })

  const unknown = serviceSchema({ name: 'Kitchen', path: '/projects/p1', provider: null })
  assert.equal('provider' in unknown, true)
  assert.equal(unknown.provider, undefined, 'no provider is claimed when the professional is unknown')

  const platform = serviceSchema({ name: 'Plumbing', path: '/services/plumbing' })
  assert.equal(platform.provider.name, 'Fixtract', 'the services page keeps the platform as provider')
})

test('locale routes compare the decoded reserved name and never throw on malformed encoding', () => {
  assert.equal(isLocalizableRoute('/projects/%63reate'), false, 'an encoded reserved name is not a project id')
  assert.equal(isLocalizableRoute('/projects/create'), false)
  assert.equal(isLocalizableRoute('/projects/%E0%A4%A'), false, 'malformed encoding is not localizable')
  assert.equal(isLocalizableRoute('/projects/abc123'), true)
  assert.equal(isLocalizableRoute('/professional/%73upport'), false, 'an encoded reserved professional route')
})

test('the sitemap index and the llms.txt route are rendered per request, not prerendered', () => {
  for (const rel of ['../app/llms.txt/route.ts', '../app/sitemap.xml/route.ts', '../app/sitemap.ts']) {
    assert.match(readSource(rel), /export const dynamic = "force-dynamic"/, rel)
    assert.doesNotMatch(readSource(rel), /export const revalidate/, rel)
  }
})

test('transactional and return pages carry noindex metadata with their own canonical', async () => {
  // Each layout's generateMetadata is called, so the returned object is checked, not just its source.
  const bookingParams = { params: Promise.resolve({ id: 'bk1' }) }
  const cases = [
    ['../app/bookings/[id]/payment/layout.tsx', bookingParams, '/bookings/bk1/payment'],
    ['../app/bookings/[id]/payment/failed/layout.tsx', bookingParams, '/bookings/bk1/payment/failed'],
    ['../app/bookings/[id]/payment/success/layout.tsx', bookingParams, '/bookings/bk1/payment/success'],
    ['../app/professional/stripe/complete/layout.tsx', undefined, '/professional/stripe/complete'],
    ['../app/professional/stripe/refresh/layout.tsx', undefined, '/professional/stripe/refresh'],
    ['../app/professional/stripe/setup/layout.tsx', undefined, '/professional/stripe/setup'],
    ['../app/(pages)/unsubscribe/layout.tsx', undefined, '/unsubscribe'],
  ]
  for (const [rel, args, path] of cases) {
    const layout = await import(rel)
    const metadata = await layout.generateMetadata(args)
    assert.equal(metadata.robots?.index, false, `${rel} must be noindex`)
    assert.equal(metadata.robots?.follow, false, `${rel} must not be followed`)
    assert.equal(metadata.alternates?.canonical, `https://example.test${path}`, `${rel} canonical`)
  }
})

test('project and professional bodies are fetched on the server and 404 when missing', () => {
  const projectPage = readSource('../app/(pages)/projects/[id]/page.tsx')
  assert.match(projectPage, /notFound\(\)/)
  assert.match(projectPage, /initialProject=/)
  const professionalPage = readSource('../app/(pages)/professional/[id]/page.tsx')
  assert.match(professionalPage, /notFound\(\)/)
  assert.match(professionalPage, /initialProfessional=/)

  // Only the entity record is read on the server. Reviews load on the client, so they do
  // not draw on the backend's per-IP review budget from the frontend server.
  assert.doesNotMatch(projectPage, /getPublicProjectReviews|\/reviews/)
  assert.doesNotMatch(professionalPage, /ProfessionalReviewsPayload|\/reviews/)
  const professionalLayout = readSource('../app/(pages)/professional/[id]/layout.tsx')
  assert.doesNotMatch(professionalLayout, /aggregateRating:|ratingsSummary|\/reviews/)
  const projectView = readSource('../app/(pages)/projects/[id]/ProjectDetailView.tsx')
  assert.doesNotMatch(projectView, /initialReviews|skipInitialReviews/)
  const professionalView = readSource('../app/(pages)/professional/[id]/ProfessionalProfileView.tsx')
  assert.doesNotMatch(professionalView, /initialData|skipInitialReviews|ProfessionalReviewsPayload/)

  for (const rel of ['../app/(pages)/projects/[id]/layout.tsx', '../app/(pages)/professional/[id]/layout.tsx']) {
    const source = readSource(rel)
    assert.doesNotMatch(source, /force-dynamic/, rel)
    assert.doesNotMatch(source, /no-store/, rel)
  }
  const projectLayout = readSource('../app/(pages)/projects/[id]/layout.tsx')
  assert.match(projectLayout, /serviceSchema\(/)
  assert.doesNotMatch(projectLayout, /path: "\/projects"/)
})

test('home and categories use the shared metadata helper and no dead breadcrumbs', () => {
  const home = readSource('../app/(home)/page.tsx')
  assert.match(home, /buildMetadata\(\{/)
  assert.match(home, /t\('meta\.title'\)/)
  const category = readSource('../app/(pages)/categories/[categorySlug]/layout.tsx')
  assert.doesNotMatch(category, /path: "\/categories"\s*\}/)
  assert.match(category, /breadcrumbs\.services/)
})
