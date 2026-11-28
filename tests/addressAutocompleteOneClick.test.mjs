import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const { attachPlacesAutocomplete } = await import('../lib/address/placesAutocomplete.ts')

const src = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

// FT2-6A follow-up (round 3): Google's legacy widget has no click handler on
// its suggestion rows; mouseover records the row and the input's blur commits
// it. Cancelling the mousedown on the dropdown kept focus in the input, so a
// click on a suggestion never selected anything.
test('attaching a widget installs no document listener that could cancel the suggestion press', () => {
  const previousDocument = globalThis.document
  const calls = []
  globalThis.document = {
    addEventListener: (...args) => calls.push(['add', ...args]),
    removeEventListener: (...args) => calls.push(['remove', ...args]),
  }
  try {
    const api = {
      create: () => ({ addListener: () => {} }),
      clearListeners: () => {},
    }
    const { detach } = attachPlacesAutocomplete(api, {}, () => undefined)
    detach()
    assert.deepEqual(calls, [])
  } finally {
    globalThis.document = previousDocument
  }
})

test('no address field cancels a press inside the Google dropdown (blur must reach the widget)', () => {
  for (const file of [
    'lib/address/placesAutocomplete.ts',
    'hooks/usePlacesAutocomplete.ts',
    'components/search/LocationAutocomplete.tsx',
    'components/professional/project-wizard/AddressAutocomplete.tsx',
  ]) {
    const source = src(file)
    assert.doesNotMatch(source, /preventDefault\(/, file)
    assert.doesNotMatch(source, /SuggestionPressGuard|keepFocusOnSuggestionPress/, file)
  }
})

test('one widget per input: a new handler is used without re-creating the widget', () => {
  const instances = []
  const api = {
    create: () => {
      const listeners = {}
      const instance = { listeners, addListener: (event, handler) => { listeners[event] = handler } }
      instances.push(instance)
      return instance
    },
    clearListeners: (instance) => { instance.cleared = true },
  }
  let handler = () => 'first'
  const seen = []
  const { instance, detach } = attachPlacesAutocomplete(api, {}, () => (i) => seen.push([handler(), i]))
  // Parent re-renders with a fresh inline onChange on every keystroke.
  handler = () => 'latest'
  instance.listeners.place_changed()
  assert.equal(instances.length, 1)
  assert.deepEqual(seen, [['latest', instance]])
  detach()
  assert.equal(instance.cleared, true)
})

test('components create the widget only through the shared hook, keyed on load state not on callbacks', () => {
  const hook = src('hooks/usePlacesAutocomplete.ts')
  assert.match(hook, /\}, \[enabled, inputRef\]\)/)
  for (const file of ['components/search/LocationAutocomplete.tsx', 'components/professional/project-wizard/AddressAutocomplete.tsx']) {
    const source = src(file)
    assert.doesNotMatch(source, /new google\.maps\.places\.Autocomplete/, file)
    assert.match(source, /usePlacesAutocomplete\(inputRef, \{/, file)
    // The old LocationAutocomplete effect depended on onChange: a new widget per keystroke.
    assert.doesNotMatch(source, /\}, \[isLoaded, onChange\]\)/, file)
  }
})

test('the pre-filled-address validation never runs for typed input', () => {
  const source = src('components/professional/project-wizard/AddressAutocomplete.tsx')
  assert.match(source, /if \(inputVersionRef\.current !== 0\) \{\s*hasInitialized\.current = true;\s*return;/)
  assert.match(source, /if \(inputVersionRef\.current !== versionAtStart\)/)
})
