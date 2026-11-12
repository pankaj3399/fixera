import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)
// Test-only resolution: Next's `next/server` subpath has no extensionless ESM export.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) {
    if (s === 'next/server') return n('next/server.js', c)
    return n(s, c)
  }
`))
process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test'
process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.test'

const urls = await import('../lib/seo/localeUrls.ts')
const { assembleMetadata } = await import('../lib/seo/metadataAssembly.ts')
const { default: robots } = await import('../app/robots.ts')
const { default: sitemap, generateSitemaps } = await import('../app/sitemap.ts')
const { buildLlmsTxt } = await import('../lib/seo/llmsTxt.ts')

// ---------------------------------------------------------------- helpers

test('language prefixes are split off only for en, nl and fr', () => {
  assert.deepEqual(urls.splitLocalePrefix('/nl/about'), { locale: 'nl', path: '/about' })
  assert.deepEqual(urls.splitLocalePrefix('/fr'), { locale: 'fr', path: '/' })
  assert.deepEqual(urls.splitLocalePrefix('/en/'), { locale: 'en', path: '/' })
  assert.equal(urls.splitLocalePrefix('/nlx/about'), null)
  assert.equal(urls.splitLocalePrefix('/de/about'), null)
  assert.equal(urls.splitLocalePrefix('/about'), null)
})

test('localizable routes are the public indexable pages and their dynamic children', () => {
  for (const path of [
    '/', '/about', '/blog', '/blog/post-1', '/news', '/news/item', '/faq', '/join',
    '/privacy-policy', '/professionals', '/services', '/services/svc-1', '/categories/plumbing',
    '/pages/terms', '/projects/64b7f0c2a1b2c3d4e5f60720', '/professional/abc123',
  ]) {
    assert.equal(urls.isLocalizableRoute(path), true, path)
  }
  for (const path of [
    '/search', '/categories', '/projects', '/projects/create', '/professional/onboarding',
    '/professional/earnings', '/professional/projects', '/professional/support',
    '/professional/stripe', '/dashboard', '/admin', '/chat', '/login', '/signup',
    '/bookings/1/payment', '/projects/abc/edit', '/projects/abc/', '/api/x',
    'https://example.test/about', '/unsubscribe',
  ]) {
    assert.equal(urls.isLocalizableRoute(path), false, path)
  }
})

test('every static folder beside a dynamic public segment is excluded from the prefix', () => {
  // A new static sibling (e.g. app/(pages)/projects/new) must be added to the reserved set.
  const siblings = [
    ['/projects', '../app/(pages)/projects'],
    ['/professional', '../app/(pages)/professional'],
    ['/professional', '../app/professional'],
  ]
  for (const [section, rel] of siblings) {
    for (const entry of readdirSync(new URL(rel, import.meta.url), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('(') || entry.name.startsWith('[')) continue
      assert.equal(urls.isLocalizableRoute(`${section}/${entry.name}`), false, `${section}/${entry.name}`)
    }
  }
})

test('localized URLs: home has no trailing slash, other routes keep their path', () => {
  assert.equal(urls.localizedPath('nl', '/'), '/nl')
  assert.equal(urls.localizedPath('fr', '/about'), '/fr/about')
  assert.deepEqual(urls.localeAlternateUrls('/faq'), {
    en: 'https://example.test/en/faq',
    nl: 'https://example.test/nl/faq',
    fr: 'https://example.test/fr/faq',
    'x-default': 'https://example.test/faq',
  })
  assert.equal(urls.localeAlternateUrls('/')['x-default'], 'https://example.test/')
})

test('language switch keeps the page, query and hash, and drops a stale lang parameter', () => {
  assert.equal(urls.switchLocaleInUrl('/nl/faq?lang=fr&x=1#a', 'fr'), '/fr/faq?x=1#a')
  assert.equal(urls.switchLocaleInUrl('/nl', 'en'), '/en')
  assert.equal(urls.switchLocaleInUrl('/fr/projects/abc', 'nl'), '/nl/projects/abc')
  // Not a language-prefixed public page: the caller keeps the cookie behaviour.
  assert.equal(urls.switchLocaleInUrl('/faq', 'nl'), null)
  assert.equal(urls.switchLocaleInUrl('/nl/dashboard', 'fr'), null)
  assert.equal(urls.switchLocaleInUrl('/nl/projects/create', 'fr'), null)
})

test('same-site links on a prefixed page keep the language; others are left alone', () => {
  assert.equal(urls.keepLocaleInUrl('/faq?x=1#a', 'nl'), '/nl/faq?x=1#a')
  assert.equal(urls.keepLocaleInUrl('/', 'fr'), '/fr')
  assert.equal(urls.keepLocaleInUrl('/fr/about', 'nl'), '/fr/about')
  assert.equal(urls.keepLocaleInUrl('/dashboard', 'nl'), '/dashboard')
  assert.equal(urls.keepLocaleInUrl('/projects/create', 'nl'), '/projects/create')
})

// ---------------------------------------------------------------- middleware

test('middleware rewrites allowlisted prefixed pages and forces the prefix locale', async () => {
  const realFetch = globalThis.fetch
  // Backend unavailable: the auto-conversion loader falls back, which must not affect locale.
  globalThis.fetch = async () => { throw new TypeError('fetch failed') }
  try {
    const { NextRequest } = await import('next/server.js')
    const { middleware } = await import('../middleware.ts')
    const run = (url, { cookie, headers = {} } = {}) => middleware(new NextRequest(url, {
      headers: {
        'x-vercel-ip-country': 'DE',
        'accept-language': 'de-DE,de;q=0.9',
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    }))
    const forwarded = (res, name) => res.headers.get(`x-middleware-request-${name}`)

    // Prefix → same route, locale forced, URL keeps the prefix.
    const nl = await run('https://fixtract.test/nl/about?lang=fr', { cookie: 'NEXT_LOCALE=en' })
    assert.equal(nl.headers.get('x-middleware-rewrite'), 'https://fixtract.test/about?lang=fr')
    assert.equal(forwarded(nl, 'x-fixera-locale'), 'nl', 'prefix beats ?lang and the cookie')
    assert.equal(forwarded(nl, 'x-fixera-document-locale'), 'nl')
    assert.equal(forwarded(nl, 'x-fixera-url-locale'), 'nl')
    assert.equal(nl.cookies.get('NEXT_LOCALE'), undefined, 'a prefixed visit writes no preference cookie')

    const fr = await run('https://fixtract.test/fr')
    assert.equal(fr.headers.get('x-middleware-rewrite'), 'https://fixtract.test/')
    assert.equal(forwarded(fr, 'x-fixera-locale'), 'fr')

    const en = await run('https://fixtract.test/en/projects/64b7f0c2a1b2c3d4e5f60720')
    assert.equal(en.headers.get('x-middleware-rewrite'), 'https://fixtract.test/projects/64b7f0c2a1b2c3d4e5f60720')
    assert.equal(forwarded(en, 'x-fixera-locale'), 'en')

    // Unprefixed: no rewrite, negotiated locale as before, no URL-locale header.
    const plain = await run('https://fixtract.test/about', { cookie: 'NEXT_LOCALE=fr' })
    assert.equal(plain.headers.get('x-middleware-rewrite'), null)
    assert.equal(forwarded(plain, 'x-fixera-locale'), 'fr')
    assert.equal(forwarded(plain, 'x-fixera-url-locale'), null)

    // A client cannot claim a prefix on an unprefixed URL.
    const forged = await run('https://fixtract.test/about', { headers: { 'x-fixera-url-locale': 'nl' } })
    assert.equal(forwarded(forged, 'x-fixera-url-locale'), null, 'client-supplied prefix header is removed')

    // Private, admin, auth, unknown and nested prefixed paths are never rewritten.
    for (const path of [
      '/nl/dashboard', '/en/admin', '/fr/login', '/nl/projects/create', '/en/professional/onboarding',
      '/nl/chat', '/nl/api/x', '/nl/projects/abc/edit', '/nlx/about', '/nl/bookings/1/payment',
    ]) {
      const res = await run(`https://fixtract.test${path}`)
      assert.equal(res.headers.get('x-middleware-rewrite'), null, `${path} must not be rewritten`)
      assert.equal(forwarded(res, 'x-fixera-url-locale'), null, `${path} carries no URL locale`)
    }
  } finally {
    globalThis.fetch = realFetch
  }
})

