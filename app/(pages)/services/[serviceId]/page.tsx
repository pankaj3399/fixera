import React, { cache } from 'react';
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
import { publicGetCms } from '@/lib/cms';
import RichTextRenderer from '@/components/cms/RichTextRenderer';

export const dynamic = "force-dynamic";

const fetchServiceLanding = cache(async (serviceId: string) => {
  return await publicGetCms("landing", serviceId);
});

type Props = {
  params: Promise<{
    serviceId: string;
  }>;
};

function findServiceMeta(serviceId: string) {
  for (const cat of serviceCategories) {
    for (const sub of cat.subCategories || []) {
      for (const svc of sub.services || []) {
        if (svc.id === serviceId) return { name: svc.name, description: svc.description, category: cat.name };
      }
    }
  }
  const navSvc = subNavbarCategories.flatMap((c) => c.services).find((s) => s.id === serviceId);
  if (navSvc) return { name: navSvc.name, description: undefined as string | undefined, category: undefined as string | undefined };
  return null;
}

function humanizeSlug(slug: string): string {
  const cleaned = (slug || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Service";
  return cleaned
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

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
    const description = meta.description || `Find verified professionals for ${meta.name.toLowerCase()} on Fixera.`;
    return buildMetadata({
      title: meta.name,
      description,
      path: `/services/${encodeURIComponent(serviceId)}`,
    });
  }
  const fallbackTitle = landing?.title || humanizeSlug(serviceId);
  return buildMetadata({
    title: fallbackTitle,
    description: `Information for ${fallbackTitle} on Fixera is being prepared. Browse our other services in the meantime.`,
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

export default async function Page({ params }: Props) {

  const { serviceId } = await params;

  const landing = await fetchServiceLanding(serviceId);
  const meta = findServiceMeta(serviceId);

  if (landing && hasMeaningfulBody(landing.body)) {
    const safePath = `/services/${encodeURIComponent(serviceId)}`;
    return (
      <div className="bg-white">
        <JsonLd
          data={breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Services', path: '/services' },
            { name: landing.title, path: safePath },
          ])}
        />
        {landing.coverImage && (
          <div className="relative h-72 md:h-96 w-full">
            <Image src={landing.coverImage} alt={landing.title} fill className="object-cover" priority unoptimized />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/20" />
            <div className="absolute inset-0 flex flex-col justify-end">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-12">
                <div className="flex items-center text-sm text-white mb-2">
                  <Link href="/" className="hover:underline">Home</Link>
                  <ChevronRight className="w-4 h-4 mx-1" />
                  <Link href="/services" className="hover:underline">Services</Link>
                </div>
                <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">{landing.title}</h1>
              </div>
            </div>
          </div>
        )}
        {!landing.coverImage && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-28 pb-6">
            <div className="flex items-center text-sm text-gray-500 mb-2">
              <Link href="/" className="hover:underline">Home</Link>
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href="/services" className="hover:underline">Services</Link>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight">{landing.title}</h1>
            {landing.excerpt && <p className="mt-3 text-lg text-gray-600 max-w-3xl">{landing.excerpt}</p>}
          </div>
        )}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <RichTextRenderer html={landing.body} />
        </main>
      </div>
    );
  }

  if (!meta) {
    const serviceName = landing?.title || humanizeSlug(serviceId);
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
                We&apos;re putting the finishing touches on this page. In the meantime, explore the other services available on Fixera or get in touch and we&apos;ll help you find the right professional.
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
      <div className="relative h-72 md:h-96 w-full">
        <Image
          src="/images/banner.jpg"
          alt={`Showcase for ${serviceName}`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/20" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-12">
            <div className="flex items-center text-sm text-white mb-2">
              <Link href="/" className="hover:underline">Home</Link>
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href="/services" className="hover:underline">Services</Link>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
              {serviceName}
            </h1>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
