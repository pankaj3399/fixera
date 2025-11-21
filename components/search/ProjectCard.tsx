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
    }>;
  };
}

const ProjectCard = ({ project }: ProjectCardProps) => {
  const professional = project.professionalId;
  const professionalName = professional?.businessInfo?.companyName || professional?.name || 'Professional';
  const location = [professional?.businessInfo?.city, professional?.businessInfo?.country]
    .filter(Boolean)
    .join(', ');

  const getProjectDuration = () => {
    if (project.executionDuration) {
      const exec = project.executionDuration;
      const buffer = project.bufferDuration;
      const total = exec.value + (buffer?.value || 0);
      return `${exec.value}${buffer?.value ? `+${buffer.value}` : ''} ${exec.unit}`;
    }
    return null;
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

        {/* Project Duration */}
        {getProjectDuration() && (
          <div className="flex items-center gap-2 mb-3 text-sm text-gray-700">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Duration: {getProjectDuration()}</span>
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
                    {subproject.executionDuration && (
                      <p className="text-gray-500 text-[10px]">
                        {subproject.executionDuration.value} {subproject.executionDuration.unit}
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
