'use client'

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Award, Gift } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useNotificationInbox, type InboxNotification } from "@/contexts/NotificationInboxProvider"

const LEVEL_UP_EVENT_KEYS = new Set(["customer.loyalty_tier_up", "professional.leveling_up"])

const seenStorageKey = (id: string) => `fixtract:levelup-seen:${id}`

function isLevelUp(item: InboxNotification): boolean {
  return LEVEL_UP_EVENT_KEYS.has(item.eventKey)
}

/**
 * Task 11: level-up popup shown on next load for both customers and
 * professionals, driven by the level-up notification/event. Dismissible,
 * localized, and shown once per level-up — an acknowledged popup marks the
 * inbox item read (the dedupe key), with a localStorage fallback so a popup
 * is never shown twice for the same event.
 */
export default function LevelUpPopup() {
  const t = useTranslations("dashboardWidgets")
  const router = useRouter()
  const { items, markRead } = useNotificationInbox()
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  const pending = useMemo(() => {
    // Fix 1: already-read items never re-pop (other browser/incognito);
    // localStorage stays as an extra guard for unread items dismissed here.
    const candidates = items.filter((item) => isLevelUp(item) && !item.readAt)
    if (candidates.length === 0) return null
    const sorted = [...candidates].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    for (const item of sorted) {
      if (item.id === dismissedId) continue
      try {
        if (typeof window !== "undefined" && window.localStorage.getItem(seenStorageKey(item.id))) {
          continue
        }
      } catch {
        // Storage unavailable — fall through to the inbox read state.
      }
      return item
    }
    return null
  }, [items, dismissedId])

  // Fix 2 (review): no reset-on-length-change — the in-memory dismiss must
  // survive inbox refreshes until markRead round-trips. A genuinely new
  // level-up carries a different id, so it still surfaces.

  if (!pending) return null

  const isProfessional = pending.eventKey === "professional.leveling_up"

  const acknowledge = () => {
    try {
      window.localStorage.setItem(seenStorageKey(pending.id), "1")
    } catch {
      // Ignore storage failures; the inbox read state still dedupes.
    }
    setDismissedId(pending.id)
    if (!pending.readAt) void markRead(pending.id)
  }

  const goToBenefits = () => {
    acknowledge()
    const url = pending.clickUrl || "/dashboard/benefits"
    try {
      const parsed = new URL(url, window.location.origin)
      if (parsed.origin === window.location.origin) {
        router.push(`${parsed.pathname}${parsed.search}${parsed.hash}`)
        return
      }
    } catch {
      // Fall through to a same-origin push.
    }
    router.push(url.startsWith("/") ? url : "/dashboard/benefits")
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) acknowledge()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-yellow-500">
            {isProfessional ? (
              <Award className="h-7 w-7 text-white" />
            ) : (
              <Gift className="h-7 w-7 text-white" />
            )}
          </div>
          <DialogTitle className="text-center text-xl">
            {isProfessional ? t("levelUp.professionalTitle") : t("levelUp.customerTitle")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {pending.body || (isProfessional ? t("levelUp.professionalBody") : t("levelUp.customerBody"))}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={goToBenefits}>
            {t("levelUp.viewBenefits")}
          </Button>
          <Button variant="outline" className="w-full" onClick={acknowledge}>
            {t("levelUp.dismiss")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
