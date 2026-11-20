import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * CA4: localized, branded state for a public CMS page whose content could not
 * be loaded (backend down). Throwing instead made Next.js serve its bare,
 * English "500 Internal Server Error" page for these on-demand ISR routes.
 * Callers first call `shortenCmsUnavailableCache()` so this state is only
 * cached for a minute.
 */
export default async function CmsUnavailable({ retryHref, backHref, backLabel }: {
  retryHref: string;
  backHref: string;
  backLabel: string;
}) {
  const t = await getTranslations("content");
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-white px-6 pt-32 pb-20 text-center">
      <h1 className="text-3xl font-bold text-rose-700">{t("unavailable.title")}</h1>
      <p className="mt-3 text-rose-500">{t("unavailable.description")}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href={retryHref}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200"
        >
          {t("unavailable.retry")}
        </a>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-2 text-sm font-semibold text-rose-600"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
