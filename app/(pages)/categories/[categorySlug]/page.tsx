'use client'

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronRight, AlertCircle, ArrowRight } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  matchCatalogCategory,
  normalizeCategorySlug,
  resolveCatalogCountry,
  CATALOG_HOME_COUNTRY,
  type CatalogCategoryItem,
} from '@/lib/catalog/resolveCategory';
import { GEO_COUNTRY_COOKIE } from '@/lib/marketing/siteAnnouncements/constants';

/** Catalog categories with translated copy in the `catalog` namespace. */
const TRANSLATED_CATEGORY_SLUGS = [
  'interior-services',
  'exterior-structural',
  'outdoor-garden',
] as const;

function isTranslatedCategorySlug(
  slug: string
): slug is (typeof TRANSLATED_CATEGORY_SLUGS)[number] {
  return (TRANSLATED_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

async function fetchCategories(country: string, signal: AbortSignal) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=${encodeURIComponent(country)}`,
    { signal, credentials: 'include' }
  );
  if (!response.ok) throw new Error('Failed to fetch categories');
  const data = await response.json();
  return (Array.isArray(data) ? data : []) as CatalogCategoryItem[];
}

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const rawSlug = params?.categorySlug as string;
  const t = useTranslations('catalog');

  const [category, setCategory] = useState<CatalogCategoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rawSlug) return;
    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const geoCountry =
          typeof document !== 'undefined'
            ? new RegExp(`(?:^|;\\s*)${GEO_COUNTRY_COOKIE}=([^;]*)`).exec(document.cookie)?.[1]
            : null;
        const resolvedCountry =
          typeof navigator !== 'undefined'
            ? resolveCatalogCountry(geoCountry, navigator.language, CATALOG_HOME_COUNTRY)
            : CATALOG_HOME_COUNTRY;
        const categories = await fetchCategories(resolvedCountry, controller.signal);
        const match = matchCatalogCategory(categories, rawSlug);
        if (!match) {
          // Unknown slug: fall back to the existing services index, never a 404.
          router.replace('/services');
          return;
        }
        if (match.slug !== rawSlug && normalizeCategorySlug(rawSlug) === normalizeCategorySlug(match.slug)) {
          // Canonical slug differs in casing/separators: normalize the URL once.
          router.replace(`/categories/${match.slug}`);
          return;
        }
        setCategory(match);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Error fetching category services:', err);
        setError(t('servicesPage.errorMessage'));
        toast.error(t('servicesPage.toastError'));
      } finally {
        setIsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [rawSlug, router, t]);

  const displayCategoryName = category
    ? isTranslatedCategorySlug(category.slug)
      ? t(`names.categories.${category.slug}.name`)
      : category.name
    : '';

  if (isLoading) {
    return (
      <div className="bg-white min-h-screen">
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96" />
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white min-h-screen">
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('servicesPage.errorTitle')}</h2>
            <p role="alert" className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => router.refresh()}>
              {t('tryAgain')}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (!category) return null;

  return (
    <div className="bg-white min-h-screen">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <nav aria-label="breadcrumb" className="flex items-center text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:underline">{t('breadcrumbs.home')}</Link>
          <ChevronRight className="w-4 h-4 mx-1" />
          <Link href="/services" className="hover:underline">{t('breadcrumbs.services')}</Link>
          <ChevronRight className="w-4 h-4 mx-1" />
          <span aria-current="page" className="text-gray-900">{displayCategoryName}</span>
        </nav>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('categoryPage.servicesTitle', { category: displayCategoryName })}
        </h1>
        <p className="text-gray-600 mb-8">
          {t('categoryPage.servicesDescription', { category: displayCategoryName.toLowerCase() })}
        </p>
        {category.services.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-600 max-w-md mx-auto">{t('servicesPage.empty')}</p>
            <Button asChild className="mt-6">
              <Link href="/services">{t('browseAllServices')}</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 border-y border-gray-200">
            {category.services.map((service) => (
              <li key={service.slug}>
                <Link
                  href={`/services/${service.slug}`}
                  className="flex items-center justify-between gap-4 py-4 px-2 hover:bg-gray-50 rounded transition-colors group"
                >
                  <span className="text-lg font-medium text-gray-900 group-hover:text-blue-700">
                    {service.name}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-blue-600 shrink-0">
                    {t('servicesPage.viewDetails')}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
