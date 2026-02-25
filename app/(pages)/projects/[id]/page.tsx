'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  MapPin,
  Calendar,
  Users,
  CheckCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Shield,
  Award,
  Euro,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { formatCurrency } from '@/lib/formatters';
import Image from 'next/image';
import ProjectBookingForm from '@/components/project/ProjectBookingForm';
import SubprojectComparisonTable from '@/components/project/SubprojectComparisonTable';
import {
  formatPriceModelLabel,
  getCertificateGradient,
  isQualityCertificate,
} from '@/lib/projectHighlights';
import {
  formatProfessionalViewerLabel,
  formatWindowProfessionalViewer,
  formatDateOnlyProfessionalViewer,
  getViewerTimezone,
} from '@/lib/timezoneDisplay';

interface Project {
  _id: string;
  title: string;
  description: string;
  category: string;
  service: string;
  priceModel?: string;
  timeMode?: 'hours' | 'days' | 'mixed';
  preparationDuration?: {
    value: number;
    unit: 'hours' | 'days';
  };
  executionDuration?: {
    value: number;
    unit: 'hours' | 'days';
  };
  bufferDuration?: {
    value: number;
    unit: 'hours' | 'days';
  };
  media: {
    images: string[];
    video?: string;
  };
  distance: {
    address: string;
    maxKmRange: number;
  };
  firstAvailableDate?: string | null;
  certifications?: Array<{
    name: string;
    isRequired?: boolean;
    fileUrl?: string;
  }>;
  resources: string[];
  minResources?: number;
  minOverlapPercentage?: number;
  subprojects: Array<{
    name: string;
    description: string;
    pricing: {
      type: 'fixed' | 'unit' | 'rfq';
      amount?: number;
      priceRange?: { min: number; max: number };
    };
    included: Array<{
      name: string;
      description?: string;
    }>;
    executionDuration?: {
      value: number;
      unit: 'hours' | 'days';
    };
    warrantyPeriod?: {
      value: number;
      unit: 'months' | 'years';
    };
  }>;
  rfqQuestions: Array<{
    question: string;
    type: 'text' | 'multiple_choice' | 'attachment';
    options?: string[];
    isRequired: boolean;
  }>;
  extraOptions: Array<{
    name: string;
    description?: string;
    price: number;
  }>;
  faq: Array<{
    question: string;
    answer: string;
  }>;
  professionalId: {
    _id: string;
    name: string;
    businessInfo?: {
      companyName?: string;
      timezone?: string;
    };
    email: string;
    phone: string;
    companyAvailability?: {
      monday?: { available: boolean; startTime?: string; endTime?: string };
      tuesday?: { available: boolean; startTime?: string; endTime?: string };
      wednesday?: { available: boolean; startTime?: string; endTime?: string };
      thursday?: { available: boolean; startTime?: string; endTime?: string };
      friday?: { available: boolean; startTime?: string; endTime?: string };
      saturday?: { available: boolean; startTime?: string; endTime?: string };
      sunday?: { available: boolean; startTime?: string; endTime?: string };
    };
    companyBlockedRanges?: Array<{
      startDate: string;
      endDate: string;
      reason?: string;
      isHoliday?: boolean;
    }>;
  };
}

interface ScheduleProposalsResponse {
  success: boolean;
  proposals?: {
    mode: 'hours' | 'days';
    earliestBookableDate: string;
    earliestProposal?: {
      start: string;
      end: string;
      executionEnd: string;
    };
    shortestThroughputProposal?: {
      start: string;
      end: string;
      executionEnd: string;
    };
  };
}

const formatWarrantyLabel = (warranty?: {
  value?: number;
  unit?: 'months' | 'years';
}) => {
  if (!warranty || !warranty.value) return null;
  const baseUnit = warranty.unit || 'years';
  const normalizedUnit =
    warranty.value === 1 ? baseUnit.replace(/s$/, '') : baseUnit;
  return `${warranty.value} ${normalizedUnit}`;
};

const collectWarrantySummaries = (subprojects: Project['subprojects']) => {
  return subprojects
    .map((sub) => {
      const label = formatWarrantyLabel(sub.warrantyPeriod);
      if (!label) return null;
      return {
        name: sub.name,
        label,
      };
    })
    .filter(Boolean) as Array<{ name: string; label: string }>;
};

