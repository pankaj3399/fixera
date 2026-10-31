"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ChatAttachment, ChatMessage } from "@/types/chat";
import { cn, getAuthToken } from "@/lib/utils";
import { FileText, Download, Star, MessageSquare, Loader2, Reply, Flag, ShieldCheck, ArrowRight, UserX } from "lucide-react";
import { isAnonymizedIdentity, isRedactedPlaceholderText } from "@/lib/anonymizedUsers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { reportChatMessage } from "@/lib/chatApi";
import { useErrorMessage } from "@/lib/i18n/useErrorMessage";
import { useCommissionRate } from "@/hooks/useCommissionRate";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useFormatLocale } from "@/lib/i18n/useFormatLocale";

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
    return s.username || s.name || "";
  }
  return "";
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

const REPORT_REASON_KEYS = {
  spam: "report.reasons.spam",
  harassment: "report.reasons.harassment",
  inappropriate: "report.reasons.inappropriate",
  scam: "report.reasons.scam",
  other: "report.reasons.other",
} as const;

const REPORT_REASONS: { value: keyof typeof REPORT_REASON_KEYS }[] = [
  { value: "spam" },
  { value: "harassment" },
  { value: "inappropriate" },
  { value: "scam" },
  { value: "other" },
];

const WARRANTY_STATUS_KEYS = {
  open: "thread.warrantyStatuses.open",
  proposal_sent: "thread.warrantyStatuses.proposalSent",
  proposal_accepted: "thread.warrantyStatuses.proposalAccepted",
  resolved: "thread.warrantyStatuses.resolved",
  escalated: "thread.warrantyStatuses.escalated",
  closed: "thread.warrantyStatuses.closed",
} as const;

const QUOTATION_STATUS_KEYS = {
  quoted: "thread.quotationStatuses.quoted",
} as const;

