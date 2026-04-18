"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const PENDING_FAVORITE_KEY = "fixera_pending_favorite";

export type FavoriteTargetType = "professional" | "project";

interface FavoriteButtonProps {
  targetType: FavoriteTargetType;
  targetId: string;
  initialFavorited?: boolean;
  initialCount?: number;
  showCount?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  stopPropagation?: boolean;
  onToggled?: (favorited: boolean, count: number) => void;
}

const sizeMap = {
  sm: { wrap: "w-8 h-8", icon: 16 },
  md: { wrap: "w-10 h-10", icon: 20 },
  lg: { wrap: "w-12 h-12", icon: 26 },
};

export default function FavoriteButton({
  targetType,
  targetId,
  initialFavorited = false,
  initialCount,
  showCount = false,
  size = "sm",
  className,
  stopPropagation = true,
  onToggled,
}: FavoriteButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, loading } = useAuth();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [count, setCount] = useState<number | undefined>(initialCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFavorited(initialFavorited);
  }, [initialFavorited]);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  const reactId = useId();
  const gradientId = `favGrad-${reactId.replace(/:/g, "")}`;

  const toggle = useCallback(async () => {
    if (busy || loading) return;

    if (!isAuthenticated) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          PENDING_FAVORITE_KEY,
          JSON.stringify({ targetType, targetId })
        );
      }
      router.push(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
      return;
    }

    if (user?.role !== "customer") {
      toast.error("Only customers can favorite");
      return;
    }

    const prevFavorited = favorited;
    const prevCount = count;
    setFavorited(!prevFavorited);
    if (typeof prevCount === "number") {
      setCount(prevFavorited ? Math.max(0, prevCount - 1) : prevCount + 1);
    }
    setBusy(true);

    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/favorites/toggle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType, targetId }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.msg || "Failed to update favorite");
      }
      const nextFavorited: boolean = json.data.favorited;
      const nextCount: number = json.data.count;
      setFavorited(nextFavorited);
      setCount(nextCount);
      onToggled?.(nextFavorited, nextCount);
    } catch (err) {
      setFavorited(prevFavorited);
      setCount(prevCount);
      const message = err instanceof Error ? err.message : "Failed to update favorite";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    loading,
    isAuthenticated,
    user?.role,
    targetType,
    targetId,
    favorited,
    count,
    onToggled,
    pathname,
    router,
  ]);

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    void toggle();
  };

  const disabled = Boolean(user && user.role !== "customer");
  const { wrap, icon } = sizeMap[size];

  const ariaLabel = disabled
    ? "Favoriting is for customers"
    : favorited
      ? "Remove from favorites"
      : "Add to favorites";

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        aria-label={ariaLabel}
        aria-pressed={favorited}
        title={disabled ? "Only customers can favorite" : undefined}
        className={cn(
          "rounded-full bg-white/95 backdrop-blur border shadow-md",
          "flex items-center justify-center transition-all duration-200",
          "hover:scale-110 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-pink-300",
          favorited
            ? "border-pink-300 shadow-pink-200/60"
            : "border-gray-200 hover:border-pink-300",
          disabled && "opacity-60 cursor-not-allowed hover:scale-100",
          wrap
        )}
      >
        <svg
          width={icon}
          height={icon}
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "transition-all duration-200",
            favorited && "drop-shadow-[0_0_4px_rgba(244,63,94,0.55)]"
          )}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff5d8f" />
              <stop offset="50%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill={favorited ? `url(#${gradientId})` : "none"}
            stroke={favorited ? `url(#${gradientId})` : "#d1d5db"}
          />
        </svg>
      </button>
      {showCount && typeof count === "number" && (
        <span className="text-sm text-gray-700 font-medium">{count}</span>
      )}
    </div>
  );
}
