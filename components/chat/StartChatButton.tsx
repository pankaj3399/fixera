"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { emitChatWidgetOpen, PENDING_CHAT_START_KEY } from "@/lib/chatWidgetEvents";

interface StartChatButtonProps {
  professionalId: string;
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export default function StartChatButton({
  professionalId,
  label = "Start Chat",
  className,
  variant = "outline",
  size = "sm",
}: StartChatButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, loading } = useAuth();

  const detail = useMemo(
    () => ({
      open: true,
      professionalId,
    }),
    [professionalId]
  );

  if (user && user.role !== "customer") {
    return null;
  }

  const handleClick = () => {
    if (loading) return;

    if (!isAuthenticated) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(PENDING_CHAT_START_KEY, JSON.stringify(detail));
      }
      router.push(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
      return;
    }

    if (user?.role !== "customer") {
      toast.error("Only customers can start conversations");
      return;
    }

    emitChatWidgetOpen(detail);
  };

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={handleClick}>
      <MessageSquare className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}
