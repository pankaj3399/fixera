'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

// -------------------------------------------
// STANDALONE TYPES (NO BACKEND IMPORTS)
// -------------------------------------------

type PricingType = 'fixed' | 'unit' | 'rfq';

interface Pricing {
  type: PricingType;
  amount?: number;
  priceRange?: { min: number; max: number };
  minProjectValue?: number;
}

interface IncludedItem {
  name: string;
  description?: string;
  isCustom?: boolean;
}

interface ExecutionDuration {
  value: number;
  unit: 'hours' | 'days';
  range?: { min: number; max: number };
}

interface Buffer {
  value: number;
  unit: 'hours' | 'days';
}

interface IntakeDuration {
  value: number;
  unit: 'hours' | 'days';
  buffer?: number;
}

interface Subproject {
  id?: string;
  name: string;
  description: string;
  pricing: Pricing;
  included?: IncludedItem[];
  materialsIncluded?: boolean;
  deliveryPreparation?: number;
  executionDuration?: ExecutionDuration;
  buffer?: Buffer;
  intakeDuration?: IntakeDuration;
  warrantyPeriod?: number;
}

interface ExtraOption {
  id?: string;
  name: string;
  description?: string;
  price: number;
  isCustom?: boolean;
}

interface TermCondition {
  name: string;
  description: string;
  additionalCost?: number;
  isCustom?: boolean;
}

interface FAQ {
  id?: string;
  question: string;
  answer: string;
  isGenerated?: boolean;
}

interface RFQQuestion {
  question: string;
  type: 'text' | 'multiple_choice' | 'attachment';
  options?: string[];
  isRequired?: boolean;
}

interface PostBookingQuestion {
  question: string;
  type: 'text' | 'multiple_choice' | 'attachment';
  options?: string[];
  isRequired?: boolean;
}

interface Media {
  images: string[];
  video?: string;
}

interface Distance {
  address: string;
  useCompanyAddress?: boolean;
  maxKmRange?: number;
  noBorders?: boolean;
}

