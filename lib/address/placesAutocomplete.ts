/**
 * Shared wiring for Google Places Autocomplete inputs (sign-up/onboarding/
 * booking/project-wizard addresses and the hero/search-page location bars).
 *
 * FT2-6A ("I have to click an address twice"): one widget per input.
 * `new google.maps.places.Autocomplete(input)` appends its own
 * `.pac-container` dropdown to <body> and its own listeners to the input;
 * `clearInstanceListeners` only drops the `place_changed` listener, it removes
 * neither. The location bars re-created the widget whenever the parent passed
 * a new inline `onChange` — i.e. on every keystroke — so several dropdowns
 * stacked on the same input and the visible one belonged to a stale widget
 * without a `place_changed` listener: the first click only filled the text,
 * the second (on a fresh dropdown) selected. The widget is now created once
 * per input and the latest handler is read through a getter.
 *
 * FT2-6A follow-up ("the dropdown list ... is now unclickable"): the press on a
 * suggestion must be left alone. The legacy widget puts no click or mousedown
 * handler on its `.pac-item` rows: `mouseover` records the hovered row and the
 * INPUT'S BLUR commits it (Google's blur handler selects the hovered
 * prediction and fires `place_changed`). Round 2 also cancelled mousedown
 * inside `.pac-container` to keep focus in the input; with no blur nothing was
 * ever selected, so a click did nothing in every address field. Nothing here
 * may cancel that mousedown or keep focus in the input. Blur validation that
 * could race the selection is handled by the field itself
 * (lib/address/blurCommitGuard.ts).
 */

type AutocompleteLike = { addListener: (event: string, handler: () => void) => unknown }

export interface PlacesAutocompleteApi<A extends AutocompleteLike> {
  create: (input: HTMLInputElement) => A
  clearListeners: (instance: A) => void
}

/**
 * Attach ONE autocomplete widget to `input`. `getOnPlaceChanged` is read on
 * every selection, so callers can pass a fresh handler each render without
 * re-creating the widget. Returns the detach function for effect cleanup.
 * It installs no document listener: the widget's own blur selection must run.
 */
export function attachPlacesAutocomplete<A extends AutocompleteLike>(
  api: PlacesAutocompleteApi<A>,
  input: HTMLInputElement,
  getOnPlaceChanged: () => ((instance: A) => void) | undefined,
): { instance: A; detach: () => void } {
  const instance = api.create(input)
  instance.addListener('place_changed', () => getOnPlaceChanged()?.(instance))
  return {
    instance,
    detach: () => {
      api.clearListeners(instance)
    },
  }
}
