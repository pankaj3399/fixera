'use client'

import TierBadge from "@/components/dashboard/TierBadge"
import { useTierColors } from "@/lib/tierColors"

/**
 * FT3 #14b: a professional level tag in the colour configured for that level
 * in the admin level configuration (grey fallback while unknown).
 */
export default function ProfessionalLevelTag({ level, className }: { level?: string | null; className?: string }) {
  const { levelColor } = useTierColors()
  if (!level) return null
  return <TierBadge level={level} color={levelColor(level)} className={className} />
}
