import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, ArrowRight, Clock, ChevronLeft, ChevronRight, Calendar, Star } from 'lucide-react';
import { isQualityCertificate, getCertificateGradient, formatPriceModelLabel } from '@/lib/projectHighlights';
import { formatUtcViewerLabel, formatWindowUtcViewer, getViewerTimezone } from '@/lib/timezoneDisplay';
import { LEVEL_COLORS, ADMIN_TAG_STYLES, formatAdminTagLabel } from '@/lib/professionalLevel';

interface ProjectCardProps {
  customerPrice: (value: number) => number;
  project: {
    _id: string;
    title: string;
    description: string;
    category: string;
    service: string;
    areaOfWork?: string;
    services?: Array<{
      service?: string;
      areaOfWork?: string;
    }>;
    timeMode?: 'hours' | 'days' | 'mixed';
    executionDuration?: {
      value: number;
      unit: 'hours' | 'days';
    };
    bufferDuration?: {
      value: number;
      unit: 'hours' | 'days';
    };
    pricing?: {
      type: 'fixed' | 'unit' | 'rfq';
      amount?: number;
      priceRange?: { min: number; max: number };
    };
    priceModel?: string;
    certifications?: Array<{
      name: string;
      fileUrl: string;
    }>;
    media?: {
      images?: string[];
      video?: string;
    };
    professionalId?: {
      _id: string;
      name: string;
      username?: string;
      email: string;
      businessInfo?: {
        city?: string;
        country?: string;
      };
      hourlyRate?: number;
      currency?: string;
      profileImage?: string;
      professionalLevel?: string;
      adminTags?: string[];
    };
    projectAvgRating?: number;
    projectTotalReviews?: number;
    subprojects?: Array<{
      name: string;
      description: string;
      pricing: {
        type: 'fixed' | 'unit' | 'rfq';
        amount?: number;
        priceRange?: { min: number; max: number };
      };
      executionDuration?: {
        value: number;
        unit: 'hours' | 'days';
      };
      warrantyPeriod?: {
        value: number;
        unit: 'months' | 'years';
      };
      projectType?: string[];
      included?: Array<{
        name?: string;
        description?: string;
      }>;
      firstAvailableDate?: string | null;
    }>;
    firstAvailableDate?: string | null;
    firstAvailableWindow?: {
      start: string;
      end: string;
    } | null;
    shortestThroughputWindow?: {
      start: string;
      end: string;
    } | null;
  };
}

