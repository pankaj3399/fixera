import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

const { formatSearchDateDraft, isSearchDateRangeValid, parseSearchDateDraft } = await import('../lib/search/dateDraft.ts')

test('partial years stay drafts; only complete real dates commit', () => {
  assert.deepEqual(parseSearchDateDraft('2026-1'), { date: undefined, error: 'invalid' })
  assert.equal(parseSearchDateDraft('2024-02-29').date?.getFullYear(), 2024)
  assert.equal(parseSearchDateDraft('2025-02-29').error, 'invalid')
  assert.deepEqual(parseSearchDateDraft(''), { date: undefined, error: null })
})

test('date range checks include equal days and clearing both fields resets drafts', () => {
  const from = parseSearchDateDraft('2026-10-27').date
  const to = parseSearchDateDraft('2026-10-27').date
  const laterFrom = parseSearchDateDraft('2026-10-28').date
  assert.equal(isSearchDateRangeValid(from, to), true)
  assert.equal(isSearchDateRangeValid(laterFrom, to), false)
  assert.equal(formatSearchDateDraft(undefined), '')
})
