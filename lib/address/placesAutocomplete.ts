/**
 * Shared wiring for Google Places Autocomplete inputs (sign-up/onboarding/
 * booking/project-wizard addresses and the hero/search-page location bars).
 *
 * FT2-6A ("I have to click an address twice"), two causes fixed here:
 *
 * 1. One widget per input. `new google.maps.places.Autocomplete(input)`
 *    appends its own `.pac-container` dropdown to <body> and its own listeners
 *    to the input; `clearInstanceListeners` only drops the `place_changed`
 *    listener, it removes neither. The location bars re-created the widget
 *    whenever the parent passed a new inline `onChange` — i.e. on every
 *    keystroke — so several dropdowns stacked on the same input and the
 *    visible one belonged to a stale widget without a `place_changed`
 *    listener: the first click only filled the text, the second (on a fresh
 *    dropdown) selected. The widget is now created once per input and the
 *    latest handler is read through a getter.
 *
 * 2. Focus stays in the input while a suggestion is pressed. A mousedown on
 *    the dropdown moved focus out of the input, so the input's blur
 *    (validation, re-render, controlled value reset) raced Google's
 *    selection. Preventing the mousedown default keeps focus without stopping
 *    the event, so Google still receives mousedown/click and selects on the
 *    first click.
 */

export const SUGGESTION_DROPDOWN_SELECTOR = '.pac-container'

type ClosestTarget = { closest?: (selector: string) => unknown } | null | undefined

/** True when the event target sits inside a Google suggestion dropdown. */
export function isInsideSuggestionDropdown(target: unknown): boolean {
  const node = target as ClosestTarget
  return Boolean(node && typeof node.closest === 'function' && node.closest(SUGGESTION_DROPDOWN_SELECTOR))
}

/** Mousedown handler: keep focus in the input when a suggestion is pressed. */
export function keepFocusOnSuggestionPress(event: { target: unknown; preventDefault: () => void }): void {
  if (isInsideSuggestionDropdown(event.target)) event.preventDefault()
}

type ListenerTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

let guardUsers = 0
let guardTarget: ListenerTarget | null = null
const guardListener = (event: Event) => keepFocusOnSuggestionPress(event)

/**
 * Install the document-level suggestion-press guard (reference counted, so
 * every autocomplete on the page shares one listener). Returns the release.
 */
export function retainSuggestionPressGuard(target: ListenerTarget | undefined = typeof document === 'undefined' ? undefined : document): () => void {
  if (!target) return () => {}
  if (guardUsers === 0) {
    guardTarget = target
    target.addEventListener('mousedown', guardListener, true)
  }
  guardUsers += 1
  let released = false
  return () => {
    if (released) return
    released = true
    guardUsers -= 1
    if (guardUsers === 0 && guardTarget) {
      guardTarget.removeEventListener('mousedown', guardListener, true)
      guardTarget = null
    }
  }
}

type AutocompleteLike = { addListener: (event: string, handler: () => void) => unknown }

export interface PlacesAutocompleteApi<A extends AutocompleteLike> {
  create: (input: HTMLInputElement) => A
  clearListeners: (instance: A) => void
}

/**
 * Attach ONE autocomplete widget to `input`. `getOnPlaceChanged` is read on
 * every selection, so callers can pass a fresh handler each render without
 * re-creating the widget. Returns the detach function for effect cleanup.
 */
export function attachPlacesAutocomplete<A extends AutocompleteLike>(
  api: PlacesAutocompleteApi<A>,
  input: HTMLInputElement,
  getOnPlaceChanged: () => ((instance: A) => void) | undefined,
): { instance: A; detach: () => void } {
  const instance = api.create(input)
  instance.addListener('place_changed', () => getOnPlaceChanged()?.(instance))
  const releaseGuard = retainSuggestionPressGuard()
  return {
    instance,
    detach: () => {
      releaseGuard()
      api.clearListeners(instance)
    },
  }
}
