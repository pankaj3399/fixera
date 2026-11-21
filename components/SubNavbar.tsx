"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getServiceIcon, getCategoryIcon } from "@/lib/serviceIcons";
import { ANNOUNCE_BANNER_HEIGHT_PX } from "@/lib/marketing/siteAnnouncements/constants";
import { useActiveTopBar } from "@/components/marketing/site-announcements/useActiveTopBar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalogNames } from "@/lib/catalog/catalogNames";

interface Service {
  name: string;
  slug: string;
  icon?: string;
}

interface Category {
  name: string;
  slug: string;
  icon?: string;
  /** Static outage fallback from lib/server/serviceCategories. */
  isFallback?: boolean;
  services: Service[];
}

const FALLBACK_CATEGORY_NAME_KEYS = {
  "small-tasks": "fallbackCategories.smallTasks",
  interior: "fallbackCategories.interior",
  exterior: "fallbackCategories.exterior",
  "outdoor-work": "fallbackCategories.outdoorWork",
  renovation: "fallbackCategories.renovation",
  inspections: "fallbackCategories.inspections",
} as const;

type FallbackCategorySlug = keyof typeof FALLBACK_CATEGORY_NAME_KEYS;

function fallbackCategoryNameKey(
  slug: string
): (typeof FALLBACK_CATEGORY_NAME_KEYS)[FallbackCategorySlug] | undefined {
  return FALLBACK_CATEGORY_NAME_KEYS[slug as FallbackCategorySlug];
}

// Shared constant for dropdown width — used in both the portal style and
// the viewport-clamping logic inside handleMouseEnter.
const DROPDOWN_WIDTH = 288; // matches w-72 (18rem × 16px)

function useSubNavbarStickyTop() {
  const { bar: announceBar } = useActiveTopBar();
  return announceBar
    ? `calc(4rem + ${ANNOUNCE_BANNER_HEIGHT_PX})`
    : "4rem";
}

export function SubNavbarFallback() {
  const stickyTop = useSubNavbarStickyTop();
  return (
    <div className="hidden lg:block bg-white border-b border-t border-gray-200 shadow-sm sticky z-40" style={{ top: stickyTop }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto">
        <div className="flex justify-between items-center h-12 min-w-full">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-full flex items-center shrink-0 px-3 gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SubNavbar = ({ categories }: { categories: Category[] }) => {
  const t = useTranslations("nav");
  const { categoryName, serviceName } = useCatalogNames();
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending hover timeout on unmount to avoid state updates after cleanup
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = useCallback((slug: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    const el = categoryRefs.current.get(slug);
    if (el) {
      const rect = el.getBoundingClientRect();
      const left = Math.min(rect.left, window.innerWidth - DROPDOWN_WIDTH - 8);
      setDropdownPos({ top: rect.bottom, left: Math.max(8, left) });
    }
    setHoveredCategory(slug);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCategory(null);
      setDropdownPos(null);
    }, 150);
  }, []);

  const handleDropdownEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handleDropdownLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCategory(null);
      setDropdownPos(null);
    }, 150);
  }, []);

  const hoveredCategoryData = categories.find(c => c.slug === hoveredCategory);
  const stickyTop = useSubNavbarStickyTop();

  return (
    <>
      <div
        role="navigation"
        aria-label={t("serviceCategories")}
        className="hidden lg:block bg-white border-b border-t border-gray-200 shadow-sm sticky z-40"
        style={{ top: stickyTop }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto scrollbar-hide">
          <div className="flex justify-between items-center h-12 min-w-full">
            {categories.map((category) => {
              const CategoryIcon = getCategoryIcon(category.slug, category.name);
              const fallbackKey = category.isFallback
                ? fallbackCategoryNameKey(category.slug)
                : undefined;
              const categoryLabel = fallbackKey
                ? t(fallbackKey)
                : categoryName(category.name);
              return (
                <div
                  key={category.slug}
                  ref={(el) => {
                    if (el) categoryRefs.current.set(category.slug, el);
                  }}
                  role="menuitem"
                  aria-haspopup="true"
                  aria-expanded={hoveredCategory === category.slug}
                  className="h-full flex items-center shrink-0"
                  onMouseEnter={() => handleMouseEnter(category.slug)}
                  onMouseLeave={handleMouseLeave}
                  onFocus={() => handleMouseEnter(category.slug)}
                  onBlur={handleMouseLeave}
                >
                  <Link
                    href={`/categories/${category.slug}`}
                    className={`px-3 text-gray-600 hover:text-blue-600 font-medium transition-colors duration-200 h-full flex items-center gap-2 border-b-2 whitespace-nowrap ${hoveredCategory === category.slug
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent'
                      }`}
                  >
                    <CategoryIcon className={`w-4 h-4 ${hoveredCategory === category.slug ? 'text-blue-600' : 'text-gray-400'} transition-colors duration-200`} />
                    {categoryLabel}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dropdown rendered via portal to escape overflow clipping */}
      {hoveredCategoryData && dropdownPos && typeof document !== 'undefined' && createPortal(
        <div
          role="menu"
          className="bg-white rounded-b-lg shadow-2xl border border-t-0 border-gray-200 z-[9999] max-h-96 overflow-y-auto"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: DROPDOWN_WIDTH,
          }}
          onMouseEnter={handleDropdownEnter}
          onMouseLeave={handleDropdownLeave}
          onFocus={handleDropdownEnter}
          onBlur={handleDropdownLeave}
        >
          <div className="py-4">
            <ul className="px-4 space-y-1">
              {hoveredCategoryData.services.map((service) => {
                const ServiceIcon = getServiceIcon(service.slug, service.icon);
                return (
                  <li key={service.slug} role="none">
                    <Link
                      role="menuitem"
                      href={`/services/${service.slug}`}
                      className="flex items-center gap-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 p-2.5 rounded-md transition-colors"
                    >
                      <ServiceIcon className="w-4 h-4 text-blue-500" />
                      {serviceName(service.name)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default SubNavbar;
