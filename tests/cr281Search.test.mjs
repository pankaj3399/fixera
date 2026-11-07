import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { transformSync } from '@swc/core'

test('keyword Enter leaves IME composition untouched and commits a normal Enter', () => {
  const source = readFileSync(new URL('../components/search/SearchFilters.tsx', import.meta.url), 'utf8')
  const keyword = source.slice(source.indexOf('id="keyword"'))
  const start = keyword.indexOf('onKeyDown={') + 'onKeyDown={'.length
  const handler = keyword.slice(start, keyword.indexOf('}}', start) + 1)
  const code = transformSync(`const handler = ${handler}`, { jsc: { parser: { syntax: 'typescript' } } }).code
  let committed = 0, prevented = 0
  const keyDown = new Function('commitKeyword', `${code}; return handler;`)(() => committed++)
  for (const nativeEvent of [{ isComposing: true }, { isComposing: false, keyCode: 229 }]) {
    keyDown({ key: 'Enter', nativeEvent, preventDefault() { prevented++ } })
    assert.equal(committed, 0); assert.equal(prevented, 0)
  }
  keyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() { prevented++ } })
  assert.equal(committed, 1); assert.equal(prevented, 1)
})
