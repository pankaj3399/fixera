"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatAttachment, ChatMessage } from "@/types/chat";
import { cn, getAuthToken } from "@/lib/utils";
import { FileText, Download, Star, MessageSquare, Loader2, Reply, Flag, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { reportChatMessage } from "@/lib/chatApi";

interface ChatThreadProps {
  messages: ChatMessage[];
  currentUserId: string | null;
  currentUserRole?: string;
  currentUserImage?: string | null;
  currentUserName?: string;
  loading: boolean;
  conversationId?: string | null;
  onReviewReplySubmitted?: () => void;
  onReplyTo?: (message: ChatMessage) => void;
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

const resolveSenderName = (sender: unknown): string => {
  if (sender && typeof sender === "object") {
    const s = sender as { username?: string; name?: string };
    return s.username || s.name || "User";
  }
  return "User";
};

const getSenderName = (message: ChatMessage) =>
  resolveSenderName(message.senderId);

const getSenderImage = (message: ChatMessage) => {
  const sender = message.senderId as unknown;
  if (sender && typeof sender === "object") {
    return (sender as { profileImage?: string }).profileImage || null;
  }
  return null;
};

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "scam", label: "Scam" },
  { value: "other", label: "Other" },
];

function ReportDialog({
  messageId,
  open,
  onOpenChange,
}: {
  messageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }
    setSubmitting(true);
    try {
      await reportChatMessage(messageId, reason, description.trim() || undefined);
      toast.success("Report submitted");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-sm">Report Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <label
              key={r.value}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors",
                reason === r.value ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
              )}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="sr-only"
              />
              {r.label}
            </label>
          ))}
        </div>
        <Textarea
          placeholder="Additional details (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-xs min-h-[50px]"
          maxLength={500}
        />
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Submit Report
          </Button>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

function WarrantyNotificationCard({ message }: { message: ChatMessage }) {
  const router = useRouter();
  const meta = message.warrantyMeta;

  if (!meta) return null;

  const handleOpenClaim = () => {
    const params = new URLSearchParams();
    params.set("claimId", meta.claimId);
    router.push(`/dashboard/warranty-claims?${params.toString()}`);
  };

  return (
    <div className="flex justify-center my-4">
      <button
        type="button"
        onClick={handleOpenClaim}
        className="w-[92%] max-w-lg rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-sky-600" />
              <span className="text-sm font-semibold text-slate-900">Warranty Claim Update</span>
            </div>
            <p className="text-sm font-medium text-slate-800">{meta.claimNumber}</p>
            {message.text && <p className="mt-1 text-sm text-slate-600">{message.text}</p>}
          </div>
          <ArrowRight className="h-4 w-4 text-sky-600 shrink-0 mt-1" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {meta.status ? `Status: ${meta.status.replace(/_/g, " ")}` : "Open claim details"}
          </span>
          <span className="text-xs font-medium text-sky-700">Open warranty page</span>
        </div>
      </button>
    </div>
  );
}

