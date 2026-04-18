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
  MapPin,
  Calendar,
  Users,
  User,
  CheckCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Shield,
  AlertTriangle,
  FileText,
  Award,
  Euro,
  Star,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { formatCurrency } from '@/lib/formatters';
import Image from 'next/image';
import ProjectBookingForm from '@/components/project/ProjectBookingForm';
import SubprojectComparisonTable from '@/components/project/SubprojectComparisonTable';
import {
  formatPriceModelLabel,
  getCertificateGradient,
  isQualityCertificate,
} from '@/lib/projectHighlights';
import { emitChatWidgetOpen, PENDING_CHAT_START_KEY } from '@/lib/chatWidgetEvents';
import {
  formatProfessionalViewerLabel,
  formatWindowProfessionalViewer,
  formatDateOnlyProfessionalViewer,
  getViewerTimezone,
} from '@/lib/timezoneDisplay';
import { useCommissionRate } from '@/hooks/useCommissionRate';
import type { PublicProjectDto as Project } from '@/types/project';
import {
  getLevelColor,
  getAdminTagStyle,
  formatAdminTagLabel,
  formatResponseTime,
} from '@/lib/professionalLevel';

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

type RatingSummaryProps = {
  ratingsSummary: { overallAverage: number; totalReviews: number };
  size?: 'sm' | 'md';
};