// ---------------------------------------------------------------- metadata

test('canonical and alternates: prefixed page canonicalises to itself, unprefixed to itself', () => {
  const about = { title: 'About', path: '/about' }
  const plain = assembleMetadata(about, 'nl', 'desc')
  assert.equal(plain.alternates.canonical, 'https://example.test/about', 'unprefixed canonical is itself')
  assert.deepEqual(plain.alternates.languages, {
    en: 'https://example.test/en/about',
    nl: 'https://example.test/nl/about',
    fr: 'https://example.test/fr/about',
    'x-default': 'https://example.test/about',
  })

  const prefixed = assembleMetadata(about, 'nl', 'desc', 'nl')
  assert.equal(prefixed.alternates.canonical, 'https://example.test/nl/about')
  assert.equal(prefixed.openGraph.url, 'https://example.test/nl/about')
  assert.deepEqual(prefixed.alternates.languages, plain.alternates.languages)
})

test('og:locale matches the served language, with the other two as alternates', () => {
  const nl = assembleMetadata({ title: 'Over', path: '/about' }, 'nl', 'desc', 'nl')
  assert.equal(nl.openGraph.locale, 'nl_BE')
  assert.deepEqual(nl.openGraph.alternateLocale, ['en_US', 'fr_BE'])
  const fr = assembleMetadata({ path: '/' }, 'fr', 'desc', 'fr')
  assert.equal(fr.openGraph.locale, 'fr_BE')
  assert.equal(fr.alternates.canonical, 'https://example.test/fr')
  assert.equal(fr.alternates.languages['x-default'], 'https://example.test/')
})

