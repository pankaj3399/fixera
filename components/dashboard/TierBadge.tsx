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
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(cleaned.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  const blackContrast = (luminance + 0.05) / 0.05
  const whiteContrast = 1.05 / (luminance + 0.05)
  return blackContrast >= whiteContrast
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
        color: light ? "#000000" : "#FFFFFF",
      }}
    >
      {level}
    </Badge>
  )
}
