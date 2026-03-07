"use client";

import { useState } from "react";
import type { ChatAttachment, ChatMessage } from "@/types/chat";
import { cn, getAuthToken } from "@/lib/utils";
import { FileText, Download, Star, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ChatThreadProps {
  messages: ChatMessage[];
  currentUserId: string | null;
  currentUserRole?: string;
  loading: boolean;
  onReviewReplySubmitted?: () => void;
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

function ReviewNotificationCard({
  message,
  isProfessional,
  onReplySubmitted,
}: {
  message: ChatMessage;
  isProfessional: boolean;
  onReplySubmitted?: () => void;
}) {
  const meta = message.reviewMeta;
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!meta) return null;

  const handleReply = async () => {
    if (!replyText.trim()) {
      toast.error("Please enter a reply");
      return;
    }
    setSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/${meta.bookingId}/customer-review/reply`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ comment: replyText.trim() }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Reply posted successfully");
        setShowReply(false);
        setReplyText("");
        onReplySubmitted?.();
      } else {
        toast.error(data.msg || "Failed to post reply");
      }
    } catch {
      toast.error("Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center my-4">
      <div className="w-[90%] max-w-md rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
          <span className="text-sm font-semibold text-gray-800">New Review from {meta.customerName}</span>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl font-bold text-gray-900">{meta.avgRating.toFixed(1)}</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-4 w-4 ${
                  star <= Math.round(meta.avgRating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1 text-xs text-gray-600 mb-3">
          <div className="flex justify-between"><span>Communication</span><span className="font-medium">{meta.communicationLevel}/5</span></div>
          <div className="flex justify-between"><span>Value of Delivery</span><span className="font-medium">{meta.valueOfDelivery}/5</span></div>
          <div className="flex justify-between"><span>Quality of Service</span><span className="font-medium">{meta.qualityOfService}/5</span></div>
        </div>

        {meta.comment && (
          <p className="text-sm text-gray-700 italic border-l-2 border-yellow-300 pl-3 mb-3">
            &ldquo;{meta.comment}&rdquo;
          </p>
        )}

        {isProfessional && !showReply && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setShowReply(true)}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Reply Publicly
          </Button>
        )}

        {showReply && (
          <div className="space-y-2 mt-2">
            <Textarea
              placeholder="Write your public reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="text-sm min-h-[60px]"
              maxLength={1000}
            />
            <div className="flex gap-2">
              <Button size="sm" className="text-xs flex-1" onClick={handleReply} disabled={submitting}>
                {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Post Reply
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowReply(false)} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-400 mt-2">
          {new Date(message.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function ChatThread({ messages, currentUserId, currentUserRole, loading, onReviewReplySubmitted }: ChatThreadProps) {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className={`h-8 rounded-2xl bg-gray-200/70 animate-pulse ${i % 2 === 0 ? 'w-1/3' : 'w-1/2'}`} />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No messages yet. Say hello.</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 bg-slate-50/50">
      {messages.map((message) => {
        if (message.messageType === "review_notification") {
          return (
            <ReviewNotificationCard
              key={message._id}
              message={message}
              isProfessional={currentUserRole === "professional"}
              onReplySubmitted={onReviewReplySubmitted}
            />
          );
        }

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
                          <track kind="captions" src="" srcLang="en" label="Captions (not available)" />
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
