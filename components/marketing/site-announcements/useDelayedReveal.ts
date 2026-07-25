"use client";

import { useEffect, useState } from "react";

/** Reveal `true` after `delayMs` while `key` is set; resets when key changes. */
export function useDelayedReveal(key: string | null, delayMs: number): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!key) {
      setRevealed(false);
      return;
    }

    setRevealed(false);
    const timer = window.setTimeout(() => setRevealed(true), Math.max(0, delayMs));
    return () => window.clearTimeout(timer);
  }, [key, delayMs]);

  return revealed;
}