const RatingSummary = ({ ratingsSummary, size = 'md' }: RatingSummaryProps) => {
  const starClass = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const avgClass = size === 'md' ? 'text-base font-semibold text-gray-800' : 'text-sm font-semibold';
  const countClass = size === 'md' ? 'text-sm text-gray-500' : 'text-xs text-gray-500';
  return (
    <div className={`flex items-center gap-2 ${size === 'md' ? 'mb-2' : 'mt-1'}`}>
      <div className='flex gap-0.5'>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${starClass} ${
              star <= Math.round(ratingsSummary.overallAverage)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-200'
            }`}
          />
        ))}
      </div>
      <span className={avgClass}>{ratingsSummary.overallAverage.toFixed(1)}</span>
      <span className={countClass}>
        ({ratingsSummary.totalReviews} review{ratingsSummary.totalReviews !== 1 ? 's' : ''})
      </span>
    </div>
  );
};

type ProvidedByCardProps = {
  pro: Project['professionalId'];
  stats?: Project['professionalStats'];
};

const ProvidedByCard = ({ pro, stats }: ProvidedByCardProps) => {
  const proName =
    pro.businessInfo?.companyName || pro.name || pro.username || 'Professional';
  const proLocation = [pro.businessInfo?.city, pro.businessInfo?.country]
    .filter(Boolean)
    .join(', ');
  const memberSince = pro.createdAt
    ? new Date(pro.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provided By</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          <div className='flex items-center gap-3'>
            {pro.profileImage ? (
              <img
                src={pro.profileImage}
                alt={proName}
                className='h-12 w-12 rounded-full object-cover'
              />
            ) : (
              <div className='h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg'>
                {proName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className='flex-1 min-w-0'>
              <p className='font-semibold text-gray-900 truncate'>{proName}</p>
              {proLocation && (
                <div className='flex items-center gap-1 text-xs text-gray-500'>
                  <MapPin className='w-3 h-3' />
                  <span className='truncate'>{proLocation}</span>
                </div>
              )}
              {memberSince && (
                <p className='text-xs text-gray-400'>Member since {memberSince}</p>
              )}
            </div>
          </div>

          <div className='flex flex-wrap gap-1.5'>
            {pro.professionalLevel && (
              <Badge variant='secondary' className={`text-xs ${getLevelColor(pro.professionalLevel)}`}>
                {pro.professionalLevel}
              </Badge>
            )}
            {(pro.adminTags || []).map((tag) => (
              <Badge
                key={tag}
                variant='outline'
                className={`text-xs ${getAdminTagStyle(tag)}`}
              >
                {formatAdminTagLabel(tag)}
              </Badge>
            ))}
          </div>

          {stats && stats.totalReviews > 0 && (
            <div className='space-y-2 pt-2 border-t border-gray-100'>
              <div className='flex items-center gap-2'>
                <div className='flex gap-0.5'>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${
                        star <= Math.round(stats.avgRating)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <span className='text-sm font-semibold text-gray-800'>{stats.avgRating.toFixed(1)}</span>
                <span className='text-xs text-gray-500'>({stats.totalReviews})</span>
              </div>
              <div className='space-y-1 text-xs text-gray-600'>
                <div className='flex justify-between'>
                  <span>Communication</span>
                  <span className='font-medium'>{stats.avgCommunication.toFixed(1)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Value of Delivery</span>
                  <span className='font-medium'>{stats.avgValueOfDelivery.toFixed(1)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Quality of Service</span>
                  <span className='font-medium'>{stats.avgQualityOfService.toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}

          {stats && stats.avgResponseTimeMs > 0 && (
            <div className='flex items-center justify-between text-xs text-gray-600 pt-2 border-t border-gray-100'>
              <span className='flex items-center gap-1'>
                <Clock className='h-3 w-3' />
                Avg Response
              </span>
              <span className='font-medium'>{formatResponseTime(stats.avgResponseTimeMs)}</span>
            </div>
          )}

          <p className='text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-3'>
            <strong>Note:</strong> Contact details will be revealed
            after you complete your booking and payment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

const CUSTOMER_PRESENCE_LABELS: Record<string, string> = {
  not_required: 'Not required',
  available: 'Customer should be available',
  first_hour_only: 'Customer only needs to be present for the first hour',
  present_throughout: 'Customer must be present throughout',
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
  const [reviews, setReviews] = useState<Array<{
    _id: string;
    customerReview: {
      communicationLevel: number;
      valueOfDelivery: number;
      qualityOfService: number;
      comment?: string;
      images?: string[];
      reviewedAt: string;
      reply?: { comment: string; repliedAt: string };
    };
    customer: { name?: string; profileImage?: string };
  }>>([]);
  const [ratingsSummary, setRatingsSummary] = useState<{
    overallAverage: number;
    avgCommunication: number;
    avgValueOfDelivery: number;
    avgQualityOfService: number;
    totalReviews: number;
  } | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [ordersInQueue, setOrdersInQueue] = useState(0);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewRatingFilter, setReviewRatingFilter] = useState<number | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotalPages, setReviewTotalPages] = useState(1);
  const { customerPrice } = useCommissionRate();

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
    if (!projectId) return;
    const controller = new AbortController();
    const fetchReviews = async () => {
      setReviewsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(reviewPage), limit: '10' });
        if (reviewSearch.trim()) params.set('search', reviewSearch.trim());
        if (reviewRatingFilter) params.set('rating', String(reviewRatingFilter));
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${projectId}/reviews?${params}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (data.success) {
          setReviews(data.data.reviews);
          setRatingsSummary(data.data.ratingsSummary);
          setOrdersInQueue(data.data.ordersInQueue || 0);
          setReviewTotalPages(data.data.pagination.totalPages);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // non-critical
      } finally {
        setReviewsLoading(false);
      }
    };
    fetchReviews();
    return () => { controller.abort(); };
  }, [projectId, reviewPage, reviewSearch, reviewRatingFilter]);

  useEffect(() => {
    if (!projectId || !project) return;

    // Fetch proposals for the currently viewed subproject
    fetchScheduleProposals(viewedSubprojectIndex);
  }, [
    projectId,
    viewedSubprojectIndex,
    project?._id,
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

  const handleContactProfessional = () => {
    const profId = project?.professionalId?._id;
    if (!profId) return;

    if (!isAuthenticated) {
      sessionStorage.setItem(
        PENDING_CHAT_START_KEY,
        JSON.stringify({ open: true, professionalId: profId })
      );
      toast.error('Please sign in to contact this professional');
      router.push(`/login?redirect=/projects/${projectId}`);
      return;
    }

    if (user?.role !== 'customer') {
      toast.error('Only customers can contact professionals');
      return;
    }

    emitChatWidgetOpen({ open: true, professionalId: profId });
  };

  if (loading || authLoading) {
    return (
      <div className='min-h-screen bg-gray-50 py-8'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <Skeleton className="h-9 w-20 rounded-lg mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Hero image skeleton */}
              <Skeleton className="h-64 w-full rounded-xl" />
              {/* Title & meta */}
              <div className="space-y-3">
                <Skeleton className="h-8 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              {/* Subprojects skeleton */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
                <Skeleton className="h-6 w-36" />
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
            {/* Sidebar */}
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-3">
                <Skeleton className="h-6 w-32" />
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
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
  const customerPresenceLabel = project.customerPresence
    ? CUSTOMER_PRESENCE_LABELS[project.customerPresence] || project.customerPresence
    : null;
  const projectTermsConditions = project.termsConditions || [];
  const hasPresenceConditionsSection =
    Boolean(customerPresenceLabel) || projectTermsConditions.length > 0;

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

  const serviceAreaLabel = project.distance.noBorders
    ? 'No borders'
    : project.distance.maxKmRange != null
      ? `${project.distance.maxKmRange} km radius`
      : '—';

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
                    {ratingsSummary && ratingsSummary.totalReviews > 0 && (
                      <RatingSummary ratingsSummary={ratingsSummary} size='md' />
                    )}
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

                {(() => {
                  const sub = project.subprojects?.[viewedSubprojectIndex]
                  const inputs = sub?.professionalInputs || []
                  if (inputs.length === 0) return null
                  return (
                    <div className='pt-4 border-t'>
                      <h4 className='font-semibold mb-3'>Service Details{sub?.name ? ` — ${sub.name}` : ''}</h4>
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                        {inputs.map((input, idx) => {
                          const value = input.value
                          let display: string
                          if (value && typeof value === 'object' && 'min' in value) {
                            display = `${value.min} - ${value.max}`
                          } else if (value === undefined || value === null || value === '') {
                            display = '—'
                          } else {
                            display = String(value)
                          }
                          return (
                            <div key={`${input.fieldName}-${idx}`} className='flex items-start justify-between gap-3 text-sm bg-gray-50 rounded-md px-3 py-2'>
                              <span className='text-gray-600'>{input.fieldName}</span>
                              <span className='font-medium text-gray-900 text-right'>{display}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t'>
                  {priceModelLabel && (
                    <div className='flex items-start gap-3'>
                      <Euro className='h-5 w-5 text-blue-600 mt-0.5' />
                      <div>
                        <p className='text-sm text-gray-500'>Price Model</p>
                        <p className='font-medium text-gray-900'>
                          {priceModelLabel}
                        </p>
                        <p className='text-xs text-gray-500 mt-0.5'>
                          Pricing unit: {priceModelLabel}
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
                      <p className='font-medium'>{serviceAreaLabel}</p>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Users className='h-5 w-5 text-gray-500' />
                    <div>
                      <p className='text-sm text-gray-500'>Team Size</p>
                      <p className='font-medium'>
                        {project.resources.length} members
                      </p>
                      <p className='text-xs text-blue-600'>
                        {project.minResources || 1} required ({project.minOverlapPercentage ?? 70}% overlap)
                      </p>
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



            {/* Customer Presence, Conditions & Warnings */}
            {hasPresenceConditionsSection && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <FileText className='h-5 w-5 text-blue-600' />
                    Customer Presence, Conditions & Warnings
                  </CardTitle>
                  <CardDescription>
                    Requirements the customer should review before booking
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-5'>
                  {customerPresenceLabel && (
                    <div className='rounded-lg border border-blue-100 bg-blue-50 px-4 py-3'>
                      <div className='flex items-center gap-2 text-sm font-semibold text-blue-900'>
                        <User className='h-4 w-4' />
                        Customer Presence
                      </div>
                      <p className='mt-1 text-sm text-blue-800'>
                        {customerPresenceLabel}
                      </p>
                    </div>
                  )}

                  {projectTermsConditions.length > 0 && (
                    <div className='space-y-3'>
                      {projectTermsConditions.map((term, idx) => {
                        const isWarning = term.type === 'warning';
                        return (
                          <div
                            key={`${term.name}-${idx}`}
                            className={`rounded-lg border px-4 py-3 ${
                              isWarning
                                ? 'border-yellow-200 bg-yellow-50'
                                : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
                              <div className='min-w-0'>
                                <div className='flex items-center gap-2'>
                                  {isWarning ? (
                                    <AlertTriangle className='h-4 w-4 text-yellow-600' />
                                  ) : (
                                    <Shield className='h-4 w-4 text-blue-600' />
                                  )}
                                  <h4 className='font-semibold text-gray-900'>
                                    {term.name}
                                  </h4>
                                  {isWarning && (
                                    <Badge
                                      variant='outline'
                                      className='border-yellow-300 bg-yellow-100 text-yellow-800'
                                    >
                                      Warning
                                    </Badge>
                                  )}
                                </div>
                                <p className='mt-2 text-sm text-gray-600'>
                                  {term.description}
                                </p>
                              </div>

                              {!isWarning &&
                                term.additionalCost != null &&
                                Number.isFinite(term.additionalCost) &&
                                term.additionalCost > 0 && (
                                  <div className='shrink-0 text-sm font-semibold text-orange-600'>
                                    +{formatCurrency(customerPrice(term.additionalCost)) ?? `€${term.additionalCost.toFixed(2)}`}
                                  </div>
                                )}
                            </div>
                          </div>
                        );
                      })}
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
                <div className='flex items-center justify-between'>
                  <CardTitle>Reviews From Customers</CardTitle>
                  {ordersInQueue > 0 && (
                    <div className='flex items-center gap-1.5 text-sm text-orange-600'>
                      <ShoppingCart className='h-4 w-4' />
                      <span>{ordersInQueue} order{ordersInQueue !== 1 ? 's' : ''} in queue</span>
                    </div>
                  )}
                </div>
                {ratingsSummary && ratingsSummary.totalReviews > 0 && (
                  <RatingSummary ratingsSummary={ratingsSummary} size='sm' />
                )}

                {/* Search and filter controls */}
                <div className='flex flex-col sm:flex-row gap-2 mt-3'>
                  <div className='relative flex-1'>
                    <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400' />
                    <Input
                      placeholder='Search reviews...'
                      value={reviewSearch}
                      onChange={(e) => { setReviewSearch(e.target.value); setReviewPage(1); }}
                      className='pl-9 h-9 text-sm'
                    />
                  </div>
                  <div className='flex gap-1'>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Button
                        key={star}
                        variant={reviewRatingFilter === star ? 'default' : 'outline'}
                        size='sm'
                        className='h-9 px-2 text-xs'
                        onClick={() => { setReviewRatingFilter(reviewRatingFilter === star ? null : star); setReviewPage(1); }}
                      >
                        {star} <Star className='h-3 w-3 ml-0.5 fill-current' />
                      </Button>
                    ))}
                    {reviewRatingFilter && (
                      <Button variant='ghost' size='sm' className='h-9 px-2' aria-label='Clear rating filter' title='Clear rating filter' onClick={() => { setReviewRatingFilter(null); setReviewPage(1); }}>
                        <X className='h-3 w-3' />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {reviewsLoading ? (
                  <div className='space-y-3'>
                    {[1, 2].map(i => (
                      <div key={i} className='space-y-2'>
                        <div className='flex items-center gap-2'>
                          <div className='h-4 w-24 bg-gray-200 rounded animate-pulse' />
                          <div className='h-3 w-16 bg-gray-100 rounded animate-pulse' />
                        </div>
                        <div className='h-3 w-full bg-gray-100 rounded animate-pulse' />
                      </div>
                    ))}
                  </div>
                ) : reviews.length === 0 ? (
                  <p className='text-sm text-gray-500'>No reviews yet.</p>
                ) : (
                  <div className='space-y-4'>
                    {reviews.map((review) => {
                      const cr = review.customerReview;
                      const avg = Math.round(((cr.communicationLevel + cr.valueOfDelivery + cr.qualityOfService) / 3) * 10) / 10;
                      return (
                        <div key={review._id} className='border-b border-gray-100 pb-4 last:border-0 last:pb-0'>
                          <div className='flex items-center gap-2 mb-1'>
                            <span className='text-sm font-medium'>{review.customer?.name || 'Anonymous'}</span>
                            <div className='flex gap-0.5'>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-3 w-3 ${star <= Math.round(avg) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                                />
                              ))}
                            </div>
                            <span className='text-xs text-gray-400'>{new Date(cr.reviewedAt).toLocaleDateString()}</span>
                          </div>
                          {cr.comment && <p className='text-sm text-gray-600'>{cr.comment}</p>}
                          {cr.images && cr.images.length > 0 && (
                            <div className='flex gap-2 mt-2'>
                              {cr.images.map((img, idx) => (
                                <a key={idx} href={img} target='_blank' rel='noopener noreferrer'>
                                  <img src={img} alt={`Review image ${idx + 1}`} className='h-20 w-20 object-cover rounded-md border border-gray-200 hover:opacity-80 transition-opacity' />
                                </a>
                              ))}
                            </div>
                          )}
                          {cr.reply && (
                            <div className='mt-2 ml-4 border-l-2 border-blue-200 pl-3'>
                              <p className='text-xs font-medium text-blue-700'>Professional&apos;s Reply</p>
                              <p className='text-sm text-gray-600'>{cr.reply.comment}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Pagination */}
                    {reviewTotalPages > 1 && (
                      <div className='flex items-center justify-center gap-2 pt-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={reviewPage <= 1}
                          onClick={() => setReviewPage(reviewPage - 1)}
                          aria-label='Previous page'
                        >
                          <ChevronLeft className='h-4 w-4' />
                        </Button>
                        <span className='text-sm text-gray-600'>
                          Page {reviewPage} of {reviewTotalPages}
                        </span>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={reviewPage >= reviewTotalPages}
                          onClick={() => setReviewPage(reviewPage + 1)}
                          aria-label='Next page'
                        >
                          <ChevronRight className='h-4 w-4' />
                        </Button>
                      </div>
                    )}

                    {project?.professionalId?._id && (
                      <Link href={`/professional/${project.professionalId._id}`} className='text-sm text-blue-600 hover:underline'>
                        View all reviews
                      </Link>
                    )}
                  </div>
                )}
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
                  repeatBuyerDiscount={project.repeatBuyerDiscount}
                  repeatBuyerEligibility={project.repeatBuyerEligibility}
                  selectedIndex={viewedSubprojectIndex}
                  onSelectIndex={setViewedSubprojectIndex}
                  dateLabels={comparisonTableDateLabels}
                  timeMode={project.timeMode}
                  companyAvailability={project.professionalId.companyAvailability}
                  companyBlockedRanges={project.professionalId.companyBlockedRanges}
                  onContactProfessional={handleContactProfessional}
                />
              </div>
            )}

            {project.professionalId && (
              <ProvidedByCard pro={project.professionalId} stats={project.professionalStats} />
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
                        {formatCurrency(customerPrice(option.price)) ?? 'N/A'}
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
    </div >
  );
}

