'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Euro, ArrowRight, Calendar } from 'lucide-react';
import StartChatButton from '@/components/chat/StartChatButton';

interface ProfessionalCardProps {
  professional: {
    _id: string;
    name: string;
    email: string;
    businessInfo?: {
      companyName?: string;
      description?: string;
      city?: string;
      country?: string;
    };
    hourlyRate?: number;
    currency?: string;
    serviceCategories?: string[];
    profileImage?: string;
    availability?: boolean;
  };
}

const ProfessionalCard = ({ professional }: ProfessionalCardProps) => {
  const displayName = professional.businessInfo?.companyName || professional.name;
  const location = [professional.businessInfo?.city, professional.businessInfo?.country]
    .filter(Boolean)
    .join(', ');

  return (
    <Card className="group overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border-gray-200 flex flex-col h-full">
      {/* Avatar/Image Section */}
      <div className="relative h-48 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
        {professional.profileImage ? (
          <img
            src={professional.profileImage}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center text-white text-3xl font-bold">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {professional.availability && (
          <Badge className="absolute top-3 right-3 bg-green-500 text-white">
            <Calendar className="w-3 h-3 mr-1" />
            Available
          </Badge>
        )}
      </div>

      {/* Content Section */}
      <CardContent className="p-5 flex flex-col flex-grow">
        <div className="flex-grow">
          <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-1">
            {displayName}
          </h3>
          {professional.businessInfo?.companyName && professional.name !== professional.businessInfo.companyName && (
            <p className="text-sm text-gray-500 mb-3">{professional.name}</p>
          )}

          {professional.businessInfo?.description && (
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {professional.businessInfo.description}
            </p>
          )}

          {/* Services */}
          {professional.serviceCategories && professional.serviceCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {professional.serviceCategories.slice(0, 3).map((service, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {service}
                </Badge>
              ))}
              {professional.serviceCategories.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{professional.serviceCategories.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="space-y-2 pt-4 border-t border-gray-200">
          {location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span>{location}</span>
            </div>
          )}

          {professional.hourlyRate && (
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Euro className="w-4 h-4 text-gray-400" />
              <span>
                {professional.currency || '€'}{professional.hourlyRate}/hr
              </span>
            </div>
          )}
        </div>

        {/* CTA Buttons */}
        <div className="mt-4 grid grid-cols-1 gap-2">
          <Button asChild className="w-full" variant="default">
            <Link href={`/professionals/${professional._id}`}>
              View Profile <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <StartChatButton
            professionalId={professional._id}
            label="Start Chat"
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfessionalCard;