export interface Project {
  _id: string;
  title: string;
  description: string;
  category: string;
  service: string;
  areaOfWork?: string;
  status: string;
  media: Media;
  distance?: Distance;
  resources?: string[];
  projectType?: string[];
  keywords?: string[];
  priceModel?: string;
  subprojects: Subproject[];
  extraOptions: ExtraOption[];
  termsConditions?: TermCondition[];
  faq: FAQ[];
  rfqQuestions?: RFQQuestion[];
  postBookingQuestions?: PostBookingQuestion[];
  customConfirmationMessage?: string;
  certifications?: {
    name: string;
    fileUrl: string;
    uploadedAt: string;
    isRequired: boolean;
  }[];
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------
// MAIN COMPONENT
// -------------------------------------------

export default function ProjectEditPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    } else if (!loading && user?.role !== 'professional') {
      router.push('/dashboard');
    }
  }, [isAuthenticated, loading, router, user]);

  const fetchProject = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${params.id}`,
        {
          credentials: 'include',
        }
      );

      if (response.ok) {
        const projectData = await response.json();
        setProject(projectData);
      } else {
        setError('Failed to fetch project details');
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
      setError('Failed to fetch project details');
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (user?.role === 'professional' && params.id) {
      fetchProject();
    }
  }, [user, params.id, fetchProject]);

  const validateProject = (): string[] => {
    const errors: string[] = [];

    if (!project) return ['Project data not loaded'];

    if (!project.title || project.title.length < 30) {
      errors.push('Title must be at least 30 characters long');
    }

    if (!project.description || project.description.length < 100) {
      errors.push('Description must be at least 100 characters long');
    }

    if (!project.category) {
      errors.push('Category is required');
    }

    if (!project.service) {
      errors.push('Service is required');
    }

    if (project.subprojects.length === 0) {
      errors.push('At least one subproject/pricing variation is required');
    }

    return errors;
  };

  const saveAndSubmitProject = async () => {
    if (!project) return;

    // Validate project before saving
    const errors = validateProject();
    setValidationErrors(errors);

    if (errors.length > 0) {
      toast.error(`Please fix ${errors.length} validation error(s)`);
      return;
    }

    setIsSaving(true);
    try {
      // First save the changes
      console.log('Saving project changes...');
      const saveResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...project,
          // Ensure priceModel is always set when saving edits
          priceModel: (project.priceModel && project.priceModel.trim()) || ((project.category || '').toLowerCase() === 'renovation' ? 'rfq' : (project.subprojects?.some(s => s.pricing?.type === 'rfq') ? 'rfq' : 'fixed')),
          id: project._id,
        }),
        credentials: 'include',
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || 'Failed to save project');
      }

      console.log('Project saved, now submitting...');

      // Then submit for approval
      const submitResponse = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${project._id}/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (submitResponse.ok) {
        toast.success('Project saved and submitted for approval!');
        // Close edit page and go back to project view
        router.push(`/professional/projects/${project._id}`);
      } else {
        const errorData = await submitResponse.json();
        toast.error(errorData.error || 'Failed to submit project');
      }
    } catch (error) {
      console.error('Save and submit error:', error);
      toast.error('Failed to save and submit project');
    } finally {
      setIsSaving(false);
    }
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const updateField = (field: string, value: any) => {
    if (!project) return;
    setProject({ ...project, [field]: value });
  };

  if (loading || isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto'></div>
          <p className='mt-4 text-gray-600'>Loading project...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'professional') {
    return null;
  }

  if (error || !project) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4'>
        <div className='max-w-4xl mx-auto pt-16 md:pt-20'>
          <Card className='border-red-200 bg-red-50'>
            <CardContent className='pt-6 text-center'>
              <AlertTriangle className='h-12 w-12 text-red-500 mx-auto mb-4' />
              <h3 className='text-lg font-medium text-red-900 mb-2'>
                Error Loading Project
              </h3>
              <p className='text-red-700 mb-4'>
                {error || 'Project not found'}
              </p>
              <Button
                onClick={() => router.push('/professional/projects/manage')}
                variant='outline'
              >
                <ArrowLeft className='h-4 w-4 mr-2' />
                Back to Projects
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4'>
      <div className='max-w-4xl mx-auto pt-16 md:pt-20'>
        {/* Header */}
        <div className='flex items-center justify-between mb-6'>
          <div className='flex items-center gap-4'>
            <Button
              onClick={() =>
                router.push(`/professional/projects/${project._id}`)
              }
              variant='outline'
              size='sm'
            >
              <ArrowLeft className='h-4 w-4 mr-2' />
              Back to Project
            </Button>
            <div>
              <h1 className='text-2xl font-bold text-gray-900'>Edit Project</h1>
              <Badge className='mt-1'>{project.status.replace('_', ' ')}</Badge>
            </div>
          </div>
          <div className='flex gap-2'>
            <Button
              onClick={saveAndSubmitProject}
              disabled={isSaving}
              className='bg-green-600 hover:bg-green-700'
            >
              <Save className='h-4 w-4 mr-2' />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Card className='mb-6 border-red-200 bg-red-50'>
            <CardHeader>
              <CardTitle className='text-red-800 flex items-center gap-2'>
                <AlertTriangle className='h-5 w-5' />
                Validation Errors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className='list-disc list-inside space-y-1'>
                {validationErrors.map((error, index) => (
                  <li key={index} className='text-red-700 text-sm'>
                    {error}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Basic Information */}
        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Project Title <span className='text-red-500'>*</span>
                <span className='text-xs text-gray-500 ml-2'>
                  ({project.title?.length || 0}/30 minimum)
                </span>
              </label>
              <Input
                value={project.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder='Enter project title (minimum 30 characters)...'
                className={
                  project.title && project.title.length < 30
                    ? 'border-red-300'
                    : ''
                }
              />
            </div>

            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Description <span className='text-red-500'>*</span>
                <span className='text-xs text-gray-500 ml-2'>
                  ({project.description?.length || 0}/100 minimum)
                </span>
              </label>
              <Textarea
                value={project.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder='Enter project description (minimum 100 characters)...'
                rows={4}
                className={
                  project.description && project.description.length < 100
                    ? 'border-red-300'
                    : ''
                }
              />
            </div>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Category <span className='text-red-500'>*</span>
                </label>
                <Input
                  value={project.category || ''}
                  onChange={(e) => updateField('category', e.target.value)}
                  placeholder='Category'
                  className={!project.category ? 'border-red-300' : ''}
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Service <span className='text-red-500'>*</span>
                </label>
                <Input
                  value={project.service || ''}
                  onChange={(e) => updateField('service', e.target.value)}
                  placeholder='Service'
                  className={!project.service ? 'border-red-300' : ''}
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Area of Work
                </label>
                <Input
                  value={project.areaOfWork || ''}
                  onChange={(e) => updateField('areaOfWork', e.target.value)}
                  placeholder='Area of work'
                />
              </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Keywords (comma separated)
                </label>
                <Input
                  value={project.keywords?.join(', ') || ''}
                  onChange={(e) =>
                    updateField(
                      'keywords',
                      e.target.value
                        .split(',')
                        .map((k) => k.trim())
                        .filter((k) => k)
                    )
                  }
                  placeholder='keyword1, keyword2, keyword3'
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Project Type (comma separated)
                </label>
                <Input
                  value={project.projectType?.join(', ') || ''}
                  onChange={(e) =>
                    updateField(
                      'projectType',
                      e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter((t) => t)
                    )
                  }
                  placeholder='type1, type2, type3'
                />
              </div>
            </div>

            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Price Model
              </label>
              <Input
                value={project.priceModel || ''}
                onChange={(e) => updateField('priceModel', e.target.value)}
                placeholder='Price model'
              />
            </div>

            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Custom Confirmation Message
              </label>
              <Textarea
                value={project.customConfirmationMessage || ''}
                onChange={(e) =>
                  updateField('customConfirmationMessage', e.target.value)
                }
                placeholder='Enter custom confirmation message...'
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Distance & Location */}
        {project.distance && (
          <Card className='mb-6'>
            <CardHeader>
              <CardTitle>Distance & Location</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2'>
                  Address
                </label>
                <Input
                  value={project.distance.address || ''}
                  onChange={(e) =>
                    updateField('distance', {
                      ...project.distance,
                      address: e.target.value,
                    })
                  }
                  placeholder='Enter address'
                />
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Max Range (km)
                  </label>
                  <Input
                    type='number'
                    value={project.distance.maxKmRange || ''}
                    onChange={(e) =>
                      updateField('distance', {
                        ...project.distance,
                        maxKmRange: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder='50'
                  />
                </div>

                <div className='flex items-center space-x-4 pt-8'>
                  <label className='flex items-center'>
                    <input
                      type='checkbox'
                      checked={project.distance.useCompanyAddress || false}
                      onChange={(e) =>
                        updateField('distance', {
                          ...project.distance,
                          useCompanyAddress: e.target.checked,
                        })
                      }
                      className='mr-2'
                    />
                    Use Company Address
                  </label>

                  <label className='flex items-center'>
                    <input
                      type='checkbox'
                      checked={project.distance.noBorders || false}
                      onChange={(e) =>
                        updateField('distance', {
                          ...project.distance,
                          noBorders: e.target.checked,
                        })
                      }
                      className='mr-2'
                    />
                    No Borders
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Project Statistics & Complex Data */}
        <Card>
          <CardHeader>
            <CardTitle>Project Content Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-6'>
              <div className='p-3 bg-blue-50 rounded-lg'>
                <div className='text-2xl font-bold text-blue-600'>
                  {project.subprojects.length}
                </div>
                <div className='text-sm text-gray-600'>Subprojects</div>
                <div className='text-xs text-gray-500 mt-1'>
                  {project.subprojects.length === 0
                    ? 'Required!'
                    : 'Configured'}
                </div>
              </div>
              <div className='p-3 bg-green-50 rounded-lg'>
                <div className='text-2xl font-bold text-green-600'>
                  {project.extraOptions.length}
                </div>
                <div className='text-sm text-gray-600'>Extra Options</div>
                <div className='text-xs text-gray-500 mt-1'>Optional</div>
              </div>
              <div className='p-3 bg-purple-50 rounded-lg'>
                <div className='text-2xl font-bold text-purple-600'>
                  {project.faq.length}
                </div>
                <div className='text-sm text-gray-600'>FAQ Items</div>
                <div className='text-xs text-gray-500 mt-1'>Optional</div>
              </div>
              <div className='p-3 bg-orange-50 rounded-lg'>
                <div className='text-2xl font-bold text-orange-600'>
                  {project.media.images.length}
                </div>
                <div className='text-sm text-gray-600'>Images</div>
                <div className='text-xs text-gray-500 mt-1'>Optional</div>
              </div>
            </div>

            {project.subprojects.length === 0 && (
              <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
                <p className='text-red-800 text-sm font-medium'>
                  ⚠️ At least one subproject/pricing variation is required
                  before submission.
                </p>
                <p className='text-red-700 text-xs mt-1'>
                  Add subprojects in the sections below.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subprojects */}
        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>
              Subprojects & Pricing <span className='text-red-500'>*</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.subprojects.map((subproject, index) => (
              <div key={index} className='border rounded-lg p-4 mb-4'>
                <div className='flex justify-between items-center mb-3'>
                  <h4 className='font-medium'>Subproject {index + 1}</h4>
                  <Button
                    size='sm'
                    variant='destructive'
                    onClick={() => {
                      const newSubprojects = project.subprojects.filter(
                        (_, i) => i !== index
                      );
                      updateField('subprojects', newSubprojects);
                    }}
                  >
                    Remove
                  </Button>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Name
                    </label>
                    <Input
                      value={subproject.name || ''}
                      onChange={(e) => {
                        const newSubprojects = [...project.subprojects];
                        newSubprojects[index] = {
                          ...subproject,
                          name: e.target.value,
                        };
                        updateField('subprojects', newSubprojects);
                      }}
                      placeholder='Subproject name'
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Pricing Type
                    </label>
                    <select
                      value={subproject.pricing?.type || 'fixed'}
                      onChange={(e) => {
                        const newSubprojects = [...project.subprojects];
                        newSubprojects[index] = {
                          ...subproject,
                          pricing: {
                            ...subproject.pricing,
                            type: e.target.value as PricingType,
                          },
                        };
                        updateField('subprojects', newSubprojects);
                      }}
                      className='w-full p-2 border border-gray-300 rounded-md'
                    >
                      <option value='fixed'>Fixed Price</option>
                      <option value='unit'>Unit Price</option>
                      <option value='rfq'>Request for Quote</option>
                    </select>
                  </div>
                </div>

                <div className='mt-4'>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Description
                  </label>
                  <Textarea
                    value={subproject.description || ''}
                    onChange={(e) => {
                      const newSubprojects = [...project.subprojects];
                      newSubprojects[index] = {
                        ...subproject,
                        description: e.target.value,
                      };
                      updateField('subprojects', newSubprojects);
                    }}
                    placeholder='Subproject description'
                    rows={3}
                  />
                </div>

                {subproject.pricing?.type === 'fixed' && (
                  <div className='mt-4'>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Fixed Price (€)
                    </label>
                    <Input
                      type='number'
                      value={subproject.pricing.amount || ''}
                      onChange={(e) => {
                        const newSubprojects = [...project.subprojects];
                        newSubprojects[index] = {
                          ...subproject,
                          pricing: {
                            ...subproject.pricing,
                            amount: parseFloat(e.target.value) || 0,
                          },
                        };
                        updateField('subprojects', newSubprojects);
                      }}
                      placeholder='1000'
                    />
                  </div>
                )}

                {subproject.pricing?.type === 'unit' && (
                  <div className='mt-4 grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Min Price (€)
                      </label>
                      <Input
                        type='number'
                        value={subproject.pricing.priceRange?.min || ''}
                        onChange={(e) => {
                          const newSubprojects = [...project.subprojects];
                          newSubprojects[index] = {
                            ...subproject,
                            pricing: {
                              ...subproject.pricing,
                              priceRange: {
                                ...subproject.pricing.priceRange,
                                min: parseFloat(e.target.value) || 0,
                                max: subproject.pricing.priceRange?.max || 0,
                              },
                            },
                          };
                          updateField('subprojects', newSubprojects);
                        }}
                        placeholder='500'
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>
                        Max Price (€)
                      </label>
                      <Input
                        type='number'
                        value={subproject.pricing.priceRange?.max || ''}
                        onChange={(e) => {
                          const newSubprojects = [...project.subprojects];
                          newSubprojects[index] = {
                            ...subproject,
                            pricing: {
                              ...subproject.pricing,
                              priceRange: {
                                min: subproject.pricing.priceRange?.min || 0,
                                max: parseFloat(e.target.value) || 0,
                              },
                            },
                          };
                          updateField('subprojects', newSubprojects);
                        }}
                        placeholder='1500'
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <Button
              onClick={() => {
                const newSubproject: Subproject = {
                  id: `sub-${Date.now()}`,
                  name: '',
                  description: '',
                  pricing: { type: 'fixed', amount: 0 },
                  included: [],
                  materialsIncluded: false,
                  deliveryPreparation: 0,
                  executionDuration: { value: 1, unit: 'days' },
                  warrantyPeriod: 0,
                };
                updateField('subprojects', [
                  ...project.subprojects,
                  newSubproject,
                ]);
              }}
              variant='outline'
              className='w-full'
            >
              Add Subproject
            </Button>
          </CardContent>
        </Card>

        {/* Extra Options */}
        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>Extra Options</CardTitle>
          </CardHeader>
          <CardContent>
            {project.extraOptions.map((option, index) => (
              <div key={index} className='border rounded-lg p-4 mb-4'>
                <div className='flex justify-between items-center mb-3'>
                  <h4 className='font-medium'>Extra Option {index + 1}</h4>
                  <Button
                    size='sm'
                    variant='destructive'
                    onClick={() => {
                      const newOptions = project.extraOptions.filter(
                        (_, i) => i !== index
                      );
                      updateField('extraOptions', newOptions);
                    }}
                  >
                    Remove
                  </Button>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Name
                    </label>
                    <Input
                      value={option.name || ''}
                      onChange={(e) => {
                        const newOptions = [...project.extraOptions];
                        newOptions[index] = { ...option, name: e.target.value };
                        updateField('extraOptions', newOptions);
                      }}
                      placeholder='Option name'
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Price (€)
                    </label>
                    <Input
                      type='number'
                      value={option.price || ''}
                      onChange={(e) => {
                        const newOptions = [...project.extraOptions];
                        newOptions[index] = {
                          ...option,
                          price: parseFloat(e.target.value) || 0,
                        };
                        updateField('extraOptions', newOptions);
                      }}
                      placeholder='100'
                    />
                  </div>
                </div>

                <div className='mt-4'>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Description
                  </label>
                  <Textarea
                    value={option.description || ''}
                    onChange={(e) => {
                      const newOptions = [...project.extraOptions];
                      newOptions[index] = {
                        ...option,
                        description: e.target.value,
                      };
                      updateField('extraOptions', newOptions);
                    }}
                    placeholder='Option description'
                    rows={2}
                  />
                </div>
              </div>
            ))}

            <Button
              onClick={() => {
                const newOption: ExtraOption = {
                  id: `option-${Date.now()}`,
                  name: '',
                  description: '',
                  price: 0,
                };
                updateField('extraOptions', [
                  ...project.extraOptions,
                  newOption,
                ]);
              }}
              variant='outline'
              className='w-full'
            >
              Add Extra Option
            </Button>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>FAQ</CardTitle>
          </CardHeader>
          <CardContent>
            {project.faq.map((faq, index) => (
              <div key={index} className='border rounded-lg p-4 mb-4'>
                <div className='flex justify-between items-center mb-3'>
                  <h4 className='font-medium'>FAQ {index + 1}</h4>
                  <Button
                    size='sm'
                    variant='destructive'
                    onClick={() => {
                      const newFaq = project.faq.filter((_, i) => i !== index);
                      updateField('faq', newFaq);
                    }}
                  >
                    Remove
                  </Button>
                </div>

                <div className='space-y-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Question
                    </label>
                    <Input
                      value={faq.question || ''}
                      onChange={(e) => {
                        const newFaq = [...project.faq];
                        newFaq[index] = { ...faq, question: e.target.value };
                        updateField('faq', newFaq);
                      }}
                      placeholder='Frequently asked question'
                    />
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Answer
                    </label>
                    <Textarea
                      value={faq.answer || ''}
                      onChange={(e) => {
                        const newFaq = [...project.faq];
                        newFaq[index] = { ...faq, answer: e.target.value };
                        updateField('faq', newFaq);
                      }}
                      placeholder='Answer to the question'
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              onClick={() => {
                const newFaq: FAQ = {
                  id: `faq-${Date.now()}`,
                  question: '',
                  answer: '',
                  isGenerated: false,
                };
                updateField('faq', [...project.faq, newFaq]);
              }}
              variant='outline'
              className='w-full'
            >
              Add FAQ
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
