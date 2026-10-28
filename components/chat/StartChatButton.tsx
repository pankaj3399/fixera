"use client";

import { useMemo } from "react";
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
}

export default function StartChatButton({
  professionalId,
  label,
  className,
  variant = "outline",
  size = "sm",
  initialMessage,
}: StartChatButtonProps) {
  const t = useTranslations("chat");
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, loading } = useAuth();

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
    if (loading) return;

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
    <Button type="button" variant={variant} size={size} className={className} onClick={handleClick}>
      <MessageSquare className="h-4 w-4 mr-2" />
      {label ?? t("startChatButton.label")}
    </Button>
  );
}
