"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface OverviewTotals {
  professionals: number;
  projects: number;
  uniqueCustomers: number;
}

interface LeaderProfessional {
  _id: string;
  name: string;
  profileImage: string | null;
  count: number;
}

interface LeaderProject {
  _id: string;
  title: string;
  count: number;
  professionalId: string | null;
  professionalName: string | null;
}

interface RecentFavorite {
  _id: string;
  user: { _id: string; name?: string; email?: string } | null;
  targetType: "professional" | "project";
  targetId: string;
  targetLabel: string;
  createdAt: string;
}

interface Overview {
  totals: OverviewTotals;
  topProfessionals: LeaderProfessional[];
  topProjects: LeaderProject[];
  recent: RecentFavorite[];
}

interface ListItem {
  _id: string;
  user: { _id: string; name?: string; email?: string; role?: string } | null;
  targetType: "professional" | "project";
  targetId: string;
  targetLabel: string;
  createdAt: string;
}

const PastelHeart = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="favAdminGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffb4c6" />
        <stop offset="100%" stopColor="#c3b4ff" />
      </linearGradient>
    </defs>
    <path
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
      fill="url(#favAdminGrad)"
      stroke="url(#favAdminGrad)"
      strokeWidth="2"
    />
  </svg>
);

export default function AdminFavoritesPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [items, setItems] = useState<ListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<"" | "professional" | "project">("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterTargetId, setFilterTargetId] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.push("/login?redirect=/admin/favorites");
      return;
    }
    if (user?.role !== "admin") {
      toast.error("Admin access only");
      router.push("/dashboard");
    }
  }, [loading, isAuthenticated, user?.role, router]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/favorites/overview`
      );
      const json = await res.json();
      if (res.ok && json?.success) {
        setOverview(json.data);
      } else {
        toast.error(json?.msg || "Failed to load overview");
      }
    } catch {
      toast.error("Failed to load overview");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadList = useCallback(
    async (nextPage = page) => {
      setListLoading(true);
      try {
        const qs = new URLSearchParams();
        if (filterType) qs.set("targetType", filterType);
        if (filterUserId) qs.set("userId", filterUserId);
        if (filterTargetId) qs.set("targetId", filterTargetId);
        qs.set("page", String(nextPage));
        qs.set("limit", "50");
        const res = await authFetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/favorites?${qs.toString()}`
        );
        const json = await res.json();
        if (res.ok && json?.success) {
          setItems(json.data.items || []);
          setTotal(json.data.total || 0);
          setPage(nextPage);
        } else {
          toast.error(json?.msg || "Failed to load favorites");
        }
      } catch {
        toast.error("Failed to load favorites");
      } finally {
        setListLoading(false);
      }
    },
    [filterType, filterUserId, filterTargetId, page]
  );

  useEffect(() => {
    if (user?.role === "admin") {
      loadOverview();
      loadList(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Remove this favorite entry? The customer will no longer see it in their list.")) return;
      try {
        const res = await authFetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/favorites/${id}`,
          { method: "DELETE" }
        );
        const json = await res.json();
        if (res.ok && json?.success) {
          toast.success("Favorite removed");
          setItems((prev) => prev.filter((i) => i._id !== id));
          setTotal((t) => Math.max(0, t - 1));
          loadOverview();
        } else {
          toast.error(json?.msg || "Failed to remove favorite");
        }
      } catch {
        toast.error("Failed to remove favorite");
      }
    },
    [loadOverview]
  );

  if (loading || user?.role !== "admin") {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <PastelHeart size={28} /> Favorites Admin
          </h1>
          <p className="text-gray-500 mt-1">
            Monitor customer favorite activity and moderate abusive entries.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadOverview} disabled={overviewLoading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="all">All Favorites</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {overviewLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : overview ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-500">Professional favorites</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{overview.totals.professionals}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-500">Project favorites</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{overview.totals.projects}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-gray-500">Unique customers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{overview.totals.uniqueCustomers}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Professionals</CardTitle>
                    <CardDescription>Most-favorited professional profiles</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {overview.topProfessionals.length === 0 ? (
                      <p className="text-sm text-gray-500">No data yet.</p>
                    ) : (
                      <ul className="divide-y">
                        {overview.topProfessionals.map((p) => (
                          <li key={p._id} className="flex items-center justify-between py-2">
                            <span className="truncate pr-2">{p.name}</span>
                            <span className="flex items-center gap-1 font-semibold">
                              <PastelHeart size={14} /> {p.count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Projects</CardTitle>
                    <CardDescription>Most-favorited project listings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {overview.topProjects.length === 0 ? (
                      <p className="text-sm text-gray-500">No data yet.</p>
                    ) : (
                      <ul className="divide-y">
                        {overview.topProjects.map((p) => (
                          <li key={p._id} className="flex items-center justify-between py-2 gap-2">
                            <div className="truncate">
                              <p className="truncate font-medium">{p.title}</p>
                              {p.professionalName && (
                                <p className="text-xs text-gray-500 truncate">
                                  by {p.professionalName}
                                </p>
                              )}
                            </div>
                            <span className="flex items-center gap-1 font-semibold whitespace-nowrap">
                              <PastelHeart size={14} /> {p.count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Favorites</CardTitle>
                  <CardDescription>Latest 50 favorite events</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-gray-500">
                        <tr>
                          <th className="py-2 pr-2">When</th>
                          <th className="py-2 pr-2">Customer</th>
                          <th className="py-2 pr-2">Type</th>
                          <th className="py-2 pr-2">Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.recent.map((r) => (
                          <tr key={r._id} className="border-t">
                            <td className="py-2 pr-2 whitespace-nowrap text-gray-500">
                              {new Date(r.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2 pr-2">
                              {r.user?.name || r.user?.email || "(deleted)"}
                            </td>
                            <td className="py-2 pr-2 capitalize">{r.targetType}</td>
                            <td className="py-2 pr-2">{r.targetLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="all" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Select
                  value={filterType || "all"}
                  onValueChange={(v) =>
                    setFilterType(v === "all" ? "" : (v as "professional" | "project"))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Customer user ID"
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                />
                <Input
                  placeholder="Target ID"
                  value={filterTargetId}
                  onChange={(e) => setFilterTargetId(e.target.value)}
                />
                <Button onClick={() => loadList(1)} disabled={listLoading}>
                  {listLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Apply
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                All Favorites{" "}
                <span className="text-sm font-normal text-gray-500">
                  ({total} total)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {listLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-gray-500">No favorites match the filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="py-2 pr-2">When</th>
                        <th className="py-2 pr-2">Customer</th>
                        <th className="py-2 pr-2">Type</th>
                        <th className="py-2 pr-2">Target</th>
                        <th className="py-2 pr-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => (
                        <tr key={r._id} className="border-t">
                          <td className="py-2 pr-2 whitespace-nowrap text-gray-500">
                            {new Date(r.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-2">
                            {r.user?.name || r.user?.email || "(deleted)"}
                          </td>
                          <td className="py-2 pr-2 capitalize">{r.targetType}</td>
                          <td className="py-2 pr-2">{r.targetLabel}</td>
                          <td className="py-2 pr-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(r._id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {total > items.length && (
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadList(Math.max(1, page - 1))}
                    disabled={page <= 1 || listLoading}
                  >
                    Prev
                  </Button>
                  <span className="text-sm text-gray-500 self-center">
                    Page {page}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadList(page + 1)}
                    disabled={page * 50 >= total || listLoading}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
