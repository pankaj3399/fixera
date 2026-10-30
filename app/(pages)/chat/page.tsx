"use client";

import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, MessageSquare, Search, PanelRightOpen, PanelRightClose, ArrowLeft, Plus, X, AlertTriangle, FileText, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import ChatList from "@/components/chat/ChatList";
import ChatThread from "@/components/chat/ChatThread";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatInfoPanel from "@/components/chat/ChatInfoPanel";
import { useChatPolling } from "@/hooks/useChatPolling";
import { useSupportChatAccess } from "@/hooks/useSupportChatAccess";
import { supportChatBlockReasonFromError } from "@/lib/support/chatAccess";
import {
  createOrGetConversation,
  fetchConversationMessages,
  fetchConversations,
  fetchConversationInfo,
  fetchProfessionals,
  markConversationAsRead,
  sendConversationMessage,
  uploadChatImage,
  uploadChatFile,
  toggleConversationStar,
  toggleConversationArchive,
  addConversationLabel,
  removeConversationLabel,
  searchChatMessages,
} from "@/lib/chatApi";
import type { ProfessionalOption } from "@/lib/chatApi";
import type { ChatAttachment, ChatConversation, ChatMessage, ChatFilter } from "@/types/chat";
import {
  conversationCounterparty,
  isAnonymizedIdentity,
  isConversationCounterpartyAnonymized,
  isRedactedPlaceholderText,
} from "@/lib/anonymizedUsers";
import { cn, getAuthToken } from "@/lib/utils";
import { useFormatLocale } from "@/lib/i18n/useFormatLocale";
import { useErrorMessage } from "@/lib/i18n/useErrorMessage";

const isAllowedRole = (role?: string) => role === "customer" || role === "professional";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" /></div>}>
      <ChatContent />
    </Suspense>
  );
}

