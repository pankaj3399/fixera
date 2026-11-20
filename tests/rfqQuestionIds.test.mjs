import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
register('./swc-loader.mjs', import.meta.url)
const { withQuestionIds } = await import('../components/professional/project-wizard/Step5RFQQuestions.tsx')

test('C11-2: saved wizard questions get stable, distinct ids so one can be edited or removed alone', () => {
  const saved = [{ _id: 'a1', question: 'Q1' }, { question: 'Q2' }, { id: 'custom-1', question: 'Q3' }]
  const ids = withQuestionIds(saved).map((question) => question.id)
  assert.deepEqual(ids, ['a1', 'saved-1', 'custom-1'])
  assert.equal(new Set(ids).size, ids.length)
})
