import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowUpRight, Calendar } from "lucide-react";
import { CmsContent, cmsAuthorName, cmsCoverAlt } from "@/lib/cms";
import { intlLocale } from "@/lib/i18n/format";

interface Props {
  item: CmsContent;
  basePath: "blog" | "news";
}

export default async function BlogCard({ item, basePath }: Props) {
  const [t, locale] = await Promise.all([getTranslations("content"), getLocale()]);
  const authorName = cmsAuthorName(item);
  const date = item.publishedAt || item.updatedAt;

  return (
    <Link
      href={`/${basePath}/${encodeURIComponent(item.slug)}`}
      className="group block rounded-3xl bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 p-[1.5px] transition hover:from-rose-300 hover:via-pink-300 hover:to-orange-300 hover:shadow-xl hover:shadow-rose-100 hover:-translate-y-0.5"
    >
      <article className="flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-1.5px)] bg-white">
        {item.coverImage && (
          <div className="relative aspect-[16/9] overflow-hidden">
            <Image
              src={item.coverImage}
              alt={cmsCoverAlt(item)}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-rose-900/20 via-transparent to-transparent" />
          </div>
        )}
        <div className="flex flex-1 flex-col p-6">
          {item.tags?.length ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {item.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gradient-to-r from-rose-100 to-pink-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <h3 className="text-lg font-bold text-rose-900 transition-colors group-hover:text-rose-700">
            {item.title}
          </h3>
          {item.excerpt && (
            <p className="mt-2 line-clamp-3 flex-1 text-sm text-rose-600/80">{item.excerpt}</p>
          )}
          <div className="mt-4 flex items-center justify-between text-xs text-rose-500">
            <div className="flex items-center gap-3">
              {date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(date).toLocaleDateString(intlLocale(locale), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {authorName && <span>· {t("byAuthor", { author: authorName })}</span>}
            </div>
            <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>
      </article>
    </Link>
  );
}
