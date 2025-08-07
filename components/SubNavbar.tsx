'use client'

import React from 'react';
import Link from 'next/link';
// This assumes your data is in '@/data/content' and has the subNavbarCategories export
import { subNavbarCategories } from '@/data/content';
import { ArrowRight } from 'lucide-react';

const SubNavbar = () => {
  return (
    <div className="hidden lg:block bg-white border-b border-t border-gray-200 shadow-sm sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-12">
          {subNavbarCategories.map((category) => (
            <div key={category.name} className="group relative h-full flex items-center">
              <Link
                href={`/categories/${category.slug}`}
                className="px-3 text-gray-600 hover:text-blue-600 group  font-medium transition-colors duration-200 h-full flex items-center border-b-2 border-transparent group-hover:border-blue-600"
              >
                {category.name}
              </Link>

              {/* --- Dropdown Menu --- */}
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-0 w-96 bg-white rounded-b-lg shadow-2xl border-x border-b group-hover:opacity-100 hidden group-hover:block border-gray-200 opacity-0 z-50 transition-all duration-300 transform group-hover:translate-y-0 translate-y-2"
              >
                <div className="p-4">
                  <ul className="space-y-1">
                    {category.services.map((service) => (
                      <li key={service.id}>
                        <Link
                          href={`/services/${service.id}`}
                          className="block text-gray-700 hover:text-blue-600 hover:bg-gray-50 p-2.5 rounded-md transition-colors"
                        >
                          {service.name}
                        </Link>
                      </li>
                    ))}
                        <Link href={`/category/${category.slug}`} className=" flex items-center hover:text-blue-600 justify-center text-blue-400">
                           see more <ArrowRight className="w-4 h-4 ml-2 mt-1"/>
                        </Link>
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