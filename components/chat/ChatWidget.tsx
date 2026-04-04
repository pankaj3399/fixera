"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { MessageSquare, X, Minus, ArrowLeft, Loader2, Plus, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useChatPolling } from "@/hooks/useChatPolling";
import ChatList from "@/components/chat/ChatList";
import ChatThread from "@/components/chat/ChatThread";
import ChatComposer from "@/components/chat/ChatComposer";
import {
  createOrGetConversation,
  fetchConversationMessages,
  fetchConversations,
  fetchProfessionals,
  markConversationAsRead,
  sendConversationMessage,
  uploadChatImage,
  uploadChatFile,
} from "@/lib/chatApi";
import type { ProfessionalOption } from "@/lib/chatApi";
import {
  CHAT_WIDGET_OPEN_EVENT,
  PENDING_CHAT_START_KEY,
  type ChatWidgetOpenDetail,
} from "@/lib/chatWidgetEvents";
import type { ChatAttachment, ChatConversation, ChatMessage } from "@/types/chat";
import { cn, getAuthToken } from "@/lib/utils";
import { toast } from "sonner";

const isAllowedRole = (role?: string) => role === "customer" || role === "professional";

const getOtherParticipantLabel = (conversation: ChatConversation, userRole?: string) => {
  if (userRole === "professional") {
    return conversation.customerId?.name || "Customer";
  }

  return (
    conversation.professionalId?.username ||
    conversation.professionalId?.name ||
    "Professional"
  );
};

