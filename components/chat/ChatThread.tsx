"use client";

import type { ChatAttachment, ChatMessage } from "@/types/chat";
import { cn } from "@/lib/utils";
import { FileText, Download } from "lucide-react";

interface ChatThreadProps {
  messages: ChatMessage[];
  currentUserId: string | null;
  loading: boolean;
}

const getSenderId = (message: ChatMessage) => {
  const sender = message.senderId as unknown;
  if (typeof sender === "string") return sender;
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
                      rel="noreferrer noopener"
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

              {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                <div className="mt-2 space-y-2">
                  {message.attachments.map((att: ChatAttachment, index: number) => {
                    if (att.fileType === "image") {
                      return (
                        <a
                          key={`${message._id}-att-${index}`}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block"
                        >
                          <img
                            src={att.url}
                            alt={att.fileName}
                            className="max-h-56 w-full rounded-md object-cover"
                          />
                        </a>
                      );
                    }

                    if (att.fileType === "video") {
                      return (
                        <video
                          key={`${message._id}-att-${index}`}
                          src={att.url}
                          controls
                          className="max-h-56 w-full rounded-md"
                        >
                          Your browser does not support video playback.
                        </video>
                      );
                    }

                    return (
                      <a
                        key={`${message._id}-att-${index}`}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                          isMine
                            ? "border-indigo-400 text-indigo-100 hover:bg-indigo-500"
                            : "border-slate-200 text-gray-700 hover:bg-slate-50"
                        )}
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate flex-1">{att.fileName}</span>
                        <Download className="h-3 w-3 shrink-0" />
                      </a>
                    );
                  })}
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
