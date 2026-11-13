import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)
const { resolveCoverSrc } = await import('../components/cms/CoverImage.tsx')

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SOURCE_DIRS = ['app', 'components', 'data', 'lib', 'contexts', 'hooks']

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) yield* sourceFiles(full)
    else if (/\.(tsx?|css)$/.test(name)) yield full
  }
}

// Literal root-relative asset paths ('/images/x.jpg', url('/grid.svg')); template paths are skipped.
const ASSET_REF = /['"(]\/((?:images|icons)\/[^'"()\s$`]+|[\w.-]+)\.(jpe?g|png|svg|webp|gif|ico)['")]/g

test('every literal public asset path referenced in source exists under public/', () => {
  const missing = []
  let checked = 0
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(path.join(root, dir))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(ASSET_REF)) {
        const rel = `${match[1]}.${match[2]}`
        checked += 1
        if (!existsSync(path.join(root, 'public', rel))) missing.push(`${path.relative(root, file)} -> /${rel}`)
      }
    }
  }
  assert.ok(checked > 5, 'the scan found asset references')
  assert.deepEqual(missing, [])
})

test('the former /grid.svg and team photo references are gone', () => {
  for (const rel of ['components/CTASection.tsx', 'components/TestimonialsSection.tsx', 'components/professionals-page/ProfessionalsHero.tsx']) {
    const source = readFileSync(path.join(root, rel), 'utf8')
    assert.doesNotMatch(source, /grid\.svg/, rel)
    assert.match(source, /bg-grid-pattern/, rel)
  }
  assert.match(readFileSync(path.join(root, 'app/globals.css'), 'utf8'), /@utility bg-grid-pattern \{/)
  assert.doesNotMatch(readFileSync(path.join(root, 'data/content.ts'), 'utf8'), /team-\d\.jpg|success-\d\.jpg/)
})

test('a missing CMS cover falls back to the local cover, then to nothing (no broken image)', () => {
  const s3 = 'https://bucket.s3.amazonaws.com/cms/gone.png?X-Amz-Signature=x'
  assert.equal(resolveCoverSrc(s3, '/images/banner.jpg', new Set()), s3)
  assert.equal(resolveCoverSrc(s3, '/images/banner.jpg', new Set([s3])), '/images/banner.jpg')
  assert.equal(resolveCoverSrc(s3, '/images/banner.jpg', new Set([s3, '/images/banner.jpg'])), null)
  assert.equal(resolveCoverSrc(s3, undefined, new Set([s3])), null)
})

test('blog and news covers use the fallback-aware image', () => {
  for (const rel of ['components/cms/BlogCard.tsx', 'app/(pages)/blog/[slug]/page.tsx', 'app/(pages)/news/[slug]/page.tsx']) {
    const source = readFileSync(path.join(root, rel), 'utf8')
    assert.match(source, /<CoverImage\b/, rel)
    assert.doesNotMatch(source, /from "next\/image"/, rel)
  }
  for (const rel of ['app/(pages)/blog/[slug]/page.tsx', 'app/(pages)/news/[slug]/page.tsx']) {
    // The frame is hidden when the image renders nothing.
    assert.match(readFileSync(path.join(root, rel), 'utf8'), /hidden max-w-5xl px-6 has-\[img\]:block/, rel)
  }
})
