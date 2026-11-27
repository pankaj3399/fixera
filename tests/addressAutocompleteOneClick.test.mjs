import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { test } from 'node:test'

register('./swc-loader.mjs', import.meta.url)

const {
  attachPlacesAutocomplete,
  isInsideSuggestionDropdown,
  keepFocusOnSuggestionPress,
  retainSuggestionPressGuard,
} = await import('../lib/address/placesAutocomplete.ts')

const src = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const inDropdown = { closest: (selector) => (selector === '.pac-container' ? {} : null) }
const outside = { closest: () => null }

test('a press on a Google suggestion keeps focus in the input (no blur before selection)', () => {
  let prevented = 0
  keepFocusOnSuggestionPress({ target: inDropdown, preventDefault: () => { prevented += 1 } })
  assert.equal(prevented, 1)
  keepFocusOnSuggestionPress({ target: outside, preventDefault: () => { prevented += 1 } })
  keepFocusOnSuggestionPress({ target: null, preventDefault: () => { prevented += 1 } })
  keepFocusOnSuggestionPress({ target: {}, preventDefault: () => { prevented += 1 } })
  assert.equal(prevented, 1, 'presses elsewhere keep their default')
  assert.equal(isInsideSuggestionDropdown(inDropdown), true)
  assert.equal(isInsideSuggestionDropdown(outside), false)
})

test('the guard is one shared capture listener, removed when the last field unmounts', () => {
  const calls = []
  const target = {
    addEventListener: (...args) => calls.push(['add', ...args]),
    removeEventListener: (...args) => calls.push(['remove', ...args]),
  }
  const releaseA = retainSuggestionPressGuard(target)
  const releaseB = retainSuggestionPressGuard(target)
  assert.equal(calls.filter(([kind]) => kind === 'add').length, 1)
  const [, type, listener, capture] = calls[0]
  assert.equal(type, 'mousedown')
  assert.equal(capture, true)
  let prevented = false
  listener({ target: inDropdown, preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
  releaseA()
  releaseA()
  assert.equal(calls.filter(([kind]) => kind === 'remove').length, 0)
  releaseB()
  assert.equal(calls.filter(([kind]) => kind === 'remove').length, 1)
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
