'use client'

import { useEffect, useReducer } from "react"
import { TIER_BADGE_FALLBACK_COLOR } from "@/components/dashboard/TierBadge"

interface TierEntry {
  name?: string
  color?: string
}

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/+$/, "")

let tierCache: Record<string, string> | null = null
let levelCache: Record<string, string> | null = null
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notifyTierColors() {
  listeners.forEach((listener) => listener())
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase()
}

function toMap(entries: TierEntry[] | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of entries || []) {
    if (typeof entry?.name === "string" && entry.name.trim() && typeof entry?.color === "string" && entry.color) {
      map[normalizeKey(entry.name)] = entry.color
    }
  }
  return map
}

async function loadTierColors(): Promise<void> {
  if (!BACKEND_URL) return
  try {
    const [tiersRes, levelsRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/public/loyalty-tiers`),
      fetch(`${BACKEND_URL}/api/public/professional-levels`),
    ])
    if (tiersRes.ok) {
      const json = await tiersRes.json().catch(() => null)
      if (json?.success) tierCache = toMap(json?.data?.tiers)
    }
    if (levelsRes.ok) {
      const json = await levelsRes.json().catch(() => null)
      if (json?.success) levelCache = toMap(json?.data?.levels)
    }
  } catch {
    // Display-only metadata: keep the safe fallback colour on failure.
  }
  tierCache = tierCache ?? {}
  levelCache = levelCache ?? {}
}

function ensureTierColors() {
  if (tierCache !== null && levelCache !== null) return
  if (!inflight) {
    inflight = loadTierColors().finally(() => {
      inflight = null
      notifyTierColors()
    })
  }
}

/**
 * Task 14b: level/tier tag colours come from the admin level/tier
 * configuration (public read-only endpoints), with
 * TIER_BADGE_FALLBACK_COLOR as the safe fallback.
 */
export function useTierColors(): {
  tierColor: (name?: string | null) => string
  levelColor: (name?: string | null) => string
} {
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0)

  useEffect(() => {
    listeners.add(forceUpdate)
    ensureTierColors()
    return () => {
      listeners.delete(forceUpdate)
    }
  }, [])

  return {
    tierColor: (name) => {
      if (name && tierCache) {
        const found = tierCache[normalizeKey(name)]
        if (found) return found
      }
      return TIER_BADGE_FALLBACK_COLOR
    },
    levelColor: (name) => {
      if (name && levelCache) {
        const found = levelCache[normalizeKey(name)]
        if (found) return found
      }
      return TIER_BADGE_FALLBACK_COLOR
    },
  }
}
