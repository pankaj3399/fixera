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

interface ProfessionalRow {
  _id: string
  name: string
  email: string
  professionalLevel?: string
  points?: number
  moneyEarned?: number
  accountStatus?: string
  adminTags?: string[]
  businessInfo?: { companyName?: string; country?: string }
}

export default function AdminProfessionalManagementPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<ProfessionalRow[]>([])
  const [search, setSearch] = useState("")
  const [country, setCountry] = useState("all")
  const [level, setLevel] = useState("all")
  const [tag, setTag] = useState("")
  const abortRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)

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
      if (tag.trim()) params.set("tags", tag.trim())
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professionals/manage?${params.toString()}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      })
      let payload: { success?: boolean; msg?: string; data?: { professionals?: ProfessionalRow[] } } | null = null
      try {
        payload = await response.json()
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to parse professionals response:", error)
        }
      }
      const isLatestRequest = requestId === loadRequestIdRef.current
      if (!controller.signal.aborted && isLatestRequest && response.ok && payload?.success) {
        setRows(payload.data?.professionals || [])
        return
      }
      if (!controller.signal.aborted && isLatestRequest && !response.ok) {
        console.error("Failed to load professionals:", payload?.msg || `Request failed with status ${response.status}`)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.error("Failed to load professionals:", error)
    }
  }, [country, level, search, tag])

  const patchProfessional = async (professionalId: string, body: Record<string, unknown>) => {
    try {
      const token = getAuthToken()
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/professionals/manage/${professionalId}`, {
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
        console.error("Failed to parse professional patch response:", error)
      }
      if (!response.ok || !payload?.success) {
        console.error("Failed to patch professional:", payload?.msg || `Request failed with status ${response.status}`)
        return
      }
      await load()
    } catch (error) {
      console.error("Failed to patch professional:", error)
    }
  }

  useEffect(() => {
    if (user?.role !== "admin") return
    void load()
    return () => {
      abortRef.current?.abort()
    }
  }, [load, user])

  if (user?.role !== "admin") return null

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-7xl pt-20 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Professional Management</h1>
            <p className="text-sm text-slate-600">Search, filter, adjust levels, apply tags, and manage account status.</p>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>Back</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or company" />
            <Input value={country === "all" ? "" : country} onChange={(e) => setCountry(e.target.value || "all")} placeholder="Country" />
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                {["all", "New", "Level 1", "Level 2", "Level 3", "Expert"].map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag (our choice, verified)" />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row._id}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{row.businessInfo?.companyName || row.name}</p>
                  <p className="text-sm text-slate-600">{row.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{row.professionalLevel || "New"}</Badge>
                    <Badge variant="outline">{row.points || 0} pts</Badge>
                    <Badge variant="outline">EUR {(row.moneyEarned || 0).toLocaleString()}</Badge>
                    <Badge variant="outline">{row.accountStatus || "active"}</Badge>
                    <Badge variant="outline">{row.businessInfo?.country || "No country"}</Badge>
                    {(row.adminTags || []).map((item) => <Badge key={item}>{item}</Badge>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select onValueChange={(value) => void patchProfessional(row._id, { professionalLevel: value })}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Adjust level" /></SelectTrigger>
                    <SelectContent>
                      {["New", "Level 1", "Level 2", "Level 3", "Expert"].map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => void patchProfessional(row._id, { tags: Array.from(new Set([...(row.adminTags || []), "verified"])) })}
                  >
                    Verified
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void patchProfessional(row._id, { tags: Array.from(new Set([...(row.adminTags || []), "our choice"])) })}
                  >
                    Our Choice
                  </Button>
                  <Button variant="outline" onClick={() => void patchProfessional(row._id, { action: row.accountStatus === "suspended" ? "reactivate" : "suspend" })}>
                    {row.accountStatus === "suspended" ? "Reactivate" : "Suspend"}
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
