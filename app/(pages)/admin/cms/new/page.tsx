"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import CmsContentForm from "@/components/cms/CmsContentForm";
import { CmsContentType, CMS_TYPE_ORDER } from "@/lib/cms";

export default function NewCmsContentPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const typeParam = params.get("type");
  const lockedType: CmsContentType | undefined = CMS_TYPE_ORDER.includes(typeParam as CmsContentType)
    ? (typeParam as CmsContentType)
    : undefined;

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/login");
    }
  }, [user, isAuthenticated, loading, router]);

  if (loading || !isAuthenticated || user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-white">
        <Loader2 className="animate-spin text-rose-500" />
      </div>
    );
  }

  return <CmsContentForm mode="create" lockedType={lockedType} />;
}