const ProjectCard = ({ customerPrice, project }: ProjectCardProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [viewerTimeZone, setViewerTimeZone] = useState('UTC');
  const formatAmount = (value: number) => `€${customerPrice(value).toLocaleString()}`;
  const professional = project.professionalId;
  const professionalName = professional?.username || professional?.name || 'Professional';
  const location = [professional?.businessInfo?.city, professional?.businessInfo?.country]
    .filter(Boolean)
    .join(', ');
  const qualityCertificates = (project.certifications || []).filter((cert) => isQualityCertificate(cert.name));

  const images = project.media?.images || [];
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    setViewerTimeZone(getViewerTimezone());
  }, []);

  // Pre-compute timezone labels for first available date and windows
  const firstAvailableDateLabels = formatUtcViewerLabel(project.firstAvailableDate, viewerTimeZone);
  const firstAvailableWindowLabels = formatWindowUtcViewer(project.firstAvailableWindow, viewerTimeZone);

  const getProjectDuration = () => {
    if (project.executionDuration) {
      const exec = project.executionDuration;
      const buffer = project.bufferDuration;
      return `${exec.value}${buffer?.value ? `+${buffer.value}` : ''} ${exec.unit}`;
    }
    return null;
  };

  const formatSubprojectPrice = (pricing: { type: string; amount?: number; priceRange?: { min: number; max: number } }) => {
    const amount = pricing.amount;

    if (pricing.type === 'fixed' && amount != null && Number.isFinite(amount)) {
      return formatAmount(amount);
    }
    if (pricing.type === 'unit') {
      if (
        pricing.priceRange &&
        Number.isFinite(pricing.priceRange.min) &&
        Number.isFinite(pricing.priceRange.max)
      ) {
        return `${formatAmount(pricing.priceRange.min)}-${formatAmount(pricing.priceRange.max)}/unit`;
      }
      if (amount != null && Number.isFinite(amount)) {
        return `${formatAmount(amount)}/unit`;
      }
    }
    if (pricing.type === 'rfq') {
      return 'RFQ';
    }
    return 'Contact';
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const currentImage = images[currentImageIndex];

  return (
    <Card className="group overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border-gray-200 flex flex-col h-full">
      {/* Image Section with Carousel */}
      <div className="relative h-48 bg-gradient-to-br from-blue-50 to-purple-50">
        {currentImage ? (
          <img
            src={currentImage}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-sm text-gray-500" aria-label="No preview available">
              No preview available
            </div>
          </div>
        )}

        {/* Category Badge */}
        <Badge className="absolute top-3 right-3 bg-blue-600 text-white">
          {project.category}
        </Badge>

        {/* First Available Date Badge */}
        {project.firstAvailableDate && (
          <Badge className="absolute top-3 left-3 bg-emerald-600 text-white flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(project.firstAvailableDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </Badge>
        )}

        {/* Navigation Arrows - Only show if there are multiple images */}
        {hasMultipleImages && (
          <>
            <button
              onClick={handlePrevImage}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextImage}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              aria-label="Next image"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Image Indicators - Only show if there are multiple images */}
        {hasMultipleImages && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCurrentImageIndex(idx);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${idx === currentImageIndex
                  ? 'bg-white w-4'
                  : 'bg-white/60 hover:bg-white/80'
                  }`}
                aria-label={`Go to image ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content Section */}
      <CardContent className="p-5 flex flex-col flex-grow">
        <div className="flex-grow">
          <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-2 line-clamp-2">
            {project.title}
          </h3>

          {project.projectAvgRating != null && project.projectAvgRating > 0 && (
            <div className="flex items-center gap-1 mb-3">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${
                      star <= Math.round(project.projectAvgRating!)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-200'
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-gray-700">{project.projectAvgRating.toFixed(1)}</span>
              {project.projectTotalReviews != null && (
                <span className="text-xs text-gray-400">({project.projectTotalReviews})</span>
              )}
            </div>
          )}

          <p className="text-sm text-gray-600 mb-4 line-clamp-3">
            {project.description}
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="outline" className="text-xs">
              {project.service}
            </Badge>
            {project.priceModel && (
              <Badge className="text-xs bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-0">
                {formatPriceModelLabel(project.priceModel)}
              </Badge>
            )}
            {qualityCertificates.slice(0, 3).map((cert, idx) => (
              <span
                key={`${cert.name}-${idx}`}
                className={`text-xs py-1 px-2 rounded-full text-white font-semibold bg-gradient-to-r ${getCertificateGradient(cert.name)}`}
              >
                {cert.name}
              </span>
            ))}
            {qualityCertificates.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{qualityCertificates.length - 3} more
              </Badge>
            )}
          </div>
        </div>

        {/* Project Duration & Availability */}
        {(getProjectDuration() || firstAvailableDateLabels || firstAvailableWindowLabels) && (
          <div className="space-y-2 mb-3 text-sm text-gray-700">
            {getProjectDuration() && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="font-medium">Duration: {getProjectDuration()}</span>
              </div>
            )}
            {/* ProjectCard doesn't display First Available explicitly here besides the badge, so we'll just leave it clean */}
          </div>
        )}

        {/* Subprojects/Packages */}
        {project.subprojects && project.subprojects.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-700 mb-2">Available Packages:</p>
            <div className="space-y-2">
              {project.subprojects.slice(0, 3).map((subproject, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs border border-gray-200">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="font-medium text-gray-900 truncate">{subproject.name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-gray-500">
                      {subproject.executionDuration && (
                        <span>
                          {subproject.executionDuration.value} {subproject.executionDuration.unit}
                        </span>
                      )}
                      {subproject.warrantyPeriod && (
                        <span>
                          {subproject.warrantyPeriod.value} {subproject.warrantyPeriod.unit} warranty
                        </span>
                      )}
                    </div>
                    {subproject.firstAvailableDate && (
                      <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        Available: {new Date(subproject.firstAvailableDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                  <Badge variant={subproject.pricing.type === 'rfq' ? 'outline' : 'default'} className="text-[10px] px-2 py-0.5 shrink-0">
                    {formatSubprojectPrice(subproject.pricing)}
                  </Badge>
                </div>
              ))}
              {project.subprojects.length > 3 && (
                <p className="text-[10px] text-gray-500 text-center">
                  +{project.subprojects.length - 3} more package{project.subprojects.length - 3 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Professional Info */}
        {professional && (
          <div className="pt-3 border-t border-gray-200 mt-auto">
            <div className="flex items-center gap-3">
              {professional.profileImage ? (
                <img
                  src={professional.profileImage}
                  alt={professionalName}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                  {professionalName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {professionalName}
                  </p>
                  {professional?.professionalLevel && (
                    <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${LEVEL_COLORS[professional.professionalLevel] || ''}`}>
                      {professional.professionalLevel}
                    </Badge>
                  )}
                  {(professional?.adminTags || []).slice(0, 2).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${ADMIN_TAG_STYLES[tag] || ''}`}
                    >
                      {formatAdminTagLabel(tag)}
                    </Badge>
                  ))}
                  {(professional?.adminTags?.length || 0) > 2 && (
                    <span className="text-[9px] text-gray-400">+{professional!.adminTags!.length - 2}</span>
                  )}
                </div>
                {location && (
                  <div className="flex items-center gap-1 text-[10px] text-gray-500">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CTA Button */}
        <Button asChild className="w-full mt-4" variant="default">
          <Link href={`/projects/${project._id}`}>
            View Project <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export default ProjectCard;
