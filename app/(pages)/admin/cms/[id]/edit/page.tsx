"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import CmsContentForm from "@/components/cms/CmsContentForm";
import { adminGetCms, CmsContent } from "@/lib/cms";

export default function EditCmsContentPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [content, setContent] = useState<CmsContent | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/login");
    }
  }, [user, isAuthenticated, loading, router]);

  useEffect(() => {
    if (!id || !isAuthenticated || user?.role !== "admin") return;
    setFetching(true);
    adminGetCms(id)
      .then(setContent)
      .catch((err) => {
        toast.error(err?.message || "Failed to load content");
        router.replace("/admin/cms");
      })
      .finally(() => setFetching(false));
  }, [id, isAuthenticated, user, router]);

  if (loading || fetching || !content) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-white">
        <Loader2 className="animate-spin text-rose-500" />
      </div>
    );
  }

  return <CmsContentForm mode="edit" initial={content} />;
}
