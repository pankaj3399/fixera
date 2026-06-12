"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, LifeBuoy, CalendarClock, MessageCircle, Send, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  proCreateMeetingRequest,
  proCreateTicket,
  proListMyMeetingRequests,
  proListMyTickets,
  proReplyTicket,
  SupportTicket,
  MeetingRequest,
} from "@/lib/support";
import {
  fetchConversations,
  fetchConversationMessages,
  sendConversationMessage,
  markConversationAsRead,
} from "@/lib/chatApi";
import type { ChatConversation, ChatMessage } from "@/types/chat";

type Tab = "ticket" | "meeting" | "chat";

export default function ProfessionalSupportPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ticket");

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace("/login?redirect=/professional/support");
    } else if (user?.role !== "professional") {
      router.replace("/dashboard");
    }
  }, [user, isAuthenticated, loading, router]);

  if (loading || !isAuthenticated || user?.role !== "professional") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-indigo-50 via-blue-50 to-white">
        <Loader2 className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-white pb-16">
      <div className="mx-auto max-w-4xl px-6 pt-24">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-200 via-blue-200 to-cyan-200 p-[1.5px] shadow-md">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-white px-8 py-8">
            <h1 className="text-3xl font-bold text-indigo-900">Professional Support</h1>
            <p className="mt-1 text-sm text-indigo-600/80">Open a ticket, request a meeting, or chat with us.</p>
          </div>
        </div>

        <div role="tablist" aria-label="Support sections" className="mt-6 flex flex-wrap gap-2">
          <TabButton
            id="ticket-tab"
            controls="ticket-panel"
            active={tab === "ticket"}
            onClick={() => setTab("ticket")}
            icon={<LifeBuoy size={14} />}
          >
            Create ticket
          </TabButton>
          <TabButton
            id="meeting-tab"
            controls="meeting-panel"
            active={tab === "meeting"}
            onClick={() => setTab("meeting")}
            icon={<CalendarClock size={14} />}
          >
            Plan a meeting
          </TabButton>
          <TabButton
            id="chat-tab"
            controls="chat-panel"
            active={tab === "chat"}
            onClick={() => setTab("chat")}
            icon={<MessageCircle size={14} />}
          >
            Chat
          </TabButton>
        </div>

        {tab === "ticket" && (
          <div role="tabpanel" id="ticket-panel" aria-labelledby="ticket-tab" className="mt-6">
            <TicketsTab />
          </div>
        )}
        {tab === "meeting" && (
          <div role="tabpanel" id="meeting-panel" aria-labelledby="meeting-tab" className="mt-6">
            <MeetingsTab />
          </div>
        )}
        {tab === "chat" && (
          <div role="tabpanel" id="chat-panel" aria-labelledby="chat-tab" className="mt-6">
            <SupportChatTab />
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ children, active, onClick, icon, id, controls }: { children: React.ReactNode; active: boolean; onClick: () => void; icon?: React.ReactNode; id?: string; controls?: string }) {
  return (
    <button
      id={id}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-transparent bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-200"
          : "border-indigo-200 bg-white/60 text-indigo-700 hover:bg-indigo-50"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-100 via-blue-100 to-cyan-100 p-[1.5px] shadow-sm">
      <div className="rounded-[calc(1rem-1.5px)] bg-white">{children}</div>
    </div>
  );
}

