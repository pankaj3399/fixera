'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { getAuthToken } from "@/lib/utils"

interface CustomerRow {
  _id: string
  name: string
  email: string
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

  const abortRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)
  const [patching, setPatching] = useState<string | null>(null)

  const load = useCallback(async () => {
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
        return
      }
      if (!controller.signal.aborted && isLatestRequest && !response.ok) {
        console.error("Failed to load customers:", payload?.msg || `Request failed with status ${response.status}`)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return
      console.error("Failed to load customers:", e)
    }
  }, [country, level, search])

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
        console.error("Failed to patch customer:", payload?.msg || `Request failed with status ${response.status}`)
        return
      }
      await load()
    } catch (e) {
      console.error("Failed to patch customer:", e)
    } finally {
      setPatching(null)
    }
  }

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
            <h1 className="text-3xl font-bold text-slate-900">Customer Management</h1>
            <p className="text-sm text-slate-600">Search, filter, adjust levels, suspend, or soft-delete customers.</p>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>Back</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" />
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

        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row._id}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{row.name}</p>
                  <p className="text-sm text-slate-600">{row.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{row.loyaltyLevel || "Bronze"}</Badge>
                    <Badge variant="outline">{row.points || 0} pts</Badge>
                    <Badge variant="outline">EUR {(row.moneySpent || 0).toLocaleString()}</Badge>
                    <Badge variant="outline">{row.accountStatus || "active"}</Badge>
                    <Badge variant="outline">{row.location?.country || row.companyAddress?.country || "No country"}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
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
                  <Button
                    variant="destructive"
                    disabled={patching === row._id}
                    onClick={() => {
                      if (!window.confirm(`Delete customer ${row.name || row.email}? This can be reversed only through admin recovery tools.`)) {
                        return
                      }
                      void patchCustomer(row._id, { action: "delete" })
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
