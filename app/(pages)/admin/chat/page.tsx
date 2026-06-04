'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { authFetch } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, RefreshCw, Send, Lock, MessageSquare } from "lucide-react"
import { toast } from "sonner"

interface AdminConversation {
  _id: string
  type: string
  status: string
  supportTargetUserId?: { _id: string; name?: string; email?: string }
  supportAdminId?: { _id: string; name?: string; email?: string }
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

  const [conversation, setConversation] = useState<AdminConversation | null>(null)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const load = useCallback(async () => {
    if (!conversationId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const [convRes, msgRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/conversations/${conversationId}`),
        authFetch(`${BACKEND}/api/admin/conversations/${conversationId}/messages?limit=100`),
      ])
      const convJson = await convRes.json()
      const msgJson = await msgRes.json()
      if (convJson?.success) setConversation(convJson.data)
      if (msgJson?.success) setMessages(Array.isArray(msgJson.data?.items) ? msgJson.data.items : [])
    } catch {
      toast.error("Failed to load conversation")
    } finally {
      setIsLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    if (user?.role === 'admin') load()
  }, [user, load])

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
    } catch {
      toast.error("Failed to close chat")
    } finally {
      setClosing(false)
    }
  }

  if (loading || !user || user.role !== 'admin') return null

  const target = conversation?.supportTargetUserId
  const isClosed = conversation?.status === "archived"

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto pt-20 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Support chat
            </h1>
            {target && (
              <p className="text-sm text-gray-500">
                With {target.name || target.email || "user"} {target.email ? `(${target.email})` : ""}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {!isClosed && conversation && (
              <Button variant="outline" size="sm" onClick={closeChat} disabled={closing}>
                {closing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                Close chat
              </Button>
            )}
          </div>
        </div>

        {!conversationId ? (
          <Card><CardContent className="py-12 text-center text-gray-500">No conversation selected.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="h-[60vh] overflow-y-auto p-4 space-y-3">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No messages yet.</p>
                ) : (
                  messages.map((m) => {
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
                <div ref={endRef} />
              </div>
              <div className="border-t p-3">
                {isClosed ? (
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
