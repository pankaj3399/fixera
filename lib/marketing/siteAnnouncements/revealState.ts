/**
 * Key-scoped "revealed/triggered" flag for announcement overlays.
 *
 * The flag belongs to one key (announcement + page occurrence). A new key
 * always starts hidden in the very render where the key changes, so a
 * `once_pageview` modal or exit-intent that was showing on the previous page
 * neither flashes on the next page nor records an impression there before its
 * own delay / exit gesture. Late timers or gestures for an old key are ignored.
 */
export type KeyedFlag = { key: string | null; on: boolean };

/** Render-phase sync: returns `state` itself when the key is unchanged. */
export function syncKeyedFlag(state: KeyedFlag, key: string | null): KeyedFlag {
  return state.key === key ? state : { key, on: false };
}

/** Timer/gesture result for `key`; a no-op when the flag has moved on to another key. */
export function raiseKeyedFlag(state: KeyedFlag, key: string | null): KeyedFlag {
  if (key === null || state.key !== key || state.on) return state;
  return { key, on: true };
}

export function isKeyedFlagOn(state: KeyedFlag, key: string | null): boolean {
  return key !== null && state.key === key && state.on;
}
