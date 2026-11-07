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
let tierLoaded = false
let levelLoaded = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
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
  const load = async (kind: 'tiers' | 'levels') => {
    try {
      const endpoint = kind === 'tiers' ? 'loyalty-tiers' : 'professional-levels'
      const response = await fetch(`${BACKEND_URL}/api/public/${endpoint}`)
      if (!response.ok) return
      const json = await response.json()
      if (!json?.success || !Array.isArray(json.data?.[kind])) return
      if (kind === 'tiers') {
        tierCache = toMap(json.data.tiers)
        tierLoaded = true
      } else {
        levelCache = toMap(json.data.levels)
        levelLoaded = true
      }
    } catch {
      // Keep fallback colours and retry only the failed metadata request.
    }
  }
  await Promise.all([
    tierLoaded ? Promise.resolve() : load('tiers'),
    levelLoaded ? Promise.resolve() : load('levels'),
  ])
}

function ensureTierColors() {
  if (!BACKEND_URL || (tierLoaded && levelLoaded)) return
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (!inflight) {
    inflight = loadTierColors().finally(() => {
      inflight = null
      notifyTierColors()
      if (listeners.size > 0 && (!tierLoaded || !levelLoaded)) {
        retryTimer = setTimeout(() => {
          retryTimer = null
          ensureTierColors()
        }, 5000)
      }
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
      if (listeners.size === 0 && retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
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
