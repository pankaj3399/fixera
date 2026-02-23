"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import ChatList from "@/components/chat/ChatList";
import ChatThread from "@/components/chat/ChatThread";
import ChatComposer from "@/components/chat/ChatComposer";
import { useChatPolling } from "@/hooks/useChatPolling";
import {
  createOrGetConversation,
  fetchConversationMessages,
  fetchConversations,
  markConversationAsRead,
  sendConversationMessage,
  uploadChatImage,
} from "@/lib/chatApi";
import type { ChatConversation, ChatMessage } from "@/types/chat";

const isAllowedRole = (role?: string) => role === "customer" || role === "professional";

const getOtherParticipant = (conversation: ChatConversation, role?: string) => {
  if (role === "professional") {
    return conversation.customerId;
  }
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

  const userRole = user?.role;
  const conversationIdFromQuery = searchParams.get("conversationId") || undefined;
  const professionalIdFromQuery = searchParams.get("professionalId") || undefined;
  const bookingIdFromQuery = searchParams.get("bookingId") || undefined;

  const initializedByQueryRef = useRef(false);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation._id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const loadConversationList = useCallback(
    async (showBusy: boolean) => {
      if (!isAuthenticated || !isAllowedRole(userRole)) return;

      if (showBusy) {
        setLoadingConversations(true);
      }

      try {
        const data = await fetchConversations({ page: 1, limit: 50 });
        const list = data.conversations || [];
        setConversations(list);

        setSelectedConversationId((current) => {
          if (current && list.some((conversation) => conversation._id === current)) {
            return current;
          }

          if (conversationIdFromQuery && list.some((conversation) => conversation._id === conversationIdFromQuery)) {
            return conversationIdFromQuery;
          }

          return list[0]?._id || null;
        });

        setError(null);
      } catch (listError) {
        const message = listError instanceof Error ? listError.message : "Failed to load conversations";
        setError(message);
      } finally {
        if (showBusy) {
          setLoadingConversations(false);
        }
      }
    },
    [conversationIdFromQuery, isAuthenticated, userRole]
  );

  const loadMessages = useCallback(async (conversationId: string, showBusy: boolean) => {
    if (!conversationId) return;

    if (showBusy) {
      setLoadingMessages(true);
    }

    try {
      const data = await fetchConversationMessages(conversationId, { limit: 100 });
      setMessages(data.messages || []);
    } catch (messageError) {
      const message = messageError instanceof Error ? messageError.message : "Failed to load messages";
      toast.error(message);
    } finally {
      if (showBusy) {
        setLoadingMessages(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login?redirect=/chat");
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (!isAuthenticated || !isAllowedRole(userRole)) return;
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
          bookingId: bookingIdFromQuery,
        });

        setSelectedConversationId(conversation._id);
        router.replace(`/chat?conversationId=${conversation._id}`);
        await loadConversationList(false);
      } catch (queryError) {
        const message = queryError instanceof Error ? queryError.message : "Failed to start chat";
        toast.error(message);
      }
    };

    void createFromQuery();
  }, [
    bookingIdFromQuery,
    isAuthenticated,
    loadConversationList,
    professionalIdFromQuery,
    router,
    userRole,
  ]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedConversationId, true);

    markConversationAsRead(selectedConversationId)
      .then(() => loadConversationList(false))
      .catch(() => {
        // keep UI responsive if mark-read fails
      });
  }, [selectedConversationId, loadMessages, loadConversationList]);

  useChatPolling(
    () => {
      void loadConversationList(false);
    },
    10000,
    isAuthenticated && isAllowedRole(userRole),
    [userRole]
  );

  useChatPolling(
    () => {
      if (selectedConversationId) {
        void loadMessages(selectedConversationId, false);
      }
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
      const uploadedImageUrls: string[] = [];
      for (const file of files) {
        const uploadResult = await uploadChatImage(file, selectedConversationId);
        uploadedImageUrls.push(uploadResult.url);
      }

      await sendConversationMessage(selectedConversationId, {
        text: text.trim() || undefined,
        images: uploadedImageUrls,
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

  if (loading || loadingConversations) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-600">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!isAllowedRole(userRole)) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-4xl mx-auto pt-20">
          <Card>
            <CardHeader>
              <CardTitle>Chat Unavailable</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600">
              Chat is currently available for customers and professionals only.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-4">
      <div className="max-w-7xl mx-auto pt-20 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Chat</h1>
        </div>

        {error && (
          <Card className="border border-rose-200 bg-rose-50">
            <CardContent className="py-3 text-sm text-rose-700">{error}</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] h-[calc(100vh-180px)]">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-base">Conversations</CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[calc(100%-57px)]">
              <ChatList
                conversations={conversations}
                selectedConversationId={selectedConversationId}
                currentUserRole={userRole}
                onSelect={setSelectedConversationId}
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base">
                {selectedConversation
                  ? getOtherParticipant(selectedConversation, userRole).businessInfo?.companyName ||
                    getOtherParticipant(selectedConversation, userRole).name ||
                    "Conversation"
                  : "Select a conversation"}
              </CardTitle>
              {selectedConversation?.bookingId?.bookingNumber && (
                <p className="text-xs text-gray-500">
                  Booking: {selectedConversation.bookingId.bookingNumber}
                </p>
              )}
            </CardHeader>

            <div className="flex-1 min-h-0">
              {selectedConversationId ? (
                <ChatThread messages={messages} currentUserId={user?._id || null} loading={loadingMessages} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-gray-500">
                  Select a conversation to view messages.
                </div>
              )}
            </div>

            <ChatComposer disabled={!selectedConversationId} sending={sending} onSend={handleSend} />
          </Card>
        </div>
      </div>
    </div>
  );
}
