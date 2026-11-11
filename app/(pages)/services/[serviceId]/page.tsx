import React, { cache, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronRight, Sparkles, Hammer, ArrowRight, Mail } from 'lucide-react';
import {
  TRANSLATED_CATEGORY_SLUGS,
  findServiceMeta,
  isTranslatedCategorySlug,
  isTranslatedServiceId,
  navServiceNameKey,
} from '@/lib/services/serviceNames';
import { Button } from '@/components/ui/button';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/jsonLd';
import { buildMetadata } from '@/lib/seo/metadata';
import { CmsContent, cmsCoverAlt, humanizeCmsSlug } from '@/lib/cms';
import { publicGetCms, publicListCms } from '@/lib/cms/public';
import RichTextRenderer from '@/components/cms/RichTextRenderer';
import BlogCard from '@/components/cms/BlogCard';
import PopularProjectsCarousel from '@/components/PopularProjectsCarousel';
import { PopularProjectsCarouselSkeleton } from '@/components/home/PopularProjectsCarouselSkeleton';
import ServiceLandingSearch from '@/components/services/ServiceLandingSearch';
import { getPopularProjects } from '@/lib/server/popular';
import ServiceTableOfContents from '@/components/services/ServiceTableOfContents';
import ServiceViewTracker from '@/components/services/ServiceViewTracker';
import { extractTocAndAddIds } from '@/lib/cms/toc';
import { getServiceCoverImage } from '@/lib/serviceCovers';

export const revalidate = 21600;

const fetchServiceLanding = cache(async (serviceId: string) => {
  return await publicGetCms("landing", serviceId);
});

type Props = {
  params: Promise<{
    serviceId: string;
  }>;
};



function relatedCatalogName(landing: CmsContent | null): string | undefined {
  const related = landing?.relatedServices;
  if (Array.isArray(related)) {
    for (const item of related) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (typeof item === "object" && item) {
        const name = item.name?.trim();
        const slug = item.slug?.trim();
        if (name) return name;
        if (slug) return slug;
      }
    }
  }
  const slug = landing?.relatedServiceSlug?.trim();
  return slug || undefined;
}

const fetchRelatedArticles = cache(async (serviceSlug: string) => {
  try {
    const [blogs, news] = await Promise.all([
      publicListCms('blog', { serviceSlug, limit: 6 }).then((r) => r.items).catch(() => [] as CmsContent[]),
      publicListCms('news', { serviceSlug, limit: 4 }).then((r) => r.items).catch(() => [] as CmsContent[]),
    ]);
    return { blogs, news };
  } catch {
    return { blogs: [] as CmsContent[], news: [] as CmsContent[] };
  }
});

function hasMeaningfulBody(html: string | undefined | null): boolean {
  if (!html) return false;
  if (/<(img|video|iframe|picture|audio|object|embed)\b/i.test(html)) return true;
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, "")
    .replace(/[\s ]+/g, "")
    .length > 0;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { serviceId } = await params;
  const t = await getTranslations('catalog');
  const landing = await fetchServiceLanding(serviceId);
  if (landing && hasMeaningfulBody(landing.body)) {
    return buildMetadata({
      title: landing.seo?.titleTag || landing.title,
      description: landing.seo?.metaDescription || landing.excerpt,
      path: landing.seo?.canonical || `/services/${encodeURIComponent(serviceId)}`,
      image: landing.seo?.ogImage || landing.coverImage,
      noindex: landing.seo?.noindex,
    });
  }
  const meta = findServiceMeta(serviceId);
  if (meta) {
    const navNameKey = navServiceNameKey(meta);
    const name = isTranslatedServiceId(meta.id)
      ? t(`names.services.${meta.id}.name`)
      : navNameKey
        ? t(navNameKey)
        : meta.name;
    const description = isTranslatedServiceId(meta.id)
      ? t(`names.services.${meta.id}.description`)
      : meta.description || t('servicePage.fallbackMetaDescription', { service: name.toLowerCase() });
    return buildMetadata({
      title: name,
      description,
      path: `/services/${encodeURIComponent(serviceId)}`,
    });
  }
  const fallbackTitle = landing?.title || humanizeCmsSlug(serviceId);
  return buildMetadata({
    title: fallbackTitle,
    description: t('servicePage.missingMetaDescription', { service: fallbackTitle }),
    path: `/services/${encodeURIComponent(serviceId)}`,
    noindex: true,
  });
}


async function ServicePopularProjects({
  heading,
  queryName,
}: {
  heading: string
  queryName: string
}) {
  const projects = await getPopularProjects({ service: queryName, limit: 10 });
  return <PopularProjectsCarousel projects={projects} heading={heading} />;
}

function PopularProjectsSection({
  heading,
  queryName,
}: {
  heading: string
  queryName: string
}) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-16">
      <Suspense fallback={<PopularProjectsCarouselSkeleton heading={heading} />}>
        <ServicePopularProjects heading={heading} queryName={queryName} />
      </Suspense>
    </section>
  );
}

