"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Loader2, Hammer, Zap, PaintBucket, Wrench, Palette, Fan, Thermometer,
  Layers, Sun, Droplet, Wind, Ruler, Shield, Bath, Plug, Flame, TreePine,
  Flower, Grid, Square, Home, ChefHat, Scissors, Truck, Brush, Sparkles
} from "lucide-react";

interface Service {
  name: string;
  slug: string;
  icon?: string;
}

interface Category {
  name: string;
  slug: string;
  services: Service[];
}

// Shared constant for dropdown width — used in both the portal style and
// the viewport-clamping logic inside handleMouseEnter.
const DROPDOWN_WIDTH = 288; // matches w-72 (18rem × 16px)

import { iconMapData } from "@/data/icons";

const getServiceIcon = (slug: string, customIcon?: string) => {
  // If a custom icon is configured and exists in our map, use it
  if (customIcon && iconMapData[customIcon as keyof typeof iconMapData]) {
    return iconMapData[customIcon as keyof typeof iconMapData];
  }

  const s = slug.toLowerCase();
  if (s.includes("plumb")) return Droplet;
  if (s.includes("electr")) return Zap;
  if (s.includes("paint")) return PaintBucket;
  if (s.includes("renov")) return Hammer;
  if (s.includes("roof")) return Home;
  if (s.includes("garden") || s.includes("landsc")) return TreePine;
  if (s.includes("clean")) return Sparkles;
  if (s.includes("hvac") || s.includes("air")) return Fan;
  if (s.includes("insul")) return Thermometer;
  if (s.includes("floor")) return Layers;
  if (s.includes("tile") || s.includes("tiling")) return Grid;
  if (s.includes("solar")) return Sun;
  if (s.includes("design")) return Palette;
  if (s.includes("kitchen")) return ChefHat;
  if (s.includes("bath")) return Bath;
  if (s.includes("carpentry") || s.includes("wood")) return Hammer;
  if (s.includes("window") || s.includes("door")) return Square;
  if (s.includes("mov") || s.includes("remov")) return Truck;

  return Wrench; // Default icon
};

const SubNavbar = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  // Clear any pending hover timeout on unmount to avoid state updates after cleanup
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=BE`,
        { cache: 'no-store' }
      );
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMouseEnter = useCallback((categoryName: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    const el = categoryRefs.current.get(categoryName);
    if (el) {
      const rect = el.getBoundingClientRect();
      const left = Math.min(rect.left, window.innerWidth - DROPDOWN_WIDTH - 8);
      setDropdownPos({ top: rect.bottom, left: Math.max(8, left) });
    }
    setHoveredCategory(categoryName);
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

  const hoveredCategoryData = categories.find(c => c.name === hoveredCategory);

  if (isLoading) {
    return (
      <div className="hidden lg:block bg-white border-b border-t border-gray-200 shadow-sm sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center h-12">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="hidden lg:block bg-white border-b border-t border-gray-200 shadow-sm sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto scrollbar-hide">
          <div className="flex justify-between items-center h-12 min-w-full">
            {categories.map((category) => (
              <div
                key={category.name}
                ref={(el) => {
                  if (el) categoryRefs.current.set(category.name, el);
                }}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={hoveredCategory === category.name}
                className="h-full flex items-center shrink-0"
                onMouseEnter={() => handleMouseEnter(category.name)}
                onMouseLeave={handleMouseLeave}
                onFocus={() => handleMouseEnter(category.name)}
                onBlur={handleMouseLeave}
              >
                <Link
                  href={`/categories/${category.slug}`}
                  className={`px-3 text-gray-600 hover:text-blue-600 font-medium transition-colors duration-200 h-full flex items-center border-b-2 whitespace-nowrap ${hoveredCategory === category.name
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent'
                    }`}
                >
                  {category.name}
                </Link>
              </div>
            ))}
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
              {hoveredCategoryData.services.map((service) => (
                <li key={service.slug} role="none">
                  <Link
                    role="menuitem"
                    href={`/services/${service.slug}`}
                    className="flex items-center gap-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 p-2.5 rounded-md transition-colors"
                  >
                    {React.createElement(getServiceIcon(service.slug, service.icon), { className: "w-4 h-4 text-blue-500" })}
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default SubNavbar;
