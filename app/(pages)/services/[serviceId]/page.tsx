import React, { cache, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from '@/components/ui/separator';
import { Star, Heart, Award, ChevronRight, Sparkles, Hammer, ArrowRight, Mail } from 'lucide-react';
import { professionalsForService, serviceCategories, subNavbarCategories } from '@/data/content';
import { Button } from '@/components/ui/button';
import ProfessionalFilters from '@/components/ProfessionalFilters';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/jsonLd';
import { buildMetadata } from '@/lib/seo/metadata';
import { CmsContent, cmsCoverAlt, humanizeCmsSlug } from '@/lib/cms';
import { publicGetCms, publicListCms } from '@/lib/cms/public';
import { getVisitorCountryCode } from '@/lib/cms/visitorCountry';
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

export const revalidate = 60;

const fetchServiceLanding = cache(async (serviceId: string) => {
  return await publicGetCms("landing", serviceId);
});

type Props = {
  params: Promise<{
    serviceId: string;
  }>;
};

function serviceKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function matchesServiceId(id: string, name: string, serviceId: string): boolean {
  const needle = serviceKey(serviceId);
  return id === serviceId || serviceKey(id) === needle || serviceKey(name) === needle;
}

function findServiceMeta(serviceId: string) {
  for (const cat of serviceCategories) {
    for (const sub of cat.subCategories || []) {
      for (const svc of sub.services || []) {
        if (matchesServiceId(svc.id, svc.name, serviceId)) {
          return { name: svc.name, description: svc.description, category: cat.name, categorySlug: cat.slug };
        }
      }
    }
  }
  const navSvc = subNavbarCategories.flatMap((c) => c.services).find((s) => matchesServiceId(s.id, s.name, serviceId));
  if (navSvc) return { name: navSvc.name, description: undefined as string | undefined, category: undefined as string | undefined, categorySlug: undefined as string | undefined };
  return null;
}

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

const fetchRelatedArticles = cache(async (serviceSlug: string, country?: string) => {
  try {
    const [blogs, news] = await Promise.all([
      publicListCms('blog', { serviceSlug, limit: 6, country }).then((r) => r.items).catch(() => [] as CmsContent[]),
      publicListCms('news', { serviceSlug, limit: 4, country }).then((r) => r.items).catch(() => [] as CmsContent[]),
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
    const description = meta.description || `Find verified professionals for ${meta.name.toLowerCase()} on Fixtract.`;
    return buildMetadata({
      title: meta.name,
      description,
      path: `/services/${encodeURIComponent(serviceId)}`,
    });
  }
  const fallbackTitle = landing?.title || humanizeCmsSlug(serviceId);
  return buildMetadata({
    title: fallbackTitle,
    description: `Information for ${fallbackTitle} on Fixtract is being prepared. Browse our other services in the meantime.`,
    path: `/services/${encodeURIComponent(serviceId)}`,
    noindex: true,
  });
}

const ProfessionalCard = ({ professional }: { professional: (typeof professionalsForService)[0] }) => {
  return (
    <Card className="group overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border-gray-200 flex flex-col w-full">
      <div className="relative aspect-[4/3] w-full">
        <Image
          src={professional.image}
          alt={professional.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-white/70 backdrop-blur-sm hover:bg-white rounded-full">
          <Heart className="w-5 h-5 text-gray-700" />
        </Button>
      </div>
      <CardContent className="p-4 flex flex-col flex-grow">
        <div className="flex items-center space-x-3 mb-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={professional.avatar} alt={professional.name} />
            <AvatarFallback>{professional.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-base leading-tight">{professional.name}</p>
            <p className="text-xs text-blue-600 font-medium flex items-center gap-1"><Award className="w-3 h-3" />{professional.level}</p>
          </div>
        </div>
        <p className="text-base text-gray-800 group-hover:text-blue-600 transition-colors flex-grow">
          {professional.title}
        </p>
        <div className="flex items-center gap-1 mt-3">
          <Star className="w-4 h-4 text-yellow-400 fill-current" />
          <span className="font-bold text-gray-700">{professional.rating}</span>
          <span className="text-sm text-gray-500">({professional.reviews})</span>
        </div>
      </CardContent>
      <div className="p-4 border-t flex items-center justify-between">
        <span className="text-xs text-gray-500 font-semibold tracking-wider">STARTING AT</span>
        <p className="text-xl font-bold text-gray-900">€{professional.startingPrice}</p>
      </div>
    </Card>
  );
};

async function ServicePopularProjects({
  headingName,
  queryName,
}: {
  headingName: string
  queryName: string
}) {
  const projects = await getPopularProjects({ service: queryName, limit: 10 });
  return <PopularProjectsCarousel projects={projects} heading={`Popular ${headingName} projects`} />;
}

function PopularProjectsSection({
  headingName,
  queryName,
}: {
  headingName: string
  queryName: string
}) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-16">
      <Suspense fallback={<PopularProjectsCarouselSkeleton heading={`Popular ${headingName} projects`} />}>
        <ServicePopularProjects headingName={headingName} queryName={queryName} />
      </Suspense>
    </section>
  );
}

export default async function Page({ params }: Props) {

  const { serviceId } = await params;

  const landing = await fetchServiceLanding(serviceId);
  const meta = findServiceMeta(serviceId);

  if (landing && hasMeaningfulBody(landing.body)) {
    const safePath = `/services/${encodeURIComponent(serviceId)}`;
    const serviceName = landing.title || meta?.name || humanizeCmsSlug(serviceId);
    const queryName = meta?.name || relatedCatalogName(landing) || serviceId;
    const coverSrc = landing.coverImage || getServiceCoverImage(serviceId, meta?.categorySlug);
    const { html: bodyHtml, toc } = extractTocAndAddIds(landing.body);
    const country = await getVisitorCountryCode();
    const { blogs, news } = await fetchRelatedArticles(serviceId, country);

    return (
      <div className="bg-white">
        <ServiceViewTracker serviceId={serviceId} />
        <JsonLd
          data={breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Services', path: '/services' },
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
                <Link href="/" className="hover:underline">Home</Link>
                <ChevronRight className="w-4 h-4 mx-1" />
                <Link href="/services" className="hover:underline">Services</Link>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-6">{landing.title}</h1>
              <ServiceLandingSearch serviceName={serviceName} />
            </div>
          </div>
        </div>

        <PopularProjectsSection headingName={serviceName} queryName={queryName} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-10">
            {toc.length >= 2 && <ServiceTableOfContents items={toc} />}
            <div className="min-w-0">
              <RichTextRenderer html={bodyHtml} />

              {(blogs.length > 0 || news.length > 0) && (
                <section className="mt-16 pt-12 border-t border-gray-200">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Related articles</h2>
                  <p className="text-sm text-gray-600 mb-8">More reading on {serviceName.toLowerCase()}.</p>
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
            <Link href="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <Link href="/services" className="hover:underline">Services</Link>
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
                Coming soon
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-gray-900">
                {serviceName}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
                We&apos;re putting the finishing touches on this page. In the meantime, explore the other services available on Fixtract or get in touch and we&apos;ll help you find the right professional.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild size="lg" className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white">
                  <Link href="/services">
                    Browse all services
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-rose-200 text-rose-700 hover:bg-rose-50">
                  <Link href="/contact">
                    <Mail className="w-4 h-4 mr-2" />
                    Contact us
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link href="/" className="text-sm text-gray-500 hover:text-rose-700 hover:underline">
              ← Back to homepage
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const serviceName = meta.name;
  const safePath = `/services/${encodeURIComponent(serviceId)}`;

  return (
    <div className="bg-white">
      <ServiceViewTracker serviceId={serviceId} />
      <JsonLd
        data={[
          serviceSchema({
            name: serviceName,
            description: meta.description,
            path: safePath,
            category: meta.category,
          }),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Services', path: '/services' },
            { name: serviceName, path: safePath },
          ]),
        ]}
      />
      <div className="relative h-[28rem] md:h-[32rem] w-full">
        <Image
          src={getServiceCoverImage(serviceId, meta.categorySlug)}
          alt={`Showcase for ${serviceName}`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-10 md:pb-14">
            <div className="flex items-center text-sm text-white mb-2">
              <Link href="/" className="hover:underline">Home</Link>
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href="/services" className="hover:underline">Services</Link>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-6">
              {serviceName}
            </h1>
            <ServiceLandingSearch serviceName={serviceName} />
          </div>
        </div>
      </div>

      <PopularProjectsSection headingName={serviceName} queryName={serviceName} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-16">
        <ProfessionalFilters resultsCount={professionalsForService.length} />
        <Separator className="mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {professionalsForService.map(professional => (
            <ProfessionalCard key={professional.id} professional={professional} />
          ))}
        </div>
      </main>
    </div>
  );
}
