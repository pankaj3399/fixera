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
const { default: sitemap } = await import('../app/sitemap.ts')

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
    if (url.includes('/projects/ok')) return json({ success: true, project: { _id: 'ok', title: 'Kitchen' } })
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

test('professional lookup accepts only a successful envelope with a professional', async () => {
  const stub = stubFetch(() => json({ success: true, data: { reviews: [] } }))
  try {
    assert.deepEqual(await publicEntities.getPublicProfessional('abc'), { status: 'unavailable' })
  } finally {
    stub.restore()
  }
})

test('sitemap lists only real routes, with honest dates, and survives entity and CMS failures', async () => {
  const errors = []
  const originalError = console.error
  console.error = (...args) => errors.push(args.map(String).join(' '))
  const stub = stubFetch((url) => {
    if (url.includes('/api/public/sitemap/entities')) {
      if (url.includes('type=professional')) return json({ success: false }, 500)
      return json({
        success: true,
        data: {
          type: 'project',
          items: [{ id: '64b7f0c2a1b2c3d4e5f60720', updatedAt: '2026-03-01T00:00:00.000Z' }],
          pagination: { page: 1, limit: 1000, total: 1, totalPages: 1, hasMore: false },
        },
      })
    }
    throw new TypeError('cms down')
  })
  try {
    const entries = await sitemap()
    const urls = entries.map((entry) => entry.url)

    for (const dead of ['/categories', '/projects', '/search']) {
      assert.ok(!urls.includes(`https://example.test${dead}`), `${dead} must not be listed`)
    }
    assert.ok(urls.includes('https://example.test/services'))
    assert.ok(urls.includes('https://example.test/professionals'))

    // Static and catalogue routes carry no fake build-time lastModified.
    const home = entries.find((entry) => entry.url === 'https://example.test/')
    assert.equal(home.lastModified, undefined)

    // The project entity is listed with its own updatedAt.
    const project = entries.find((entry) => entry.url === 'https://example.test/projects/64b7f0c2a1b2c3d4e5f60720')
    assert.ok(project, 'project detail URL listed')
    assert.equal(new Date(project.lastModified).toISOString(), '2026-03-01T00:00:00.000Z')

    // A failed professional fetch drops only professional URLs and is logged clearly.
    assert.ok(!urls.some((url) => url.includes('/professional/')))
    assert.ok(errors.some((line) => line.includes('event=sitemap.entities.fetch_failure') && line.includes('professional')))
    assert.ok(errors.some((line) => line.includes('event=sitemap.cms.fetch_failure')))
  } finally {
    stub.restore()
    console.error = originalError
  }
})

test('transactional and return pages carry noindex metadata with their own canonical', () => {
  const layouts = {
    '../app/bookings/[id]/payment/layout.tsx': 'noindexMetadata(`/bookings/${encodeURIComponent(id)}/payment`',
    '../app/bookings/[id]/payment/failed/layout.tsx': 'noindexMetadata(`/bookings/${encodeURIComponent(id)}/payment/failed`',
    '../app/bookings/[id]/payment/success/layout.tsx': 'noindexMetadata(`/bookings/${encodeURIComponent(id)}/payment/success`',
    '../app/professional/stripe/complete/layout.tsx': 'noindexMetadata("/professional/stripe/complete"',
    '../app/professional/stripe/refresh/layout.tsx': 'noindexMetadata("/professional/stripe/refresh"',
    '../app/professional/stripe/setup/layout.tsx': 'noindexMetadata("/professional/stripe/setup"',
    '../app/(pages)/unsubscribe/layout.tsx': 'noindexMetadata("/unsubscribe"',
  }
  for (const [rel, call] of Object.entries(layouts)) {
    assert.ok(readSource(rel).includes(call), `${rel} must use ${call}`)
  }
})

test('project and professional bodies are fetched on the server and 404 when missing', () => {
  const projectPage = readSource('../app/(pages)/projects/[id]/page.tsx')
  assert.match(projectPage, /notFound\(\)/)
  assert.match(projectPage, /initialProject=/)
  const professionalPage = readSource('../app/(pages)/professional/[id]/page.tsx')
  assert.match(professionalPage, /notFound\(\)/)
  assert.match(professionalPage, /initialData=/)

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
