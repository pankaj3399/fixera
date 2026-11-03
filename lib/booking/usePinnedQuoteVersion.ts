import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { resolveQuotationVersionFromUrl } from "@/lib/bookingDetails"

/**
 * The quotation version pinned by the URL hash (`#quotation-v{N}`), as the
 * booking page shows it. It is read on mount and again on every `hashchange`
 * (native fragment links, and version picks announced by
 * pushQuotationVersionUrl) and `popstate` (Back/Forward between version
 * entries). `resetKey` (the booking id) re-reads it for another booking.
 *
 * The pinned version is display-only; see isViewingPinnedQuoteVersion for the
 * Accept & Pay gate it drives.
 */
export function usePinnedQuoteVersion(resetKey: unknown): [number | null, Dispatch<SetStateAction<number | null>>] {
  const [pinnedQuoteVersion, setPinnedQuoteVersion] = useState<number | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const readHash = () => {
      setPinnedQuoteVersion(resolveQuotationVersionFromUrl(window.location.hash, null, null))
    }
    readHash()
    window.addEventListener("hashchange", readHash)
    window.addEventListener("popstate", readHash)
    return () => {
      window.removeEventListener("hashchange", readHash)
      window.removeEventListener("popstate", readHash)
    }
  }, [resetKey])
  return [pinnedQuoteVersion, setPinnedQuoteVersion]
}

/**
 * True while the page displays a historical (pinned, non-current) version.
 * Accept & Pay and Reject are disabled then: accept authority stays on the
 * current version.
 */
export function isViewingPinnedQuoteVersion({
  hasQuotationVersions,
  pinnedVersion,
  currentQuoteVersion,
  displayedVersion,
}: {
  hasQuotationVersions: boolean
  pinnedVersion: number | null
  currentQuoteVersion: number | null | undefined
  displayedVersion: number | null | undefined
}): boolean {
  return hasQuotationVersions
    && pinnedVersion != null
    && pinnedVersion !== currentQuoteVersion
    && displayedVersion === pinnedVersion
}

/**
 * The canonical current quotation version: the entry matching
 * `currentQuoteVersion`; when that is missing or unmatched, the latest entry
 * by its `version` number (versions are numbered 1, 2, 3… as they are
 * created; array order is not relied on). Never the hash-pinned version, which
 * may be historical. null without versions.
 */
export function resolveAuthoritativeQuoteVersion<V extends { version: number }>(
  quoteVersions: readonly V[] | null | undefined,
  currentQuoteVersion: number | null | undefined,
): V | null {
  if (!Array.isArray(quoteVersions) || quoteVersions.length === 0) return null
  const current = quoteVersions.find(v => v.version === currentQuoteVersion)
  if (current) return current
  let latest: V | null = null
  for (const v of quoteVersions) {
    if (typeof v?.version !== "number" || !Number.isFinite(v.version)) continue
    if (!latest || v.version > latest.version) latest = v
  }
  return latest
}

/**
 * How the booking page shows quotation versions:
 * - `displayedVersion`: the pinned (`#quotation-v{N}`) version when it exists,
 *   else the one matching `currentQuoteVersion`; shown in the customer card.
 * - `authoritativeVersion`: see resolveAuthoritativeQuoteVersion; the
 *   professional summary, edit wizard and milestone arithmetic use it.
 * - `viewingPinnedVersion`: the Accept & Pay / Reject gate
 *   (isViewingPinnedQuoteVersion).
 */
export function resolveQuoteVersionView<V extends { version: number }>({
  quoteVersions,
  currentQuoteVersion,
  pinnedVersion,
}: {
  quoteVersions: readonly V[] | null | undefined
  currentQuoteVersion: number | null | undefined
  pinnedVersion: number | null
}): {
  hasQuotationVersions: boolean
  displayedVersion: V | null
  authoritativeVersion: V | null
  viewingPinnedVersion: boolean
} {
  const versions = Array.isArray(quoteVersions) ? quoteVersions : []
  const hasQuotationVersions = versions.length > 0
  const effective = pinnedVersion ?? currentQuoteVersion
  const displayedVersion = hasQuotationVersions
    ? (versions.find(v => v.version === effective) ?? versions.find(v => v.version === currentQuoteVersion) ?? null)
    : null
  return {
    hasQuotationVersions,
    displayedVersion,
    authoritativeVersion: resolveAuthoritativeQuoteVersion(versions, currentQuoteVersion),
    viewingPinnedVersion: isViewingPinnedQuoteVersion({
      hasQuotationVersions,
      pinnedVersion,
      currentQuoteVersion,
      displayedVersion: displayedVersion?.version,
    }),
  }
}
