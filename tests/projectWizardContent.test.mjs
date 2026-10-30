import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)
const { normalizeProjectKeywords, buildProjectTitleSuggestion, mergeFAQSuggestions } = await import('../lib/projectWizardContent.ts')

test('keyword entry splits comma-separated values, trims, drops blanks and deduplicates case-insensitively', () => {
  assert.deepEqual(normalizeProjectKeywords(['Drain cleaning'], ' drain cleaning, Pipe repair, ,PIPE REPAIR '), [
    'Drain cleaning', 'Pipe repair',
  ])
})

test('title suggestions use supplied project facts and stay within the configured title bounds', () => {
  const title = buildProjectTitleSuggestion({
    service: 'Plumbing',
    area: 'Bathroom renovation',
    packageName: 'Shower replacement',
    keyword: 'tile removal',
    description: 'Remove the existing shower and install a customer supplied replacement.',
  })
  assert.ok(title.length >= 30 && title.length <= 90)
  assert.match(title, /Plumbing: Bathroom renovation/)
  assert.doesNotMatch(title, /expert|quality guaranteed|trust/i)
  const shortTitle = buildProjectTitleSuggestion({ service: 'A', description: 'x' })
  assert.ok(shortTitle.length >= 30 && shortTitle.length <= 90)
})

test('FAQ regeneration preserves authored entries and merges only new questions', () => {
  const authored = { id: 'manual', question: 'What is included?', answer: 'My edited answer', isGenerated: false }
  const merged = mergeFAQSuggestions([authored], [
    { id: 'duplicate', question: ' what is included? ', answer: 'replacement', isGenerated: true },
    { id: 'new', question: 'What materials are listed?', answer: 'Fact from description', isGenerated: true },
  ])
  assert.deepEqual(merged.map((faq) => faq.id), ['manual', 'new'])
  assert.equal(merged[0].answer, 'My edited answer')
})

test('project copy API uses authenticated credentials, the single generation endpoint, and returns editable output', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const originalStorage = globalThis.localStorage
  const originalBackend = process.env.NEXT_PUBLIC_BACKEND_URL
  const values = new Map([['authToken', 'test-session-token']])
  globalThis.window = {}
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.example.test'
  const result = { titles: ['A grounded title exceeding thirty useful characters', 'Another grounded title exceeding thirty useful chars', 'One more descriptive title exceeding thirty characters'] }
  let call
  globalThis.fetch = async (...args) => {
    call = args
    return new Response(JSON.stringify({ success: true, data: result }), { status: 200 })
  }
  try {
    const { generateProjectCopy } = await import('../lib/projectCopyApi.ts')
    const copy = await generateProjectCopy({
      kind: 'title', locale: 'en', projectId: 'draft-id',
      context: { service: 'Plumbing', description: 'Replace the shower.' },
    })
    assert.deepEqual(copy, result)
    assert.equal(call[0], 'https://backend.example.test/api/projects/generate-copy')
    assert.equal(call[1].method, 'POST')
    assert.equal(call[1].credentials, 'include')
    assert.equal(call[1].headers.Authorization, 'Bearer test-session-token')
    assert.deepEqual(JSON.parse(call[1].body), {
      kind: 'title', locale: 'en', projectId: 'draft-id',
      context: { service: 'Plumbing', description: 'Replace the shower.' },
    })
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalStorage
    if (originalBackend === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL
    else process.env.NEXT_PUBLIC_BACKEND_URL = originalBackend
  }
})


test('merging late FAQ suggestions uses the latest edited or cleared collection', () => {
  const suggestion = { id: 'new', question: 'What is included?', answer: 'Generated suggestion' }
  const currentEdit = { id: 'manual', question: 'What is included?', answer: 'Edited while waiting' }
  assert.deepEqual(mergeFAQSuggestions([currentEdit], [suggestion]), [currentEdit])
  assert.deepEqual(mergeFAQSuggestions([], [suggestion]), [suggestion])
})
