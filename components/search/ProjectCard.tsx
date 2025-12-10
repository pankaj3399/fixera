import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Euro, ArrowRight, Clock, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { isQualityCertificate, getCertificateGradient, formatPriceModelLabel } from '@/lib/projectHighlights';

interface ProjectCardProps {
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
  timeMode?: 'hours' | 'days';
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
      email: string;
      businessInfo?: {
        companyName?: string;
        city?: string;
        country?: string;
      };
      hourlyRate?: number;
      currency?: string;
      profileImage?: string;
    };
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
    }>;
    firstAvailableDate?: string | null;
  };
}

const toHours = (duration?: { value: number; unit: 'hours' | 'days' } | null) => {
  if (!duration || typeof duration.value !== 'number') {
    return 0;
  }
  return duration.unit === 'hours' ? duration.value : duration.value * 24;
};

const getResolvedShortestThroughputWindow = (project: ProjectCardProps['project']) => {
  const hasCompleteWindow = (window?: { start?: string; end?: string } | null) => {
    return Boolean(window?.start && window?.end);
  };

  if (hasCompleteWindow(project.shortestThroughputWindow)) {
    return project.shortestThroughputWindow;
  }

  if (hasCompleteWindow(project.firstAvailableWindow)) {
    return project.firstAvailableWindow;
  }

  if (!project.firstAvailableDate || !project.executionDuration?.value) {
    return null;
  }

  const startDate = new Date(project.firstAvailableDate);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  const executionHours = toHours(project.executionDuration);
  if (!executionHours) {
    return null;
  }

  const bufferHours = toHours(project.bufferDuration);
  const effectiveMode = project.timeMode || project.executionDuration.unit;

  if (effectiveMode === 'hours') {
    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + executionHours);
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
  }

  const executionDays = Math.max(1, Math.ceil(executionHours / 24));
  const bufferDays = Math.ceil(bufferHours / 24);
  const completionDate = new Date(startDate);
  completionDate.setDate(completionDate.getDate() + Math.max(0, executionDays - 1));
  const endDate = new Date(completionDate);
  endDate.setDate(endDate.getDate() + bufferDays + 1);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
};

const ProjectCard = ({ project }: ProjectCardProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const professional = project.professionalId;
  const professionalName = professional?.businessInfo?.companyName || professional?.name || 'Professional';
  const location = [professional?.businessInfo?.city, professional?.businessInfo?.country]
    .filter(Boolean)
    .join(', ');
  const qualityCertificates = (project.certifications || []).filter((cert) => isQualityCertificate(cert.name));

  const images = project.media?.images || [];
  const hasMultipleImages = images.length > 1;

  const getProjectDuration = () => {
    if (project.executionDuration) {
      const exec = project.executionDuration;
      const buffer = project.bufferDuration;
      const total = exec.value + (buffer?.value || 0);
      return `${exec.value}${buffer?.value ? `+${buffer.value}` : ''} ${exec.unit}`;
    }
    return null;
  };

  const formatAvailableDate = (dateString: string | null | undefined) => {
    if (!dateString) {
      return 'Contact for availability';
    }

    try {
      const date = new Date(dateString);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Contact for availability';
      }

      // Format date as "MMM DD, YYYY" (e.g., "Dec 15, 2025")
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      };
      return date.toLocaleDateString('en-US', options);
    } catch (error) {
      return 'Contact for availability';
    }
  };

  const formatSubprojectPrice = (pricing: { type: string; amount?: number; priceRange?: { min: number; max: number } }) => {
    if (pricing.type === 'fixed' && pricing.amount) {
      return `€${pricing.amount.toLocaleString()}`;
    } else if (pricing.type === 'unit' && pricing.priceRange) {
      return `€${pricing.priceRange.min}-€${pricing.priceRange.max}`;
    } else if (pricing.type === 'rfq') {
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
            <div className="text-6xl text-gray-300">🏗️</div>
          </div>
        )}

        {/* Category Badge */}
        <Badge className="absolute top-3 right-3 bg-blue-600 text-white">
          {project.category}
        </Badge>

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
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  idx === currentImageIndex
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

          <p className="text-sm text-gray-600 mb-4 line-clamp-3">
            {project.description}
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="secondary" className="text-xs">
              {project.service}
            </Badge>
            {project.priceModel && (
              <Badge variant="outline" className="text-xs">
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

        {/* Project Duration */}
        {getProjectDuration() && (
          <div className="flex items-center gap-2 mb-3 text-sm text-gray-700">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Duration: {getProjectDuration()}</span>
          </div>
        )}

        {/* First Available Date */}
        <div className="flex items-center gap-2 mb-3 text-sm text-gray-700">
          <Calendar className="w-4 h-4 text-green-600" />
          <span className="font-medium">
            Available: {formatAvailableDate(project.firstAvailableDate)}
          </span>
        </div>

        {/* Subprojects/Packages */}
        {project.subprojects && project.subprojects.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-700 mb-2">Available Packages:</p>
            <div className="space-y-2">
              {project.subprojects.slice(0, 3).map((subproject, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs border border-gray-200">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="font-medium text-gray-900 truncate">{subproject.name}</p>
                    {subproject.executionDuration && (
                      <p className="text-gray-500 text-[10px]">
                        {subproject.executionDuration.value} {subproject.executionDuration.unit}
                      </p>
                    )}
                    {subproject.warrantyPeriod && (
                      <p className="text-gray-500 text-[10px]">
                        {subproject.warrantyPeriod.value} {subproject.warrantyPeriod.unit} warranty
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
                <p className="text-xs font-semibold text-gray-900 truncate">
                  {professionalName}
                </p>
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