function ReportDialog({
  messageId,
  open,
  onOpenChange,
}: {
  messageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("chat");
  const getErrorText = useErrorMessage();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      toast.error(t("report.selectReason"));
      return;
    }
    setSubmitting(true);
    try {
      await reportChatMessage(messageId, reason, description.trim() || undefined);
      toast.success(t("report.submitted"));
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorText(err, t("report.failed")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-sm">{t("report.title")}</DialogTitle>
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
              {t(REPORT_REASON_KEYS[r.value])}
            </label>
          ))}
        </div>
        <Textarea
          placeholder={t("report.detailsPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-xs min-h-[50px]"
          maxLength={500}
        />
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {t("report.submit")}
          </Button>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
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
  const t = useTranslations("chat");
  const getErrorText = useErrorMessage();
  const { intl } = useFormatLocale();
  const meta = message.reviewMeta;
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!meta) return null;

  const handleReply = async () => {
    if (!replyText.trim()) {
      toast.error(t("reviewCard.enterReply"));
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
        toast.success(t("reviewCard.replyPosted"));
        setShowReply(false);
        setReplyText("");
        onReplySubmitted?.();
      } else {
        toast.error(getErrorText(data, t("reviewCard.replyFailed")));
      }
    } catch (err) {
      toast.error(getErrorText(err, t("reviewCard.replyFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center my-4">
      <div className="w-[90%] max-w-md rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
          <span className="text-sm font-semibold text-gray-800">{t("reviewCard.title", { name: meta.customerName })}</span>
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
          <div className="flex justify-between"><span>{t("ratings.communication")}</span><span className="font-medium">{meta.communicationLevel}/5</span></div>
          <div className="flex justify-between"><span>{t("ratings.valueOfDelivery")}</span><span className="font-medium">{meta.valueOfDelivery}/5</span></div>
          <div className="flex justify-between"><span>{t("ratings.qualityOfService")}</span><span className="font-medium">{meta.qualityOfService}/5</span></div>
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
            {t("reviewCard.replyPublicly")}
          </Button>
        )}

        {showReply && (
          <div className="space-y-2 mt-2">
            <Textarea
              placeholder={t("reviewCard.replyPlaceholder")}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="text-sm min-h-[60px]"
              maxLength={1000}
            />
            <div className="flex gap-2">
              <Button size="sm" className="text-xs flex-1" onClick={handleReply} disabled={submitting}>
                {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {t("reviewCard.postReply")}
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowReply(false)} disabled={submitting}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-400 mt-2">
          {new Date(message.createdAt).toLocaleString(intl)}
        </p>
      </div>
    </div>
  );
}

function WarrantyNotificationCard({ message }: { message: ChatMessage }) {
  const t = useTranslations("chat");
  const router = useRouter();
  const meta = message.warrantyMeta;

  if (!meta) return null;

  const statusKey = meta.status
    ? WARRANTY_STATUS_KEYS[meta.status.toLowerCase() as keyof typeof WARRANTY_STATUS_KEYS]
    : undefined;

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
              <span className="text-sm font-semibold text-slate-900">{t("thread.warrantyClaimUpdate")}</span>
            </div>
            <p className="text-sm font-medium text-slate-800">{meta.claimNumber}</p>
            {message.text && <p className="mt-1 text-sm text-slate-600">{message.text}</p>}
          </div>
          <ArrowRight className="h-4 w-4 text-sky-600 shrink-0 mt-1" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {meta.status
              ? t("thread.status", { status: statusKey ? t(statusKey) : meta.status.replace(/_/g, " ") })
              : t("thread.openClaimDetails")}
          </span>
          <span className="text-xs font-medium text-sky-700">{t("thread.openWarrantyPage")}</span>
        </div>
      </button>
    </div>
  );
}

function ReplyToPreview({ replyTo, isMine }: { replyTo: ChatMessage["replyTo"]; isMine: boolean }) {
  const t = useTranslations("chat");
  if (!replyTo) return null;
  const name = isAnonymizedIdentity(replyTo.senderId)
    ? t("common.deletedUser")
    : resolveSenderName(replyTo.senderId) || t("common.user");
  const previewText = isRedactedPlaceholderText(replyTo.text)
    ? t("common.messageDeleted")
    : replyTo.text?.slice(0, 100) || (replyTo.images?.length ? t("common.image") : "");

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
  const t = useTranslations("chat");
  const { intl } = useFormatLocale();
  const { formatMoney } = useCurrency();
  const [reportingId, setReportingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { customerPrice } = useCommissionRate();

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
    return <div className="p-4 text-sm text-gray-500">{t("thread.empty")}</div>;
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
          const quotationStatusKey = meta.status
            ? QUOTATION_STATUS_KEYS[String(meta.status).toLowerCase() as keyof typeof QUOTATION_STATUS_KEYS]
            : undefined;
          return (
            <div key={message._id} id={`msg-${message._id}`} className="flex justify-center my-2">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 max-w-sm w-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-purple-700 font-semibold text-sm">
                    {meta.version > 1 ? t("thread.updatedQuotation") : t("thread.newQuotation")}
                  </span>
                  <span className="text-xs text-purple-500">{meta.quotationNumber}</span>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">
                    v{meta.version}
                  </span>
                  {meta.status && (
                    <span className="rounded-full border border-purple-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-600">
                      {quotationStatusKey ? t(quotationStatusKey) : String(meta.status).replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-700 mb-1"><strong>{t("thread.scope")}</strong> {meta.scope}</p>
                <p className="text-xs text-gray-700 mb-1"><strong>{t("thread.amount")}</strong> {formatMoney(currentUserRole === 'customer' ? customerPrice(Number(meta.totalAmount)) : Number(meta.totalAmount), meta.currency)}</p>
                {meta.validUntil && (() => {
                  const raw = String(meta.validUntil).trim();
                  if (!raw) return null;
                  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
                  let parsed: Date | null = null;
                  if (isoMatch) {
                    const year = Number(isoMatch[1]);
                    const month = Number(isoMatch[2]);
                    const day = Number(isoMatch[3]);
                    const candidate = new Date(year, month - 1, day);
                    if (candidate.getFullYear() === year && candidate.getMonth() + 1 === month && candidate.getDate() === day) {
                      parsed = candidate;
                    }
                  } else {
                    const fallback = new Date(raw);
                    if (!isNaN(fallback.getTime())) parsed = fallback;
                  }
                  if (!parsed || isNaN(parsed.getTime())) return null;
                  return <p className="text-xs text-gray-500 mb-3">{t("thread.validUntil", { date: parsed.toLocaleDateString(intl) })}</p>;
                })()}
                <a
                  href={`/bookings/${meta.bookingId}`}
                  className="inline-block text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 px-3 py-1.5 rounded transition-colors"
                >
                  {t("thread.viewAndRespond")}
                </a>
              </div>
            </div>
          );
        }

        const isMine = getSenderId(message) === currentUserId;
        const isAdminSender = message.senderRole === "admin";
        const isDeletedSender = !isAdminSender && isAnonymizedIdentity(message.senderId);
        const senderName = isAdminSender
          ? t("common.fixtractSupport")
          : isDeletedSender
            ? t("common.deletedUser")
            : getSenderName(message) || t("common.user");
        const senderImage = isAdminSender || isDeletedSender ? null : getSenderImage(message);
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showAvatar = !prevMessage || getSenderId(prevMessage) !== getSenderId(message) || prevMessage.messageType === "review_notification" || prevMessage.messageType === "quotation_notification" || prevMessage.messageType === "warranty_notification";

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
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center overflow-hidden",
                    isAdminSender ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-indigo-100"
                  )}>
                    {senderImage ? (
                      <img src={senderImage} alt="" className="h-full w-full object-cover" />
                    ) : isAdminSender ? (
                      <ShieldCheck className="h-4 w-4 text-white" />
                    ) : isDeletedSender ? (
                      <UserX className="h-4 w-4 text-slate-500" aria-hidden />
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
                  isMine
                    ? "bg-indigo-600 text-white"
                    : isAdminSender
                      ? "bg-indigo-50 text-gray-900 border border-indigo-200"
                      : "bg-white text-gray-900 border border-slate-200"
                )}
              >

                {!isMine && showAvatar && (
                  <p className={cn(
                    "mb-1 text-[11px] font-semibold flex items-center gap-1",
                    isAdminSender ? "text-indigo-700" : "text-indigo-700"
                  )}>
                    {senderName}
                    {isAdminSender && <ShieldCheck className="h-3 w-3" />}
                  </p>
                )}
                {message.text && (
                  <p className="text-sm whitespace-pre-wrap">
                    {isRedactedPlaceholderText(message.text)
                      ? t("common.messageDeleted")
                      : message.text}
                  </p>
                )}

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
                          alt={t("thread.chatAttachment")}
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
                            <track kind="captions" src="" srcLang="en" label={t("thread.captionsUnavailable")} />
                            {t("thread.videoUnsupported")}
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
                  {new Date(message.createdAt).toLocaleString(intl)}
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
                    title={t("thread.reply")}
                  >
                    <Reply className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                )}
                {!isMine && (
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-slate-100"
                    onClick={() => setReportingId(message._id)}
                    title={t("thread.report")}
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
