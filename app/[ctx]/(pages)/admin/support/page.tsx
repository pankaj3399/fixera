"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import SupportInbox from "@/components/admin/SupportInbox";
import SupportMeetingLinkSettings from "@/components/admin/SupportMeetingLinkSettings";

export default function AdminSupportPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace("/login?redirect=/admin/support");
    } else if (user?.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, isAuthenticated, loading, router]);

  if (loading || !isAuthenticated || user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-indigo-50 via-blue-50 to-white">
        <Loader2 className="animate-spin text-indigo-500" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-white pb-16 pt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-200 via-blue-200 to-cyan-200 p-[1.5px] shadow-md">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-white px-6 py-7 sm:px-8">
            <h1 className="text-2xl font-bold text-indigo-900 sm:text-3xl">
              Support — Admin
            </h1>
            <p className="mt-1 text-sm text-indigo-600/80">
              Tickets and meetings from customers and professionals.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <SupportMeetingLinkSettings />
        </div>

        <div className="mt-6">
          <SupportInbox />
        </div>
      </div>
    </div>
  );
}
