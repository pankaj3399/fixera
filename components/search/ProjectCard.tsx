import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Euro, ArrowRight, Clock } from 'lucide-react';

interface ProjectCardProps {
  project: {
    _id: string;
    title: string;
    description: string;
    category: string;
    service: string;
    pricing?: {
      type: 'fixed' | 'unit' | 'rfq';
      amount?: number;
      priceRange?: { min: number; max: number };
    };
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
      executionDuration?: {
        value: number;
        unit: 'hours' | 'days';
      };
    }>;
  };
}

const ProjectCard = ({ project }: ProjectCardProps) => {
  const professional = project.professionalId;
  const professionalName = professional?.businessInfo?.companyName || professional?.name || 'Professional';
  const location = [professional?.businessInfo?.city, professional?.businessInfo?.country]
    .filter(Boolean)
    .join(', ');

  const getPriceDisplay = () => {
    if (!project.pricing) return 'Contact for pricing';

    if (project.pricing.type === 'fixed' && project.pricing.amount) {
      return `€${project.pricing.amount.toLocaleString()}`;
    } else if (project.pricing.type === 'unit' && project.pricing.priceRange) {
      return `€${project.pricing.priceRange.min} - €${project.pricing.priceRange.max}`;
    } else if (project.pricing.type === 'rfq') {
      return 'Request Quote';
    }
    return 'Contact for pricing';
  };

  const getDuration = () => {
    if (project.subprojects && project.subprojects.length > 0) {
      const firstSubproject = project.subprojects[0];
      if (firstSubproject.executionDuration) {
        return `${firstSubproject.executionDuration.value} ${firstSubproject.executionDuration.unit}`;
      }
    }
    return null;
  };

  const mainImage = project.media?.images?.[0];

  return (
    <Card className="group overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border-gray-200 flex flex-col h-full">
      {/* Image Section */}
      <div className="relative h-48 bg-gradient-to-br from-blue-50 to-purple-50">
        {mainImage ? (
          <img
            src={mainImage}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-6xl text-gray-300">🏗️</div>
          </div>
        )}
        <Badge className="absolute top-3 right-3 bg-blue-600 text-white">
          {project.category}
        </Badge>
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
            {project.pricing && (
              <Badge variant="outline" className="text-xs">
                {project.pricing.type === 'fixed' ? 'Fixed Price' :
                 project.pricing.type === 'unit' ? 'Unit Price' : 'Quote'}
              </Badge>
            )}
          </div>
        </div>

        {/* Professional Info */}
        {professional && (
          <div className="pt-4 border-t border-gray-200 mb-4">
            <div className="flex items-center gap-3">
              {professional.profileImage ? (
                <img
                  src={professional.profileImage}
                  alt={professionalName}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                  {professionalName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {professionalName}
                </p>
                {location && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <Euro className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-gray-900">{getPriceDisplay()}</span>
          </div>
          {getDuration() && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              <span>{getDuration()}</span>
            </div>
          )}
        </div>

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