test('noindex pages, non-localizable routes and CMS absolute canonicals get no alternates', () => {
  const noindex = assembleMetadata({ path: '/blog/missing', noindex: true }, 'en', 'desc', 'en')
  assert.equal(noindex.alternates.languages, undefined)
  assert.equal(noindex.robots.index, false)

  const search = assembleMetadata({ path: '/search' }, 'nl', 'desc', 'nl')
  assert.equal(search.alternates.canonical, 'https://example.test/search', 'no prefixed twin exists')
  assert.equal(search.alternates.languages, undefined)

  const external = assembleMetadata({ path: 'https://other.test/x' }, 'nl', 'desc', 'nl')
  assert.equal(external.alternates.canonical, 'https://other.test/x')
  assert.equal(external.alternates.languages, undefined)
})

// ---------------------------------------------------------------- sitemap

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Backend stub for the entity endpoint: `totals` maps type → entity count. */
function entityBackend(totals, { failCount = [] } = {}) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    if (url.pathname === '/api/public/sitemap/entities') {
      const type = url.searchParams.get('type')
      const page = Number(url.searchParams.get('page'))
      const limit = Number(url.searchParams.get('limit'))
      if (failCount.includes(type) && page === 1) return json({ success: false }, 500)
      const total = totals[type] ?? 0
      const start = (page - 1) * limit
      const count = Math.max(0, Math.min(limit, total - start))
      const items = Array.from({ length: count }, (_, i) => ({
        id: `${type}-${String(start + i).padStart(6, '0')}`,
        updatedAt: '2026-03-01T00:00:00.000Z',
      }))
      return json({
        success: true,
        data: { type, items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: start + count < total } },
      })
    }
    if (url.pathname === '/api/service-categories/active') {
      // The live catalog the category pages resolve against.
      return json([{ name: 'Interior', slug: 'interior', services: [{ name: 'Painting', slug: 'painting' }] }])
    }
    if (url.pathname === '/api/public/cms/sitemap') {
      // An empty CMS listing: the content file holds the static pages only.
      return json({ success: true, data: { items: [], pagination: { page: 1, limit: 1000, total: 0, totalPages: 0, hasMore: false } } })
    }
    throw new TypeError('unexpected request')
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

test('sitemap is an index: content file plus one file per 5,000-entity chunk, with fixed slots', async () => {
  const backend = entityBackend({ project: 12000, professional: 6000 })
  const originalWarn = console.warn
  const originalError = console.error
  console.warn = () => {}
  console.error = () => {}
  try {
    const ids = (await generateSitemaps()).map((entry) => entry.id)
    // content file 0; project chunks 101..103; professional chunks 201..202 (fixed slots per type)
    assert.deepEqual(ids, [0, 101, 102, 103, 201, 202])
  } finally {
    backend.restore()
    console.warn = originalWarn
    console.error = originalError
  }
})

test('entity chunk reads only the backend pages it covers and lists each entity in every language', async () => {
  const backend = entityBackend({ project: 12000 })
  try {
    const entries = await sitemap({ id: 102 })
    const pages = backend.calls.map((u) => Number(u.searchParams.get('page')))
    assert.deepEqual(pages, [6, 7, 8, 9, 10], 'chunk 2 covers backend pages 6-10 only')
    assert.equal(entries.length, 5000 * 3, 'three language URLs per entity')
    assert.ok(entries.length < 50000)
    const first = entries.find((entry) => entry.url === 'https://example.test/nl/projects/project-005000')
    assert.ok(first, 'prefixed project URL listed')
    assert.equal(first.alternates.languages.en, 'https://example.test/en/projects/project-005000')
    assert.equal(first.alternates.languages['x-default'], 'https://example.test/projects/project-005000')
    assert.equal(first.lastModified.toISOString(), '2026-03-01T00:00:00.000Z')

    const last = await sitemap({ id: 103 })
    assert.equal(last.length, 2000 * 3, 'the final chunk stops at the last page')
  } finally {
    backend.restore()
  }
})

