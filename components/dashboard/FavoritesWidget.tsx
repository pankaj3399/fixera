"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart } from "lucide-react";

interface PerProjectCount {
  projectId: string;
  projectTitle: string;
  count: number;
}

interface FavoritesStats {
  total: number;
  profileCount: number;
  perProject: PerProjectCount[];
  newSinceLastSeen: number;
}

export default function FavoritesWidget() {
  const [stats, setStats] = useState<FavoritesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/professional/favorites-stats`
      );
      const json = await res.json();
      if (res.ok && json?.success) {
        setStats(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const dismissNew = useCallback(async () => {
    if (dismissing) return;
    setDismissing(true);
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/professional/favorites-notifications/seen`,
        { method: "POST" }
      );
      if (res.ok) {
        setStats((prev) => (prev ? { ...prev, newSinceLastSeen: 0 } : prev));
      }
    } catch {
      // silent
    } finally {
      setDismissing(false);
    }
  }, [dismissing]);

  if (loading) {
    return (
      <Card className="border-pink-100 bg-gradient-to-br from-white via-pink-50 to-purple-50 shadow-md">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-24 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const topProjects = stats.perProject.filter((p) => p.count > 0).slice(0, 3);

  return (
    <Card className="border-pink-100 bg-gradient-to-br from-white via-pink-50 to-purple-50 shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <defs>
                <linearGradient id="favWidgetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffb4c6" />
                  <stop offset="100%" stopColor="#c3b4ff" />
                </linearGradient>
              </defs>
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill="url(#favWidgetGrad)"
                stroke="url(#favWidgetGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Favorites
          </span>
          {stats.newSinceLastSeen > 0 && (
            <button
              type="button"
              onClick={dismissNew}
              className="text-xs bg-gradient-to-r from-pink-300 to-purple-300 text-white font-semibold px-2 py-0.5 rounded-full hover:opacity-90"
              title="Mark as seen"
              disabled={dismissing}
            >
              +{stats.newSinceLastSeen} new
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-bold text-gray-900">{stats.total}</span>
          <span className="text-sm text-gray-500">total favorites</span>
        </div>
        <div className="text-xs text-gray-500 mb-3">
          Profile: <span className="font-semibold text-gray-700">{stats.profileCount}</span>
          {" · "}
          Projects:{" "}
          <span className="font-semibold text-gray-700">
            {stats.total - stats.profileCount}
          </span>
        </div>
        {topProjects.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 font-medium">Top projects by favorites</p>
            <ul className="space-y-1">
              {topProjects.map((p) => (
                <li key={p.projectId} className="flex justify-between text-sm">
                  <span className="truncate pr-2 text-gray-700">{p.projectTitle}</span>
                  <span className="flex items-center gap-1 text-gray-500 font-medium">
                    <Heart className="w-3 h-3 fill-pink-300 stroke-pink-400" />
                    {p.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No project favorites yet. Keep publishing great work!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
