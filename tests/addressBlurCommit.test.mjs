import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from 'node:module'

register('./swc-loader.mjs', import.meta.url)

const { shouldSkipBlurCommit } = await import('../lib/address/blurCommitGuard.ts')

const manual = {
  dropdownPointerArmed: false,
  inputVersionAtBlur: 3,
  currentInputVersion: 3,
  selectionCommitted: false,
}

test('manual blur validates (no skip)', () => {
  assert.equal(shouldSkipBlurCommit(manual), false)
})

test('mousedown in the suggestion dropdown suppresses the following blur', () => {
  // Real event order: dropdown mousedown -> input blur -> place_changed.
  assert.equal(shouldSkipBlurCommit({ ...manual, dropdownPointerArmed: true }), true)
})

test('a selection committed while blur validation was in flight wins', () => {
  // Blur observed version 3; place_changed then committed version 4.
  assert.equal(
    shouldSkipBlurCommit({ ...manual, currentInputVersion: 4 }),
    true,
  )
})

test('an already-committed selection is never re-validated', () => {
  assert.equal(shouldSkipBlurCommit({ ...manual, selectionCommitted: true }), true)
})

test('typing after blur restarts validation instead of being swallowed', () => {
  // New input after the blur means a newer version: the stale blur must not
  // commit, and the next blur observes the fresh version and validates.
  assert.equal(
    shouldSkipBlurCommit({ ...manual, currentInputVersion: 5 }),
    true,
  )
  assert.equal(
    shouldSkipBlurCommit({ ...manual, inputVersionAtBlur: 5, currentInputVersion: 5 }),
    false,
  )
})
