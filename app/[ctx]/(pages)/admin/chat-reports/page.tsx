'use client'

import { messageFromApiBody } from '@/lib/apiErrors';

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertOctagon, Ban, MessageSquare, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react"
import { toast } from "sonner"

interface ChatReportSummary {
  _id: string
  reason: string
  description?: string
  status: 'pending' | 'reviewed' | 'dismissed'
  createdAt: string
  reportedBy?: { _id: string; name?: string; email?: string }
  messageId?: { _id: string; text?: string; senderId?: string; senderRole?: string; createdAt?: string }
  conversationId?: {
    _id: string
    type?: 'direct' | 'support'
    customerId?: { _id: string; name?: string; email?: string }
    professionalId?: { _id: string; name?: string; email?: string }
  }
}

interface SurroundingMessage {
  _id: string
  text?: string
  senderRole?: string
  createdAt: string
  senderId?: { name?: string; email?: string }
}

type StatusFilter = 'all' | 'pending' | 'reviewed' | 'dismissed'

export default function AdminChatReportsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [items, setItems] = useState<ChatReportSummary[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [page, setPage] = useState(1)
  const limit = 20

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerReport, setDrawerReport] = useState<ChatReportSummary | null>(null)
  const [drawerMessages, setDrawerMessages] = useState<SurroundingMessage[]>([])
  const [resolveAction, setResolveAction] = useState<'warn' | 'ban' | 'dismiss'>('warn')
  const [resolveNotes, setResolveNotes] = useState('')
  const [resolving, setResolving] = useState(false)
  const latestFetchIdRef = useRef(0)
  const drawerFetchIdRef = useRef(0)

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const fetchReports = useCallback(async () => {
    const fetchId = latestFetchIdRef.current + 1
    latestFetchIdRef.current = fetchId
    setIsLoading(true)
    let clamped = false
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/chat-reports?${params}`)
      const json = await res.json()
      if (latestFetchIdRef.current !== fetchId) return
      if (json.success) {
        const newTotal = json.data.total as number
        const maxPage = Math.max(1, Math.ceil(newTotal / limit))
        if (page > maxPage) {
          clamped = true
          setPage(maxPage)
          setTotal(newTotal)
        } else {
          setItems(json.data.items)
          setTotal(newTotal)
        }
      } else {
        toast.error('Failed to load chat reports')
      }
    } catch {
      if (latestFetchIdRef.current !== fetchId) return
      toast.error('Failed to load chat reports')
    } finally {
      if (!clamped && latestFetchIdRef.current === fetchId) {
        setIsLoading(false)
      }
    }
  }, [page, statusFilter])

  useEffect(() => {
    if (user?.role === 'admin') fetchReports()
  }, [user, fetchReports])

  const openDrawer = async (report: ChatReportSummary) => {
    setDrawerReport(report)
    setDrawerOpen(true)
    setDrawerLoading(true)
    setDrawerMessages([])
    setResolveAction('warn')
    setResolveNotes('')
    const fetchId = drawerFetchIdRef.current + 1
    drawerFetchIdRef.current = fetchId
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/chat-reports/${report._id}`)
      const json = await res.json()
      if (drawerFetchIdRef.current !== fetchId) return
      if (json.success) {
        setDrawerMessages(json.data.surroundingMessages || [])
      } else {
        toast.error('Failed to load conversation context')
      }
    } catch {
      if (drawerFetchIdRef.current !== fetchId) return
      toast.error('Failed to load conversation context')
    } finally {
      if (drawerFetchIdRef.current === fetchId) {
        setDrawerLoading(false)
      }
    }
  }

  const handleResolve = async () => {
    if (!drawerReport) return
    if ((resolveAction === 'ban') && !resolveNotes.trim()) {
      toast.error('Please provide a ban reason')
      return
    }
    const currentId = drawerReport._id
    setResolving(true)
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/chat-reports/${currentId}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: resolveAction, notes: resolveNotes.trim() || undefined }),
        }
      )
      const json = await res.json()
      if (json.success) {
        toast.success(`Report ${resolveAction === 'dismiss' ? 'dismissed' : 'resolved'}`)
        setDrawerReport((current) => {
          if (current?._id === currentId) {
            setDrawerOpen(false)
            return null
          }
          return current
        })
        fetchReports()
      } else {
        toast.error(messageFromApiBody(json, 'Failed to resolve report'))
      }
    } catch {
      toast.error('Failed to resolve report')
    } finally {
      setResolving(false)
    }
  }

  if (loading || !user || user.role !== 'admin') return null
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto pt-20 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <AlertOctagon className="h-6 w-6" />
              Reported Chats
            </h1>
            <p className="text-sm text-gray-500 mt-1">Review reported chat messages and take moderation action</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchReports}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(value: StatusFilter) => { setStatusFilter(value); setPage(1) }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldCheck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No chat reports found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item._id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={
                            item.status === 'pending' ? 'destructive' : item.status === 'reviewed' ? 'default' : 'secondary'
                          }
                          className="text-xs"
                        >
                          {item.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{item.reason}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">
                        Reported by: {item.reportedBy?.name || item.reportedBy?.email || 'Unknown'}
                        {' | '}
                        Customer: {item.conversationId?.customerId?.name || '—'}
                        {' / '}
                        Professional: {item.conversationId?.professionalId?.name || '—'}
                      </p>
                      {item.messageId?.text && (
                        <p className="text-sm text-gray-800 mt-1 italic">
                          “{item.messageId.text.slice(0, 200)}{item.messageId.text.length > 200 ? '…' : ''}”
                        </p>
                      )}
                      {item.description && (
                        <p className="text-xs text-gray-500">Reporter notes: {item.description}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      <p className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</p>
                      <Button size="sm" className="h-7 text-xs" onClick={() => openDrawer(item)}>
                        Review
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-sm text-gray-500 self-center">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={drawerOpen} onOpenChange={(open) => { if (!open) { setDrawerOpen(false); setDrawerReport(null) } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Reported Message Context</DialogTitle>
            <DialogDescription>
              Read the conversation around the reported message before taking action.
            </DialogDescription>
          </DialogHeader>
          {drawerLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-h-72 overflow-y-auto border rounded p-3 bg-gray-50 space-y-2">
                {drawerMessages.length === 0 ? (
                  <p className="text-xs text-gray-500">No surrounding messages.</p>
                ) : (
                  drawerMessages.map((m) => (
                    <div key={m._id} className="text-xs text-gray-800">
                      <span className="font-semibold">
                        {m.senderId?.name || m.senderId?.email || 'Unknown'} ({m.senderRole}):
                      </span>{' '}
                      <span className={m._id === drawerReport?.messageId?._id ? 'bg-yellow-100 px-1 rounded' : ''}>
                        {m.text || '[no text]'}
                      </span>
                      <span className="text-gray-400 ml-2">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={resolveAction}
                  onValueChange={(value: string) => setResolveAction(value as 'warn' | 'ban' | 'dismiss')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">Warn (post system message)</SelectItem>
                    <SelectItem value="ban">Ban reported user</SelectItem>
                    <SelectItem value="dismiss">Dismiss report</SelectItem>
                  </SelectContent>
                </Select>
                <Label htmlFor="resolve-notes">Notes</Label>
                <Textarea
                  id="resolve-notes"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={resolveAction === 'ban' ? 'Reason for ban (will be saved as suspension reason)' : 'Optional notes'}
                />
              </div>

              <div className="flex justify-end gap-2 flex-wrap">
                {drawerReport?.conversationId?._id && (
                  <Button variant="outline" asChild>
                    <a
                      href={`/admin/chat?conversationId=${drawerReport.conversationId._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Open full thread
                    </a>
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setDrawerOpen(false); setDrawerReport(null) }}>
                  Cancel
                </Button>
                <Button onClick={handleResolve} disabled={resolving}>
                  {resolveAction === 'ban' ? <Ban className="h-4 w-4 mr-1" /> : resolveAction === 'warn' ? <MessageSquare className="h-4 w-4 mr-1" /> : <ShieldOff className="h-4 w-4 mr-1" />}
                  {resolving ? 'Working…' : `Resolve (${resolveAction})`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
