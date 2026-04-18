"use client";

import { useEffect, useState, useCallback, useRef, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ProfessionalCard from "@/components/search/ProfessionalCard";
import ProjectCard from "@/components/search/ProjectCard";
import Link from "next/link";
import { toast } from "sonner";
import { useCommissionRate } from "@/hooks/useCommissionRate";

type ProfessionalPayload = ComponentProps<typeof ProfessionalCard>["professional"];
type ProjectCardProject = ComponentProps<typeof ProjectCard>["project"];
type ProjectPayload = Omit<ProjectCardProject, "professionalId"> & {
  professional?: ProjectCardProject["professionalId"];
};

interface FavoriteItem {
  _id: string;
  targetType: "professional" | "project";
  targetId: string;
  favoritedAt: string;
  professional?: ProfessionalPayload;
  project?: ProjectPayload;
}

export default function FavoritesPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading } = useAuth();
  const [tab, setTab] = useState<"professional" | "project">("professional");
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const requestIdRef = useRef(0);
  const { customerPrice } = useCommissionRate();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.push("/login?redirect=/dashboard/favorites");
      return;
    }
    if (user?.role !== "customer") {
      toast.error("Only customers have a favorites list");
      router.push("/dashboard");
    }
  }, [loading, isAuthenticated, user?.role, router]);

  const loadFavorites = useCallback(async (targetType: "professional" | "project") => {
    const reqId = ++requestIdRef.current;
    setItems([]);
    setListLoading(true);
    try {
      const res = await authFetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/favorites?targetType=${targetType}&limit=50`
      );
      const json = await res.json();
      if (reqId !== requestIdRef.current) return;
      if (res.ok && json?.success) {
        setItems(json.data.items || []);
      } else {
        toast.error(json?.msg || "Failed to load favorites");
      }
    } catch {
      if (reqId !== requestIdRef.current) return;
      toast.error("Failed to load favorites");
    } finally {
      if (reqId === requestIdRef.current) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.role === "customer") {
      loadFavorites(tab);
    }
  }, [isAuthenticated, user?.role, tab, loadFavorites]);

  const removeItem = (targetId: string) => {
    setItems((prev) => prev.filter((i) => i.targetId !== targetId));
  };

  const handleToggle = (targetId: string, favorited: boolean) => {
    if (!favorited) removeItem(targetId);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Your Favorites</h1>
        <p className="text-gray-500 mt-1">Professionals and projects you&apos;ve saved.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "professional" | "project")}>
        <TabsList>
          <TabsTrigger value="professional">Professionals</TabsTrigger>
          <TabsTrigger value="project">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="professional" className="mt-6">
          {listLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-80" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-600 mb-4">
                  You haven&apos;t favorited any professionals yet.
                </p>
                <Button asChild>
                  <Link href="/professionals">Browse Professionals</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (() => {
            const professionalItems = items.filter(
              (item): item is FavoriteItem & { professional: ProfessionalPayload } => !!item.professional
            );
            return professionalItems.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {professionalItems.map((item) => (
                  <ProfessionalCard
                    key={item._id}
                    professional={item.professional}
                    initialFavorited
                    onFavoriteToggled={(fav) => handleToggle(item.targetId, fav)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                No professionals found for your favorites — they may have been removed.
              </p>
            );
          })()}
        </TabsContent>

        <TabsContent value="project" className="mt-6">
          {listLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-96" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-600 mb-4">
                  You haven&apos;t favorited any projects yet.
                </p>
                <Button asChild>
                  <Link href="/search?type=projects">Browse Projects</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (() => {
            const projectItems = items.filter(
              (item): item is FavoriteItem & { project: ProjectPayload } => !!item.project
            );
            return projectItems.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {projectItems.map((item) => (
                  <ProjectCard
                    key={item._id}
                    project={{
                      ...item.project,
                      professionalId: item.project.professional,
                    }}
                    customerPrice={customerPrice}
                    initialFavorited
                    onFavoriteToggled={(fav) => handleToggle(item.targetId, fav)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                No projects found for your favorites — they may have been removed.
              </p>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
