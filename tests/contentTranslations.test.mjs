import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const React = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { mergeContentTranslations, translateContentText, translatedLabel } = await import('../lib/contentTranslations.ts')
const { ContentTranslationsProvider, useContentText } = await import('@/components/i18n/ContentTranslationsProvider')

const nl = { locale: 'nl', texts: { 'Wall preparation': 'Voorbereiding van de muren', 'Total price': 'Totaalprijs' } }
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('ct: translated text when stored, the source otherwise (no translation, no map, non-strings)', () => {
  assert.equal(translateContentText(nl, 'Wall preparation'), 'Voorbereiding van de muren')
  assert.equal(translateContentText(nl, ' Wall preparation '), 'Voorbereiding van de muren', 'trimmed lookup')
  assert.equal(translateContentText(nl, 'Not translated yet'), 'Not translated yet')
  assert.equal(translateContentText(undefined, 'Wall preparation'), 'Wall preparation')
  assert.equal(translateContentText({ locale: 'nl' }, 'Wall preparation'), 'Wall preparation', 'malformed map is ignored')
  assert.equal(translateContentText(nl, undefined), undefined)
  assert.equal(translateContentText(nl, ''), '')
})

test('translatedLabel: a translation wins, otherwise the legacy formatter', () => {
  const ct = (value) => translateContentText(nl, value)
  const upper = (value) => value.toUpperCase()
  assert.equal(translatedLabel(ct, 'Total price', upper), 'Totaalprijs')
  assert.equal(translatedLabel(ct, 'price_per_m2', upper), 'PRICE_PER_M2')
})

test('mergeContentTranslations: later maps win and the latest locale is kept', () => {
  const merged = mergeContentTranslations(nl, undefined, { locale: 'nl', texts: { 'Total price': 'Totale prijs', Extra: 'Extra optie' } })
  assert.deepEqual(merged, { locale: 'nl', texts: { 'Wall preparation': 'Voorbereiding van de muren', 'Total price': 'Totale prijs', Extra: 'Extra optie' } })
  assert.equal(mergeContentTranslations(undefined, null), undefined)
})

test('provider + useContentText render translations; without a provider text is unchanged', () => {
  const Label = ({ text }) => React.createElement('span', null, useContentText()(text))
  const html = renderToStaticMarkup(
    React.createElement(ContentTranslationsProvider, { value: nl },
      React.createElement(Label, { text: 'Wall preparation' }),
      React.createElement(ContentTranslationsProvider, { value: { locale: 'nl', texts: { Ceiling: 'Plafond' } } },
        React.createElement(Label, { text: 'Ceiling' }),
        React.createElement(Label, { text: 'Total price' }),
      ),
    ),
  )
  assert.equal(html, '<span>Voorbereiding van de muren</span><span>Plafond</span><span>Totaalprijs</span>')
  assert.equal(renderToStaticMarkup(React.createElement(Label, { text: 'Wall preparation' })), '<span>Wall preparation</span>')
})

test('server project fetch asks the API for the page language and caches per language', async () => {
  const calls = []
  const original = globalThis.fetch
  process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.test'
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers })
    return new Response(JSON.stringify({ success: true, project: { _id: 'p1', professionalId: { _id: 'u1' }, title: 'T', contentTranslations: nl } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const { getPublicProject } = await import('../lib/server/publicEntities.ts')
    const found = await getPublicProject('p1', 'nl')
    assert.equal(found.status, 'found')
    assert.deepEqual(found.data.contentTranslations, nl, 'normalizePublicProject keeps the translations')
    assert.equal(calls[0].url, 'https://api.example.test/api/public/projects/p1?lang=nl')
    assert.deepEqual(calls[0].headers, { 'Accept-Language': 'nl' })
    await getPublicProject('p1')
    assert.equal(calls[1].url, 'https://api.example.test/api/public/projects/p1')
    assert.equal(calls[1].headers, undefined)
  } finally {
    globalThis.fetch = original
  }
})

test('booking wizard: RFQ and VAT options show translated labels but submit the stored values', () => {
  const form = read('components/project/ProjectBookingForm.tsx')
  assert.match(form, /<RadioGroupItem\s+value=\{option\}/)
  assert.match(form, /className='font-normal'\s*>\s*\{ct\(option\)\}/)
  assert.match(form, /checked\s*\?\s*\[\.\.\.current, option\]/, 'VAT checkbox answers keep the stored option')
  assert.match(form, /\{ct\(question\.question\)\}/)
  assert.match(form, /\{ct\(selectedPackage\.name\)\}/)
  assert.match(form, /\{ct\(option\.name\)\}/)
  assert.match(form, /value: project\.title/, 'chat prefill to the professional keeps the source title')
})

test('project page, comparison table, search card and filters read the translations', () => {
  const view = read('app/[ctx]/(pages)/projects/[id]/ProjectDetailView.tsx')
  assert.equal((view.match(/<ContentTranslationsProvider value=\{project\.contentTranslations\}>/g) || []).length, 2)
  assert.match(view, /\{ct\(project\.title\)\}/)
  assert.match(view, /\{ct\(term\.description\)\}/)
  const table = read('components/project/SubprojectComparisonTable.tsx')
  assert.match(table, /\{ct\(currentSubproject\.description\)\}/)
  assert.match(table, /: ct\(item\.name\)\}/)
  const card = read('components/search/ProjectCard.tsx')
  assert.match(card, /\{ct\(project\.title\)\}/)
  const filters = read('components/search/SearchFilters.tsx')
  assert.match(filters, /onCheckedChange=\{\(\) => toggleArrayValue\('projectTypes', value\)\}/)
  assert.match(filters, />\{ct\(value\)\}<\/Badge>/)
  const search = read('app/[ctx]/(pages)/search/page.tsx')
  assert.match(search, /setContentTranslations\(data\.contentTranslations\)/)
})
