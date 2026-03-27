'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface PopularProject {
  _id: string;
  title: string;
  category: string;
  service: string;
  image: string | null;
  location: string | null;
  startingPrice: number | null;
  priceType: string;
  avgRating: number;
  totalReviews: number;
  professional: {
    name: string;
    profileImage: string | null;
    city: string | null;
    country: string | null;
  } | null;
}

const PopularProjectsCarousel = () => {
  const [projects, setProjects] = useState<PopularProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPopularProjects();
  }, []);

  const fetchPopularProjects = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const response = await fetch(`${backendUrl}/api/search/popular-projects?limit=10`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = (await response.json()) as { projects: PopularProject[] };
        setProjects(data.projects || []);
      } else {
        const errorText = await response.text().catch(() => '');
        console.error(`Failed to fetch popular projects: ${response.status}`, errorText);
        setProjects([]);
      }
    } catch (error) {
      console.error('Failed to fetch popular projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [projects, updateScrollButtons]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 300;
    el.scrollBy({
      left: direction === 'left' ? -cardWidth : cardWidth,
      behavior: 'smooth',
    });
  };

  const formatPrice = (price: number | null, type: string) => {
    if (price === null) return 'Request Quote';
    if (type === 'unit') return `From \u20AC${price.toLocaleString()}`;
    return `\u20AC${price.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="mt-10 max-w-5xl mx-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 text-left">Popular Projects</h3>
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="min-w-[280px] rounded-xl border border-gray-200 overflow-hidden">
              <Skeleton className="h-40 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (projects.length === 0) return null;

  return (
    <div className="mt-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Popular Projects</h3>
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="p-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="p-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {projects.map((project) => {
          const profLocation = [project.professional?.city, project.professional?.country]
            .filter(Boolean)
            .join(', ');

          return (
            <Link
              key={project._id}
              href={`/projects/${project._id}`}
              className="min-w-[280px] max-w-[280px] snap-start flex-shrink-0 group"
            >
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
                {/* Image */}
                <div className="relative h-40 bg-gradient-to-br from-blue-50 to-purple-50">
                  {project.image ? (
                    <img
                      src={project.image}
                      alt={project.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                      No preview
                    </div>
                  )}
                  <Badge className="absolute top-2 right-2 bg-blue-600 text-white text-[10px]">
                    {project.category}
                  </Badge>
                </div>

                {/* Content */}
                <div className="p-3.5 flex flex-col flex-grow">
                  <h4 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-1.5">
                    {project.title}
                  </h4>

                  <Badge variant="outline" className="text-[10px] w-fit mb-2">
                    {project.service}
                  </Badge>

                  {/* Price */}
                  <p className="text-sm font-bold text-gray-900 mb-2">
                    {formatPrice(project.startingPrice, project.priceType)}
                  </p>

                  {/* Rating */}
                  {project.avgRating > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-medium text-gray-700">
                        {project.avgRating.toFixed(1)}
                      </span>
                      <span className="text-xs text-gray-400">
                        ({project.totalReviews})
                      </span>
                    </div>
                  )}

                  {/* Professional */}
                  {project.professional && (
                    <div className="mt-auto pt-2.5 border-t border-gray-100 flex items-center gap-2">
                      {project.professional.profileImage ? (
                        <img
                          src={project.professional.profileImage}
                          alt={project.professional.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                          {project.professional.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-gray-800 truncate">
                          {project.professional.name}
                        </p>
                        {profLocation && (
                          <p className="text-[10px] text-gray-500 flex items-center gap-0.5 truncate">
                            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                            {profLocation}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default PopularProjectsCarousel;
