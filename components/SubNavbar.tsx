"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Hammer, Zap, PaintBucket, Wrench, Palette, Fan, Thermometer,
  Layers, Sun, Droplet, Wind, Ruler, Shield, Bath, Plug, Flame, TreePine,
  Flower, Grid, Square, Home, ChefHat, Scissors, Truck, Brush, Sparkles
} from "lucide-react";

interface Service {
  name: string;
  slug: string;
}

interface Category {
  name: string;
  slug: string;
  services: Service[];
}

const getServiceIcon = (slug: string) => {
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

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=BE`
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
    <div className="hidden lg:block bg-white border-b border-t border-gray-200 shadow-sm sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-12">
          {categories.map((category) => (
            <div
              key={category.name}
              className="group relative h-full flex items-center"
            >
              <Link
                href={`/categories/${category.slug}`}
                className="px-3 text-gray-600 hover:text-blue-600 group  font-medium transition-colors duration-200 h-full flex items-center border-b-2 border-transparent group-hover:border-blue-600"
              >
                {category.name}
              </Link>

              {/* --- Dropdown Menu --- */}
              <div className="absolute top-full left-0 mt-0 w-72 bg-white rounded-b-lg shadow-2xl border-x border-b group-hover:opacity-100 hidden group-hover:block border-gray-200 opacity-0 z-50 transition-all duration-300 transform group-hover:translate-y-0 translate-y-2 max-h-96 overflow-y-auto">
                <div className="py-4">
                  <ul className="px-4 space-y-1">
                    {category.services.map((service) => (
                      <li key={service.slug}>
                        <Link
                          href={`/services/${service.slug}`}
                          className="flex items-center gap-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 p-2.5 rounded-md transition-colors"
                        >
                          {React.createElement(getServiceIcon(service.slug), { className: "w-4 h-4 text-blue-500" })}
                          {service.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SubNavbar;