function ReplyToPreview({ replyTo, isMine }: { replyTo: ChatMessage["replyTo"]; isMine: boolean }) {
  if (!replyTo) return null;
  const name = resolveSenderName(replyTo.senderId);
  const previewText = replyTo.text?.slice(0, 100) || (replyTo.images?.length ? "[Image]" : "");

  const scrollToOriginal = () => {
    const el = document.getElementById(`msg-${replyTo._id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-indigo-400", "ring-offset-1");
      setTimeout(() => el.classList.remove("ring-2", "ring-indigo-400", "ring-offset-1"), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={scrollToOriginal}
      className={cn(
        "w-full text-left flex items-start gap-2 px-3 py-2 mb-1 rounded-lg cursor-pointer transition-colors",
        "border-l-[3px] border-indigo-500",
        isMine
          ? "bg-indigo-900/30 hover:bg-indigo-900/40"
          : "bg-indigo-50 hover:bg-indigo-100"
      )}
    >
      <Reply className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", isMine ? "text-white" : "text-indigo-500")} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[11px] font-semibold", isMine ? "text-white" : "text-indigo-600")}>
          {name}
        </p>
        <p className={cn("text-[11px] truncate", isMine ? "text-indigo-50" : "text-gray-500")}>
          {previewText}
        </p>
      </div>
    </button>
  );
}

export default function ChatThread({ messages, currentUserId, currentUserRole, currentUserImage, currentUserName, loading, conversationId, onReviewReplySubmitted, onReplyTo }: ChatThreadProps) {
  const [reportingId, setReportingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (loading) return;

    const frame = window.requestAnimationFrame(() => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "auto", block: "end" });
      } else if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, loading, messages.length]);

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
    <div ref={containerRef} className="h-full overflow-y-auto p-4 space-y-3 bg-slate-50/50">
      {messages.map((message, index) => {
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

        if (message.messageType === "warranty_notification") {
          return (
            <div key={message._id} id={`msg-${message._id}`}>
              <WarrantyNotificationCard message={message} />
            </div>
          );
        }

        if (message.messageType === "quotation_notification" && message.quotationMeta) {
          const meta = message.quotationMeta;
          return (
            <div key={message._id} id={`msg-${message._id}`} className="flex justify-center my-2">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 max-w-sm w-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-purple-700 font-semibold text-sm">
                    {meta.version > 1 ? 'Updated Quotation' : 'New Quotation'}
                  </span>
                  <span className="text-xs text-purple-500">{meta.quotationNumber}</span>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">
                    v{meta.version}
                  </span>
                  {meta.status && (
                    <span className="rounded-full border border-purple-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-600">
                      {String(meta.status).replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-700 mb-1"><strong>Scope:</strong> {meta.scope}</p>
                <p className="text-xs text-gray-700 mb-1"><strong>Amount:</strong> {meta.currency} {Number(meta.totalAmount).toFixed(2)}</p>
                <p className="text-xs text-gray-500 mb-3">Valid until {(() => { const [y, m, d] = String(meta.validUntil).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(); })()}</p>
                <a
                  href={`/bookings/${meta.bookingId}`}
                  className="inline-block text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 px-3 py-1.5 rounded transition-colors"
                >
                  View & Respond
                </a>
              </div>
            </div>
          );
        }

        const isMine = getSenderId(message) === currentUserId;
        const senderName = getSenderName(message);
        const senderImage = getSenderImage(message);
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showAvatar = !prevMessage || getSenderId(prevMessage) !== getSenderId(message) || prevMessage.messageType === "review_notification";

        return (
          <div
            key={message._id}
            id={`msg-${message._id}`}
            className={cn("flex gap-2 group/msg", isMine ? "justify-end" : "justify-start")}
          >
            {/* Avatar — other user */}
            {!isMine && (
              <div className="w-8 shrink-0">
                {showAvatar && (
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden">
                    {senderImage ? (
                      <img src={senderImage} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-semibold text-indigo-600">
                        {senderName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="relative w-[320px] max-w-[80%]">
              {/* Reply-to preview */}
              {message.replyTo && <ReplyToPreview replyTo={message.replyTo} isMine={isMine} />}

              <div
                className={cn(
                  "rounded-lg px-3 py-2 shadow-sm w-full",
                  isMine ? "bg-indigo-600 text-white" : "bg-white text-gray-900 border border-slate-200"
                )}
              >
                
                {!isMine && showAvatar && <p className="mb-1 text-[11px] font-semibold text-indigo-700">{senderName}</p>}
                {message.text && <p className="text-sm whitespace-pre-wrap">{message.text}</p>}

                {Array.isArray(message.images) && message.images.length > 0 && (
                  <div className={cn("mt-2 grid gap-2", message.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                    {message.images.map((imageUrl, imgIndex) => (
                      <a
                        key={`${message._id}-image-${imgIndex}`}
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
                    {message.attachments.map((att: ChatAttachment, attIndex: number) => {
                      if (att.fileType === "image") {
                        return (
                          <a
                            key={`${message._id}-att-${attIndex}`}
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
                            key={`${message._id}-att-${attIndex}`}
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
                          key={`${message._id}-att-${attIndex}`}
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

              {/* Hover actions: Reply + Report — always in DOM, shown via CSS */}
              <div
                className={cn(
                  "absolute top-0 flex gap-0.5 bg-white border border-slate-200 rounded-md shadow-sm p-0.5 z-10 transition-opacity",
                  "opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100",
                  "[@media(hover:none)]:opacity-70",
                  isMine ? "left-0 -translate-x-full -ml-1" : "right-0 translate-x-full ml-1"
                )}
              >
                {onReplyTo && (
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-slate-100"
                    onClick={() => onReplyTo(message)}
                    title="Reply"
                  >
                    <Reply className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                )}
                {!isMine && (
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-slate-100"
                    onClick={() => setReportingId(message._id)}
                    title="Report"
                  >
                    <Flag className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                )}
              </div>
            </div>

            {/* Avatar — own user */}
            {isMine && (
              <div className="w-8 shrink-0">
                {showAvatar && (
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden">
                    {(senderImage || currentUserImage) ? (
                      <img src={(senderImage || currentUserImage)!} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-semibold text-indigo-600">
                        {(currentUserName || senderName).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />

      {/* Report dialog */}
      <ReportDialog
        messageId={reportingId || ""}
        open={!!reportingId}
        onOpenChange={(open) => { if (!open) setReportingId(null); }}
      />
    </div>
  );
}
