"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquare, X, Minus, ArrowLeft, Loader2, Plus, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useChatPolling } from "@/hooks/useChatPolling";
import { useSupportChatAccess } from "@/hooks/useSupportChatAccess";
import { supportChatBlockReasonFromError } from "@/lib/support/chatAccess";
import { isAnonymizedIdentity, conversationCounterparty, isConversationCounterpartyAnonymized } from "@/lib/anonymizedUsers";
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
  LEGACY_PENDING_CHAT_START_KEY,
  type ChatWidgetOpenDetail,
} from "@/lib/chatWidgetEvents";
import type { ChatAttachment, ChatConversation, ChatMessage } from "@/types/chat";
import { cn, getAuthToken } from "@/lib/utils";
import { toast } from "sonner";
import { getMigratedItem, removeMigratedItem } from "@/lib/storageMigration";
import { useErrorMessage } from "@/lib/i18n/useErrorMessage";

const isAllowedRole = (role?: string) => role === "customer" || role === "professional";

const fingerprintPrefillMessage = (message: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < message.length; index += 1) {
    hash ^= message.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const clearPendingChatRequestIfCurrent = (expected: string) => {
  const current = getMigratedItem(
    "session",
    PENDING_CHAT_START_KEY,
    LEGACY_PENDING_CHAT_START_KEY
  );
  if (current === expected) {
    removeMigratedItem(
      "session",
      PENDING_CHAT_START_KEY,
      LEGACY_PENDING_CHAT_START_KEY
    );
  }
};

const getOtherParticipantLabel = (conversation: ChatConversation, userRole?: string) => {
  if (conversation.type === "support") {
    return null;
  }
  const counterparty = conversationCounterparty(conversation, userRole);
  if (isAnonymizedIdentity(counterparty)) {
    return null;
  }
  if (userRole === "professional") {
    return counterparty?.name || null;
  }

  return counterparty?.username || counterparty?.name || null;
};

export default function ChatWidget() {
  const t = useTranslations("chat");
  const getErrorText = useErrorMessage();
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
  const [showQuotationDialog, setShowQuotationDialog] = useState(false);
  const [activeProjects, setActiveProjects] = useState<Array<{ _id: string; title?: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");
  const conversationListRef = useRef<ChatConversation[]>([]);
  const selectedConversationIdRef = useRef<string | null>(null);
  const conversationListRequestRef = useRef<Promise<void> | null>(null);
  const conversationListRequestGenerationRef = useRef(0);
  const pendingStartInFlightRef = useRef<string | null>(null);
  const chatSessionRef = useRef(0);
  const messageRequestGenerationRef = useRef(0);

  const loadActiveProjects = useCallback(async () => {
    const session = chatSessionRef.current;
    setLoadingProjects(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/active-projects`,
        { credentials: "include", headers }
      );
      const data = await response.json();
      if (session !== chatSessionRef.current) return;
      if (response.ok && data?.success) {
        const projects = Array.isArray(data.data?.projects) ? data.data.projects : [];
        setActiveProjects(projects);
        if (projects.length === 1) {
          setSelectedProjectId(projects[0]._id);
        } else {
          setSelectedProjectId("none");
        }
      } else {
        setActiveProjects([]);
        setSelectedProjectId("none");
      }
    } catch (err) {
      if (session !== chatSessionRef.current) return;
      console.error("Error loading active projects:", err);
      setActiveProjects([]);
      setSelectedProjectId("none");
    } finally {
      if (session === chatSessionRef.current) {
        setLoadingProjects(false);
      }
    }
  }, []);

  const handleSendQuotation = async () => {
    if (!selectedConversation || userRole !== "professional") return;
    if (isAnonymizedIdentity(selectedConversation.customerId)) {
      toast.error(t("page.recipientUnavailable"));
      return;
    }
    const customerId = selectedConversation.customerId?._id;
    if (!customerId) { toast.error(t("toasts.customerNotFound")); return; }

    setCreatingSendQuotation(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/direct`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            customerId,
            projectId: selectedProjectId !== "none" ? selectedProjectId : undefined,
          }),
        }
      );
      const data = await response.json();
      if (response.ok && data?.success) {
        setShowQuotationDialog(false);
        setOpen(false);
        chatRouter.push(`/bookings/${data.data.bookingId}?action=quote`);
      } else {
        toast.error(getErrorText(data, t("toasts.createQuotationFailed")));
      }
    } catch (err) {
      console.error("Error creating direct quotation:", err);
      toast.error(t("toasts.createQuotationFailed"));
    } finally {
      setCreatingSendQuotation(false);
    }
  };

  const openQuotationDialog = () => {
    if (isAnonymizedIdentity(selectedConversation?.customerId)) return;
    setShowQuotationDialog(true);
    void loadActiveProjects();
  };

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [professionalOptions, setProfessionalOptions] = useState<ProfessionalOption[]>([]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  const userRole = user?.role;
  const userId = user?._id || null;

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation._id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );
  const isSupportConversation = selectedConversation?.type === "support";
  const recipientUnavailable = isConversationCounterpartyAnonymized(
    selectedConversation,
    userRole
  );
  const isSupportClosed =
    isSupportConversation && selectedConversation?.status === "archived";
  const supportChatAccess = useSupportChatAccess(
    Boolean(isSupportConversation),
    selectedConversationId,
  );
  const isSupportReadOnly =
    Boolean(isSupportConversation) &&
    (isSupportClosed || !supportChatAccess.canWrite);
  const supportReadOnlyNotice =
    supportChatAccess.reason === "role"
      ? t("page.supportReadOnlyRole")
      : supportChatAccess.reason === "disabled"
        ? t("page.supportReadOnlyDisabled")
        : supportChatAccess.reason === "checking"
          ? t("page.supportReadOnlyChecking")
          : supportChatAccess.reason === "unavailable"
            ? t("page.supportReadOnlyUnavailable")
            : t("page.supportReadOnlyBlocked");

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
    async (busy: boolean, forceRefresh = false) => {
      if (!isAuthenticated || !isAllowedRole(userRole)) return;

      if (conversationListRequestRef.current) {
        if (!forceRefresh) {
          return conversationListRequestRef.current;
        }
        try {
          await conversationListRequestRef.current;
        } catch {
          // Start a fresh refresh even if the superseded request failed.
        }
        if (conversationListRequestRef.current) {
          return conversationListRequestRef.current;
        }
      }

      if (busy) {
        setLoadingConversations(true);
      }

      const generation = ++conversationListRequestGenerationRef.current;
      const session = chatSessionRef.current;
      const request = (async () => {
        try {
          const data = await fetchConversations({ page: 1, limit: 50 });
          const list = data.conversations || [];
          if (session !== chatSessionRef.current) return;
          setConversations(list);
          conversationListRef.current = list;

          // Messenger-like behavior:
          // Keep the user's current view. Do NOT auto-open latest conversation.
          setSelectedConversationId((current) => {
            if (!current) return null;
            return list.some((conversation) => conversation._id === current) ? current : null;
          });
        } catch {
          if (open) {
            toast.error(t("toasts.loadConversationsFailed"));
          }
        } finally {
          if (busy && session === chatSessionRef.current) {
            setLoadingConversations(false);
          }
          if (
            session === chatSessionRef.current &&
            conversationListRequestGenerationRef.current === generation
          ) {
            conversationListRequestRef.current = null;
          }
        }
      })();

      conversationListRequestRef.current = request;
      return request;
    },
    [isAuthenticated, open, userRole, t]
  );

  const loadMessages = useCallback(
    async (conversationId: string, busy: boolean) => {
      if (!conversationId) return;
      const session = chatSessionRef.current;
      const generation = ++messageRequestGenerationRef.current;

      if (busy) {
        setLoadingMessages(true);
      }

      try {
        const data = await fetchConversationMessages(conversationId, { limit: 100 });
        if (
          session !== chatSessionRef.current ||
          generation !== messageRequestGenerationRef.current
        ) return;
        setMessages(data.messages || []);
      } catch {
        if (
          session === chatSessionRef.current &&
          generation === messageRequestGenerationRef.current &&
          open
        ) {
          toast.error(t("toasts.loadMessagesFailed"));
        }
      } finally {
        if (
          busy &&
          session === chatSessionRef.current &&
          generation === messageRequestGenerationRef.current
        ) {
          setLoadingMessages(false);
        }
      }
    },
    [open, t]
  );

  const selectConversation = useCallback(
    (conversationId: string) => {
      setManualNewChatPanel(false);
      if (selectedConversationIdRef.current === conversationId) {
        // Re-selecting the already-open conversation (e.g. after a failed or
        // stale load) must still fetch and display its messages.
        void loadMessages(conversationId, true);
        return;
      }
      setSelectedConversationId(conversationId);
    },
    [loadMessages]
  );

  const loadProfessionalOptions = useCallback(async () => {
    if (!open || userRole !== "customer") return;

    setLoadingProfessionals(true);
    setProfessionalsError(null);

    try {
      const data = await fetchProfessionals();
      setProfessionalOptions(data);
    } catch (error) {
      setProfessionalsError(getErrorText(error, t("toasts.loadProfessionalsFailed")));
    } finally {
      setLoadingProfessionals(false);
    }
  }, [open, userRole, getErrorText, t]);

  const ensureConversation = useCallback(
    async (detail: ChatWidgetOpenDetail) => {
      if (!isAuthenticated || !isAllowedRole(userRole)) return;

      if (detail.conversationId) {
        setManualNewChatPanel(false);
        setSelectedConversationId(detail.conversationId);
        // The target may sit beyond the loaded page. Resolve it into the list
        // so type/status-based guards (support read-only) apply to it too.
        if (!conversationListRef.current.some((c) => c._id === detail.conversationId)) {
          try {
            const { conversation } = await fetchConversationMessages(
              String(detail.conversationId),
              { limit: 1 },
            );
            if (conversation) {
              const next = [conversation, ...conversationListRef.current];
              conversationListRef.current = next;
              setConversations(next);
            }
          } catch {
            // Unresolved: the composer stays disabled until the list loads it.
          }
        }
        // Refresh so the selected conversation resolves to an object
        // (header/actions) while the message effect fetches its thread.
        void loadConversationList(false);
        return;
      }

      if (userRole === "professional" && detail.customerId) {
        await loadConversationList(false);
        const existing = conversationListRef.current.find(
          (c) => c.customerId?._id === detail.customerId
        );
        if (existing) {
          setManualNewChatPanel(false);
          setSelectedConversationId(existing._id);
        } else {
          try {
            const conversation = await createOrGetConversation({
              customerId: detail.customerId,
            });
            await loadConversationList(false, true);
            setManualNewChatPanel(false);
            setSelectedConversationId(conversation._id);
          } catch {
            toast.error(t("toasts.startConversationWithCustomerFailed"));
          }
        }
        return;
      }

      if (!detail.professionalId || userRole !== "customer") return;

      setCreatingConversation(true);
      try {
        const conversation = await createOrGetConversation({
          professionalId: detail.professionalId,
        });

        if (detail.initialMessage?.trim()) {
          const initialMessage = detail.initialMessage.trim();
          const prefillKey = `rfq-prefill:${conversation._id}:${fingerprintPrefillMessage(initialMessage)}`;
          let alreadySent = false;
          try {
            alreadySent = window.sessionStorage.getItem(prefillKey) === "1";
          } catch {
            alreadySent = false;
          }
          if (!alreadySent) {
            try {
              await sendConversationMessage(conversation._id, { text: initialMessage });
              try {
                window.sessionStorage.setItem(prefillKey, "1");
              } catch {
                // Prefill still sent; storage is only a duplicate guard.
              }
            } catch {
              toast.error(t("toasts.prefillSendFailed"));
            }
          }
        }

        await loadConversationList(false, true);
        setManualNewChatPanel(false);
        setSelectedConversationId(conversation._id);
      } catch (error) {
        toast.error(getErrorText(error, t("toasts.startChatFailed")));
      } finally {
        setCreatingConversation(false);
      }
    },
    [isAuthenticated, loadConversationList, userRole, getErrorText, t]
  );

  useEffect(() => {
    chatSessionRef.current += 1;
    conversationListRequestGenerationRef.current += 1;
    messageRequestGenerationRef.current += 1;
    conversationListRequestRef.current = null;
    conversationListRef.current = [];
    pendingStartInFlightRef.current = null;
    setConversations([]);
    setSelectedConversationId(null);
    setMessages([]);
    setManualNewChatPanel(false);
    setShowQuotationDialog(false);
    setActiveProjects([]);
    setSelectedProjectId("none");
    setLoadingProjects(false);
    setLoadingConversations(false);
    setLoadingMessages(false);
    setCreatingConversation(false);
    setLoadingProfessionals(false);
    setProfessionalsError(null);
    setCreatingSendQuotation(false);
    setSending(false);

    if (!isAuthenticated || !isAllowedRole(userRole)) {
      setOpen(false);
      return;
    }

  }, [isAuthenticated, userId, userRole]);

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
      if (detail.open === false) return;

      if (!isAuthenticated || !isAllowedRole(userRole)) {
        return;
      }

      const serializedDetail = JSON.stringify(detail);
      if (pendingStartInFlightRef.current === serializedDetail) {
        return;
      }
      pendingStartInFlightRef.current = serializedDetail;
      void ensureConversation(detail).finally(() => {
        clearPendingChatRequestIfCurrent(serializedDetail);
        if (pendingStartInFlightRef.current === serializedDetail) {
          pendingStartInFlightRef.current = null;
        }
      });
    };

    window.addEventListener(CHAT_WIDGET_OPEN_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(CHAT_WIDGET_OPEN_EVENT, handler as EventListener);
    };
  }, [ensureConversation, isAuthenticated, userRole]);

  useEffect(() => {
    if (!isAuthenticated || !isAllowedRole(userRole)) return;
    if (typeof window === "undefined") return;

    const raw = getMigratedItem(
      "session",
      PENDING_CHAT_START_KEY,
      LEGACY_PENDING_CHAT_START_KEY
    );
    if (!raw) return;
    if (pendingStartInFlightRef.current === raw) return;
    pendingStartInFlightRef.current = raw;

    try {
      const detail = JSON.parse(raw) as ChatWidgetOpenDetail;
      setOpen(true);
      void ensureConversation(detail).finally(() => {
        clearPendingChatRequestIfCurrent(raw);
        if (pendingStartInFlightRef.current === raw) {
          pendingStartInFlightRef.current = null;
        }
      });
    } catch {
      if (pendingStartInFlightRef.current === raw) {
        pendingStartInFlightRef.current = null;
      }
      removeMigratedItem(
        "session",
        PENDING_CHAT_START_KEY,
        LEGACY_PENDING_CHAT_START_KEY
      );
    }
  }, [ensureConversation, isAuthenticated, userRole]);

  useChatPolling(
    () => loadConversationList(false),
    10000,
    isAuthenticated && isAllowedRole(userRole) && open,
    [userRole, open]
  );

  useChatPolling(
    () => loadConversationList(false),
    10000,
    isAuthenticated && isAllowedRole(userRole) && !open,
    [userRole, open]
  );

  useChatPolling(
    () => open && selectedConversationId
      ? loadMessages(selectedConversationId, false)
      : Promise.resolve(),
    10000,
    isAuthenticated && isAllowedRole(userRole) && open && Boolean(selectedConversationId),
    [open, selectedConversationId]
  );

  const handleSend = async ({ text, files }: { text: string; files: File[] }) => {
    if (!selectedConversationId) {
      throw new Error("No conversation selected");
    }
    if (isSupportReadOnly) {
      throw new Error(supportReadOnlyNotice);
    }
    if (recipientUnavailable) {
      throw new Error(t("page.recipientUnavailable"));
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
      if (isSupportConversation && supportChatBlockReasonFromError(error)) {
        supportChatAccess.blockFor(error);
        toast.error(t("page.supportReadOnlyBlocked"));
        throw new Error(t("page.supportReadOnlyBlocked"));
      }
      const message = getErrorText(error, t("toasts.sendMessageFailed"));
      toast.error(message);
      throw new Error(message);
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
          onClick={() => {
            setOpen(true);
            // Load explicitly: opening from the floating button must show the
            // conversation list immediately instead of waiting for a poll tick.
            void loadConversationList(true);
          }}
          className="h-14 rounded-full bg-indigo-600 px-5 text-white shadow-xl hover:bg-indigo-700"
        >
          <MessageSquare className="mr-2 h-5 w-5" />
          {t("widget.button")}
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
                    ? recipientUnavailable
                      ? t("common.deletedUser")
                      : getOtherParticipantLabel(selectedConversation, userRole) ||
                        (userRole === "professional" ? t("common.customer") : t("common.professional"))
                    : shouldShowNewChatPanel
                    ? t("widget.newChat")
                    : t("page.title")}
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
                      aria-label={t("widget.backToConversations")}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {userRole === "professional" && selectedConversation && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-white/20"
                        onClick={openQuotationDialog}
                        disabled={creatingSendQuotation || recipientUnavailable}
                        aria-label={t("page.sendQuotation")}
                        title={recipientUnavailable ? t("page.recipientUnavailable") : t("page.sendQuotationTitle")}
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
                    aria-label={t("widget.startNewChat")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={() => setOpen(false)}
                  aria-label={t("widget.minimize")}
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
                  aria-label={t("widget.close")}
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
                {t("widget.startingConversation")}
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
                        {t("widget.pickProfessional")}
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
                          {t("common.retry")}
                        </Button>
                      </div>
                    )}

                    {!loadingProfessionals && !professionalsError && professionalOptions.length === 0 && (
                      <div className="py-6 text-sm text-gray-500 text-center">
                        {t("page.noProfessionals")}
                      </div>
                    )}

                    {!loadingProfessionals && !professionalsError && professionalOptions.length > 0 && (
                      <div className="space-y-2">
                        {professionalOptions.map((professional) => {
                          const displayName =
                            professional.username || professional.name || t("common.professional");
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
                                {t("common.chat")}
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
                      selectConversation(conversationId);
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
                {isSupportClosed ? (
                  <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
                    {t("page.supportClosed")}
                  </div>
                ) : isSupportReadOnly && isSupportConversation ? (
                  <div
                    role="status"
                    className="flex flex-col gap-2 border-t border-indigo-100 bg-indigo-50/70 px-4 py-3 text-center text-xs text-indigo-800"
                  >
                    <span>{supportReadOnlyNotice}</span>
                    {(supportChatAccess.reason === "disabled" ||
                      supportChatAccess.reason === "unavailable" ||
                      supportChatAccess.reason === "blocked") && (
                      <button
                        type="button"
                        onClick={() => supportChatAccess.reload()}
                        className="mx-auto inline-flex min-h-8 items-center rounded-lg border border-indigo-300 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        {t("page.supportReadOnlyRetry")}
                      </button>
                    )}
                  </div>
                ) : recipientUnavailable ? (
                  <div
                    role="status"
                    className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-600"
                  >
                    {t("page.recipientUnavailable")}
                  </div>
                ) : (
                  <ChatComposer
                    disabled={
                      !selectedConversationId ||
                      creatingConversation ||
                      (!selectedConversation && !manualNewChatPanel)
                    }
                    sending={sending}
                    onSend={handleSend}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showQuotationDialog} onOpenChange={(open) => { setShowQuotationDialog(open); if (!open) setSelectedProjectId("none"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("quotationDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("quotationDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">{t("quotationDialog.linkedProject")}</p>
              {loadingProjects ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("quotationDialog.loadingProjects")}
                </div>
              ) : (
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("quotationDialog.chooseProject")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("quotationDialog.noLinkedProject")}</SelectItem>
                    {activeProjects.map(project => (
                      <SelectItem key={project._id} value={project._id}>
                        {project.title || t("common.untitledProject")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button onClick={handleSendQuotation} disabled={creatingSendQuotation} className="w-full">
              {creatingSendQuotation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {t("quotationDialog.createDraft")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