const filterQualityCertificates = (
  certifications?: Project['certifications']
) => {
  if (!certifications) return [];
  return certifications.filter((cert) => isQualityCertificate(cert.name));
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedSubprojectIndex, setSelectedSubprojectIndex] = useState<
    number | null
  >(null);
  const [proposals, setProposals] = useState<
    ScheduleProposalsResponse['proposals'] | null
  >(null);
  const [viewedSubprojectIndex, setViewedSubprojectIndex] = useState(0);
  const [viewerTimeZone, setViewerTimeZone] = useState('UTC');

  const projectId = params.id as string;

  useEffect(() => {
    setViewerTimeZone(getViewerTimezone());
  }, []);

  useEffect(() => {
    setCurrentImageIndex(0);
    setSelectedSubprojectIndex(null);
    setViewedSubprojectIndex(0);
  }, [project?._id]);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !project) return;

    // Fetch proposals for the currently viewed subproject
    fetchScheduleProposals(viewedSubprojectIndex);
  }, [
    projectId,
    viewedSubprojectIndex,
    project?.executionDuration?.value,
  ]);

  const fetchProject = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${projectId}`
      );
      const data = await response.json();

      if (data.success) {
        setProject(data.project);
      } else {
        toast.error('Project not found');
        router.push('/search');
      }
    } catch (error) {
      console.error('Error fetching project:', error);
      toast.error('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduleProposals = async (subprojectIndex?: number) => {
    try {
      let endpoint = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${projectId}/schedule-proposals`;
      if (typeof subprojectIndex === 'number') {
        endpoint += `?subprojectIndex=${subprojectIndex}`;
      }
      const response = await fetch(endpoint);
      const data: ScheduleProposalsResponse = await response.json();
      if (data.success && data.proposals) {
        setProposals(data.proposals);
      } else {
        setProposals(null);
      }
    } catch (error) {
      console.error('Error fetching project schedule proposals:', error);
      setProposals(null);
    }
  };

  const handleSelectPackage = (index: number) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to book this project');
      router.push(`/login?redirect=/projects/${projectId}`);
      return;
    }

    if (user?.role !== 'customer') {
      toast.error('Only customers can book projects');
      return;
    }

    setSelectedSubprojectIndex(index);
    setShowBookingForm(true);
  };

  if (loading || authLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
      </div>
    );
  }

  if (!project) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <p>Project not found</p>
      </div>
    );
  }

  // Compute first available date from proposals or project data
  const derivedFirstAvailableDate =
    proposals?.earliestProposal?.start ||
    proposals?.earliestBookableDate ||
    project.firstAvailableDate;
  const firstAvailableWindow = proposals?.earliestProposal || null;

  // Format dates with professional's timezone + viewer's timezone
  // For "hours" mode, include time. For "days" mode, just show date.
  const includeTime = project.timeMode === 'hours';
  const professionalTimeZone = project.professionalId?.businessInfo?.timezone || 'UTC';



  const priceModelLabel = project.priceModel
    ? formatPriceModelLabel(project.priceModel)
    : null;
  const qualityCertificates = filterQualityCertificates(project.certifications);
  const warrantySummaries = collectWarrantySummaries(project.subprojects);
  const hasQualityHighlights =
    qualityCertificates.length > 0 || warrantySummaries.length > 0;

  const getComparisonTableDateLabels = () => {
    // We strictly use viewerTimeZone
    let firstAvailable = null;

    if (includeTime) {
      // For timemode hours: just show the first available date and time.
      const dt = firstAvailableWindow?.start || derivedFirstAvailableDate;
      if (dt) {
        firstAvailable = formatProfessionalViewerLabel(dt, professionalTimeZone, viewerTimeZone, true)?.viewerLabel || null;
      }
    } else {
      // For timemode days: show window or single date
      if (firstAvailableWindow) {
        firstAvailable = formatWindowProfessionalViewer(firstAvailableWindow, professionalTimeZone, viewerTimeZone, false)?.viewerLabel || null;
      } else if (derivedFirstAvailableDate) {
        firstAvailable = formatDateOnlyProfessionalViewer(derivedFirstAvailableDate, professionalTimeZone, viewerTimeZone)?.viewerLabel || null;
      }
    }

    // Shortest Throughput is NOT needed for hours timemode (includeTime === true)
    let shortestThroughput = null;
    if (!includeTime && proposals?.shortestThroughputProposal) {
      shortestThroughput = formatWindowProfessionalViewer(
        proposals.shortestThroughputProposal,
        professionalTimeZone,
        viewerTimeZone,
        false
      )?.viewerLabel || null;
    }

    // Hide shortest throughput if it provides redundant information
    if (shortestThroughput === firstAvailable) {
      shortestThroughput = null;
    }

    return { firstAvailable, shortestThroughput };
  };

  const comparisonTableDateLabels = getComparisonTableDateLabels();

  if (showBookingForm) {
    return (
      <ProjectBookingForm
        project={project}
        onBack={() => {
          setShowBookingForm(false);
          setSelectedSubprojectIndex(null);
        }}
        selectedSubprojectIndex={selectedSubprojectIndex}
      />
    );
  }

  return (
    <div className='min-h-screen bg-gray-50 py-8'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        {/* Back Button */}
        <Link href='/search'>
          <Button variant='ghost' className='mb-6'>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back to Search
          </Button>
        </Link>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
          {/* Main Content */}
          <div className='lg:col-span-2 space-y-6'>
            {/* Image Gallery with Carousel */}
            {project.media.images.length > 0 && (
              <Card>
                <CardContent className='p-0'>
                  <div className='relative h-96 w-full group'>
                    <Image
                      src={project.media.images[currentImageIndex]}
                      alt={project.title}
                      fill
                      className='object-cover rounded-t-lg'
                    />

                    {/* Left Arrow */}
                    {project.media.images.length > 1 && (
                      <>
                        <button
                          onClick={() =>
                            setCurrentImageIndex((prev) =>
                              prev > 0
                                ? prev - 1
                                : project.media.images.length - 1
                            )
                          }
                          className='absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200'
                          aria-label='Previous image'
                        >
                          <ChevronLeft className='w-6 h-6' />
                        </button>

                        {/* Right Arrow */}
                        <button
                          onClick={() =>
                            setCurrentImageIndex((prev) =>
                              prev < project.media.images.length - 1
                                ? prev + 1
                                : 0
                            )
                          }
                          className='absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200'
                          aria-label='Next image'
                        >
                          <ChevronRight className='w-6 h-6' />
                        </button>

                        {/* Image Counter */}
                        <div className='absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm font-medium'>
                          {currentImageIndex + 1} /{' '}
                          {project.media.images.length}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Thumbnail Navigation */}
                  {project.media.images.length > 1 && (
                    <div className='flex gap-2 p-4 overflow-x-auto'>
                      {project.media.images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentImageIndex(idx)}
                          className={`relative h-20 w-20 flex-shrink-0 rounded overflow-hidden border-2 transition-all ${currentImageIndex === idx
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-400'
                            }`}
                        >
                          <Image
                            src={img}
                            alt={`${project.title} thumbnail ${idx + 1}`}
                            fill
                            className='object-cover'
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Project Details */}
            <Card>
              <CardHeader>
                <div className='flex items-start justify-between'>
                  <div>
                    <CardTitle className='text-3xl mb-2'>
                      {project.title}
                    </CardTitle>
                    <CardDescription className='text-base flex flex-wrap gap-2'>
                      <Badge className='mb-2'>{project.category}</Badge>
                      <Badge className='mb-2' variant='outline'>
                        {project.service}
                      </Badge>
                      {priceModelLabel && (
                        <Badge className='mb-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-0'>
                          {priceModelLabel}
                        </Badge>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <h3 className='font-semibold text-lg mb-2'>Description</h3>
                  <p className='text-gray-700 whitespace-pre-wrap'>
                    {project.description}
                  </p>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t'>
                  {priceModelLabel && (
                    <div className='flex items-start gap-3'>
                      <Euro className='h-5 w-5 text-blue-600 mt-0.5' />
                      <div>
                        <p className='text-sm text-gray-500'>Price Model</p>
                        <p className='font-medium text-gray-900'>
                          {priceModelLabel}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className='grid grid-cols-2 gap-4 pt-4 border-t'>
                  <div className='flex items-center gap-2'>
                    <MapPin className='h-5 w-5 text-gray-500' />
                    <div>
                      <p className='text-sm text-gray-500'>Service Area</p>
                      <p className='font-medium'>
                        {project.distance.maxKmRange} km radius
                      </p>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Users className='h-5 w-5 text-gray-500' />
                    <div>
                      <p className='text-sm text-gray-500'>Team Size</p>
                      <p className='font-medium'>
                        {project.resources.length} members
                      </p>
                      {project.minResources && project.minResources > 1 && (
                        <p className='text-xs text-blue-600'>
                          {project.minResources} required ({project.minOverlapPercentage || 90}% overlap)
                        </p>
                      )}
                    </div>
                  </div>
                </div>


                {/* Project Timeline */}
                {project.executionDuration && (
                  <div className='pt-4 border-t'>
                    <h4 className='font-semibold mb-3'>Project Timeline</h4>
                    <div className='grid grid-cols-2 gap-4'>
                      {project.preparationDuration &&
                        project.preparationDuration.value > 0 && (
                          <div className='flex items-start gap-2'>
                            <Clock className='h-5 w-5 text-blue-600 mt-0.5' />
                            <div>
                              <p className='text-sm text-gray-500'>
                                Preparation Time
                              </p>
                              <p className='font-medium'>
                                {project.preparationDuration.value}{' '}
                                {project.preparationDuration.unit}
                              </p>
                            </div>
                          </div>
                        )}
                      <div className='flex items-start gap-2'>
                        <Calendar className='h-5 w-5 text-blue-600 mt-0.5' />
                        <div>
                          <p className='text-sm text-gray-500'>
                            Execution Duration
                          </p>
                          <p className='font-medium'>
                            {project.executionDuration.value}{' '}
                            {project.executionDuration.unit}
                          </p>
                        </div>
                      </div>
                      {project.bufferDuration &&
                        project.bufferDuration.value > 0 && (
                          <div className='flex items-start gap-2'>
                            <Calendar className='h-5 w-5 text-yellow-600 mt-0.5' />
                            <div>
                              <p className='text-sm text-gray-500'>
                                Buffer Time
                              </p>
                              <p className='font-medium'>
                                {project.bufferDuration.value}{' '}
                                {project.bufferDuration.unit}
                              </p>
                              <p className='text-xs text-gray-500'>
                                Reserved for quality assurance
                              </p>
                            </div>
                          </div>
                        )}
                      {project.timeMode && (
                        <div className='flex items-start gap-2'>
                          <CheckCircle className='h-5 w-5 text-green-600 mt-0.5' />
                          <div>
                            <p className='text-sm text-gray-500'>
                              Scheduling Mode
                            </p>
                            <p className='font-medium capitalize'>
                              {project.timeMode}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {hasQualityHighlights && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Shield className='h-5 w-5 text-green-600' />
                    Quality & Guarantees
                  </CardTitle>
                  <CardDescription>
                    Professional certifications and warranty coverage per
                    package
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-5'>
                  {qualityCertificates.length > 0 && (
                    <div>
                      <h4 className='font-semibold mb-2 flex items-center gap-2 text-gray-900'>
                        <Award className='h-4 w-4 text-amber-500' />
                        Certified Excellence
                      </h4>
                      <div className='flex flex-wrap gap-2'>
                        {qualityCertificates.map((cert, idx) => (
                          <span
                            key={`${cert.name}-${idx}`}
                            className={`text-xs font-semibold text-white px-3 py-1 rounded-full bg-gradient-to-r ${getCertificateGradient(
                              cert.name
                            )}`}
                          >
                            {cert.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {warrantySummaries.length > 0 && (
                    <div className='space-y-3'>
                      <h4 className='font-semibold text-gray-900'>
                        Warranty Coverage
                      </h4>
                      <div className='space-y-2'>
                        {warrantySummaries.map((summary) => (
                          <div
                            key={summary.name}
                            className='flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2'
                          >
                            <span className='text-sm font-medium text-gray-900'>
                              {summary.name}
                            </span>
                            <Badge variant='outline' className='text-xs'>
                              {summary.label}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}



            {/* FAQ */}
            {(project.faq?.length || 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Frequently Asked Questions</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {(project.faq || []).map((item, idx) => (
                    <div key={idx} className='space-y-2'>
                      <h4 className='font-semibold'>{item.question}</h4>
                      <p className='text-gray-600 text-sm'>{item.answer}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Reviews & More From This Professional</CardTitle>
                <CardDescription>Coming soon in the next phase</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-sm text-gray-600'>
                  We&apos;re working on surfacing verified reviews and
                  additional projects from this company. Stay tuned!
                </p>
              </CardContent>
            </Card>

          </div>

          {/* Sidebar */}
          <div className='space-y-6'>

            {project.subprojects.length > 0 && (
              <div className='bg-white rounded-lg shadow-sm p-4'>
                <SubprojectComparisonTable
                  subprojects={project.subprojects}
                  onSelectPackage={handleSelectPackage}
                  priceModel={project.priceModel}
                  selectedIndex={viewedSubprojectIndex}
                  onSelectIndex={setViewedSubprojectIndex}
                  dateLabels={comparisonTableDateLabels}
                  timeMode={project.timeMode}
                  companyAvailability={project.professionalId?.companyAvailability}
                  companyBlockedRanges={project.professionalId?.companyBlockedRanges}
                  professionalId={project.professionalId?._id}
                />
              </div>
            )}

            {/* Professional Info - Hidden until after booking */}
            {project.professionalId && (
              <Card>
                <CardHeader>
                  <CardTitle>Provided By</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='space-y-3'>
                    <div className='flex items-center space-x-2'>
                      <div className='h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg'>
                        P
                      </div>
                      <div>
                        <p className='font-semibold text-lg text-gray-900'>
                          Verified Professional
                        </p>
                        <Badge variant='secondary' className='text-xs'>
                          <CheckCircle className='w-3 h-3 mr-1' />
                          Verified
                        </Badge>
                      </div>
                    </div>
                    <p className='text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-3'>
                      <strong>Note:</strong> Contact details will be revealed
                      after you complete your booking and payment.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Extra Options */}
            {project.extraOptions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Add-On Options</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {project.extraOptions.map((option, idx) => (
                    <div
                      key={idx}
                      className='flex justify-between items-start text-sm'
                    >
                      <div>
                        <p className='font-medium'>{option.name}</p>
                        {option.description && (
                          <p className='text-gray-600 text-xs'>
                            {option.description}
                          </p>
                        )}
                      </div>
                      <p className='font-semibold text-blue-600'>
                        {formatCurrency(option.price) ?? 'N/A'}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Company Working Hours & Availability */}
            {project.professionalId.companyAvailability && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Clock className='h-5 w-5' />
                    Working Hours & Availability
                  </CardTitle>
                  <CardDescription>
                    Standard business hours and upcoming closures
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-6'>
                  {/* Weekly Schedule */}
                  <div>
                    <h4 className='font-semibold mb-3'>
                      Standard Working Days:
                    </h4>
                    <div className='grid grid-cols-1 gap-2 text-sm'>
                      {[
                        'monday',
                        'tuesday',
                        'wednesday',
                        'thursday',
                        'friday',
                        'saturday',
                        'sunday',
                      ].map((day) => {
                        const dayKey =
                          day as keyof typeof project.professionalId.companyAvailability;
                        const dayInfo =
                          project.professionalId.companyAvailability?.[dayKey];
                        const dayName =
                          day.charAt(0).toUpperCase() + day.slice(1);

                        return (
                          <div
                            key={day}
                            className='flex justify-between items-center p-2 rounded bg-gray-50'
                          >
                            <span className='font-medium'>{dayName}:</span>
                            {dayInfo?.available ? (
                              <span className='text-green-600'>
                                {dayInfo.startTime || '09:00'} -{' '}
                                {dayInfo.endTime || '17:00'}
                              </span>
                            ) : (
                              <span className='text-gray-400'>Closed</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Company Closures */}
                  {project.professionalId.companyBlockedRanges &&
                    project.professionalId.companyBlockedRanges.length > 0 && (
                      <div className='pt-4 border-t'>
                        <h4 className='font-semibold mb-3'>
                          Upcoming Closures:
                        </h4>
                        <div className='space-y-2'>
                          {project.professionalId.companyBlockedRanges
                            .filter((closure) => {
                              const endDate = new Date(closure.endDate);
                              return endDate >= new Date(); // Only show future/current closures
                            })
                            .slice(0, 5) // Limit to 5 upcoming closures
                            .map((closure, idx) => (
                              <div
                                key={idx}
                                className='flex justify-between items-start p-3 bg-yellow-50 border border-yellow-200 rounded text-sm'
                              >
                                <div>
                                  <p className='font-medium text-gray-900'>
                                    {closure.reason ||
                                      (closure.isHoliday
                                        ? 'Holiday Period'
                                        : 'Company Closure')}
                                  </p>
                                  <p className='text-gray-600 text-xs mt-1'>
                                    {new Date(
                                      closure.startDate
                                    ).toLocaleDateString()}{' '}
                                    -{' '}
                                    {new Date(
                                      closure.endDate
                                    ).toLocaleDateString()}
                                  </p>
                                </div>
                                {closure.isHoliday && (
                                  <Badge
                                    variant='secondary'
                                    className='text-xs'
                                  >
                                    Holiday
                                  </Badge>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}



          </div>
        </div>
      </div>
    </div>
  );
}

