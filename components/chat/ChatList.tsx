"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Star, Archive, Tag, MoreVertical, X } from "lucide-react";
import type { ChatConversation, ChatFilter } from "@/types/chat";

interface ChatListProps {
  conversations: ChatConversation[];
  selectedConversationId: string | null;
  currentUserRole: string | undefined;
  currentUserId: string | undefined;
  filter: ChatFilter;
  userLabels: string[];
  compact?: boolean;
  onSelect: (conversationId: string) => void;
  onFilterChange: (filter: ChatFilter) => void;
  onToggleStar: (conversationId: string) => void;
  onToggleArchive: (conversationId: string) => void;
  onAddLabel: (conversationId: string, label: string) => void;
  onRemoveLabel: (conversationId: string, label: string) => void;
}

type ParticipantDisplay = {
  name?: string;
  nameFallback:
    | "common.supportThread"
    | "common.fixtractSupport"
    | "common.customer"
    | "common.professional";
  subtitle?: string;
  subtitleFallback?: "common.officialSupportTeam";
  profileImage?: string;
  isSupport: boolean;
};

const getParticipantDisplay = (conversation: ChatConversation, role: string | undefined): ParticipantDisplay => {
  if (conversation.type === "support") {
    if (role === "admin") {
      const target = conversation.supportTargetUserId;
      return {
        name: target?.name || target?.username,
        nameFallback: "common.supportThread" as const,
        subtitle: target?.email || target?.role || "",
        profileImage: target?.profileImage,
        isSupport: false as const,
      };
    }
    return {
      name: undefined,
      nameFallback: "common.fixtractSupport" as const,
      subtitle: "",
      subtitleFallback: "common.officialSupportTeam" as const,
      profileImage: undefined,
      isSupport: true as const,
    };
  }

  if (role === "professional") {
    const customer = conversation.customerId;
    return {
      name: customer?.name,
      nameFallback: "common.customer" as const,
      subtitle: customer?.email || "",
      profileImage: customer?.profileImage,
      isSupport: false as const,
    };
  }

  const professional = conversation.professionalId;
  return {
    name: professional?.username || professional?.name,
    nameFallback: "common.professional" as const,
    subtitle: professional?.businessInfo?.city || professional?.email || "",
    profileImage: professional?.profileImage,
    isSupport: false as const,
  };
};

const getUnreadCount = (conversation: ChatConversation, role: string | undefined) => {
  if (conversation.type === "support") {
    if (role === "admin") {
      return conversation.professionalUnreadCount || 0;
    }
    return conversation.customerUnreadCount || 0;
  }
  if (role === "professional") {
    return conversation.professionalUnreadCount || 0;
  }
  return conversation.customerUnreadCount || 0;
};

const FILTER_OPTIONS: {
  value: ChatFilter;
  labelKey: "list.filters.all" | "list.filters.unread" | "list.filters.starred" | "list.filters.archived";
}[] = [
  { value: "all", labelKey: "list.filters.all" },
  { value: "unread", labelKey: "list.filters.unread" },
  { value: "starred", labelKey: "list.filters.starred" },
  { value: "archived", labelKey: "list.filters.archived" },
];

