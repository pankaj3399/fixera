"use client";

import type { ChatMessage } from "@/types/chat";
import { cn } from "@/lib/utils";

interface ChatThreadProps {
  messages: ChatMessage[];
  currentUserId: string | null;
  loading: boolean;
}

const getSenderId = (message: ChatMessage) => {
  const sender = message.senderId as unknown;
  if (sender && typeof sender === "object" && "_id" in (sender as Record<string, unknown>)) {
    const senderId = (sender as { _id?: string })._id;
    if (senderId) return senderId;
  }
  return "";
};

const getSenderName = (message: ChatMessage) => {
  const sender = message.senderId as unknown;
  if (sender && typeof sender === "object") {
    const senderRecord = sender as { name?: string; businessInfo?: { companyName?: string } };
    return senderRecord.businessInfo?.companyName || senderRecord.name || "User";
  }
  return "User";
};

export default function ChatThread({ messages, currentUserId, loading }: ChatThreadProps) {
  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading messages...</div>;
  }

  if (messages.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No messages yet. Say hello.</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 bg-slate-50/50">
      {messages.map((message) => {
        const isMine = getSenderId(message) === currentUserId;
        const senderName = getSenderName(message);

        return (
          <div
            key={message._id}
            className={cn("flex", isMine ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 shadow-sm",
                isMine ? "bg-indigo-600 text-white" : "bg-white text-gray-900 border border-slate-200"
              )}
            >
              {!isMine && <p className="mb-1 text-[11px] font-semibold text-indigo-700">{senderName}</p>}
              {message.text && <p className="text-sm whitespace-pre-wrap">{message.text}</p>}

              {Array.isArray(message.images) && message.images.length > 0 && (
                <div className={cn("mt-2 grid gap-2", message.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                  {message.images.map((imageUrl, index) => (
                    <a
                      key={`${message._id}-image-${index}`}
                      href={imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={imageUrl}
                        alt="Chat attachment"
                        className="max-h-56 w-full rounded-md object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}

              <p className={cn("mt-2 text-[10px]", isMine ? "text-indigo-100" : "text-gray-400")}>
                {new Date(message.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
