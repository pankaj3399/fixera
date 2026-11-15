"use client";

import { useEffect } from "react";
import { useVisiblePathname } from "@/hooks/useVisiblePathname";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Route-level fallback for unexpected render/data failures. Technical details
 * stay in the console/server logs; users get one clear message and a retry.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = useVisiblePathname();
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("common.errors");
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    console.error("Unhandled page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">
          {isAdmin ? "Something went wrong" : tErrors("generic")}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {isAdmin
            ? "The page could not be loaded. Please try again."
            : tErrors("server")}
        </p>
        <Button type="button" className="mt-6" onClick={reset}>
          {isAdmin ? "Try again" : tCommon("tryAgain")}
        </Button>
      </div>
    </div>
  );
}
