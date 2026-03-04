"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MessageSquare, Search, PanelRightOpen, PanelRightClose, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import ChatList from "@/components/chat/ChatList";
import ChatThread from "@/components/chat/ChatThread";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatInfoPanel from "@/components/chat/ChatInfoPanel";
import { useChatPolling } from "@/hooks/useChatPolling";
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
import type { ChatAttachment, ChatConversation, ChatMessage } from "@/types/chat";
import { cn } from "@/lib/utils";

const isAllowedRole = (role?: string) => role === "customer" || role === "professional";

const getOtherParticipant = (conversation: ChatConversation, role?: string) => {
  if (role === "professional") return conversation.customerId;
  return conversation.professionalId;
};

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loading } = useAuth();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [professionalOptions, setProfessionalOptions] = useState<ProfessionalOption[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);

  const userRole = user?.role;
  const conversationIdFromQuery = searchParams.get("conversationId") || undefined;
  const professionalIdFromQuery = searchParams.get("professionalId") || undefined;

  const initializedByQueryRef = useRef(false);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c._id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const other = getOtherParticipant(c, userRole);
      const name = other?.businessInfo?.companyName || other?.name || "";
      const email = other?.email || "";
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
  }, [conversations, searchQuery, userRole]);

  const otherParticipant = selectedConversation
    ? getOtherParticipant(selectedConversation, userRole)
    : null;
  const otherName = otherParticipant?.businessInfo?.companyName || otherParticipant?.name || "Conversation";

  const loadConversationList = useCallback(
    async (showBusy: boolean) => {
      if (!isAuthenticated || !isAllowedRole(userRole)) return;

      if (showBusy) setLoadingConversations(true);

      try {
        const data = await fetchConversations({ page: 1, limit: 50 });
        const list = data.conversations || [];
        setConversations(list);

        setSelectedConversationId((current) => {
          if (current && list.some((c) => c._id === current)) return current;
          if (conversationIdFromQuery && list.some((c) => c._id === conversationIdFromQuery)) {
            return conversationIdFromQuery;
          }
          return list[0]?._id || null;
        });

        setError(null);
      } catch (listError) {
        setError(listError instanceof Error ? listError.message : "Failed to load conversations");
      } finally {
        if (showBusy) setLoadingConversations(false);
      }
    },
    [conversationIdFromQuery, isAuthenticated, userRole]
  );

  const loadMessages = useCallback(async (conversationId: string, showBusy: boolean) => {
    if (!conversationId) return;
    if (showBusy) setLoadingMessages(true);

    try {
      const data = await fetchConversationMessages(conversationId, { limit: 100 });
      setMessages(data.messages || []);
    } catch (messageError) {
      toast.error(messageError instanceof Error ? messageError.message : "Failed to load messages");
    } finally {
      if (showBusy) setLoadingMessages(false);
    }
  }, []);

  const loadProfessionalOptions = useCallback(async () => {
    if (userRole !== "customer") return;
    setLoadingProfessionals(true);
    try {
      const data = await fetchProfessionals();
      setProfessionalOptions(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load professionals");
    } finally {
      setLoadingProfessionals(false);
    }
  }, [userRole]);

  const startNewChat = useCallback(
    async (professionalId: string) => {
      setCreatingConversation(true);
      try {
        const conversation = await createOrGetConversation({ professionalId });
        await loadConversationList(false);
        setSelectedConversationId(conversation._id);
        setShowNewChat(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start chat");
      } finally {
        setCreatingConversation(false);
      }
    },
    [loadConversationList]
  );

  useEffect(() => {
    if (showNewChat && professionalOptions.length === 0) {
      void loadProfessionalOptions();
    }
  }, [showNewChat, professionalOptions.length, loadProfessionalOptions]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login?redirect=/chat");
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (!isAuthenticated || !isAllowedRole(userRole)) {
      setLoadingConversations(false);
      return;
    }
    void loadConversationList(true);
  }, [isAuthenticated, userRole, loadConversationList]);

  useEffect(() => {
    if (!isAuthenticated || userRole !== "customer") return;
    if (!professionalIdFromQuery) return;
    if (initializedByQueryRef.current) return;
    initializedByQueryRef.current = true;

    const createFromQuery = async () => {
      try {
        const conversation = await createOrGetConversation({
          professionalId: professionalIdFromQuery,
        });
        setSelectedConversationId(conversation._id);
        router.replace(`/chat?conversationId=${conversation._id}`);
        await loadConversationList(false);
      } catch (queryError) {
        toast.error(queryError instanceof Error ? queryError.message : "Failed to start chat");
      }
    };
    void createFromQuery();
  }, [isAuthenticated, loadConversationList, professionalIdFromQuery, router, userRole]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedConversationId, true);
    markConversationAsRead(selectedConversationId)
      .then(() => loadConversationList(false))
      .catch((err) => {
        console.error(`Failed to mark conversation ${selectedConversationId} as read:`, err);
      });
  }, [selectedConversationId, loadMessages, loadConversationList]);

  useChatPolling(
    () => void loadConversationList(false),
    10000,
    isAuthenticated && isAllowedRole(userRole),
    [userRole]
  );

  useChatPolling(
    () => {
      if (selectedConversationId) void loadMessages(selectedConversationId, false);
    },
    10000,
    isAuthenticated && isAllowedRole(userRole) && Boolean(selectedConversationId),
    [selectedConversationId]
  );

  const handleSend = async ({ text, files }: { text: string; files: File[] }) => {
    if (!selectedConversationId) {
      toast.error("Select a conversation first");
      return;
    }

    setSending(true);
    try {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      const otherFiles = files.filter((f) => !f.type.startsWith("image/"));

      const uploadedImageUrls = imageFiles.length > 0
        ? (await Promise.all(imageFiles.map((file) => uploadChatImage(file, selectedConversationId)))).map((r) => r.url)
        : [];

      const uploadedAttachments: ChatAttachment[] = otherFiles.length > 0
        ? await Promise.all(
            otherFiles.map(async (file) => {
              const result = await uploadChatFile(file, selectedConversationId);
              return {
                url: result.url,
                fileName: result.fileName,
                fileType: result.fileType,
                mimeType: result.mimeType,
                fileSize: result.fileSize,
              };
            })
          )
        : [];

      await sendConversationMessage(selectedConversationId, {
        text: text.trim() || undefined,
        images: uploadedImageUrls,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      });

      await loadMessages(selectedConversationId, false);
      await loadConversationList(false);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Failed to send message";
      toast.error(message);
      throw sendError instanceof Error ? sendError : new Error(message);
    } finally {
      setSending(false);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
  };

  const handleBackToList = () => {
    setSelectedConversationId(null);
  };

  if (loading || loadingConversations) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-600">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!isAllowedRole(userRole)) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto" />
          <h2 className="mt-4 text-lg font-semibold text-gray-700">Chat Unavailable</h2>
          <p className="mt-1 text-sm text-gray-500">Chat is available for customers and professionals only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] mt-16 flex bg-white">
      {/* Left Panel - Conversation List */}
      <div
        className={cn(
          "w-full md:w-80 md:min-w-[320px] border-r border-slate-200 flex flex-col bg-white",
          selectedConversationId ? "hidden md:flex" : "flex"
        )}
      >
        <div className="p-3 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
              <h1 className="text-lg font-semibold text-gray-900">Messages</h1>
            </div>
            {userRole === "customer" && (
              <Button
                variant={showNewChat ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowNewChat((prev) => !prev)}
                aria-label="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          {!showNewChat && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 bg-rose-50 text-xs text-rose-700 border-b border-rose-200">{error}</div>
        )}

        {showNewChat && userRole === "customer" ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-xs text-indigo-700">
                Pick a professional below to start a conversation.
              </p>
            </div>

            {loadingProfessionals && (
              <div className="py-6 text-sm text-gray-500 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading professionals...
              </div>
            )}

            {!loadingProfessionals && professionalOptions.length === 0 && (
              <div className="py-6 text-sm text-gray-500 text-center">
                No professionals available right now.
              </div>
            )}

            {!loadingProfessionals && professionalOptions.length > 0 && (
              <div className="space-y-2">
                {professionalOptions.map((professional) => {
                  const displayName =
                    professional.businessInfo?.companyName || professional.name || "Professional";
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
                        disabled={creatingConversation}
                        onClick={() => void startNewChat(professional._id)}
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
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ChatList
              conversations={filteredConversations}
              selectedConversationId={selectedConversationId}
              currentUserRole={userRole}
              onSelect={handleSelectConversation}
            />
          </div>
        )}
      </div>

      {/* Center Panel - Thread */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0",
          !selectedConversationId ? "hidden md:flex" : "flex"
        )}
      >
        {selectedConversation ? (
          <>
            {/* Thread Header */}
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="md:hidden p-1 rounded hover:bg-gray-100"
                  onClick={handleBackToList}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{otherName}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-indigo-600"
                onClick={() => setShowInfoPanel((prev) => !prev)}
                aria-label={showInfoPanel ? "Hide info panel" : "Show info panel"}
              >
                {showInfoPanel ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0">
              <ChatThread messages={messages} currentUserId={user?._id || null} loading={loadingMessages} />
            </div>

            {/* Composer */}
            <ChatComposer disabled={!selectedConversationId} sending={sending} onSend={handleSend} />
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <MessageSquare className="h-16 w-16 mb-4" />
            <p className="text-sm">Select a conversation to view messages</p>
          </div>
        )}
      </div>

      {/* Right Panel - Info */}
      {showInfoPanel && selectedConversationId && (
        <div className="hidden lg:flex w-80 min-w-[320px] border-l border-slate-200 bg-white flex-col">
          <ChatInfoPanel
            conversationId={selectedConversationId}
            conversation={selectedConversation}
            currentUserRole={userRole}
          />
        </div>
      )}
    </div>
  );
}