export default function ChatList({
  conversations,
  selectedConversationId,
  currentUserRole,
  currentUserId,
  filter,
  userLabels,
  compact,
  onSelect,
  onFilterChange,
  onToggleStar,
  onToggleArchive,
  onAddLabel,
  onRemoveLabel,
}: ChatListProps) {
  const t = useTranslations("chat");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [labelInputId, setLabelInputId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const formatRelativeTime = (dateString: string): string => {
    const now = Date.now();
    const date = new Date(dateString).getTime();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffMonth = Math.floor(diffDay / 30);

    if (diffSec < 60) return t("list.justNow");
    if (diffMin < 60) return t("list.minutesAgo", { count: diffMin });
    if (diffHour < 24) return t("list.hoursAgo", { count: diffHour });
    if (diffDay < 30) return t("list.daysAgo", { count: diffDay });
    return t("list.monthsAgo", { count: diffMonth });
  };

  const handleAddLabel = (conversationId: string) => {
    const trimmed = newLabel.trim();
    if (trimmed) {
      onAddLabel(conversationId, trimmed);
      setNewLabel("");
      setLabelInputId(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Filter tabs */}
      {!compact && (
        <div className="px-3 py-2 border-b border-slate-100 flex gap-1 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFilterChange(opt.value)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors",
                filter === opt.value
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100"
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
          {userLabels.map((label) => (
            <button
              key={`label:${label}`}
              type="button"
              onClick={() => onFilterChange(`label:${label}`)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors",
                filter === `label:${label}`
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100"
              )}
            >
              <Tag className="h-2.5 w-2.5 inline mr-0.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <div className="p-4 text-sm text-gray-500">{t("list.empty")}</div>
        )}

        <div className="divide-y divide-slate-100">
          {conversations.map((conversation) => {
            const participant = getParticipantDisplay(conversation, currentUserRole);
            const participantName = participant.name || t(participant.nameFallback);
            const participantSubtitle =
              participant.subtitle ||
              (participant.subtitleFallback ? t(participant.subtitleFallback) : "");
            const unread = getUnreadCount(conversation, currentUserRole);
            const isSelected = selectedConversationId === conversation._id;
            const isStarred = currentUserId ? conversation.starredBy?.includes(currentUserId) : false;
            const myLabels = currentUserId
              ? (conversation.labels || []).filter((l) => l.userId === currentUserId)
              : [];
            const isMenuOpen = menuOpenId === conversation._id;

            return (
              <div key={conversation._id} className="relative group">
                <button
                  type="button"
                  onClick={() => onSelect(conversation._id)}
                  className={cn(
                    "w-full px-4 py-3 pr-14 text-left transition-colors hover:bg-slate-50",
                    isSelected && "bg-indigo-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {/* Profile pic */}
                      <div className={cn(
                        "h-9 w-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden",
                        participant.isSupport
                          ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                          : "bg-indigo-100"
                      )}>
                        {participant.profileImage ? (
                          <img
                            src={participant.profileImage}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className={cn(
                            "text-xs font-semibold",
                            participant.isSupport ? "text-white" : "text-indigo-600"
                          )}>
                            {participant.isSupport ? "F" : participantName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="truncate text-sm font-medium text-gray-900">{participantName}</p>
                          {participant.isSupport && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-indigo-100 text-indigo-700">
                              {t("common.official")}
                            </Badge>
                          )}
                          {isStarred && (
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
                          )}
                        </div>
                        {participantSubtitle && (
                          <p className="truncate text-xs text-gray-500">{participantSubtitle}</p>
                        )}
                        {conversation.lastMessagePreview && (
                          <p className="mt-0.5 truncate text-xs text-gray-600">{conversation.lastMessagePreview}</p>
                        )}
                        {myLabels.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {myLabels.map((l) => (
                              <span
                                key={l.label}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600"
                                style={l.color ? { backgroundColor: `${l.color}20`, color: l.color } : undefined}
                              >
                                {l.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {conversation.lastMessageAt && (
                        <span className="text-[11px] text-gray-400">
                          {formatRelativeTime(conversation.lastMessageAt)}
                        </span>
                      )}
                      {unread > 0 && (
                        <Badge className="bg-indigo-600 text-white text-[10px]">{unread}</Badge>
                      )}
                    </div>
                  </div>
                </button>

                {/* Context menu trigger */}
                {!compact && (
                  <button
                    type="button"
                    className={cn(
                      "absolute top-3 right-3 p-1.5 rounded-md bg-white border border-slate-200 shadow-sm transition-opacity",
                      "hover:bg-slate-100 hover:border-slate-300",
                      "focus:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-500",
                      "[@media(hover:none)]:opacity-0 [@media(hover:none)]:pointer-events-none",
                      isMenuOpen ? "opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto" : "opacity-0 group-hover:opacity-100"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(isMenuOpen ? null : conversation._id);
                      setLabelInputId(null);
                    }}
                    aria-label={t("list.options")}
                  >
                    <MoreVertical className="h-4 w-4 text-gray-600" />
                  </button>
                )}

                {/* Dropdown menu */}
                {!compact && isMenuOpen && (
                  <div
                    ref={menuRef}
                    className="absolute right-2 top-10 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 flex items-center gap-2"
                      onClick={() => {
                        onToggleStar(conversation._id);
                        setMenuOpenId(null);
                      }}
                    >
                      <Star className={cn("h-3.5 w-3.5", isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-400")} />
                      {isStarred ? t("list.unstar") : t("list.star")}
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 flex items-center gap-2"
                      onClick={() => {
                        onToggleArchive(conversation._id);
                        setMenuOpenId(null);
                      }}
                    >
                      <Archive className="h-3.5 w-3.5 text-gray-400" />
                      {conversation.archivedBy?.includes(currentUserId || "") ? t("list.unarchive") : t("list.archive")}
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <div className="px-3 py-1">
                      <p className="text-[10px] text-gray-400 mb-1">{t("list.labels")}</p>
                      {myLabels.map((l) => (
                        <div key={l.label} className="flex items-center justify-between py-0.5">
                          <span className="text-xs text-gray-600">{l.label}</span>
                          <button
                            type="button"
                            onClick={() => onRemoveLabel(conversation._id, l.label)}
                            className="p-0.5 hover:bg-gray-100 rounded"
                          >
                            <X className="h-2.5 w-2.5 text-gray-400" />
                          </button>
                        </div>
                      ))}
                      {labelInputId === conversation._id ? (
                        <div className="flex gap-1 mt-1">
                          <input
                            type="text"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddLabel(conversation._id);
                            }}
                            placeholder={t("list.labelName")}
                            className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            maxLength={30}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleAddLabel(conversation._id)}
                            className="text-[10px] text-indigo-600 font-medium hover:text-indigo-700"
                          >
                            {t("list.add")}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-[10px] text-indigo-600 mt-1 hover:text-indigo-700"
                          onClick={() => {
                            setLabelInputId(conversation._id);
                            setNewLabel("");
                          }}
                        >
                          {t("list.addLabel")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
