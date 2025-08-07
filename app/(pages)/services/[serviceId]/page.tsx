import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from '@/components/ui/separator';
import { Star, Heart, Award, ChevronRight } from 'lucide-react';
import { professionalsForService, subNavbarCategories } from '@/data/content';
import { Button } from '@/components/ui/button';
import ProfessionalFilters from '@/components/ProfessionalFilters';

type Props = {
  params: Promise<{
    serviceId: string;
  }>;
};

const ProfessionalCard = ({ professional }: { professional: (typeof professionalsForService)[0] }) => {
  return (
    <Card className="group overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border-gray-200 flex flex-col w-full">
      <div className="relative aspect-[4/3] w-full">
        <Image
          src={professional.image}
          alt={professional.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-white/70 backdrop-blur-sm hover:bg-white rounded-full">
          <Heart className="w-5 h-5 text-gray-700" />
        </Button>
      </div>
      <CardContent className="p-4 flex flex-col flex-grow">
        <div className="flex items-center space-x-3 mb-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={professional.avatar} alt={professional.name} />
            <AvatarFallback>{professional.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-base leading-tight">{professional.name}</p>
            <p className="text-xs text-blue-600 font-medium flex items-center gap-1"><Award className="w-3 h-3" />{professional.level}</p>
          </div>
        </div>
        <p className="text-base text-gray-800 group-hover:text-blue-600 transition-colors flex-grow">
          {professional.title}
        </p>
        <div className="flex items-center gap-1 mt-3">
          <Star className="w-4 h-4 text-yellow-400 fill-current" />
          <span className="font-bold text-gray-700">{professional.rating}</span>
          <span className="text-sm text-gray-500">({professional.reviews})</span>
        </div>
      </CardContent>
      <div className="p-4 border-t flex items-center justify-between">
        <span className="text-xs text-gray-500 font-semibold tracking-wider">STARTING AT</span>
        <p className="text-xl font-bold text-gray-900">€{professional.startingPrice}</p>
      </div>
    </Card>
  );
};

export default async function Page({ params }: Props) {

  const { serviceId } = await params;


  const serviceName = subNavbarCategories
    .flatMap(cat => cat.services)
    .find(srv => srv.id === serviceId)?.name || 'Services';

  return (
    <div className="bg-white">
      <div className="relative h-72 md:h-96 w-full">
        <Image
          src="/images/banner.jpg"
          alt={`Showcase for ${serviceName}`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/20" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-12">
            <div className="flex items-center text-sm text-white mb-2">
              <Link href="/" className="hover:underline">Home</Link>
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href="/services" className="hover:underline">Services</Link>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
              {serviceName}
            </h1>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <ProfessionalFilters resultsCount={professionalsForService.length} />
        <Separator className="mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {professionalsForService.map(professional => (
            <ProfessionalCard key={professional.id} professional={professional} />
          ))}
        </div>
      </main>
    </div>
  );
}
