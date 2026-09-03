'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { useChatPolling } from "@/hooks/useChatPolling"
import { setAdminActiveConversationId, markAdminConversationSeen } from "@/hooks/useAdminUnreadCount"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw, Send, Lock, MessageSquare, Search } from "lucide-react"
import { toast } from "sonner"
import AdminSupportInfoPanel from "@/components/admin/AdminSupportInfoPanel"

interface AdminConversation {
  _id: string
  type: string
  status: string
  supportTargetUserId?: { _id: string; name?: string; email?: string }
  supportAdminId?: { _id: string; name?: string; email?: string }
  customerId?: { _id: string; name?: string; email?: string }
  professionalId?: { _id: string; name?: string; email?: string }
}

interface AdminConversationListItem {
  _id: string
  supportTargetUserId?: { _id: string; name?: string; email?: string }
  supportAdminId?: { _id: string; name?: string; email?: string } | null
  lastMessagePreview?: string
  lastMessageAt?: string | null
  awaitingReply?: boolean
}

interface AdminMessage {
  _id: string
  text: string
  senderRole: string
  senderId?: { _id: string; name?: string; email?: string } | string
  createdAt: string
}

type InboxFilter = 'all' | 'mine'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL

function AdminChatInner() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryConversationId = searchParams?.get("conversationId") || ""

  const [selectedId, setSelectedId] = useState<string>(queryConversationId)
  const conversationId = selectedId

  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all')
  const [inboxSearchInput, setInboxSearchInput] = useState("")
  const [inboxSearch, setInboxSearch] = useState("")
  const [inboxPage, setInboxPage] = useState(1)
  const [inboxTotal, setInboxTotal] = useState(0)
  const [conversations, setConversations] = useState<AdminConversationListItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [conversation, setConversation] = useState<AdminConversation | null>(null)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const selectedIdRef = useRef<string>(selectedId)
  const inboxRequestIdRef = useRef(0)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  useEffect(() => {
    setSelectedId(queryConversationId)
  }, [queryConversationId])

  const loadConversations = useCallback(async (silent = false) => {
    const requestId = ++inboxRequestIdRef.current
    if (!silent) setListLoading(true)
    try {
      const qs = new URLSearchParams({
        page: String(inboxPage),
        limit: '20',
      })
      if (inboxFilter === 'mine') qs.set('mine', 'true')
      if (inboxSearch) qs.set('q', inboxSearch)
      const res = await authFetch(`${BACKEND}/api/admin/conversations?${qs}`)
      const json = await res.json()
      if (requestId !== inboxRequestIdRef.current) return
      if (!res.ok || !json?.success) {
        throw new Error(json?.msg || "Failed to load conversations")
      }
      const nextTotal = Math.max(0, Number(json.data?.total) || 0)
      const lastPage = Math.max(1, Math.ceil(nextTotal / 20))
      setInboxTotal(nextTotal)
      if (inboxPage > lastPage) {
        setInboxPage(lastPage)
        return
      }
      setConversations(Array.isArray(json.data?.items) ? json.data.items : [])
    } catch {
      if (!silent && requestId === inboxRequestIdRef.current) {
        toast.error("Failed to load conversations")
      }
    } finally {
      // Always clear when this request is latest — a silent poll can supersede a
      // slow initial load and must not leave the spinner stuck.
      if (requestId === inboxRequestIdRef.current) {
        setListLoading(false)
      }
    }
  }, [inboxFilter, inboxPage, inboxSearch])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInboxSearch(inboxSearchInput.trim())
      setInboxPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [inboxSearchInput])

  const load = useCallback(async (silent = false) => {
    if (!conversationId) {
      setIsLoading(false)
      return
    }
    if (!silent) {
      setIsLoading(true)
      setLoadError(null)
    }
    try {
      const [convRes, msgRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/conversations/${conversationId}`),
        authFetch(`${BACKEND}/api/admin/conversations/${conversationId}/messages?limit=100`),
      ])
      const convJson = await convRes.json()
      const msgJson = await msgRes.json()
      if (conversationId !== selectedIdRef.current) return
      if (!convRes.ok || !convJson?.success) {
        throw new Error(convJson?.msg || "Failed to load conversation")
      }
      if (!msgRes.ok || !msgJson?.success) {
        throw new Error(msgJson?.msg || "Failed to load messages")
      }
      setConversation(convJson.data)
      const items = Array.isArray(msgJson.data?.items) ? msgJson.data.items : []
      setMessages(items)
      markAdminConversationSeen(conversationId)
      setLoadError(null)
    } catch {
      if (!silent) {
        toast.error("Failed to load conversation")
        setLoadError("Failed to load conversation. Please try again.")
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    if (user?.role === 'admin' && conversationId) {
      setAdminActiveConversationId(conversationId)
    }
  }, [user, conversationId])

  useEffect(() => {
    if (user?.role === 'admin') loadConversations()
  }, [user, loadConversations])

  useEffect(() => {
    if (user?.role === 'admin') load()
  }, [user, load])

  const pollMessages = useCallback(() => load(true), [load])
  const pollConversations = useCallback(() => loadConversations(true), [loadConversations])

  useChatPolling(pollMessages, 6000, user?.role === 'admin' && !!conversationId, [conversationId])
  useChatPolling(pollConversations, 15000, user?.role === 'admin')

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    if (messages.length === 0) {
      lastMessageIdRef.current = null
      return
    }
    const lastId = messages[messages.length - 1]._id
    if (lastId === lastMessageIdRef.current) return
    const isFirstLoad = lastMessageIdRef.current === null
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
    lastMessageIdRef.current = lastId
    if (isFirstLoad || nearBottom) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

  const selectConversation = (id: string) => {
    if (id === selectedId) return
    setSelectedId(id)
    setConversation(null)
    setMessages([])
    router.replace(`/admin/chat?conversationId=${id}`)
  }

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed || !conversationId) return
    if (!conversation || conversation.type === 'direct' || conversation.status === 'archived') {
      toast.error('Cannot reply to this conversation')
      return
    }
    setSending(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/conversations/${conversationId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.msg || "Failed to send")
        return
      }
      setText("")
      await load()
      await loadConversations(true)
    } catch {
      toast.error("Failed to send")
    } finally {
      setSending(false)
    }
  }

  const closeChat = async () => {
    if (!conversationId) return
    if (!window.confirm("Close this support chat? The user will no longer be able to reply.")) return
    setClosing(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/conversations/${conversationId}/close`, { method: "POST" })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        toast.error(json?.msg || "Failed to close chat")
        return
      }
      toast.success("Support chat closed")
      await load()
      await loadConversations(true)
    } catch {
      toast.error("Failed to close chat")
    } finally {
      setClosing(false)
    }
  }

  if (loading || !user || user.role !== 'admin') return null

  const isDirect = conversation?.type === 'direct'
  const isClosed = conversation?.status === "archived"
  const target = conversation?.supportTargetUserId
  const customer = conversation?.customerId
  const professional = conversation?.professionalId

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto pt-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Support chat
          </h1>
          <Button variant="outline" size="sm" onClick={() => { load(); loadConversations() }} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[280px_1fr_280px] gap-4">
          <Card className="h-[70vh] overflow-hidden">
            <CardContent className="p-0 h-full overflow-y-auto">
              <div className="border-b px-4 py-3 space-y-2">
                <div className="text-sm font-semibold text-gray-700">Inbox</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={inboxSearchInput}
                    onChange={(e) => setInboxSearchInput(e.target.value)}
                    placeholder="Search name, email, username, phone…"
                    className="h-8 pl-8 text-sm"
                    aria-label="Search support inbox"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={inboxFilter === 'all' ? 'default' : 'outline'}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => {
                      setInboxFilter('all')
                      setInboxPage(1)
                    }}
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={inboxFilter === 'mine' ? 'default' : 'outline'}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => {
                      setInboxFilter('mine')
                      setInboxPage(1)
                    }}
                  >
                    Mine
                  </Button>
                </div>
              </div>
              {listLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : conversations.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No support conversations.</p>
              ) : (
                <ul className="divide-y">
                  {conversations.map((c) => {
                    const u = c.supportTargetUserId
                    const assignee = c.supportAdminId
                    const active = c._id === conversationId
                    return (
                      <li key={c._id}>
                        <button
                          type="button"
                          onClick={() => selectConversation(c._id)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${active ? 'bg-indigo-50' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {u?.name || u?.email || "User"}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {c.lastMessageAt && (
                                <span className="text-[10px] text-gray-400">
                                  {new Date(c.lastMessageAt).toLocaleDateString()}
                                </span>
                              )}
                              {c.awaitingReply && (
                                <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" aria-label="Awaiting reply" />
                              )}
                            </div>
                          </div>
                          {assignee?.name || assignee?.email ? (
                            <p className="mt-0.5 text-[11px] text-gray-500 truncate">
                              Assigned: {assignee.name || assignee.email}
                            </p>
                          ) : null}
                          <p className={`mt-0.5 text-xs truncate ${c.awaitingReply ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                            {c.lastMessagePreview || "No messages yet."}
                          </p>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {(inboxTotal > 20 || inboxPage > 1) && (
                <div className="sticky bottom-0 flex items-center justify-between border-t bg-white px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={inboxPage <= 1 || listLoading}
                    onClick={() => setInboxPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-gray-500">
                    {inboxPage} / {Math.max(1, Math.ceil(inboxTotal / 20))}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={inboxPage >= Math.max(1, Math.ceil(inboxTotal / 20)) || listLoading}
                    onClick={() =>
                      setInboxPage((current) =>
                        Math.min(Math.max(1, Math.ceil(inboxTotal / 20)), current + 1),
                      )
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {isDirect ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-gray-500">
                  Customer: {customer?.name || customer?.email || "—"}
                  {customer?.email && customer?.name ? ` (${customer.email})` : ""}
                  {" · "}
                  Professional: {professional?.name || professional?.email || "—"}
                  {professional?.email && professional?.name ? ` (${professional.email})` : ""}
                </p>
                <Badge variant="secondary" className="text-xs">
                  Read-only — customer↔professional thread
                </Badge>
              </div>
            ) : target ? (
              <p className="text-sm text-gray-500">
                With {target.name || target.email || "user"} {target.email ? `(${target.email})` : ""}
              </p>
            ) : null}

            {loadError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loadError}
              </div>
            )}

            {!conversationId ? (
              <Card><CardContent className="py-12 text-center text-gray-500">No conversation selected.</CardContent></Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="flex items-center justify-end border-b p-2">
                    {!isDirect && !isClosed && conversation && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={closeChat}
                        disabled={closing}
                        aria-label="Close support chat"
                      >
                        {closing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                        Close chat
                      </Button>
                    )}
                  </div>
                  <div ref={messagesContainerRef} className="h-[55vh] overflow-y-auto p-4 space-y-3">
                    {isLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                    ) : messages.length === 0 ? (
                      <p className="text-center text-gray-400 py-8">No messages yet.</p>
                    ) : (
                      messages.map((m) => {
                        if (m.senderRole === "system") {
                          return (
                            <div key={m._id} className="flex justify-center">
                              <p className="max-w-[90%] rounded-full bg-gray-100 px-3 py-1 text-center text-xs text-gray-600">
                                {m.text}
                                <span className="mt-0.5 block text-[10px] text-gray-400">
                                  {new Date(m.createdAt).toLocaleString()}
                                </span>
                              </p>
                            </div>
                          )
                        }
                        const mine = m.senderRole === 'admin'
                        return (
                          <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                              <p className="whitespace-pre-wrap break-words">{m.text}</p>
                              <p className={`mt-1 text-[10px] ${mine ? 'text-indigo-100' : 'text-gray-400'}`}>
                                {m.senderRole} · {new Date(m.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                  <div className="border-t p-3">
                    {!conversation ? (
                      <p className="text-center text-sm text-gray-400">Loading conversation…</p>
                    ) : isDirect ? (
                      <p className="text-center text-sm text-gray-400 flex items-center justify-center gap-1">
                        <Lock className="h-4 w-4" /> Read-only — you cannot reply to customer↔professional threads.
                      </p>
                    ) : isClosed ? (
                      <p className="text-center text-sm text-gray-400 flex items-center justify-center gap-1">
                        <Lock className="h-4 w-4" /> This support chat is closed.
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                          placeholder="Type a message…"
                          disabled={sending}
                        />
                        <Button onClick={send} disabled={sending || !text.trim()}>
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="order-3 mt-4 lg:col-span-2 xl:order-none xl:col-span-1 xl:col-start-3 xl:mt-0">
            <AdminSupportInfoPanel conversationId={conversationId} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminChatPage() {
  return (
    <Suspense fallback={null}>
      <AdminChatInner />
    </Suspense>
  )
}
