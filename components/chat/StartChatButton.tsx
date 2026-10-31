"use client";

import { useId, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { emitChatWidgetOpen, PENDING_CHAT_START_KEY, LEGACY_PENDING_CHAT_START_KEY } from "@/lib/chatWidgetEvents";
import { setMigratedItem } from "@/lib/storageMigration";

interface StartChatButtonProps {
  professionalId: string;
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  initialMessage?: string;
  /** A disabled button keeps the action visible but prevents an unavailable recipient from being contacted. */
  disabledReason?: string;
}

export default function StartChatButton({
  professionalId,
  label,
  className,
  variant = "outline",
  size = "sm",
  initialMessage,
  disabledReason,
}: StartChatButtonProps) {
  const t = useTranslations("chat");
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, loading } = useAuth();
  const disabledReasonId = useId();

  const detail = useMemo(
    () => ({
      open: true,
      professionalId,
      ...(initialMessage ? { initialMessage } : {}),
    }),
    [professionalId, initialMessage]
  );

  if (user && user.role !== "customer") {
    return null;
  }

  const handleClick = () => {
    if (loading || disabledReason) return;

    if (!isAuthenticated) {
      if (typeof window !== "undefined") {
        setMigratedItem(
          "session",
          PENDING_CHAT_START_KEY,
          JSON.stringify(detail),
          LEGACY_PENDING_CHAT_START_KEY
        );
      }
      router.push(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
      return;
    }

    if (user?.role !== "customer") {
      toast.error(t("startChatButton.onlyCustomers"));
      return;
    }

    emitChatWidgetOpen(detail);
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={disabledReason ? `${className ?? ""} opacity-60` : className}
        onClick={handleClick}
        // Keep the control focusable so keyboard users can reach the reason.
        // `handleClick` already refuses the action while a reason is set.
        aria-disabled={disabledReason ? true : undefined}
        aria-describedby={disabledReason ? disabledReasonId : undefined}
        title={disabledReason}
        aria-label={disabledReason ? `${label ?? t("startChatButton.label")}: ${disabledReason}` : undefined}
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        {label ?? t("startChatButton.label")}
      </Button>
      {disabledReason ? (
        <span id={disabledReasonId} className="text-xs text-muted-foreground">
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