export default function ChatWidget() {
  const pathname = usePathname();
  const chatRouter = useRouter();
  const { user, isAuthenticated, loading } = useAuth();

  const [open, setOpen] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Explicitly controls "new chat" panel for customers with existing conversations.
  const [manualNewChatPanel, setManualNewChatPanel] = useState(false);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [professionalsError, setProfessionalsError] = useState<string | null>(null);
  const [creatingSendQuotation, setCreatingSendQuotation] = useState(false);

  const handleSendQuotation = async () => {
    if (!selectedConversation || userRole !== "professional") return;
    const customerId = selectedConversation.customerId?._id;
    if (!customerId) { toast.error("Customer not found"); return; }

    setCreatingSendQuotation(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/direct`,
        { method: "POST", headers, credentials: "include", body: JSON.stringify({ customerId }) }
      );
      const data = await response.json();
      if (response.ok && data?.success) {
        setOpen(false);
        chatRouter.push(`/bookings/${data.data.bookingId}?action=quote`);
      } else {
        toast.error(data?.error?.message || "Failed to create quotation");
      }
    } catch (err) {
      console.error("Error creating direct quotation:", err);
      toast.error("Failed to create quotation");
    } finally {
      setCreatingSendQuotation(false);
    }
  };

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [professionalOptions, setProfessionalOptions] = useState<ProfessionalOption[]>([]);

  const userRole = user?.role;
  const userId = user?._id || null;

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation._id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const shouldShowNewChatPanel =
    userRole === "customer" &&
    !selectedConversationId &&
    (conversations.length === 0 || manualNewChatPanel);

  const totalUnread = useMemo(() => {
    return conversations.reduce((total, conversation) => {
      if (userRole === "professional") {
        return total + (conversation.professionalUnreadCount || 0);
      }
      return total + (conversation.customerUnreadCount || 0);
    }, 0);
  }, [conversations, userRole]);

  const loadConversationList = useCallback(
    async (busy: boolean) => {
      if (!isAuthenticated || !isAllowedRole(userRole)) return;

      if (busy) {
        setLoadingConversations(true);
      }

      try {
        const data = await fetchConversations({ page: 1, limit: 50 });
        const list = data.conversations || [];
        setConversations(list);

        // Messenger-like behavior:
        // Keep the user's current view. Do NOT auto-open latest conversation.
        setSelectedConversationId((current) => {
          if (!current) return null;
          return list.some((conversation) => conversation._id === current) ? current : null;
        });
      } catch {
        if (open) {
          toast.error("Failed to load conversations");
        }
      } finally {
        if (busy) {
          setLoadingConversations(false);
        }
      }
    },
    [isAuthenticated, open, userRole]
  );

  const loadMessages = useCallback(
    async (conversationId: string, busy: boolean) => {
      if (!conversationId) return;

      if (busy) {
        setLoadingMessages(true);
      }

      try {
        const data = await fetchConversationMessages(conversationId, { limit: 100 });
        setMessages(data.messages || []);
      } catch {
        if (open) {
          toast.error("Failed to load messages");
        }
      } finally {
        if (busy) {
          setLoadingMessages(false);
        }
      }
    },
    [open]
  );

  const loadProfessionalOptions = useCallback(async () => {
    if (!open || userRole !== "customer") return;

    setLoadingProfessionals(true);
    setProfessionalsError(null);

    try {
      const data = await fetchProfessionals();
      setProfessionalOptions(data);
    } catch (error) {
      setProfessionalsError(error instanceof Error ? error.message : "Failed to load professionals");
    } finally {
      setLoadingProfessionals(false);
    }
  }, [open, userRole]);

  const ensureConversation = useCallback(
    async (detail: ChatWidgetOpenDetail) => {
      if (!isAuthenticated || userRole !== "customer") return;

      if (detail.conversationId) {
        setManualNewChatPanel(false);
        setSelectedConversationId(detail.conversationId);
        return;
      }

      if (!detail.professionalId) return;

      setCreatingConversation(true);
      try {
        const conversation = await createOrGetConversation({
          professionalId: detail.professionalId,
        });

        await loadConversationList(false);
        setManualNewChatPanel(false);
        setSelectedConversationId(conversation._id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to start chat");
      } finally {
        setCreatingConversation(false);
      }
    },
    [isAuthenticated, loadConversationList, userRole]
  );

  useEffect(() => {
    if (!isAuthenticated || !isAllowedRole(userRole)) {
      setOpen(false);
      setConversations([]);
      setSelectedConversationId(null);
      setMessages([]);
      setManualNewChatPanel(false);
      return;
    }

    void loadConversationList(true);
  }, [isAuthenticated, loadConversationList, userRole]);

  useEffect(() => {
    if (!shouldShowNewChatPanel || userRole !== "customer") return;
    if (professionalOptions.length > 0) return;
    void loadProfessionalOptions();
  }, [loadProfessionalOptions, professionalOptions.length, shouldShowNewChatPanel, userRole]);

  useEffect(() => {
    if (!selectedConversationId || !open) {
      if (!open || !selectedConversationId) {
        setMessages([]);
      }
      return;
    }

    void loadMessages(selectedConversationId, true);

    markConversationAsRead(selectedConversationId)
      .then(() => loadConversationList(false))
      .catch(() => {
        // ignore mark-read errors
      });
  }, [selectedConversationId, open, loadMessages, loadConversationList]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ChatWidgetOpenDetail>;
      const detail = customEvent.detail || {};

      setOpen(detail.open !== false);

      if (!isAuthenticated || !isAllowedRole(userRole)) {
        return;
      }

      void ensureConversation(detail);
    };

    window.addEventListener(CHAT_WIDGET_OPEN_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(CHAT_WIDGET_OPEN_EVENT, handler as EventListener);
    };
  }, [ensureConversation, isAuthenticated, userRole]);

  useEffect(() => {
    if (!isAuthenticated || !isAllowedRole(userRole)) return;
    if (typeof window === "undefined") return;

    const raw = window.sessionStorage.getItem(PENDING_CHAT_START_KEY);
    if (!raw) return;

    window.sessionStorage.removeItem(PENDING_CHAT_START_KEY);

    try {
      const detail = JSON.parse(raw) as ChatWidgetOpenDetail;
      setOpen(true);
      void ensureConversation(detail);
    } catch {
      // ignore invalid payload
    }
  }, [ensureConversation, isAuthenticated, userRole]);

  useChatPolling(
    () => {
      void loadConversationList(false);
    },
    10000,
    isAuthenticated && isAllowedRole(userRole),
    [userRole, open]
  );

  useChatPolling(
    () => {
      if (open && selectedConversationId) {
        void loadMessages(selectedConversationId, false);
      }
    },
    10000,
    isAuthenticated && isAllowedRole(userRole) && open && Boolean(selectedConversationId),
    [open, selectedConversationId]
  );

  const handleSend = async ({ text, files }: { text: string; files: File[] }) => {
    if (!selectedConversationId) {
      throw new Error("No conversation selected");
    }

    setSending(true);
    try {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      const otherFiles = files.filter((f) => !f.type.startsWith("image/"));

      const [uploadedImages, uploadedFiles] = await Promise.all([
        Promise.all(imageFiles.map((file) => uploadChatImage(file, selectedConversationId))),
        Promise.all(otherFiles.map((file) => uploadChatFile(file, selectedConversationId))),
      ]);

      const images = uploadedImages.map((u) => u.url);
      const attachments: ChatAttachment[] = uploadedFiles.map((u) => ({
        url: u.url,
        fileName: u.fileName,
        fileType: u.fileType,
        mimeType: u.mimeType,
        fileSize: u.fileSize,
      }));

      await sendConversationMessage(selectedConversationId, {
        text: text.trim() || undefined,
        images,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      await loadMessages(selectedConversationId, false);
      await loadConversationList(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message";
      toast.error(message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setSending(false);
    }
  };

  if (loading || !isAuthenticated || !isAllowedRole(userRole) || pathname === "/chat") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70]">
      {!open && (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="h-14 rounded-full bg-indigo-600 px-5 text-white shadow-xl hover:bg-indigo-700"
        >
          <MessageSquare className="mr-2 h-5 w-5" />
          Chat
          {totalUnread > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs font-semibold text-indigo-700">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </Button>
      )}

      {open && (
        <Card className="w-[92vw] sm:w-[380px] h-[70vh] sm:h-[560px] shadow-2xl border border-indigo-100 overflow-hidden flex flex-col">
          <CardHeader className="py-3 px-4 border-b bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold truncate">
                  {selectedConversation
                    ? getOtherParticipantLabel(selectedConversation, userRole)
                    : shouldShowNewChatPanel
                    ? "New chat"
                    : "Messages"}
                </CardTitle>
              </div>

              <div className="flex items-center gap-1">
                {selectedConversationId && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/20"
                      onClick={() => {
                        setSelectedConversationId(null);
                        setManualNewChatPanel(false);
                      }}
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {userRole === "professional" && selectedConversation && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-white/20"
                        onClick={handleSendQuotation}
                        disabled={creatingSendQuotation}
                        aria-label="Send quotation"
                        title="Send Quotation"
                      >
                        {creatingSendQuotation ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      </Button>
                    )}
                  </>
                )}

                {userRole === "customer" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => {
                      setSelectedConversationId(null);
                      setManualNewChatPanel((current) => !current);
                    }}
                    aria-label="Start new chat"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={() => setOpen(false)}
                  aria-label="Minimize chat"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={() => {
                    setOpen(false);
                    setSelectedConversationId(null);
                    setManualNewChatPanel(false);
                  }}
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
            {creatingConversation && (
              <div className="flex items-center justify-center py-3 text-xs text-gray-500 border-b">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Starting conversation...
              </div>
            )}

            {!selectedConversationId ? (
              <div className="flex-1 min-h-0">
                {loadingConversations ? (
                  <div className="p-3 space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-2">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-2.5 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : shouldShowNewChatPanel && userRole === "customer" ? (
                  <div className="h-full overflow-y-auto p-3 space-y-2">
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                      <p className="text-xs text-indigo-700">
                        Pick a professional below and we will open the chat instantly.
                      </p>
                    </div>

                    {loadingProfessionals && (
                      <div className="py-3 space-y-3 px-2">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="flex items-center gap-2">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <Skeleton className="h-3 flex-1" />
                          </div>
                        ))}
                      </div>
                    )}

                    {!loadingProfessionals && professionalsError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <p className="text-xs text-rose-700">{professionalsError}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => void loadProfessionalOptions()}
                        >
                          Retry
                        </Button>
                      </div>
                    )}

                    {!loadingProfessionals && !professionalsError && professionalOptions.length === 0 && (
                      <div className="py-6 text-sm text-gray-500 text-center">
                        No professionals available right now.
                      </div>
                    )}

                    {!loadingProfessionals && !professionalsError && professionalOptions.length > 0 && (
                      <div className="space-y-2">
                        {professionalOptions.map((professional) => {
                          const displayName =
                            professional.username || professional.name || "Professional";
                          const location = [professional.businessInfo?.city, professional.businessInfo?.country]
                            .filter(Boolean)
                            .join(", ");

                          return (
                            <div
                              key={professional._id}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                                {location && <p className="text-xs text-gray-500 truncate">{location}</p>}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  void ensureConversation({
                                    open: true,
                                    professionalId: professional._id,
                                  });
                                }}
                              >
                                Chat
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <ChatList
                    conversations={conversations}
                    selectedConversationId={selectedConversationId}
                    currentUserRole={userRole}
                    currentUserId={user?._id}
                    filter="all"
                    userLabels={[]}
                    compact
                    onSelect={(conversationId) => {
                      setManualNewChatPanel(false);
                      setSelectedConversationId(conversationId);
                    }}
                    onFilterChange={() => {}}
                    onToggleStar={() => {}}
                    onToggleArchive={() => {}}
                    onAddLabel={() => {}}
                    onRemoveLabel={() => {}}
                  />
                )}
              </div>
            ) : (
              <>
                <div className={cn("flex-1 min-h-0", sending && "opacity-95")}>
                  <ChatThread
                    messages={messages}
                    currentUserId={userId}
                    currentUserRole={userRole}
                    loading={loadingMessages}
                    conversationId={selectedConversationId}
                  />
                </div>
                <ChatComposer
                  disabled={!selectedConversationId || creatingConversation}
                  sending={sending}
                  onSend={handleSend}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
