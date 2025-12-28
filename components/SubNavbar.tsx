"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface Service {
  name: string;
  slug: string;
}

interface Category {
  name: string;
  slug: string;
  services: Service[];
}

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
                          className="block text-gray-700 hover:text-blue-600 hover:bg-gray-50 p-2.5 rounded-md transition-colors"
                        >
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
