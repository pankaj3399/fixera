'use client'

import { useMemo, useState } from "react"
import { Globe2, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { messageFromApiBody } from "@/lib/apiErrors"
import { authFetch } from "@/lib/utils"
import {
  ROLLOUT_COUNTRY_OPTIONS,
  buildAutoConversionPayload,
  editAutoConversionCard,
  initAutoConversionCard,
  savedAutoConversionCard,
  syncAutoConversionCard,
  toggleRolloutCountry,
  validateAutoConversionDraft,
  type AutoConversionCardState,
  type AutoConversionDraft,
} from "@/lib/admin/autoConversionSettings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * Platform settings → Auto-conversion: the roll-out countries where region,
 * language and currency follow the visitor's IP geolocation, and the default
 * country every other visitor is served as.
 */
export default function AutoConversionSettingsCard({ initial }: { initial: unknown }) {
  const [cardState, setCardState] = useState<AutoConversionCardState>(() => initAutoConversionCard(initial))
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  // Re-hydrate from a new `initial` (adjusted during render) unless the admin
  // has unsaved edits: saving the main settings form must not wipe them.
  const synced = syncAutoConversionCard(cardState, initial)
  if (synced !== cardState) setCardState(synced)
  const draft = synced.draft
  const setDraft = (update: (prev: AutoConversionDraft) => AutoConversionDraft) =>
    setCardState((prev) => editAutoConversionCard(prev, update))

  const visibleCountries = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return ROLLOUT_COUNTRY_OPTIONS
    return ROLLOUT_COUNTRY_OPTIONS.filter(
      (country) => country.name.toLowerCase().includes(query) || country.code.toLowerCase() === query,
    )
  }, [search])

  const nameFor = (code: string) =>
    ROLLOUT_COUNTRY_OPTIONS.find((country) => country.code === code)?.name ?? code

  const save = async () => {
    const problem = validateAutoConversionDraft(draft)
    if (problem) {
      toast.error(problem)
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/platform-settings/auto-conversion`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildAutoConversionPayload(draft)),
        },
      )
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.success === false) {
        toast.error(messageFromApiBody(json, "Failed to save auto-conversion settings"))
        return
      }
      const saved = json?.data ?? buildAutoConversionPayload(draft)
      setCardState((prev) => savedAutoConversionCard(prev, saved))
      toast.success("Auto-conversion settings saved. Visitors pick them up within a few minutes.")
    } catch {
      toast.error("Failed to save auto-conversion settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="h-5 w-5" />
          Auto-conversion
        </CardTitle>
        <CardDescription>
          Countries where the roll-out is completed: region, language and currency are set automatically from the
          visitor&apos;s location. Visitors from any other country get the content, language and currency of the
          default country. A visitor&apos;s own language or currency choice always wins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!draft.configured && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Not configured yet: auto-conversion is currently on for every country. Saving switches to the roll-out
            list below.
          </p>
        )}

        <div className="space-y-2 max-w-xs">
          <Label htmlFor="auto-conversion-default">Default country</Label>
          <Select
            value={draft.defaultCountry}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, defaultCountry: value }))}
          >
            <SelectTrigger id="auto-conversion-default">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {ROLLOUT_COUNTRY_OPTIONS.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.flag} {country.name} ({country.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-900">Auto-conversion ON in</legend>
          <p className="text-xs text-gray-500">
            {draft.enabledCountries.length === 0
              ? "No roll-out countries selected: every visitor is served as the default country."
              : `${draft.enabledCountries.length} selected: ${draft.enabledCountries.map(nameFor).join(", ")}`}
          </p>
          <Input
            aria-label="Filter countries"
            placeholder="Filter countries"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-gray-200 p-2 sm:grid-cols-2">
            {visibleCountries.map((country) => {
              const checked = draft.enabledCountries.includes(country.code)
              return (
                <label key={country.code} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={checked}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        enabledCountries: toggleRolloutCountry(prev.enabledCountries, country.code, e.target.checked),
                      }))
                    }
                  />
                  <span aria-hidden>{country.flag}</span>
                  <span>{country.name}</span>
                  <span className="text-xs text-gray-400">{country.code}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save auto-conversion
        </Button>
        {synced.dirty && (
          <p role="status" className="text-sm text-amber-700">
            Unsaved auto-conversion changes. They are saved only with “Save auto-conversion”.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
