import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Localized 404 for unknown URLs and notFound() calls. Rendered inside the root
 * layout, so the locale is the one middleware resolved for the request: the URL
 * prefix (`/nl/...`, also for prefixed paths that do not exist), then ?lang,
 * the NEXT_LOCALE cookie and geo. Next sends it with status 404.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.notFound");
  return { title: t("metaTitle"), robots: { index: false, follow: true } };
}

export default async function NotFound() {
  const t = await getTranslations("common.notFound");
  return (
    <div className="flex justify-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#4032f7]">404</p>
        <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">{t("title")}</h1>
        <p className="mt-4 text-base text-gray-600 sm:text-lg">{t("description")}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("home")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/services">
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("browseServices")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
