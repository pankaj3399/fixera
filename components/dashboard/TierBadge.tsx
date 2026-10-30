'use client'

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const TIER_BADGE_FALLBACK_COLOR = "#6B7280"

/**
 * Task 14b: level/tier tags render the colour from the admin level/tier
 * configuration, with a safe grey fallback when no colour is configured.
 * White text is used on dark backgrounds, dark text on light ones.
 */
function isLightColor(hex: string): boolean {
  const cleaned = hex.replace("#", "")
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return false
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  // Relative luminance approximation; light backgrounds need dark text.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}

function normalizeColor(color?: string | null): string {
  if (typeof color === "string") {
    const trimmed = color.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`
  }
  return TIER_BADGE_FALLBACK_COLOR
}

interface TierBadgeProps {
  level?: string | null
  color?: string | null
  className?: string
}

export default function TierBadge({ level, color, className }: TierBadgeProps) {
  if (!level) return null
  const backgroundColor = normalizeColor(color)
  const light = isLightColor(backgroundColor)
  return (
    <Badge
      variant="outline"
      className={cn(className)}
      style={{
        backgroundColor,
        borderColor: backgroundColor,
        color: light ? "#1F2937" : "#FFFFFF",
      }}
    >
      {level}
    </Badge>
  )
}
