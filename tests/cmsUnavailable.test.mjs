import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

// CA4: with the backend down these on-demand ISR pages threw, and Next.js
// served its bare, English "500: Internal Server Error" page. Verified against
// a production build with an unreachable backend: they now answer 200 with the
// localized outage state and `Cache-Control: s-maxage=60`.
test('CMS pages render a localized outage state instead of throwing', () => {
  for (const [path, retry] of [
    ['../app/[ctx]/(pages)/blog/[slug]/page.tsx', '/blog/'],
    ['../app/[ctx]/(pages)/news/[slug]/page.tsx', '/news/'],
    ['../app/[ctx]/(pages)/pages/[slug]/page.tsx', '/pages/'],
    ['../app/[ctx]/(pages)/blog/page.tsx', '/blog'],
    ['../app/[ctx]/(pages)/news/page.tsx', '/news'],
  ]) {
    const source = read(path)
    assert.doesNotMatch(source, /throw new Error/, path)
    assert.match(source, /await shortenCmsUnavailableCache\(\);\s*return <CmsUnavailable retryHref=/, path)
    assert.ok(source.includes(`retryHref=${retry.endsWith('/') ? '{`' + retry : '"' + retry}`), path)
  }
})

test('the outage state is cached for a minute at most and its copy exists in en/nl/fr', () => {
  const lib = read('../lib/cms/public.ts')
  assert.match(lib, /CMS_UNAVAILABLE_REVALIDATE_SECONDS = 60/)
  assert.match(lib, /fetch\(`\$\{API\}\/health`, \{ next: \{ revalidate: CMS_UNAVAILABLE_REVALIDATE_SECONDS \} \}\)/)
  for (const locale of ['en', 'nl', 'fr']) {
    const copy = JSON.parse(read(`../messages/${locale}/content.json`)).unavailable
    for (const key of ['title', 'description', 'retry']) assert.ok(copy?.[key], `${locale} ${key}`)
  }
})