function ChatContent() {
  const t = useTranslations("chat");
  const getErrorText = useErrorMessage();
  const { intl } = useFormatLocale();
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
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [professionalOptions, setProfessionalOptions] = useState<ProfessionalOption[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);

  // New state for features
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [absence, setAbsence] = useState<{ from: string; to: string } | null>(null);

  // Quotation
  const [creatingSendQuotation, setCreatingSendQuotation] = useState(false);
  const [showQuotationDialog, setShowQuotationDialog] = useState(false);
  const [activeProjects, setActiveProjects] = useState<Array<{ _id: string; title?: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");

  const loadActiveProjects = useCallback(async () => {
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
      console.error("Error loading active projects:", err);
      setActiveProjects([]);
      setSelectedProjectId("none");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const handleSendQuotation = async () => {
    if (!selectedConversation || userRole !== "professional") return;
    if (isAnonymizedIdentity(selectedConversation.customerId)) {
      toast.error(t("page.recipientUnavailable"));
      return;
    }
    if (loadingProjects) return;
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
        router.push(`/bookings/${data.data.bookingId}?action=quote`);
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

  // In-chat search
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatSearchResults, setChatSearchResults] = useState<ChatMessage[]>([]);
  const [chatSearchIndex, setChatSearchIndex] = useState(0);
  const [searchingChat, setSearchingChat] = useState(false);

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
      const other = conversationCounterparty(c, userRole);
      const name = other?.username || other?.name || "";
      const email = other?.email || "";
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
  }, [conversations, searchQuery, userRole]);

  // Collect all unique user labels — use a ref to preserve labels discovered from unfiltered list
  const allLabelsRef = useRef<string[]>([]);
  const userLabels = useMemo(() => {
    const labels = new Set<string>();
    const uid = user?._id;
    if (!uid) return allLabelsRef.current;
    for (const c of conversations) {
      for (const l of c.labels || []) {
        if (l.userId === uid) labels.add(l.label);
      }
    }
    const current = Array.from(labels);
    // When viewing all conversations, this is the authoritative label list
    if (chatFilter === "all") {
      allLabelsRef.current = current;
      return current;
    }
    // When filtered, preserve previously known labels
    return allLabelsRef.current;
  }, [conversations, user?._id, chatFilter]);

  const otherParticipant = selectedConversation
    ? conversationCounterparty(selectedConversation, userRole)
    : null;
  const isSupportConversation = selectedConversation?.type === "support";
  const recipientUnavailable = isConversationCounterpartyAnonymized(
    selectedConversation,
    userRole
  );
  const isSupportClosed = isSupportConversation && selectedConversation?.status === "archived";
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
  const otherName = isSupportConversation
    ? t("common.fixtractSupport")
    : recipientUnavailable
      ? t("common.deletedUser")
      : otherParticipant?.username || otherParticipant?.name || t("common.conversation");

  const loadConversationList = useCallback(
    async (showBusy: boolean) => {
      if (!isAuthenticated || !isAllowedRole(userRole)) return;

      if (showBusy) setLoadingConversations(true);

      try {
        const data = await fetchConversations({ page: 1, limit: 50, filter: chatFilter });
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
        setError(getErrorText(listError, t("toasts.loadConversationsFailed")));
      } finally {
        if (showBusy) setLoadingConversations(false);
      }
    },
    [conversationIdFromQuery, isAuthenticated, userRole, chatFilter, getErrorText, t]
  );

  const loadMessages = useCallback(async (conversationId: string, showBusy: boolean) => {
    if (!conversationId) return;
    if (showBusy) setLoadingMessages(true);

    try {
      const data = await fetchConversationMessages(conversationId, { limit: 100 });
      setMessages(data.messages || []);
    } catch (messageError) {
      toast.error(getErrorText(messageError, t("toasts.loadMessagesFailed")));
    } finally {
      if (showBusy) setLoadingMessages(false);
    }
  }, [getErrorText, t]);

  const loadProfessionalOptions = useCallback(async () => {
    if (userRole !== "customer") return;
    setLoadingProfessionals(true);
    try {
      const data = await fetchProfessionals();
      setProfessionalOptions(data);
    } catch (err) {
      toast.error(getErrorText(err, t("toasts.loadProfessionalsFailed")));
    } finally {
      setLoadingProfessionals(false);
    }
  }, [userRole, getErrorText, t]);

  const startNewChat = useCallback(
    async (professionalId: string) => {
      setCreatingConversation(true);
      try {
        const conversation = await createOrGetConversation({ professionalId });
        await loadConversationList(false);
        setSelectedConversationId(conversation._id);
        setShowNewChat(false);
      } catch (err) {
        toast.error(getErrorText(err, t("toasts.startChatFailed")));
      } finally {
        setCreatingConversation(false);
      }
    },
    [loadConversationList, getErrorText, t]
  );

  // Load absence info when conversation changes (with stale guard)
  useEffect(() => {
    if (!selectedConversationId) {
      setAbsence(null);
      return;
    }
    let stale = false;
    const loadAbsence = async () => {
      try {
        const data = await fetchConversationInfo(selectedConversationId);
        if (!stale) setAbsence(data.stats.absence);
      } catch {
        // non-critical
      }
    };
    void loadAbsence();
    return () => { stale = true; };
  }, [selectedConversationId]);

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
        toast.error(getErrorText(queryError, t("toasts.startChatFailed")));
      }
    };
    void createFromQuery();
  }, [isAuthenticated, loadConversationList, getErrorText, professionalIdFromQuery, router, userRole, t]);

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

  // Reset reply-to when conversation changes
  useEffect(() => {
    setReplyToMessage(null);
    setChatSearchOpen(false);
    setChatSearchQuery("");
    setChatSearchResults([]);
  }, [selectedConversationId]);

  useChatPolling(
    () => loadConversationList(false),
    10000,
    isAuthenticated && isAllowedRole(userRole),
    [userRole, chatFilter]
  );

  useChatPolling(
    () => selectedConversationId
      ? loadMessages(selectedConversationId, false)
      : Promise.resolve(),
    10000,
    isAuthenticated && isAllowedRole(userRole) && Boolean(selectedConversationId),
    [selectedConversationId]
  );

  const handleSend = async ({ text, files, replyTo }: { text: string; files: File[]; replyTo?: string }) => {
    if (!selectedConversationId) {
      toast.error(t("toasts.selectConversationFirst"));
      return;
    }
    if (isSupportReadOnly) {
      toast.error(supportReadOnlyNotice);
      return;
    }
    if (recipientUnavailable) {
      toast.error(t("page.recipientUnavailable"));
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
        replyTo,
      });

      setReplyToMessage(null);
      await loadMessages(selectedConversationId, false);
      await loadConversationList(false);
    } catch (sendError) {
      if (isSupportConversation && supportChatBlockReasonFromError(sendError)) {
        supportChatAccess.blockFor(sendError);
        toast.error(t("page.supportReadOnlyBlocked"));
        throw new Error(t("page.supportReadOnlyBlocked"));
      }
      const message = getErrorText(sendError, t("toasts.sendMessageFailed"));
      toast.error(message);
      throw new Error(message);
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

  const handleToggleStar = async (conversationId: string) => {
    try {
      await toggleConversationStar(conversationId);
      await loadConversationList(false);
    } catch (err) {
      toast.error(getErrorText(err, t("toasts.toggleStarFailed")));
    }
  };

  const handleToggleArchive = async (conversationId: string) => {
    try {
      await toggleConversationArchive(conversationId);
      await loadConversationList(false);
    } catch (err) {
      toast.error(getErrorText(err, t("toasts.toggleArchiveFailed")));
    }
  };

  const handleAddLabel = async (conversationId: string, label: string) => {
    try {
      await addConversationLabel(conversationId, label);
      await loadConversationList(false);
    } catch (err) {
      toast.error(getErrorText(err, t("toasts.addLabelFailed")));
    }
  };

  const handleRemoveLabel = async (conversationId: string, label: string) => {
    try {
      await removeConversationLabel(conversationId, label);
      await loadConversationList(false);
    } catch (err) {
      toast.error(getErrorText(err, t("toasts.removeLabelFailed")));
    }
  };

  const handleFilterChange = (filter: ChatFilter) => {
    setChatFilter(filter);
  };

  const handleChatSearch = async () => {
    if (!selectedConversationId || chatSearchQuery.trim().length < 2) return;
    setSearchingChat(true);
    try {
      const data = await searchChatMessages(selectedConversationId, chatSearchQuery.trim());
      setChatSearchResults(data.results);
      setChatSearchIndex(0);
    } catch (err) {
      toast.error(getErrorText(err, t("toasts.searchFailed")));
    } finally {
      setSearchingChat(false);
    }
  };

  if (loading || loadingConversations) {
    return (
      <div className="h-[calc(100dvh-var(--header-offset,4rem))] lg:h-[calc(100dvh-var(--header-offset,4rem)-3rem)] flex bg-white">
        {/* Left Panel - Conversation List Skeleton */}
        <div className="w-full md:w-80 md:min-w-[320px] border-r border-slate-200 flex flex-col p-4 space-y-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
        {/* Right Panel - Chat Area Skeleton */}
        <div className="hidden md:flex flex-1 flex-col">
          <div className="border-b border-slate-200 p-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="flex-1 p-6 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? 'w-1/3' : 'w-1/2'}`} />
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 p-4">
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
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
          <h2 className="mt-4 text-lg font-semibold text-gray-700">{t("page.unavailableTitle")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("page.unavailableBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-var(--header-offset,4rem))] lg:h-[calc(100dvh-var(--header-offset,4rem)-3rem)] flex bg-white">
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
              <h1 className="text-lg font-semibold text-gray-900">{t("page.title")}</h1>
            </div>
            {userRole === "customer" && (
              <Button
                variant={showNewChat ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowNewChat((prev) => !prev)}
                aria-label={t("page.newChat")}
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
                placeholder={t("page.searchConversations")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="px-3 py-2 bg-rose-50 text-xs text-rose-700 border-b border-rose-200">{error}</div>
        )}

        {showNewChat && userRole === "customer" ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-xs text-indigo-700">
                {t("page.pickProfessional")}
              </p>
            </div>

            {loadingProfessionals && (
              <div className="py-4 space-y-3 px-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            )}

            {!loadingProfessionals && professionalOptions.length === 0 && (
              <div className="py-6 text-sm text-gray-500 text-center">
                {t("page.noProfessionals")}
              </div>
            )}

            {!loadingProfessionals && professionalOptions.length > 0 && (
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
                        disabled={creatingConversation}
                        onClick={() => void startNewChat(professional._id)}
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
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ChatList
              conversations={filteredConversations}
              selectedConversationId={selectedConversationId}
              currentUserRole={userRole}
              currentUserId={user?._id}
              filter={chatFilter}
              userLabels={userLabels}
              onSelect={handleSelectConversation}
              onFilterChange={handleFilterChange}
              onToggleStar={handleToggleStar}
              onToggleArchive={handleToggleArchive}
              onAddLabel={handleAddLabel}
              onRemoveLabel={handleRemoveLabel}
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
            {/* Absence Banner */}
            {absence && !recipientUnavailable && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">
                  {t.rich("page.absence", {
                    from: new Date(absence.from).toLocaleDateString(intl),
                    to: new Date(absence.to).toLocaleDateString(intl),
                    date: (chunks) => <span className="font-medium">{chunks}</span>,
                  })}
                </p>
              </div>
            )}

            {/* Thread Header */}
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="md:hidden p-1 rounded hover:bg-gray-100"
                  onClick={handleBackToList}
                  aria-label={t("page.backToConversations")}
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600" />
                </button>
                {/* Profile pic in header */}
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center overflow-hidden shrink-0",
                  isSupportConversation ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-indigo-100"
                )}>
                  {!isSupportConversation && recipientUnavailable ? (
                    <UserX className="h-4 w-4 text-slate-500" aria-hidden />
                  ) : !isSupportConversation && otherParticipant?.profileImage ? (
                    <img src={otherParticipant.profileImage} alt="" className="h-full w-full object-cover" />
                  ) : isSupportConversation ? (
                    <ShieldCheck className="h-4 w-4 text-white" />
                  ) : (
                    <span className="text-xs font-semibold text-indigo-600">
                      {otherName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                    {otherName}
                    {isSupportConversation && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                        {t("common.official")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Send Quotation button for professionals */}
                {userRole === "professional" && selectedConversation && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-indigo-600"
                    onClick={openQuotationDialog}
                    disabled={creatingSendQuotation || recipientUnavailable}
                    aria-label={t("page.sendQuotation")}
                    title={recipientUnavailable ? t("page.recipientUnavailable") : t("page.sendQuotationTitle")}
                  >
                    {creatingSendQuotation ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  </Button>
                )}
                {/* Chat search toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500 hover:text-indigo-600"
                  onClick={() => {
                    setChatSearchOpen((prev) => !prev);
                    if (chatSearchOpen) {
                      setChatSearchQuery("");
                      setChatSearchResults([]);
                    }
                  }}
                  aria-label={t("page.searchInChat")}
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-500 hover:text-indigo-600"
                  onClick={() => setShowInfoPanel((prev) => !prev)}
                  aria-label={showInfoPanel ? t("page.hideInfoPanel") : t("page.showInfoPanel")}
                >
                  {showInfoPanel ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
                </Button>
              </div>
            </div>

            {/* In-chat search bar */}
            {chatSearchOpen && (
              <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder={t("page.searchMessages")}
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleChatSearch();
                  }}
                  className="flex-1 text-sm bg-transparent focus:outline-none"
                  autoFocus
                />
                {chatSearchResults.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span>
                      {t("page.searchPosition", { current: chatSearchIndex + 1, total: chatSearchResults.length })}
                    </span>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-gray-200"
                      onClick={() => {
                        const newIdx = chatSearchIndex > 0 ? chatSearchIndex - 1 : chatSearchResults.length - 1;
                        setChatSearchIndex(newIdx);
                        document.getElementById(`msg-${chatSearchResults[newIdx]?._id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      &uarr;
                    </button>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-gray-200"
                      onClick={() => {
                        const newIdx = chatSearchIndex < chatSearchResults.length - 1 ? chatSearchIndex + 1 : 0;
                        setChatSearchIndex(newIdx);
                        document.getElementById(`msg-${chatSearchResults[newIdx]?._id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      &darr;
                    </button>
                  </div>
                )}
                {searchingChat && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                <button
                  type="button"
                  className="p-1 rounded hover:bg-gray-200"
                  onClick={() => {
                    setChatSearchOpen(false);
                    setChatSearchQuery("");
                    setChatSearchResults([]);
                  }}
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>
            )}

            {/* Search results overlay */}
            {chatSearchResults.length > 0 && chatSearchOpen && (
              <div className="px-4 py-2 border-b border-indigo-100 bg-indigo-50/50 max-h-32 overflow-y-auto">
                {chatSearchResults.map((result, idx) => (
                  <button
                    key={result._id}
                    type="button"
                    className={cn(
                      "w-full text-left px-2 py-1 rounded text-xs hover:bg-indigo-100 truncate",
                      idx === chatSearchIndex ? "bg-indigo-100 font-medium" : ""
                    )}
                    onClick={() => {
                      setChatSearchIndex(idx);
                      // Scroll to message in thread
                      const el = document.getElementById(`msg-${result._id}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    <span className="text-gray-400 mr-1">
                      {new Date(result.createdAt).toLocaleDateString(intl)}
                    </span>
                    {isRedactedPlaceholderText(result.text)
                      ? t("common.messageDeleted")
                      : result.text?.slice(0, 80)}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 min-h-0">
              <ChatThread
                messages={messages}
                currentUserId={user?._id || null}
                currentUserRole={userRole}
                currentUserImage={user?.profileImage}
                currentUserName={user?.name}
                loading={loadingMessages}
                conversationId={selectedConversationId}
                onReplyTo={(msg) => setReplyToMessage(msg)}
              />
            </div>

            {/* Composer */}
            {isSupportClosed ? (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
                {t("page.supportClosed")}
              </div>
            ) : (
              <>
                {isSupportReadOnly && isSupportConversation ? (
                  <div
                    role="status"
                    className="flex flex-col gap-2 border-t border-indigo-100 bg-indigo-50/70 px-4 py-3 text-center text-sm text-indigo-800 sm:flex-row sm:items-center sm:justify-center"
                  >
                    <span>{supportReadOnlyNotice}</span>
                    {(supportChatAccess.reason === "disabled" ||
                      supportChatAccess.reason === "unavailable" ||
                      supportChatAccess.reason === "blocked") && (
                      <button
                        type="button"
                        onClick={() => supportChatAccess.reload()}
                        className="mx-auto inline-flex min-h-8 items-center rounded-lg border border-indigo-300 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:mx-0"
                      >
                        {t("page.supportReadOnlyRetry")}
                      </button>
                    )}
                  </div>
                ) : null}
                {/* Kept mounted while read-only so drafts/attachments survive. */}
                <ChatComposer
                  disabled={!selectedConversationId || isSupportReadOnly}
                  sending={sending}
                  replyTo={replyToMessage}
                  onCancelReply={() => setReplyToMessage(null)}
                  onSend={handleSend}
                />
              </>
            )}
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <MessageSquare className="h-16 w-16 mb-4" />
            <p className="text-sm">{t("page.selectConversation")}</p>
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

      <Dialog open={showQuotationDialog} onOpenChange={setShowQuotationDialog}>
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
            <Button onClick={handleSendQuotation} disabled={creatingSendQuotation || loadingProjects} className="w-full">
              {creatingSendQuotation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {t("quotationDialog.createDraft")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
