'use client'

import { getErrorMessage, messageFromApiBody } from '@/lib/apiErrors'

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { getAuthToken } from "@/lib/utils"
import { canManageUserDeletion } from "@/lib/adminRbac"
import { isAnonymizedIdentity } from "@/lib/anonymizedUsers"
import { AnonymizeAccountDialog, type AnonymizeAccountTarget } from "@/components/admin/AnonymizeAccountDialog"
import { AnonymizeCleanupRecovery } from "@/components/admin/AnonymizeCleanupRecovery"
import { useAnonymizeRecovery } from "@/hooks/useAnonymizeRecovery"
import {
  anonymizeRecoveryRecord,
  anonymizeRefreshFailureMessage,
  anonymizeResultAnnouncement,
  isAnonymizationComplete,
  upsertAnonymizeRecoveryRecord,
  type AnonymizeExecutionData,
  type AnonymizeRecoveryRecord,
} from "@/lib/adminAnonymize"
import { startAdminSupportChat } from "@/lib/admin-chat-utils"
import { toast } from "sonner"

interface CustomerRow {
  _id: string
  name: string
  email: string
  deletedAt?: string | null
  isAnonymized?: boolean
  loyaltyLevel?: string
  points?: number
  moneySpent?: number
  accountStatus?: string
  location?: { country?: string }
  companyAddress?: { country?: string }
}