test('a failed entity count drops only the entity chunks; the static file is still served', async () => {
  const backend = entityBackend({ project: 3 }, { failCount: ['professional'] })
  const originalError = console.error
  const logged = []
  console.error = (...args) => logged.push(args.map(String).join(' '))
  try {
    const ids = (await generateSitemaps()).map((entry) => entry.id)
    assert.deepEqual(ids, [0, 101])
    assert.ok(logged.some((line) => line.includes('event=sitemap.entities.fetch_failure') && line.includes('professional')))
  } finally {
    backend.restore()
    console.error = originalError
  }
})

test('static file lists every page in every language with alternates and no dead routes', async () => {
  const backend = entityBackend({})
  const originalError = console.error
  console.error = () => {}
  try {
    const entries = await sitemap({ id: 0 })
    const list = entries.map((entry) => entry.url)
    assert.ok(list.includes('https://example.test/en'))
    assert.ok(list.includes('https://example.test/nl/services'))
    assert.ok(list.includes('https://example.test/fr/professionals'))
    assert.ok(list.includes('https://example.test/nl/categories/interior'), 'live catalog category listed')
    assert.ok(!list.some((url) => url.endsWith('/categories/interior-services')), 'no static marketing category slug')
    assert.ok(!list.includes('https://example.test/nl/search'))
    for (const dead of ['categories', 'projects', 'search']) {
      assert.ok(!list.some((url) => url.endsWith(`/${dead}`)), `${dead} must not be listed`)
    }
    // Unprefixed URLs are alternates (x-default), not separate entries.
    assert.ok(!list.includes('https://example.test/about'))
    for (const entry of entries) {
      assert.ok(entry.alternates.languages.en && entry.alternates.languages.nl && entry.alternates.languages.fr)
      assert.ok(entry.alternates.languages['x-default'])
      assert.ok(Object.values(entry.alternates.languages).includes(entry.url), `${entry.url} is one of its own alternates`)
    }
  } finally {
    backend.restore()
    console.error = originalError
  }
})

test('sitemap.xml is an index that lists each generated sitemap file', async () => {
  const backend = entityBackend({ project: 12000, professional: 6000 })
  const originalWarn = console.warn
  const originalError = console.error
  console.warn = () => {}
  console.error = () => {}
  try {
    const { GET } = await import('../app/sitemap.xml/route.ts')
    const res = await GET()
    const body = await res.text()
    assert.equal(res.headers.get('content-type'), 'application/xml; charset=utf-8')
    assert.match(body, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
    for (const id of [0, 101, 102, 103, 201, 202]) {
      assert.ok(body.includes(`<loc>https://example.test/sitemap/${id}.xml</loc>`), `lists sitemap/${id}.xml`)
    }
    assert.equal((body.match(/<sitemap>/g) || []).length, 6)
  } finally {
    backend.restore()
    console.warn = originalWarn
    console.error = originalError
  }
})

// ---------------------------------------------------------------- robots and llms.txt

test('robots: AI crawlers are allowed explicitly with the same disallow list as *', () => {
  const rules = robots().rules
  const star = rules.find((rule) => rule.userAgent === '*')
  assert.deepEqual(star.allow, '/')
  for (const agent of [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
    'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot',
  ]) {
    const rule = rules.find((candidate) => candidate.userAgent === agent)
    assert.ok(rule, `${agent} has its own group`)
    assert.equal(rule.allow, '/')
    assert.deepEqual(rule.disallow, star.disallow, `${agent} disallows exactly what * disallows`)
  }
})

test('robots: private paths stay disallowed for every group, including prefixed variants', () => {
  for (const rule of robots().rules) {
    for (const path of ['/admin', '/dashboard', '/chat', '/login', '/signup', '/api/*']) {
      assert.ok(rule.disallow.includes(path), `${rule.userAgent} disallows ${path}`)
    }
    for (const locale of ['en', 'nl', 'fr']) {
      assert.ok(rule.disallow.includes(`/${locale}/admin`), `${rule.userAgent} disallows /${locale}/admin`)
      assert.ok(rule.disallow.includes(`/${locale}/dashboard/*`), `${rule.userAgent} disallows /${locale}/dashboard/*`)
    }
  }
  assert.equal(robots().sitemap, 'https://example.test/sitemap.xml')
})

test('llms.txt points to the language URLs', () => {
  const body = buildLlmsTxt()
  for (const locale of ['en', 'nl', 'fr']) {
    assert.ok(body.includes(`https://example.test/${locale}/`), `mentions /${locale}/`)
  }
  assert.ok(body.includes('https://example.test/nl/about'))
})
