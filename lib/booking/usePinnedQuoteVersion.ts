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