function TicketsTab() {
  const [items, setItems] = useState<SupportTicket[] | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});

  const load = useCallback(
    () =>
      proListMyTickets()
        .then((next) => setItems(next))
        .catch((e) => {
          setItems((prev) => (prev === null ? [] : prev));
          toast.error(e instanceof Error ? e.message : "Failed to load tickets");
        }),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    setSaving(true);
    try {
      await proCreateTicket({ subject: subject.trim(), description: description.trim() });
      setSubject("");
      setDescription("");
      toast.success("Ticket created");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create ticket");
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async (id: string) => {
    if (replySending[id]) return;
    const body = replyDraft[id]?.trim();
    if (!body) return;
    setReplySending((s) => ({ ...s, [id]: true }));
    try {
      await proReplyTicket(id, body);
      setReplyDraft((d) => ({ ...d, [id]: "" }));
      toast.success("Reply sent");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reply");
    } finally {
      setReplySending((s) => ({ ...s, [id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">New ticket</h2>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Ticket subject"
            maxLength={200}
            className="w-full rounded-xl border border-indigo-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Describe the issue in detail"
            aria-label="Ticket description"
            maxLength={5000}
            className="w-full resize-none rounded-xl border border-indigo-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200"
          />
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:shadow-lg hover:shadow-indigo-300 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} Create ticket
            </button>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-700">Your tickets</h2>
        {items === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-indigo-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-indigo-300 bg-gradient-to-br from-indigo-50 via-blue-50 to-white py-10 text-center text-sm text-indigo-500">
            No tickets yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((t) => (
              <Card key={t._id}>
                <div className="space-y-2 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-indigo-900">{t.subject}</h3>
                    <StatusPill label={t.status} />
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-indigo-800/80">{t.description}</p>
                  {t.replies.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-l-2 border-indigo-200 pl-3">
                      {t.replies.map((r, idx) => (
                        <div key={idx} className="text-xs">
                          <span className={cn("font-semibold", r.authorRole === "admin" ? "text-blue-700" : "text-indigo-700")}>
                            {r.authorRole === "admin" ? "Admin" : "You"}
                          </span>
                          <span className="text-indigo-400"> · {new Date(r.createdAt).toLocaleString()}</span>
                          <div className="whitespace-pre-wrap text-indigo-800/90">{r.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {t.status !== "closed" && (
                    <div className="flex items-center gap-2">
                      <input
                        value={replyDraft[t._id] || ""}
                        onChange={(e) => setReplyDraft((d) => ({ ...d, [t._id]: e.target.value }))}
                        disabled={Boolean(replySending[t._id])}
                        placeholder="Reply…"
                        aria-label={`Reply to ticket ${t.subject}`}
                        className="flex-1 rounded-xl border border-indigo-200 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
                      />
                      <button
                        onClick={() => sendReply(t._id)}
                        disabled={Boolean(replySending[t._id]) || !replyDraft[t._id]?.trim()}
                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {replySending[t._id] ? <Loader2 className="animate-spin" size={12} /> : <Send size={12} />} Send
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingsTab() {
  const [items, setItems] = useState<MeetingRequest[] | null>(null);
  const [topic, setTopic] = useState("");
  const [preferredTimes, setPreferredTimes] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      proListMyMeetingRequests()
        .then((next) => setItems(next))
        .catch((e) => {
          setItems((prev) => (prev === null ? [] : prev));
          toast.error(e instanceof Error ? e.message : "Failed to load requests");
        }),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!topic.trim() || !preferredTimes.trim()) {
      toast.error("Topic and preferred times are required");
      return;
    }
    setSaving(true);
    try {
      await proCreateMeetingRequest({ topic: topic.trim(), preferredTimes: preferredTimes.trim(), durationMinutes });
      setTopic("");
      setPreferredTimes("");
      setDurationMinutes(30);
      toast.success("Meeting request sent");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Request a meeting</h2>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic"
            aria-label="Meeting topic"
            maxLength={200}
            className="w-full rounded-xl border border-indigo-200 bg-white/60 px-4 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200"
          />
          <textarea
            value={preferredTimes}
            onChange={(e) => setPreferredTimes(e.target.value)}
            rows={3}
            placeholder="Preferred dates/times (e.g. 'Mon–Wed morning, any time after 10:00')"
            aria-label="Preferred dates and times"
            maxLength={1000}
            className="w-full resize-none rounded-xl border border-indigo-200 bg-white/60 px-4 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200"
          />
          <div className="flex items-center gap-3">
            <label htmlFor="meeting-duration" className="text-sm text-indigo-700">Duration</label>
            <select
              id="meeting-duration"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:shadow-lg hover:shadow-indigo-300 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <CalendarClock size={14} />} Submit request
            </button>
          </div>
          <p className="text-[11px] text-indigo-400">Admin will confirm with a scheduled time. Availability-based booking is coming soon.</p>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-700">Your requests</h2>
        {items === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-indigo-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-indigo-300 bg-gradient-to-br from-indigo-50 via-blue-50 to-white py-10 text-center text-sm text-indigo-500">
            No meeting requests yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((m) => (
              <Card key={m._id}>
                <div className="space-y-1 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-indigo-900">{m.topic}</h3>
                    <StatusPill label={m.status} />
                  </div>
                  <p className="text-sm text-indigo-700/80">Preferred: {m.preferredTimes}</p>
                  <p className="text-xs text-indigo-500">Duration: {m.durationMinutes} min</p>
                  {m.scheduledAt && (
                    <p className="text-sm font-medium text-emerald-700">Scheduled for: {new Date(m.scheduledAt).toLocaleString()}</p>
                  )}
                  {m.adminResponse && (
                    <div className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                      <span className="font-semibold">Admin: </span>
                      {m.adminResponse}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SUPPORT_POLL_MS = 6000;

function SupportChatTab() {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const shouldStickToBottom = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const findSupportConversation = useCallback(async (): Promise<ChatConversation | null> => {
    const { conversations } = await fetchConversations({ limit: 100 });
    const support = conversations.filter((c) => c.type === "support");
    if (support.length === 0) return null;
    support.sort((a, b) => {
      const at = new Date(a.lastMessageAt || a.updatedAt || a.createdAt).getTime();
      const bt = new Date(b.lastMessageAt || b.updatedAt || b.createdAt).getTime();
      return bt - at;
    });
    return support[0];
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const data = await fetchConversationMessages(conversationId, { limit: 100 });
    setMessages(data.messages);
    setConversation(data.conversation);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const conv = await findSupportConversation();
        if (cancelled) return;
        if (!conv) {
          setConversation(null);
          setLoading(false);
          return;
        }
        conversationIdRef.current = conv._id;
        setConversation(conv);
        await loadMessages(conv._id);
        if (cancelled) return;
        markConversationAsRead(conv._id).catch(() => {});
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load support chat");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    const interval = setInterval(async () => {
      const id = conversationIdRef.current;
      try {
        if (id) {
          await loadMessages(id);
          markConversationAsRead(id).catch(() => {});
        } else {
          const conv = await findSupportConversation();
          if (cancelled || !conv) return;
          conversationIdRef.current = conv._id;
          setConversation(conv);
          await loadMessages(conv._id);
        }
      } catch {
        // transient polling errors are ignored
      }
    }, SUPPORT_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [findSupportConversation, loadMessages]);

  useEffect(() => {
    if (shouldStickToBottom.current) {
      scrollToBottom();
    }
  }, [messages, loading, scrollToBottom]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottom.current = distanceFromBottom < 80;
  };

  const send = async () => {
    const id = conversationIdRef.current;
    const text = draft.trim();
    if (!id || !text || sending) return;
    setSending(true);
    try {
      shouldStickToBottom.current = true;
      await sendConversationMessage(id, { text });
      setDraft("");
      await loadMessages(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-500" />
        </div>
      </Card>
    );
  }

  if (!conversation) {
    return (
      <Card>
        <div className="p-10 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-blue-500 text-white shadow-md shadow-indigo-200">
            <MessageCircle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-indigo-900">No support conversation yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-indigo-600/80">
            Our team will reach out here, or raise a support ticket above and we&apos;ll follow up.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex h-[28rem] flex-col">
        <div className="flex items-center gap-2 border-b border-indigo-100 px-5 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-blue-500 text-white shadow-sm">
            <LifeBuoy size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Fixera Support</p>
            <p className="text-[11px] text-indigo-500">You&apos;re chatting with our support team</p>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-indigo-400">
              No messages yet. Say hello to start the conversation.
            </div>
          ) : (
            messages.map((m) => {
              const fromAdmin = m.senderRole === "admin" || m.senderRole === "system";
              return (
                <div key={m._id} className={cn("flex", fromAdmin ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                      fromAdmin
                        ? "rounded-tl-sm bg-indigo-50 text-indigo-900"
                        : "rounded-tr-sm bg-gradient-to-r from-indigo-500 to-blue-500 text-white"
                    )}
                  >
                    <div className={cn("mb-0.5 text-[10px] font-semibold uppercase tracking-wide", fromAdmin ? "text-indigo-500" : "text-indigo-100")}>
                      {fromAdmin ? "Support" : "You"}
                    </div>
                    {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                    {Array.isArray(m.images) && m.images.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {m.images.map((src, idx) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={idx} src={src} alt="attachment" className="max-h-48 rounded-lg" />
                        ))}
                      </div>
                    )}
                    <div className={cn("mt-1 text-[10px]", fromAdmin ? "text-indigo-400" : "text-indigo-100/80")}>
                      {new Date(m.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-indigo-100 px-4 py-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
            placeholder="Type a message…"
            aria-label="Message to support"
            maxLength={2000}
            className="flex-1 rounded-xl border border-indigo-200 bg-white/60 px-4 py-2 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:shadow-lg hover:shadow-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Send
          </button>
        </div>
      </div>
    </Card>
  );
}

function StatusPill({ label }: { label: string }) {
  const cls: Record<string, string> = {
    open: "bg-amber-100 text-amber-700",
    in_progress: "bg-blue-100 text-blue-700",
    resolved: "bg-emerald-100 text-emerald-700",
    closed: "bg-gray-100 text-gray-600",
    pending: "bg-amber-100 text-amber-700",
    scheduled: "bg-emerald-100 text-emerald-700",
    declined: "bg-rose-100 text-rose-700",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cls[label] || "bg-gray-100 text-gray-600")}>
      {label.replace("_", " ")}
    </span>
  );
}
