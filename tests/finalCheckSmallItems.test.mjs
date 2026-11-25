import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('package tabs wrap names between words instead of breaking them mid-word', () => {
  const source = read('../components/project/SubprojectComparisonTable.tsx')
  const tab = /onClick=\{\(\) => onSelectIndex\(index\)\}[\s\S]*?className=\{`([^`$]*)/.exec(source)
  assert.ok(tab, 'package tab button found')
  // No shrink below 96px; the automatic min-width keeps the longest word whole.
  assert.match(tab[1], /\bflex-\[1_0_96px\]/)
  assert.doesNotMatch(tab[1], /\bmin-w-\[/, 'an explicit min-width would override the min-content floor')
  // The tab tooltip shows the (translated) package name.
  assert.match(source, /title=\{ct\(subproject\.name\)\}/)
})

test('post-booking question examples no longer suggest asking for a start time or contact method', () => {
  const banned = {
    en: [/start time/i, /start date\?/i, /contact you/i],
    nl: [/hoe laat/i, /starten\?/i, /bereiken/i],
    fr: [/heure de démarrage/i, /vous contacter/i],
  }
  for (const [locale, patterns] of Object.entries(banned)) {
    const step6 = JSON.parse(read(`../messages/${locale}/projectWizardSteps.json`)).step6
    const examples = [step6.example1, step6.example2, step6.example3, step6.example4, step6.questionPlaceholder].join('\n')
    for (const pattern of patterns) assert.doesNotMatch(examples, pattern, `${locale}: ${pattern}`)
    assert.match(step6.infoBody, /Fixtract/, `${locale}: contact goes through Fixtract`)
  }
})

test('FT2-3: every package tab stays visible: the strip wraps instead of scrolling sideways', () => {
  const source = read('../components/project/SubprojectComparisonTable.tsx')
  assert.match(source, /<div role="tablist" className="flex flex-wrap">/)
  assert.doesNotMatch(source, /overflow-x-auto/)
  assert.doesNotMatch(source, /scrollBy\(/)
})