export default async function Page({ params }: Props) {

  const { serviceId } = await params;
  const t = await getTranslations('catalog');

  const landing = await fetchServiceLanding(serviceId);
  const meta = findServiceMeta(serviceId);

  const navNameKey = meta ? navServiceNameKey(meta) : undefined;
  const metaDisplayName = meta
    ? isTranslatedServiceId(meta.id)
      ? t(`names.services.${meta.id}.name`)
      : navNameKey
        ? t(navNameKey)
        : meta.name
    : undefined;
  const metaCategoryName = meta?.categorySlug && isTranslatedCategorySlug(meta.categorySlug)
    ? t(`names.categories.${meta.categorySlug}.name`)
    : meta?.category;

  if (landing && hasMeaningfulBody(landing.body)) {
    const safePath = `/services/${encodeURIComponent(serviceId)}`;
    const serviceName = landing.title || metaDisplayName || humanizeCmsSlug(serviceId);
    const queryName = meta?.name || relatedCatalogName(landing) || serviceId;
    const coverSrc = landing.coverImage || getServiceCoverImage(serviceId, meta?.categorySlug);
    const { html: bodyHtml, toc } = extractTocAndAddIds(landing.body);
    const { blogs, news } = await fetchRelatedArticles(serviceId);

    return (
      <div className="bg-white">
        <ServiceViewTracker serviceId={serviceId} />
        <JsonLd
          data={breadcrumbSchema([
            { name: t('breadcrumbs.home'), path: '/' },
            { name: t('breadcrumbs.services'), path: '/services' },
            { name: landing.title, path: safePath },
          ])}
        />
        <div className="relative h-[28rem] md:h-[32rem] w-full">
          <Image
            src={coverSrc}
            alt={landing.coverImage ? cmsCoverAlt(landing) : (landing.title || humanizeCmsSlug(serviceId))}
            fill
            className="object-cover"
            priority
            unoptimized={Boolean(landing.coverImage)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
          <div className="absolute inset-0 flex flex-col justify-end">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-10 md:pb-14">
              <div className="flex items-center text-sm text-white mb-2">
                <Link href="/" className="hover:underline">{t('breadcrumbs.home')}</Link>
                <ChevronRight className="w-4 h-4 mx-1" />
                <Link href="/services" className="hover:underline">{t('breadcrumbs.services')}</Link>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-6">{landing.title}</h1>
              <ServiceLandingSearch serviceName={serviceName} />
            </div>
          </div>
        </div>

        <PopularProjectsSection
          heading={t('servicePage.popularProjectsHeading', { service: serviceName })}
          queryName={queryName}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-10">
            {toc.length >= 2 && <ServiceTableOfContents items={toc} />}
            <div className="min-w-0">
              <RichTextRenderer html={bodyHtml} />

              {(blogs.length > 0 || news.length > 0) && (
                <section className="mt-16 pt-12 border-t border-gray-200">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('servicePage.relatedArticles')}</h2>
                  <p className="text-sm text-gray-600 mb-8">
                    {t('servicePage.moreReading', { service: serviceName.toLowerCase() })}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {blogs.map((b) => (
                      <BlogCard key={b._id} item={b} basePath="blog" />
                    ))}
                    {news.map((n) => (
                      <BlogCard key={n._id} item={n} basePath="news" />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!meta) {
    const serviceName = landing?.title || humanizeCmsSlug(serviceId);
    return (
      <div className="bg-gradient-to-b from-rose-50 via-white to-white min-h-screen">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
          <div className="flex items-center text-sm text-gray-500 mb-6">
            <Link href="/" className="hover:underline">{t('breadcrumbs.home')}</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <Link href="/services" className="hover:underline">{t('breadcrumbs.services')}</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-gray-700">{serviceName}</span>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-br from-rose-200 via-pink-100 to-transparent blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-gradient-to-tr from-pink-100 via-rose-50 to-transparent blur-3xl"
            />

            <div className="relative px-6 sm:px-12 py-14 sm:py-20 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-200 mb-6">
                <Hammer className="w-10 h-10" />
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 border border-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                {t('servicePage.comingSoon')}
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-gray-900">
                {serviceName}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
                {t('servicePage.comingSoonDescription')}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild size="lg" className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white">
                  <Link href="/services">
                    {t('browseAllServices')}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-rose-200 text-rose-700 hover:bg-rose-50">
                  <Link href="/contact">
                    <Mail className="w-4 h-4 mr-2" />
                    {t('servicePage.contactUs')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link href="/" className="text-sm text-gray-500 hover:text-rose-700 hover:underline">
              {t('servicePage.backHome')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const serviceName = metaDisplayName || meta.name;
  const safePath = `/services/${encodeURIComponent(serviceId)}`;

  return (
    <div className="bg-white">
      <ServiceViewTracker serviceId={serviceId} />
      <JsonLd
        data={[
          serviceSchema({
            name: serviceName,
            description: isTranslatedServiceId(meta.id)
              ? t(`names.services.${meta.id}.description`)
              : meta.description,
            path: safePath,
            category: metaCategoryName,
          }),
          breadcrumbSchema([
            { name: t('breadcrumbs.home'), path: '/' },
            { name: t('breadcrumbs.services'), path: '/services' },
            { name: serviceName, path: safePath },
          ]),
        ]}
      />
      <div className="relative h-[28rem] md:h-[32rem] w-full">
        <Image
          src={getServiceCoverImage(serviceId, meta.categorySlug)}
          alt={t('servicePage.coverAlt', { service: serviceName })}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-10 md:pb-14">
            <div className="flex items-center text-sm text-white mb-2">
              <Link href="/" className="hover:underline">{t('breadcrumbs.home')}</Link>
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href="/services" className="hover:underline">{t('breadcrumbs.services')}</Link>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-6">
              {serviceName}
            </h1>
            <ServiceLandingSearch serviceName={serviceName} />
          </div>
        </div>
      </div>

      <PopularProjectsSection
        heading={t('servicePage.popularProjectsHeading', { service: serviceName })}
        queryName={meta.name}
      />

      {/* Real professionals only: the former sample cards were fabricated
          profiles on an indexable page. Search lists actual professionals. */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-16">
        <section className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-10 text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {t('servicePage.findProsHeading', { service: serviceName })}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-gray-600">
            {t('servicePage.findProsBody', { service: serviceName.toLowerCase() })}
          </p>
          <Link
            href={`/search?${new URLSearchParams({ type: 'professionals', q: serviceName }).toString()}`}
            className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('servicePage.findProsCta')}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}
