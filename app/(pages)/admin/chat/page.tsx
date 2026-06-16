'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch, cn } from "@/lib/utils"
import { useChatPolling } from "@/hooks/useChatPolling"
import { setAdminActiveConversationId, markAdminConversationSeen } from "@/hooks/useAdminUnreadCount"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw, Send, Lock, MessageSquare, Search, ArrowLeft, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

interface AdminConversation {
  _id: string
  type: string
  status: string
  supportTargetUserId?: { _id: string; name?: string; email?: string; role?: string; profileImage?: string }
  supportAdminId?: { _id: string; name?: string; email?: string; profileImage?: string }
  lastMessageAt?: string
  lastMessagePreview?: string
  professionalUnreadCount: number
  customerUnreadCount: number
}

interface AdminMessage {
  _id: string
  text: string
  senderRole: string
  senderId?: { _id: string; name?: string; email?: string } | string
  createdAt: string
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL

function AdminChatInner() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const conversationId = searchParams?.get("conversationId") || ""

  const [conversations, setConversations] = useState<AdminConversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [conversation, setConversation] = useState<AdminConversation | null>(null)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.title = "Support Chats | Fixera Admin"
    }
  }, [])

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoadingConversations(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/conversations?limit=100`)
      const json = await res.json()
      if (json?.success && Array.isArray(json.data?.conversations)) {
        setConversations(json.data.conversations)
      }
    } catch (err) {
      console.error("Failed to load conversations", err)
      if (!silent) {
        toast.error("Failed to load conversations list")
      }
    } finally {
      if (!silent) setLoadingConversations(false)
    }
  }, [])

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
      if (convJson?.success) setConversation(convJson.data)
      if (msgJson?.success) {
        const items = Array.isArray(msgJson.data?.items) ? msgJson.data.items : []
        setMessages(items)
        markAdminConversationSeen(conversationId)
      }
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
    if (user?.role === 'admin') {
      loadConversations()
    }
  }, [user, loadConversations])

  useEffect(() => {
    if (user?.role === 'admin') {
      load()
    }
  }, [user, load])

  const pollAll = useCallback(() => {
    void loadConversations(true)
    if (conversationId) void load(true)
  }, [loadConversations, load, conversationId])

  useChatPolling(pollAll, 5000, user?.role === 'admin', [conversationId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed || !conversationId) return
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

  const target = conversation?.supportTargetUserId
  const isClosed = conversation?.status === "archived"

  // Filtering conversations based on search
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const name = c.supportTargetUserId?.name || ""
    const email = c.supportTargetUserId?.email || ""
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q)
  })

  return (
    <div className="h-[calc(100vh-64px)] mt-16 flex bg-slate-50 overflow-hidden font-sans">
      {/* Left Pane - Sidebar with Conversation List */}
      <div className={cn(
        "w-full md:w-80 md:min-w-[320px] flex flex-col border-r border-slate-200 bg-white shrink-0 transition-all duration-300",
        conversationId ? "hidden md:flex" : "flex"
      )}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
              <h1 className="text-lg font-semibold text-slate-800">Support Chats</h1>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Sidebar Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingConversations && conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <p className="text-xs text-slate-400">Loading support conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No support conversations found.
            </div>
          ) : (
            filteredConversations.map((c) => {
              const active = c._id === conversationId
              const tUser = c.supportTargetUserId
              const name = tUser?.name || tUser?.email || "Support User"
              const initial = name.charAt(0).toUpperCase()
              
              // Determine if unread. Last message is sent by target user and admin unread count could be calculated.
              // We check if professionalUnreadCount > 0, which backend increments when target sends a message.
              const isUnreadForAdmin = c.professionalUnreadCount > 0

              return (
                <div
                  key={c._id}
                  onClick={() => router.push(`/admin/chat?conversationId=${c._id}`)}
                  className={cn(
                    "flex items-start gap-3 p-3.5 cursor-pointer hover:bg-slate-50 transition-colors relative",
                    active ? "bg-indigo-50/70 hover:bg-indigo-50/70 border-l-4 border-indigo-600 pl-2.5" : "pl-3.5"
                  )}
                >
                  {/* User Avatar */}
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center overflow-hidden shrink-0 border border-slate-100 shadow-sm font-semibold text-sm",
                    active ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white" : "bg-slate-100 text-slate-600"
                  )}>
                    {tUser?.profileImage ? (
                      <img src={tUser.profileImage} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial
                    )}
                  </div>

                  {/* Conversation Details */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        "text-sm font-medium truncate text-slate-800",
                        isUnreadForAdmin && "font-bold text-slate-900"
                      )}>
                        {name}
                      </p>
                      {c.lastMessageAt && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(c.lastMessageAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tUser?.role && (
                        <span className={cn(
                          "text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded",
                          tUser.role === "professional" 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                            : "bg-blue-50 text-blue-700 border border-blue-100"
                        )}>
                          {tUser.role}
                        </span>
                      )}
                      {c.status === "archived" && (
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                          Closed
                        </span>
                      )}
                    </div>

                    <p className={cn(
                      "text-xs truncate text-slate-500",
                      isUnreadForAdmin && "font-semibold text-slate-800"
                    )}>
                      {c.lastMessagePreview || "No messages yet"}
                    </p>
                  </div>

                  {/* Unread indicator */}
                  {isUnreadForAdmin && (
                    <span className="absolute right-3.5 bottom-3.5 h-2.5 w-2.5 rounded-full bg-indigo-600 shadow-sm shadow-indigo-600/30" />
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right Pane - Chat Window / Messages */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 bg-slate-50",
        !conversationId ? "hidden md:flex items-center justify-center p-8 text-center" : "flex"
      )}>
        {!conversationId ? (
          <div className="max-w-md space-y-4">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto text-indigo-600 border border-indigo-100/50">
              <MessageSquare className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-800">Support Workspace</h2>
              <p className="text-sm text-slate-500 max-w-sm">
                Select a customer or professional support chat from the sidebar to view messages and respond.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="md:hidden p-1 rounded hover:bg-slate-100 mr-1"
                  onClick={() => router.push('/admin/chat')}
                  aria-label="Back to conversations list"
                >
                  <ArrowLeft className="h-5 w-5 text-slate-600" />
                </button>
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center overflow-hidden shrink-0 font-semibold text-sm border border-indigo-100">
                  {target?.profileImage ? (
                    <img src={target.profileImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    target?.name?.charAt(0).toUpperCase() || target?.email?.charAt(0).toUpperCase() || "S"
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                    {target?.name || target?.email || "Support User"}
                    {target?.role && (
                      <span className={cn(
                        "text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded",
                        target.role === "professional" 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                          : "bg-blue-50 text-blue-700 border border-blue-100"
                      )}>
                        {target.role}
                      </span>
                    )}
                  </h2>
                  {target?.email && (
                    <p className="text-[10px] text-slate-400 truncate">{target.email}</p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => load()} 
                  disabled={isLoading}
                  className="h-8 text-xs bg-white text-slate-600 border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
                  Refresh
                </Button>
                {!isClosed && conversation && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={closeChat}
                    disabled={closing}
                    className="h-8 text-xs font-medium bg-rose-600 hover:bg-rose-700 transition-colors"
                    aria-label="Close support chat"
                  >
                    {closing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Lock className="h-3.5 w-3.5 mr-1.5" />}
                    Close chat
                  </Button>
                )}
              </div>
            </div>

            {/* Error notifications */}
            {loadError && (
              <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{loadError}</span>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60">
              {isLoading && messages.length === 0 ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center text-slate-400 text-xs py-12">No messages in this conversation yet.</div>
              ) : (
                messages.map((m) => {
                  const mine = m.senderRole === 'admin'
                  return (
                    <div key={m._id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm text-sm border",
                        mine 
                          ? "bg-indigo-600 text-white border-indigo-700 rounded-br-none" 
                          : "bg-white text-slate-800 border-slate-100 rounded-bl-none"
                      )}>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                        <p className={cn(
                          "mt-1.5 text-[9px] flex items-center justify-between gap-4 font-medium",
                          mine ? "text-indigo-200" : "text-slate-400"
                        )}>
                          <span className="capitalize">{m.senderRole}</span>
                          <span>{new Date(m.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Input Composer Footer */}
            <div className="p-4 border-t border-slate-200 bg-white">
              {isClosed ? (
                <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded-lg">
                  <Lock className="h-3.5 w-3.5" /> 
                  <span>This support chat has been resolved and closed.</span>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="Type a message to reply…"
                    disabled={sending}
                    className="flex-1 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-indigo-500"
                  />
                  <Button 
                    onClick={send} 
                    disabled={sending || !text.trim()}
                    className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/10 px-4"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
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
