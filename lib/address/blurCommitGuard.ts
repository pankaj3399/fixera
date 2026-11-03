/**
 * Blur-vs-selection ordering guard for the shared address autocomplete.
 *
 * Google's suggestion dropdown commits on mousedown, which fires before the
 * input blur and before `place_changed`. An async blur-validation path must
 * therefore never overwrite a selection that is in flight or already
 * committed — `place_changed` is the single writer of `onChange(placeData)`.
 * All signup/onboarding/booking/project-wizard callers share this rule
 * through `AddressAutocomplete`.
 */
export interface BlurCommitSnapshot {
  /** Pointer went down inside the suggestion dropdown before this blur. */
  dropdownPointerArmed: boolean;
  /** Input version observed synchronously when blur fired. */
  inputVersionAtBlur: number;
  /** Current input version (typing and selections both bump it). */
  currentInputVersion: number;
  /** A dropdown selection was already committed for this input version. */
  selectionCommitted: boolean;
}

/** True when the blur path must not validate/commit (selection wins). */
export function shouldSkipBlurCommit(snapshot: BlurCommitSnapshot): boolean {
  if (snapshot.dropdownPointerArmed) return true;
  if (snapshot.inputVersionAtBlur !== snapshot.currentInputVersion) return true;
  if (snapshot.selectionCommitted) return true;
  return false;
}

/**
 * How long a blur that followed a dropdown pointer-down waits for
 * `place_changed`. A pointer-down that commits a place (suggestion click)
 * bumps the input version within this window; one that does not (dropdown
 * scrollbar, footer) falls through to normal blur validation of the typed
 * text, so the parent's validity can never stay stale.
 */
export const DROPDOWN_SELECTION_GRACE_MS = 300;
