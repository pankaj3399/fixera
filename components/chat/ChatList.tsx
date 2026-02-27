"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChatConversation } from "@/types/chat";

interface ChatListProps {
  conversations: ChatConversation[];
  selectedConversationId: string | null;
  currentUserRole: string | undefined;
  onSelect: (conversationId: string) => void;
}

const getParticipantDisplay = (conversation: ChatConversation, role: string | undefined) => {
  if (role === "professional") {
    const customer = conversation.customerId;
    return {
      name: customer?.name || "Customer",
      subtitle: customer?.email || "",
    };
  }

  const professional = conversation.professionalId;
  const professionalName = professional?.businessInfo?.companyName || professional?.name;
  return {
    name: professionalName || "Professional",
    subtitle: professional?.businessInfo?.city || professional?.email || "",
  };
};

const getUnreadCount = (conversation: ChatConversation, role: string | undefined) => {
  if (role === "professional") {
    return conversation.professionalUnreadCount || 0;
  }
  return conversation.customerUnreadCount || 0;
};

export default function ChatList({
  conversations,
  selectedConversationId,
  currentUserRole,
  onSelect,
}: ChatListProps) {
  return (
    <div className="h-full overflow-y-auto">
      {conversations.length === 0 && (
        <div className="p-4 text-sm text-gray-500">No conversations yet.</div>
      )}

      <div className="divide-y divide-slate-100">
        {conversations.map((conversation) => {
          const participant = getParticipantDisplay(conversation, currentUserRole);
          const unread = getUnreadCount(conversation, currentUserRole);
          const isSelected = selectedConversationId === conversation._id;

          return (
            <button
              key={conversation._id}
              type="button"
              onClick={() => onSelect(conversation._id)}
              className={cn(
                "w-full px-4 py-3 text-left transition-colors hover:bg-slate-50",
                isSelected && "bg-indigo-50"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{participant.name}</p>
                  {participant.subtitle && (
                    <p className="truncate text-xs text-gray-500">{participant.subtitle}</p>
                  )}
                  {conversation.lastMessagePreview && (
                    <p className="mt-1 truncate text-xs text-gray-600">{conversation.lastMessagePreview}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {conversation.lastMessageAt && (
                    <span className="text-[11px] text-gray-400">
                      {new Date(conversation.lastMessageAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {unread > 0 && (
                    <Badge className="bg-indigo-600 text-white text-[10px]">{unread}</Badge>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
