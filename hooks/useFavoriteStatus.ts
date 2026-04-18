"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch } from "@/lib/utils";
import type { FavoriteTargetType } from "@/components/favorites/FavoriteButton";

export function useFavoriteStatus(
  targetType: FavoriteTargetType,
  targetIds: string[]
) {
  const { user, isAuthenticated } = useAuth();
  const [favorited, setFavorited] = useState<Record<string, boolean>>({});

  const key = useMemo(() => {
    const uniq = Array.from(new Set(targetIds.filter(Boolean))).sort();
    return uniq.join(",");
  }, [targetIds]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "customer") {
      setFavorited({});
      return;
    }
    if (!key) {
      setFavorited({});
      return;
    }
    const ids = key.split(",");

    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/favorites/status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetType, targetIds: ids }),
          }
        );
        const json = await res.json();
        if (cancelled) return;
        if (res.ok && json?.success) {
          setFavorited(json.data.favorited || {});
        } else {
          setFavorited({});
        }
      } catch {
        if (!cancelled) setFavorited({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.role, targetType, key]);

  return favorited;
}
