"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import CmsContentForm from "@/components/cms/CmsContentForm";
import { CmsContentType, CMS_TYPE_ORDER } from "@/lib/cms";

function NewCmsPageClient() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const typeParam = params.get("type");
  const lockedType: CmsContentType | undefined = CMS_TYPE_ORDER.includes(typeParam as CmsContentType)
    ? (typeParam as CmsContentType)
    : undefined;
  const initialSlug = params.get("slug") || undefined;
  const initialTitle = params.get("title") || undefined;

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/login");
    }
  }, [user, isAuthenticated, loading, router]);

  if (loading || !isAuthenticated || user?.role !== "admin") {
    return <NewCmsFallback />;
  }

  return <CmsContentForm mode="create" lockedType={lockedType} initialSlug={initialSlug} initialTitle={initialTitle} />;
}

function NewCmsFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-white">
      <Loader2 className="animate-spin text-rose-500" />
    </div>
  );
}

export default function NewCmsContentPage() {
  return (
    <Suspense fallback={<NewCmsFallback />}>
      <NewCmsPageClient />
    </Suspense>
  );
}