export default function AdminCustomersPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [search, setSearch] = useState("")
  const [country, setCountry] = useState("all")
  const [level, setLevel] = useState("all")
  const [address, setAddress] = useState("")

  const abortRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)
  const [patching, setPatching] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [chattingId, setChattingId] = useState<string | null>(null)
  const [anonymizeTarget, setAnonymizeTarget] = useState<AnonymizeAccountTarget | null>(null)
  const {
    entries: anonymizeRecovery,
    setEntries: setAnonymizeRecovery,
    sync: recoverySync,
    retry: retryRecovery,
    listMeta: recoveryListMeta,
    loadMore: loadMoreRecovery,
    loadingMore: recoveryLoadingMore,
    loadMoreError: recoveryLoadMoreError,
  } = useAnonymizeRecovery(
    "customers",
    user?._id,
    canManageUserDeletion(user),
  )
  const [listAnnouncement, setListAnnouncement] = useState("")
  const canManageUserDeletionNow = canManageUserDeletion(user)

  const startChat = (customerId: string) => {
    if (chattingId) return
    void startAdminSupportChat(customerId, setChattingId)
  }

  const load = useCallback(async (options?: { failureMessage?: string }): Promise<boolean> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++loadRequestIdRef.current
    try {
      const token = getAuthToken()
      const params = new URLSearchParams()
      if (search.trim()) params.set("search", search.trim())
      if (country !== "all") params.set("country", country)
      if (level !== "all") params.set("levels", level)
      if (address.trim()) params.set("address", address.trim())
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/customers/manage?${params.toString()}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      })
      let payload: { success?: boolean; msg?: string; data?: { customers?: CustomerRow[] } } | null = null
      try {
        payload = await response.json()
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to parse customers response:", error)
        }
      }
      const isLatestRequest = requestId === loadRequestIdRef.current
      if (!controller.signal.aborted && isLatestRequest && response.ok && payload?.success) {
        setRows(payload.data?.customers || [])
        return true
      }
      if (!controller.signal.aborted && isLatestRequest && !response.ok) {
        toast.error(messageFromApiBody(payload, options?.failureMessage || "Failed to load customers"))
      }
      return false
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false
      toast.error(getErrorMessage(e, options?.failureMessage || "Failed to load customers"))
      return false
    }
  }, [address, country, level, search])

  const patchCustomer = async (customerId: string, body: Record<string, unknown>) => {
    setPatching(customerId)
    try {
      const token = getAuthToken()
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/customers/manage/${customerId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      let payload: { success?: boolean; msg?: string } | null = null
      try {
        payload = await response.json()
      } catch (error) {
        console.error("Failed to parse customer patch response:", error)
      }
      if (!response.ok || !payload?.success) {
        toast.error(messageFromApiBody(payload, "Failed to update customer"))
        return
      }
      await load()
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to update customer"))
    } finally {
      setPatching(null)
    }
  }

  const deleteCustomer = async (customerId: string) => {
    if (deletingIds.has(customerId)) return
    setDeletingIds((prev) => new Set(prev).add(customerId))
    try {
      const token = getAuthToken()
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/users/${customerId}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || (payload != null && !payload.success)) {
        toast.error(messageFromApiBody(payload, "Failed to delete customer"))
        return
      }
      setRows((prev) => prev.filter((r) => r._id !== customerId))
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to delete customer"))
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(customerId); return next })
    }
  }

  const rememberRecovery = useCallback((recovery: AnonymizeRecoveryRecord) => {
    setAnonymizeRecovery((prev) => upsertAnonymizeRecoveryRecord(prev, recovery))
  }, [setAnonymizeRecovery])

  const resolveRecovery = useCallback((targetId: string) => {
    setAnonymizeRecovery((prev) => prev.filter((entry) => entry.targetId !== targetId))
  }, [setAnonymizeRecovery])

  const handleAnonymized = useCallback((result: AnonymizeExecutionData) => {
    const targetId = result.target.id
    setRows((prev) => prev.filter((row) => row._id !== targetId))
    setListAnnouncement(anonymizeResultAnnouncement(result))
    if (isAnonymizationComplete(result)) {
      setAnonymizeRecovery((prev) => prev.filter((entry) => entry.targetId !== targetId))
    } else {
      rememberRecovery(anonymizeRecoveryRecord({
        targetId,
        role: result.target.role,
        state: "already_anonymized",
        identityRemoved: result.target.identityRemoved ?? result.target.isAnonymized === true,
        legacyAnonymized: result.target.legacyAnonymized === true,
        cleanup: result.cleanup,
        source: "session",
      }))
    }
    void load({ failureMessage: anonymizeRefreshFailureMessage(result) })
  }, [load, rememberRecovery, setAnonymizeRecovery])

  useEffect(() => {
    if (user?.role !== "admin") return
    void load()
    return () => { abortRef.current?.abort() }
  }, [load, user])

  if (user?.role !== "admin") return null

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-7xl pt-20 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1
              id="admin-customers-heading"
              tabIndex={-1}
              className="text-3xl font-bold text-slate-900 outline-none"
            >
              Customer Management
            </h1>
            <p className="text-sm text-slate-600">
              Search, filter, adjust levels, suspend, anonymize or permanently
              delete customers. Anonymization is irreversible and separate from
              suspension or permanent deletion.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>Back</Button>
        </div>

        <p className="sr-only" role="status" aria-live="polite">{listAnnouncement}</p>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" />
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" aria-label="Address" />
            <Input value={country === "all" ? "" : country} onChange={(e) => setCountry(e.target.value || "all")} placeholder="Country" />
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                {["all", "Bronze", "Silver", "Gold", "Platinum"].map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {canManageUserDeletionNow && (
          <AnonymizeCleanupRecovery
            entries={anonymizeRecovery}
            sync={recoverySync}
            listMeta={recoveryListMeta}
            onRetry={retryRecovery}
            onLoadMore={loadMoreRecovery}
            loadingMore={recoveryLoadingMore}
            loadMoreError={recoveryLoadMoreError}
            onResume={(entry) => setAnonymizeTarget({ id: entry.targetId, role: entry.role })}
          />
        )}

        <div className="space-y-3">
          {rows.map((row) => {
            const rowAnonymized = isAnonymizedIdentity(row)
            return (
            <Card key={row._id}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  {rowAnonymized ? (
                    <>
                      <p className="font-semibold text-slate-900">Deleted user</p>
                      <p className="text-sm text-slate-600">Personal details are no longer available.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-slate-900">{row.name}</p>
                      <p className="text-sm text-slate-600">{row.email}</p>
                    </>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{row.loyaltyLevel || "Bronze"}</Badge>
                    <Badge variant="outline">{row.points || 0} pts</Badge>
                    <Badge variant="outline">EUR {(row.moneySpent || 0).toLocaleString()}</Badge>
                    <Badge variant="outline">{row.accountStatus || "active"}</Badge>
                    {!rowAnonymized && (
                      <Badge variant="outline">{row.location?.country || row.companyAddress?.country || "No country"}</Badge>
                    )}
                  </div>
                </div>
                {rowAnonymized ? (
                  <p className="max-w-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    This account is anonymized. Chat, level, suspension, anonymization
                    and permanent deletion controls are disabled. Financial history
                    remains visible.
                  </p>
                ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={chattingId === row._id}
                    onClick={() => void startChat(row._id)}
                  >
                    {chattingId === row._id ? "Opening..." : "Chat"}
                  </Button>
                  <Select onValueChange={(value) => void patchCustomer(row._id, { loyaltyLevel: value })}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Adjust level" /></SelectTrigger>
                    <SelectContent>
                      {["Bronze", "Silver", "Gold", "Platinum"].map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={patching === row._id}
                    onClick={() => void patchCustomer(row._id, { action: row.accountStatus === "suspended" ? "reactivate" : "suspend" })}
                  >
                    {row.accountStatus === "suspended" ? "Reactivate" : "Suspend"}
                  </Button>
                  {canManageUserDeletionNow && (
                    <Button
                      variant="outline"
                      className="border-rose-300 text-rose-700 hover:bg-rose-50"
                      onClick={() => setAnonymizeTarget({ id: row._id, role: "customer" })}
                    >
                      Anonymize
                    </Button>
                  )}
                  {canManageUserDeletionNow && (
                    <Button
                      variant="destructive"
                      disabled={deletingIds.has(row._id)}
                      onClick={() => {
                        if (!window.confirm(`Permanently delete ${row.name || row.email}? This will remove the user and ALL their data (bookings, messages, files, etc). This cannot be undone.`)) {
                          return
                        }
                        void deleteCustomer(row._id)
                      }}
                    >
                      {deletingIds.has(row._id) ? "Deleting..." : "Delete permanently"}
                    </Button>
                  )}
                </div>
                )}
              </CardContent>
            </Card>
            )
          })}
        </div>
      </div>
      <AnonymizeAccountDialog
        open={Boolean(anonymizeTarget)}
        target={anonymizeTarget}
        focusFallbackId="admin-customers-heading"
        onOpenChange={(open) => { if (!open) setAnonymizeTarget(null) }}
        onAnonymized={handleAnonymized}
        onAlreadyAnonymized={(targetId) => {
          setRows((prev) => prev.filter((row) => row._id !== targetId))
          setAnonymizeRecovery((prev) => prev.filter((entry) => entry.targetId !== targetId))
          setListAnnouncement("Account was already anonymized and no cleanup is pending. The row was removed from this list.")
        }}
        onRecoveryResolved={resolveRecovery}
        onRecoveryRequired={(recovery) => {
          setRows((prev) => prev.filter((row) => row._id !== recovery.targetId))
          setListAnnouncement(
            recovery.state === "status_unknown"
              ? "The anonymization outcome is unknown. Check the recovery card before retrying."
              : "Account access is disabled. Cleanup or identity recovery is still pending; use the recovery card.",
          )
          rememberRecovery(recovery)
        }}
      />
    </div>
  )
}
