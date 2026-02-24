'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Trash2,
  Package,
  DollarSign,
  Clock,
  Shield,
  AlertCircle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

interface IIncludedItem {
  name: string;
  description?: string;
  isCustom: boolean;
  hasServiceDetails?: boolean;
  serviceDetails?: IProfessionalInput[];
  // NEW: mark included items that originate from professional input fields
  isDynamicField?: boolean;
  fieldName?: string;
}

interface IProfessionalInput {
  fieldName: string;
  value: string | number | { min: number; max: number };
}

interface IMaterial {
  name: string;
  quantity?: string;
  unit?: string;
  description?: string;
}

interface ISubproject {
  id: string;
  name: string;
  description: string;
  projectType?: string[]; // NEW: Types for this subproject
  customProjectType?: string; // NEW: Custom project type when "Other" is selected
  professionalInputs?: IProfessionalInput[]; // NEW: Dynamic field values
  pricing: {
    type: 'fixed' | 'unit' | 'rfq';
    amount?: number;
    priceRange?: { min?: number; max?: number };
    minOrderQuantity?: number; // Unit pricing: minimum order quantity
  };
  errors?: {
    priceRange?: string;
    executionDurationRange?: string;
  };
  included: IIncludedItem[];
  materialsIncluded: boolean;
  materials?: IMaterial[];
  preparationDuration?: {
    value: number;
    unit: 'hours' | 'days';
  };
  executionDuration: {
    value: number;
    unit: 'hours' | 'days';
    range?: { min: number; max: number };
  };
  buffer?: {
    value: number;
    unit: 'hours' | 'days';
  };
  intakeDuration?: {
    value: number;
    unit: 'hours' | 'days';
    buffer?: number;
  };
  warrantyPeriod: { value: number; unit: 'months' | 'years' };
}

interface IDynamicField {
  fieldName: string;
  fieldType: 'range' | 'dropdown' | 'number' | 'text';
  unit?: string;
  label: string;
  placeholder?: string;
  isRequired: boolean;
  options?: string[];
  min?: number;
  max?: number;
}

interface ProjectData {
  subprojects?: ISubproject[];
  category?: string;
  service?: string;
  areaOfWork?: string;
  timeMode?: 'hours' | 'days' | 'mixed';
  priceModel?: string;
  pricingModelType?: string;
  pricingModelUnit?: string;
}

interface Step2Props {
  data: ProjectData;
  onChange: (data: ProjectData) => void;
  onValidate: (isValid: boolean) => void;
}

interface IServiceConfigurationIncludedItem {
  name?: string;
  isDynamic?: boolean;
  dynamicField?: {
    fieldName?: string;
    label?: string;
    unit?: string;
  };
}

// Predefined included items by service category
const PREDEFINED_INCLUDED_ITEMS = {
  plumber: [
    'Site inspection',
    'Material calculation',
    'Professional installation',
    'Quality testing',
    'Cleanup after work',
    'Basic warranty',
    'Emergency support',
    'Maintenance advice',
  ],
  electrician: [
    'Safety inspection',
    'Wiring assessment',
    'Professional installation',
    'Code compliance check',
    'Testing and certification',
    'Cleanup',
    'Safety documentation',
    'Usage instructions',
  ],
  painter: [
    'Surface preparation',
    'Quality paint materials',
    'Professional application',
    'Clean lines and finish',
    'Cleanup and disposal',
    'Touch-up service',
    'Color consultation',
    'Protection of furniture',
  ],
  default: [
    'Initial consultation',
    'Professional execution',
    'Quality materials',
    'Cleanup after work',
    'Basic warranty',
    'Final inspection',
    'Customer walkthrough',
    'Maintenance tips',
  ],
};

// Check if priceModel is a "total price" type (fixed pricing)
const isTotalPriceModel = (priceModel?: string, pricingModelType?: string): boolean => {
  if (pricingModelType) {
    return pricingModelType === 'Fixed price';
  }
  if (!priceModel) return false;
  const normalized = priceModel.toLowerCase().trim();
  return (
    normalized === 'total price' ||
    normalized === 'total' ||
    normalized === 'fixed price'
  );
};

// Get unit label from priceModel (e.g., "m² of floor surface" → "m²")
const getUnitLabel = (priceModel?: string): string => {
  if (!priceModel) return 'unit';
  const normalized = priceModel.toLowerCase().trim();
  if (normalized.includes('m²') || normalized.includes('m2')) return 'm²';
  if (normalized.includes('hour')) return 'hour';
  if (normalized.includes('day')) return 'day';
  if (normalized.includes('meter')) return 'meter';
  if (normalized.includes('room')) return 'room';
  return 'unit'; // Return safe default if no match
};

type PricingType = 'fixed' | 'unit' | 'rfq';

const getValidPricingTypes = (
  category?: string,
  priceModel?: string,
  pricingModelType?: string
): PricingType[] => {
  const isRenovation = category?.toLowerCase() === 'renovation';
  if (isRenovation) return ['rfq'];
  if (isTotalPriceModel(priceModel, pricingModelType)) return ['fixed', 'rfq'];
  return ['unit', 'rfq'];
};

const getDefaultPricingType = (
  category?: string,
  priceModel?: string,
  pricingModelType?: string
): PricingType => getValidPricingTypes(category, priceModel, pricingModelType)[0];

export default function Step2Subprojects({
  data,
  onChange,
  onValidate,
}: Step2Props) {
  // Determine if this is a total price model or unit-based model
  const unitLabel = data.pricingModelUnit || getUnitLabel(data.priceModel);
  const validPricingTypes = getValidPricingTypes(
    data.category,
    data.priceModel,
    data.pricingModelType
  );

  const normalizePreparationDuration = (subproject?: ISubproject) => {
    const value =
      typeof subproject?.preparationDuration?.value === 'number'
        ? subproject.preparationDuration.value
        : 1;
    const unit = (subproject?.preparationDuration?.unit || 'days') as
      | 'hours'
      | 'days';
    return { value, unit };
  };

  const resolvePreparationUnit = (subproject?: ISubproject) =>
    normalizePreparationDuration(subproject).unit;
  const [subprojects, setSubprojects] = useState<ISubproject[]>(() =>
    (data.subprojects || []).map((sub) => ({
      ...sub,
      preparationDuration: normalizePreparationDuration(sub),
    }))
  );

  // NEW: Dynamic fields from backend
  const [dynamicFields, setDynamicFields] = useState<IDynamicField[]>([]);
  const [projectTypes, setProjectTypes] = useState<string[]>([]);
  const [configIncludedItems, setConfigIncludedItems] = useState<
    {
      name: string;
      isDynamic?: boolean;
      fieldName?: string;
      label?: string;
      unit?: string;
    }[]
  >([]);

  const fetchDynamicFields = async () => {
    try {
      const params = new URLSearchParams({
        category: data.category || '',
        service: data.service || '',
      });
      if (data.areaOfWork) {
        params.append('areaOfWork', data.areaOfWork);
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/service-configuration/dynamic-fields?${params}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const result = await response.json();
        setDynamicFields(result.data.professionalInputFields || []);
        setProjectTypes(result.data.projectTypes || []);
      }
    } catch (error) {
      console.error('Failed to fetch dynamic fields:', error);
      toast.error('Failed to load service configuration');
    }
  };

  const fetchServiceIncludedItems = async () => {
    try {
      const params = new URLSearchParams({
        category: data.category || '',
        service: data.service || '',
      });
      if (data.areaOfWork) params.append('areaOfWork', data.areaOfWork);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/service-configuration?${params}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const result = await response.json();
        const items = (result?.data?.includedItems || []).map(
          (it: IServiceConfigurationIncludedItem) => ({
            name: it?.name,
            isDynamic: !!it?.isDynamic,
            fieldName: it?.dynamicField?.fieldName,
            label: it?.dynamicField?.label,
            unit: it?.dynamicField?.unit,
          })
        );
        setConfigIncludedItems(
          items.filter((i: { name?: string }) => Boolean(i?.name))
        );
      } else {
        setConfigIncludedItems([]);
      }
    } catch (error) {
      console.error('Failed to fetch service configuration:', error);
      // do not toast repeatedly; keep silent here to avoid noise
    }
  };

  // Fetch dynamic fields when category/service changes
  useEffect(() => {
    if (data.category && data.service) {
      fetchDynamicFields();
      fetchServiceIncludedItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.category, data.service, data.areaOfWork]);

  useEffect(() => {
    onChange({ ...data, subprojects });
    validateForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subprojects]);

  // Fix pricing types when priceModel changes (ensure they match available options)
  useEffect(() => {
    const validTypes = getValidPricingTypes(data.category, data.priceModel, data.pricingModelType);
    const defaultType = getDefaultPricingType(data.category, data.priceModel, data.pricingModelType);

    setSubprojects((prev) => {
      const needsUpdate = prev.some(
        (sub) => !validTypes.includes(sub.pricing.type)
      );

      if (!needsUpdate || prev.length === 0) {
        return prev;
      }

      return prev.map((sub) => {
        if (!validTypes.includes(sub.pricing.type)) {
          return {
            ...sub,
            pricing: { ...sub.pricing, type: defaultType },
          };
        }
        return sub;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.priceModel, data.category, data.pricingModelType]);

  const validateForm = () => {
    const isValid =
      subprojects.length > 0 &&
      subprojects.every((sub) => {
        // Check for any validation errors
        if (sub.errors?.priceRange) return false;

        // For RFQ pricing, validate price range if both values are provided
        if (sub.pricing.type === 'rfq') {
          const { min, max } = sub.pricing.priceRange || {};
          if (min !== undefined && max !== undefined && min > max) {
            return false;
          }
        }

        return (
          sub.name &&
          sub.description &&
          sub.pricing.type &&
          (sub.pricing.type === 'rfq' || sub.pricing.amount) &&
          sub.included.length >= 3 &&
          sub.preparationDuration &&
          typeof sub.preparationDuration.value === 'number' &&
          sub.executionDuration.value > 0 &&
          // Materials validation: if materialsIncluded is true, must have at least one material
          (!sub.materialsIncluded ||
            (sub.materials && sub.materials.length > 0))
        );
      });
    onValidate(isValid);
  };

  const addSubproject = () => {
    if (subprojects.length >= 5) {
      toast.error('Maximum 5 subprojects allowed');
      return;
    }

    // Set default pricing type based on category and priceModel
    const defaultPricingType = getDefaultPricingType(
      data.category,
      data.priceModel,
      data.pricingModelType
    );

    const newSubproject: ISubproject = {
      id: Date.now().toString(),
      name: '',
      description: '',
      projectType: [], // NEW: Empty types array
      professionalInputs: [], // NEW: Empty inputs array
      pricing: {
        type: defaultPricingType,
        amount: 0,
      },
      included: [],
      materialsIncluded: false,
      materials: [],
      preparationDuration: { value: 1, unit: 'days' },
      executionDuration: {
        value: 1,
        unit: 'hours',
      },
      warrantyPeriod: { value: 0, unit: 'years' },
    };

    setSubprojects([...subprojects, newSubproject]);
  };

  // NEW: Helper to update professional input values
  const updateProfessionalInput = (
    subprojectId: string,
    fieldName: string,
    value: string | number | { min: number; max: number }
  ) => {
    const subproject = subprojects.find((s) => s.id === subprojectId);
    if (!subproject) return;

    const existingInputs = subproject.professionalInputs || [];
    const existingIndex = existingInputs.findIndex(
      (i) => i.fieldName === fieldName
    );

    let updatedInputs;
    if (existingIndex >= 0) {
      updatedInputs = [...existingInputs];
      updatedInputs[existingIndex] = { fieldName, value };
    } else {
      updatedInputs = [...existingInputs, { fieldName, value }];
    }

    updateSubproject(subprojectId, { professionalInputs: updatedInputs });
  };

  // NEW: Helper to toggle project type
  const toggleProjectType = (subprojectId: string, type: string) => {
    const subproject = subprojects.find((s) => s.id === subprojectId);
    if (!subproject) return;

    const currentTypes = subproject.projectType || [];
    const updatedTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];

    updateSubproject(subprojectId, { projectType: updatedTypes });
  };

  const removeSubproject = (id: string) => {
    setSubprojects(subprojects.filter((sub) => sub.id !== id));
  };

  const updateSubproject = (id: string, updates: Partial<ISubproject>) => {
    setSubprojects(
      subprojects.map((sub) => (sub.id === id ? { ...sub, ...updates } : sub))
    );
  };

  const addIncludedItem = (
    subprojectId: string,
    itemName: string,
    isCustom: boolean = false,
    extra?: Partial<IIncludedItem>
  ) => {
    const newItem: IIncludedItem = {
      name: itemName,
      isCustom,
      ...(extra || {}),
    };

    updateSubproject(subprojectId, {
      included: [
        ...(subprojects.find((s) => s.id === subprojectId)?.included || []),
        newItem,
      ],
    });
  };

  const removeIncludedItem = (subprojectId: string, itemIndex: number) => {
    const subproject = subprojects.find((s) => s.id === subprojectId);
    if (subproject) {
      const removedItem = subproject.included[itemIndex];
      const updatedIncluded = subproject.included.filter(
        (_, index) => index !== itemIndex
      );
      const updates: Partial<ISubproject> = { included: updatedIncluded };

      // If removing a dynamic field, also clear its professional input
      if (removedItem && removedItem.isDynamicField && removedItem.fieldName) {
        const updatedInputs = (subproject.professionalInputs || []).filter(
          (input) => input.fieldName !== removedItem.fieldName
        );
        updates.professionalInputs = updatedInputs;
      }

      updateSubproject(subprojectId, updates);
    }
  };

  // Note: Dynamic fields are shown only when 'Service Details' is included

  const getQuickAddItems = (): { name: string; fieldName?: string }[] => {
    // Prefer admin-configured included items
    if (configIncludedItems.length > 0) {
      // Show only static included items here to avoid duplicating parameters
      return configIncludedItems.filter((i) => !i?.isDynamic && !i?.fieldName);
    }
    // Fallback to predefined constants (names only)
    const service = data.service || 'default';
    const names =
      PREDEFINED_INCLUDED_ITEMS[
      service as keyof typeof PREDEFINED_INCLUDED_ITEMS
      ] || PREDEFINED_INCLUDED_ITEMS.default;
    return names.map((n) => ({ name: n }));
  };

  const addMaterial = (subprojectId: string, material: IMaterial) => {
    const subproject = subprojects.find((s) => s.id === subprojectId);
    if (!subproject) return;

    updateSubproject(subprojectId, {
      materials: [...(subproject.materials || []), material],
    });
  };

  const removeMaterial = (subprojectId: string, materialIndex: number) => {
    const subproject = subprojects.find((s) => s.id === subprojectId);
    if (!subproject) return;

    updateSubproject(subprojectId, {
      materials: (subproject.materials || []).filter(
        (_, index) => index !== materialIndex
      ),
    });
  };

  const calculateTotalPrice = () => {
    return subprojects.reduce((total, sub) => {
      if (sub.pricing.type === 'fixed' && sub.pricing.amount) {
        return total + sub.pricing.amount;
      }
      return total;
    }, 0);
  };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center space-x-2'>
            <Package className='w-5 h-5' />
            <span>Service Packages & Pricing</span>
          </CardTitle>
          <CardDescription>
            Create up to 5 different service packages with varying prices and
            inclusions. Think of these as &quot;Basic&quot;,
            &quot;Standard&quot;, and &quot;Premium&quot; tiers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-between'>
            <div className='text-sm text-gray-600'>
              Packages created: {subprojects.length}/5
            </div>
            <Button onClick={addSubproject} disabled={subprojects.length >= 5}>
              <Plus className='w-4 h-4 mr-2' />
              Add Package
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subprojects List */}
      {subprojects.length === 0 ? (
        <Card>
          <CardContent className='py-12 text-center'>
            <Package className='w-12 h-12 text-gray-400 mx-auto mb-4' />
            <h3 className='text-lg font-semibold text-gray-900 mb-2'>
              No packages yet
            </h3>
            <p className='text-gray-600 mb-6'>
              Create your first service package to get started. You can offer
              different pricing tiers to give customers options.
            </p>
            <Button onClick={addSubproject}>
              <Plus className='w-4 h-4 mr-2' />
              Create First Package
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-6'>
          {subprojects.map((subproject, index) => (
            <Card key={subproject.id} className='border-2'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-lg'>
                    Package {index + 1}
                    {subproject.name && `: ${subproject.name}`}
                  </CardTitle>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => removeSubproject(subproject.id)}
                    className='text-red-600 hover:text-red-700'
                  >
                    <Trash2 className='w-4 h-4' />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className='space-y-6'>
                {/* Basic Info */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <Label htmlFor={`name-${subproject.id}`}>
                      Package Name *
                    </Label>
                    <Input
                      id={`name-${subproject.id}`}
                      value={subproject.name}
                      onChange={(e) =>
                        updateSubproject(subproject.id, {
                          name: e.target.value,
                        })
                      }
                      placeholder='e.g., Basic, Standard, Premium'
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`warranty-${subproject.id}`}>
                      Warranty Period *
                    </Label>
                    <div className='flex space-x-2'>
                      <Select
                        value={
                          subproject.warrantyPeriod.value === 0
                            ? '0-years'
                            : `${subproject.warrantyPeriod.unit}`
                        }
                        onValueChange={(value) => {
                          if (value === '0-years') {
                            updateSubproject(subproject.id, {
                              warrantyPeriod: { value: 0, unit: 'years' },
                            });
                          } else if (value === 'months') {
                            updateSubproject(subproject.id, {
                              warrantyPeriod: { value: 1, unit: 'months' },
                            });
                          } else if (value === 'years') {
                            updateSubproject(subproject.id, {
                              warrantyPeriod: { value: 1, unit: 'years' },
                            });
                          }
                        }}
                      >
                        <SelectTrigger className='w-32'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='0-years'>0 years</SelectItem>
                          <SelectItem value='months'>1-10 months</SelectItem>
                          <SelectItem value='years'>1-10 years</SelectItem>
                        </SelectContent>
                      </Select>
                      {subproject.warrantyPeriod.value > 0 && (
                        <Input
                          type='number'
                          min='1'
                          max='10'
                          value={subproject.warrantyPeriod.value}
                          onChange={(e) =>
                            updateSubproject(subproject.id, {
                              warrantyPeriod: {
                                ...subproject.warrantyPeriod,
                                value: parseInt(e.target.value) || 1,
                              },
                            })
                          }
                          className='w-20'
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor={`description-${subproject.id}`}>
                    Package Scope *
                  </Label>
                  <Textarea
                    id={`description-${subproject.id}`}
                    value={subproject.description}
                    onChange={(e) =>
                      updateSubproject(subproject.id, {
                        description: e.target.value,
                      })
                    }
                    placeholder="Describe what's included in this package..."
                    maxLength={300}
                    rows={3}
                  />
                  <p className='text-sm text-gray-500 mt-1'>
                    {subproject.description.length}/300 characters
                  </p>
                </div>

                {/* NEW: Project Types */}
                {projectTypes.length > 0 && (
                  <div className='border rounded-lg p-4 bg-green-50'>
                    <h4 className='font-semibold mb-3'>Project Types *</h4>
                    <p className='text-sm text-gray-600 mb-3'>
                      Select all types of projects this package applies to
                    </p>
                    <div className='grid grid-cols-2 md:grid-cols-3 gap-3'>
                      {projectTypes.map((type) => (
                        <div key={type} className='flex items-center space-x-2'>
                          <Checkbox
                            id={`type-${subproject.id}-${type}`}
                            checked={
                              subproject.projectType?.includes(type) || false
                            }
                            onCheckedChange={() =>
                              toggleProjectType(subproject.id, type)
                            }
                          />
                          <Label
                            htmlFor={`type-${subproject.id}-${type}`}
                            className='text-sm'
                          >
                            {type}
                          </Label>
                        </div>
                      ))}
                      {/* Always show "Other" option */}
                      <div className='flex items-center space-x-2'>
                        <Checkbox
                          id={`type-${subproject.id}-Other`}
                          checked={
                            subproject.projectType?.includes('Other') || false
                          }
                          onCheckedChange={() =>
                            toggleProjectType(subproject.id, 'Other')
                          }
                        />
                        <Label
                          htmlFor={`type-${subproject.id}-Other`}
                          className='text-sm'
                        >
                          Other
                        </Label>
                      </div>
                    </div>

                    {/* Show custom input if "Other" is selected */}
                    {subproject.projectType?.includes('Other') && (
                      <div className='mt-3'>
                        <Label htmlFor={`custom-type-${subproject.id}`}>
                          Specify Custom Type *
                        </Label>
                        <Input
                          id={`custom-type-${subproject.id}`}
                          value={subproject.customProjectType || ''}
                          onChange={(e) =>
                            updateSubproject(subproject.id, {
                              customProjectType: e.target.value,
                            })
                          }
                          placeholder='Enter custom project type...'
                          maxLength={100}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* MERGED: Dynamic Professional Input Fields now inside What's Included */}

                {/* Pricing */}
                <div className='border rounded-lg p-4 bg-blue-50'>
                  <h4 className='font-semibold mb-4 flex items-center'>
                    <DollarSign className='w-4 h-4 mr-2' />
                    Pricing Configuration
                  </h4>

                  <div className='w-full flex gap-4'>
                    <div>
                      <Label>Pricing Type *</Label>
                      <Select
                        value={subproject.pricing.type}
                        onValueChange={(value: 'fixed' | 'unit' | 'rfq') => {
                          updateSubproject(subproject.id, {
                            pricing: { ...subproject.pricing, type: value },
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder='Select pricing type' />
                        </SelectTrigger>
                        <SelectContent>
                          {validPricingTypes.map((pricingType) => (
                            <SelectItem key={pricingType} value={pricingType}>
                              {pricingType === 'fixed' && 'Fixed Price (Total)'}
                              {pricingType === 'unit' &&
                                `Price per ${unitLabel}`}
                              {pricingType === 'rfq' &&
                                'RFQ (Request for Quote)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className='text-xs text-gray-500'>
                        Current selection:{' '}
                        {subproject.pricing.type === 'fixed' &&
                          'Fixed Price (Total)'}
                        {subproject.pricing.type === 'unit' &&
                          `Price per ${unitLabel}`}
                        {subproject.pricing.type === 'rfq' &&
                          'Request for Quote'}
                        {!subproject.pricing.type && 'None'}
                      </p>
                    </div>

                    {subproject.pricing.type === 'fixed' && (
                      <>
                        <div>
                          <Label>Total Price (EUR) *</Label>
                          <Input
                            type='number'
                            min='0'
                            step='0.01'
                            value={subproject.pricing.amount || ''}
                            onChange={(e) =>
                              updateSubproject(subproject.id, {
                                pricing: {
                                  ...subproject.pricing,
                                  amount: parseFloat(e.target.value),
                                },
                              })
                            }
                            placeholder='0.00'
                          />
                        </div>
                      </>
                    )}

                    {subproject.pricing.type === 'unit' && (
                      <>
                        <div>
                          <Label>Price per {unitLabel} (EUR) *</Label>
                          <Input
                            type='number'
                            min='0'
                            step='0.01'
                            value={subproject.pricing.amount || ''}
                            onChange={(e) =>
                              updateSubproject(subproject.id, {
                                pricing: {
                                  ...subproject.pricing,
                                  amount: parseFloat(e.target.value),
                                },
                              })
                            }
                            placeholder='0.00'
                          />
                        </div>
                        <div>
                          <Label>Minimum Order Quantity ({unitLabel})</Label>
                          <Input
                            type='number'
                            min='1'
                            step='1'
                            value={subproject.pricing.minOrderQuantity || ''}
                            onChange={(e) =>
                              updateSubproject(subproject.id, {
                                pricing: {
                                  ...subproject.pricing,
                                  minOrderQuantity:
                                    parseInt(e.target.value) || undefined,
                                },
                              })
                            }
                            placeholder='1'
                          />
                          <p className='text-xs text-gray-500 mt-1'>
                            Customer must order at least this quantity
                          </p>
                        </div>
                      </>
                    )}

                    {subproject.pricing.type === 'rfq' && (
                      <>
                        <div className='md:col-span-2'>
                          <Label>Estimated Price Range (EUR)</Label>
                          <div className='flex space-x-2'>
                            <Input
                              type='number'
                              min='0'
                              step='0.01'
                              value={subproject.pricing.priceRange?.min ?? ''}
                              onChange={(e) => {
                                const newMin =
                                  e.target.value === ''
                                    ? undefined
                                    : parseFloat(e.target.value);
                                const currentMax =
                                  subproject.pricing.priceRange?.max;
                                const hasError =
                                  newMin !== undefined &&
                                  currentMax !== undefined &&
                                  newMin > currentMax;
                                updateSubproject(subproject.id, {
                                  pricing: {
                                    ...subproject.pricing,
                                    priceRange: {
                                      min: newMin,
                                      max: currentMax,
                                    },
                                  },
                                  errors: {
                                    ...subproject.errors,
                                    priceRange: hasError
                                      ? 'Min price must be less than or equal to max price'
                                      : undefined,
                                  },
                                });
                              }}
                              placeholder='Min price'
                              className={
                                subproject.errors?.priceRange
                                  ? 'border-red-500'
                                  : ''
                              }
                            />
                            <span className='self-center'>to</span>
                            <Input
                              type='number'
                              min='0'
                              step='0.01'
                              value={subproject.pricing.priceRange?.max ?? ''}
                              onChange={(e) => {
                                const newMax =
                                  e.target.value === ''
                                    ? undefined
                                    : parseFloat(e.target.value);
                                const currentMin =
                                  subproject.pricing.priceRange?.min;
                                const hasError =
                                  newMax !== undefined &&
                                  currentMin !== undefined &&
                                  currentMin > newMax;
                                updateSubproject(subproject.id, {
                                  pricing: {
                                    ...subproject.pricing,
                                    priceRange: {
                                      min: currentMin,
                                      max: newMax,
                                    },
                                  },
                                  errors: {
                                    ...subproject.errors,
                                    priceRange: hasError
                                      ? 'Min price must be less than or equal to max price'
                                      : undefined,
                                  },
                                });
                              }}
                              placeholder='Max price'
                              className={
                                subproject.errors?.priceRange
                                  ? 'border-red-500'
                                  : ''
                              }
                            />
                          </div>
                          {subproject.errors?.priceRange && (
                            <p className='text-xs text-red-500 mt-1 flex items-center'>
                              <AlertCircle className='w-3 h-3 mr-1' />
                              {subproject.errors.priceRange}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* What's Included */}
                <div className='border rounded-lg p-4'>
                  <div className='mb-4'>
                    <h4 className='font-semibold flex items-center mb-4'>
                      <Shield className='w-4 h-4 mr-2' />
                      What&apos;s Included (3-10 items required)
                    </h4>
                    <div className='mb-4'>
                      <Label className='text-sm font-medium'>
                        Materials Included *
                      </Label>
                      <RadioGroup
                        value={subproject.materialsIncluded ? 'yes' : 'no'}
                        onValueChange={(value) => {
                          const materialsIncluded = value === 'yes';
                          updateSubproject(subproject.id, {
                            materialsIncluded,
                            // Clear materials list if switching to "no"
                            materials: materialsIncluded
                              ? subproject.materials
                              : [],
                          });
                        }}
                      >
                        <div className='flex items-center space-x-4 mt-2'>
                          <div className='flex items-center space-x-2'>
                            <RadioGroupItem
                              value='yes'
                              id={`materials-yes-${subproject.id}`}
                            />
                            <Label
                              htmlFor={`materials-yes-${subproject.id}`}
                              className='text-sm font-normal'
                            >
                              Yes
                            </Label>
                          </div>
                          <div className='flex items-center space-x-2'>
                            <RadioGroupItem
                              value='no'
                              id={`materials-no-${subproject.id}`}
                            />
                            <Label
                              htmlFor={`materials-no-${subproject.id}`}
                              className='text-sm font-normal'
                            >
                              No
                            </Label>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Materials List - Show when materialsIncluded is true */}
                    {subproject.materialsIncluded && (
                      <div className='border-t pt-4 mt-4'>
                        <div className='mb-3'>
                          <Label className='text-sm font-medium'>
                            Materials List (at least 1 required) *
                          </Label>
                          <p className='text-xs text-gray-500 mt-1'>
                            List all materials that will be provided with this
                            package
                          </p>
                        </div>

                        {/* Add Material Form */}
                        <div className='grid grid-cols-12 gap-2 mb-4'>
                          <Input
                            id={`material-name-${subproject.id}`}
                            placeholder='Material name *'
                            className='col-span-4'
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const name = (
                                  e.target as HTMLInputElement
                                ).value.trim();
                                const qty = (
                                  document.getElementById(
                                    `material-qty-${subproject.id}`
                                  ) as HTMLInputElement
                                )?.value.trim();
                                const unit = (
                                  document.getElementById(
                                    `material-unit-${subproject.id}`
                                  ) as HTMLInputElement
                                )?.value.trim();
                                const desc = (
                                  document.getElementById(
                                    `material-desc-${subproject.id}`
                                  ) as HTMLInputElement
                                )?.value.trim();

                                if (name) {
                                  addMaterial(subproject.id, {
                                    name,
                                    quantity: qty || undefined,
                                    unit: unit || undefined,
                                    description: desc || undefined,
                                  });
                                  // Clear inputs
                                  (e.target as HTMLInputElement).value = '';
                                  if (
                                    document.getElementById(
                                      `material-qty-${subproject.id}`
                                    )
                                  ) {
                                    (
                                      document.getElementById(
                                        `material-qty-${subproject.id}`
                                      ) as HTMLInputElement
                                    ).value = '';
                                  }
                                  if (
                                    document.getElementById(
                                      `material-unit-${subproject.id}`
                                    )
                                  ) {
                                    (
                                      document.getElementById(
                                        `material-unit-${subproject.id}`
                                      ) as HTMLInputElement
                                    ).value = '';
                                  }
                                  if (
                                    document.getElementById(
                                      `material-desc-${subproject.id}`
                                    )
                                  ) {
                                    (
                                      document.getElementById(
                                        `material-desc-${subproject.id}`
                                      ) as HTMLInputElement
                                    ).value = '';
                                  }
                                }
                              }
                            }}
                          />
                          <Input
                            id={`material-qty-${subproject.id}`}
                            placeholder='Quantity'
                            className='col-span-2'
                          />
                          <Input
                            id={`material-unit-${subproject.id}`}
                            placeholder='Unit'
                            className='col-span-2'
                          />
                          <Input
                            id={`material-desc-${subproject.id}`}
                            placeholder='Description'
                            className='col-span-3'
                          />
                          <Button
                            variant='outline'
                            size='sm'
                            className='col-span-1'
                            onClick={() => {
                              const name = (
                                document.getElementById(
                                  `material-name-${subproject.id}`
                                ) as HTMLInputElement
                              )?.value.trim();
                              const qty = (
                                document.getElementById(
                                  `material-qty-${subproject.id}`
                                ) as HTMLInputElement
                              )?.value.trim();
                              const unit = (
                                document.getElementById(
                                  `material-unit-${subproject.id}`
                                ) as HTMLInputElement
                              )?.value.trim();
                              const desc = (
                                document.getElementById(
                                  `material-desc-${subproject.id}`
                                ) as HTMLInputElement
                              )?.value.trim();

                              if (name) {
                                addMaterial(subproject.id, {
                                  name,
                                  quantity: qty || undefined,
                                  unit: unit || undefined,
                                  description: desc || undefined,
                                });
                                // Clear inputs
                                (
                                  document.getElementById(
                                    `material-name-${subproject.id}`
                                  ) as HTMLInputElement
                                ).value = '';
                                (
                                  document.getElementById(
                                    `material-qty-${subproject.id}`
                                  ) as HTMLInputElement
                                ).value = '';
                                (
                                  document.getElementById(
                                    `material-unit-${subproject.id}`
                                  ) as HTMLInputElement
                                ).value = '';
                                (
                                  document.getElementById(
                                    `material-desc-${subproject.id}`
                                  ) as HTMLInputElement
                                ).value = '';
                              } else {
                                toast.error('Material name is required');
                              }
                            }}
                          >
                            <Plus className='w-4 h-4' />
                          </Button>
                        </div>

                        {/* Materials List */}
                        {subproject.materials &&
                          subproject.materials.length > 0 ? (
                          <div className='space-y-2 max-h-64 overflow-y-auto'>
                            {subproject.materials.map((material, index) => (
                              <div
                                key={index}
                                className='flex items-start justify-between p-3 bg-blue-50 rounded border border-blue-200'
                              >
                                <div className='flex-1'>
                                  <div className='font-medium text-sm'>
                                    {material.name}
                                  </div>
                                  <div className='text-xs text-gray-600 mt-1'>
                                    {material.quantity && material.unit && (
                                      <span className='mr-3'>
                                        <strong>Qty:</strong>{' '}
                                        {material.quantity} {material.unit}
                                      </span>
                                    )}
                                    {material.description && (
                                      <span>{material.description}</span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() =>
                                    removeMaterial(subproject.id, index)
                                  }
                                  className='w-6 h-6 p-0 text-red-500 hover:text-red-700 ml-2'
                                >
                                  <Trash2 className='w-3 h-3' />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className='flex items-center space-x-2 text-amber-600 bg-amber-50 p-3 rounded'>
                            <AlertCircle className='w-4 h-4' />
                            <span className='text-sm'>
                              Please add at least one material
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Dynamic Fields as Individual Items */}
                  {dynamicFields.length > 0 && (
                    <div className='mb-4'>
                      <Label className='text-sm font-medium'>
                        Service Parameters (Optional)
                      </Label>
                      <div className='flex flex-wrap gap-2 mt-2'>
                        {dynamicFields.map((field) => (
                          <Button
                            key={field.fieldName}
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              addIncludedItem(
                                subproject.id,
                                field.label,
                                false,
                                {
                                  isDynamicField: true,
                                  fieldName: field.fieldName,
                                }
                              )
                            }
                            disabled={subproject.included.some(
                              (inc) => inc.fieldName === field.fieldName
                            )}
                          >
                            {field.label}
                            {field.unit && (
                              <span className='text-gray-500 text-xs ml-1'>
                                ({field.unit})
                              </span>
                            )}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Predefined Items (from Admin Config if available) */}
                  <div className='mb-4'>
                    <Label className='text-sm font-medium'>
                      Quick Add (Predefined)
                    </Label>
                    <div className='flex flex-wrap gap-2 mt-2'>
                      {getQuickAddItems().map((item, index) => (
                        <Button
                          key={index}
                          variant='outline'
                          size='sm'
                          onClick={() =>
                            item.fieldName
                              ? addIncludedItem(
                                subproject.id,
                                item.name,
                                false,
                                {
                                  isDynamicField: true,
                                  fieldName: item.fieldName,
                                }
                              )
                              : addIncludedItem(subproject.id, item.name)
                          }
                          disabled={
                            item.fieldName
                              ? subproject.included.some(
                                (inc) => inc.fieldName === item.fieldName
                              )
                              : subproject.included.some(
                                (inc) => inc.name === item.name
                              )
                          }
                        >
                          {item.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Item Input */}
                  <div className='flex space-x-2 mb-4'>
                    <Input
                      placeholder='Add custom item...'
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.target as HTMLInputElement;
                          if (input.value.trim()) {
                            addIncludedItem(
                              subproject.id,
                              input.value.trim(),
                              true
                            );
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <Button
                      variant='outline'
                      onClick={(e) => {
                        const input = (
                          e.target as HTMLElement
                        ).parentElement?.querySelector('input');
                        if (input?.value.trim()) {
                          addIncludedItem(
                            subproject.id,
                            input.value.trim(),
                            true
                          );
                          input.value = '';
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>

                  {/* Included Items List */}
                  {subproject.included.length > 0 && (
                    <div className='space-y-3'>
                      {subproject.included.map((item, index) => {
                        const dynamicField =
                          item.isDynamicField && item.fieldName
                            ? dynamicFields.find(
                              (f) => f.fieldName === item.fieldName
                            )
                            : null;

                        const currentValue = dynamicField
                          ? subproject.professionalInputs?.find(
                            (input) => input.fieldName === item.fieldName
                          )?.value
                          : null;

                        return (
                          <div
                            key={index}
                            className={`p-3 rounded border ${item.isDynamicField
                              ? 'bg-purple-50 border-purple-200'
                              : 'bg-gray-50 border-gray-200'
                              }`}
                          >
                            <div className='flex items-center justify-between mb-2'>
                              <span className='text-sm font-medium'>
                                {item.name}
                              </span>
                              <div className='flex items-center space-x-2'>
                                {item.isCustom && (
                                  <Badge variant='outline' className='text-xs'>
                                    Custom
                                  </Badge>
                                )}
                                {item.isDynamicField && (
                                  <Badge
                                    variant='outline'
                                    className='text-xs bg-purple-100'
                                  >
                                    Parameter
                                  </Badge>
                                )}
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() =>
                                    removeIncludedItem(subproject.id, index)
                                  }
                                  className='w-6 h-6 p-0 text-red-500 hover:text-red-700'
                                >
                                  <Trash2 className='w-3 h-3' />
                                </Button>
                              </div>
                            </div>

                            {/* Show input field for dynamic fields */}
                            {dynamicField && (
                              <div className='mt-2'>
                                {dynamicField.fieldType === 'dropdown' && (
                                  <Select
                                    value={(currentValue as string) || ''}
                                    onValueChange={(value) =>
                                      updateProfessionalInput(
                                        subproject.id,
                                        dynamicField.fieldName,
                                        value
                                      )
                                    }
                                  >
                                    <SelectTrigger className='h-8'>
                                      <SelectValue
                                        placeholder={
                                          dynamicField.placeholder ||
                                          `Select ${dynamicField.label}`
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {dynamicField.options
                                        ?.filter(
                                          (option) => option && option.trim()
                                        )
                                        .map((option) => (
                                          <SelectItem
                                            key={option}
                                            value={option}
                                          >
                                            {option}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                )}

                                {dynamicField.fieldType === 'range' &&
                                  // Special case: treat 'design revisions' as a single number field
                                  (dynamicField.fieldName
                                    .toLowerCase()
                                    .includes('design') &&
                                    dynamicField.fieldName
                                      .toLowerCase()
                                      .includes('revision') ? (
                                    <Input
                                      type='number'
                                      min={dynamicField.min}
                                      max={dynamicField.max}
                                      value={(currentValue as number) || ''}
                                      onChange={(e) =>
                                        updateProfessionalInput(
                                          subproject.id,
                                          dynamicField.fieldName,
                                          parseFloat(e.target.value) || 0
                                        )
                                      }
                                      placeholder={
                                        dynamicField.placeholder ||
                                        `Enter ${dynamicField.label}`
                                      }
                                      className='h-8'
                                    />
                                  ) : (
                                    <div className='flex space-x-2'>
                                      <Input
                                        type='number'
                                        min={dynamicField.min}
                                        max={dynamicField.max}
                                        value={
                                          typeof currentValue === 'object' &&
                                            currentValue !== null
                                            ? (
                                              currentValue as {
                                                min: number;
                                                max: number;
                                              }
                                            ).min
                                            : ''
                                        }
                                        onChange={(e) => {
                                          const newValue = {
                                            min:
                                              parseFloat(e.target.value) ||
                                              dynamicField.min ||
                                              0,
                                            max:
                                              typeof currentValue ===
                                                'object' &&
                                                currentValue !== null
                                                ? (
                                                  currentValue as {
                                                    min: number;
                                                    max: number;
                                                  }
                                                ).max
                                                : dynamicField.max || 0,
                                          };
                                          updateProfessionalInput(
                                            subproject.id,
                                            dynamicField.fieldName,
                                            newValue
                                          );
                                        }}
                                        placeholder='Min'
                                        className='h-8'
                                      />
                                      <span className='self-center text-gray-500 text-sm'>
                                        to
                                      </span>
                                      <Input
                                        type='number'
                                        min={dynamicField.min}
                                        max={dynamicField.max}
                                        value={
                                          typeof currentValue === 'object' &&
                                            currentValue !== null
                                            ? (
                                              currentValue as {
                                                min: number;
                                                max: number;
                                              }
                                            ).max
                                            : ''
                                        }
                                        onChange={(e) => {
                                          const newValue = {
                                            min:
                                              typeof currentValue ===
                                                'object' &&
                                                currentValue !== null
                                                ? (
                                                  currentValue as {
                                                    min: number;
                                                    max: number;
                                                  }
                                                ).min
                                                : dynamicField.min || 0,
                                            max:
                                              parseFloat(e.target.value) ||
                                              dynamicField.max ||
                                              0,
                                          };
                                          updateProfessionalInput(
                                            subproject.id,
                                            dynamicField.fieldName,
                                            newValue
                                          );
                                        }}
                                        placeholder='Max'
                                        className='h-8'
                                      />
                                    </div>
                                  ))}

                                {dynamicField.fieldType === 'number' && (
                                  <Input
                                    type='number'
                                    min={dynamicField.min}
                                    max={dynamicField.max}
                                    value={(currentValue as number) || ''}
                                    onChange={(e) =>
                                      updateProfessionalInput(
                                        subproject.id,
                                        dynamicField.fieldName,
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    placeholder={
                                      dynamicField.placeholder ||
                                      `Enter ${dynamicField.label}`
                                    }
                                    className='h-8'
                                  />
                                )}

                                {dynamicField.fieldType === 'text' && (
                                  <Input
                                    type='text'
                                    value={(currentValue as string) || ''}
                                    onChange={(e) =>
                                      updateProfessionalInput(
                                        subproject.id,
                                        dynamicField.fieldName,
                                        e.target.value
                                      )
                                    }
                                    placeholder={
                                      dynamicField.placeholder ||
                                      `Enter ${dynamicField.label}`
                                    }
                                    className='h-8'
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {subproject.included.length < 3 && (
                    <div className='flex items-center space-x-2 text-amber-600 bg-amber-50 p-2 rounded mt-2'>
                      <AlertCircle className='w-4 h-4' />
                      <span className='text-sm'>
                        Add at least 3 items to continue
                      </span>
                    </div>
                  )}
                </div>

                {/* Timing */}
                <div className='border rounded-lg p-4 bg-green-50'>
                  <h4 className='font-semibold mb-4 flex items-center'>
                    <Clock className='w-4 h-4 mr-2' />
                    Timing & Duration
                  </h4>

                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <div>
                      <Label>Preparation Time *</Label>
                      <div className='flex space-x-2'>
                        <Input
                          type='number'
                          min='0'
                          step='0.5'
                          value={subproject.preparationDuration?.value ?? 0}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value);
                            updateSubproject(subproject.id, {
                              preparationDuration: {
                                value: Number.isNaN(parsed) ? 0 : parsed,
                                unit: resolvePreparationUnit(subproject),
                              },
                            });
                          }}
                        />
                        <Select
                          value={resolvePreparationUnit(subproject)}
                          onValueChange={(value: 'hours' | 'days') =>
                            updateSubproject(subproject.id, {
                              preparationDuration: {
                                value:
                                  subproject.preparationDuration?.value ?? 0,
                                unit: value,
                              },
                            })
                          }
                        >
                          <SelectTrigger className='w-24'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='hours'>Hours</SelectItem>
                            <SelectItem value='days'>Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className='text-xs text-gray-500 mt-1'>
                        Time needed before starting work (
                        {resolvePreparationUnit(subproject)})
                      </p>
                    </div>

                    {subproject.pricing.type === 'rfq' ? (
                      <>
                        <div>
                          <Label>Execution Duration (Range) *</Label>
                          <div className='flex space-x-2'>
                            <Input
                              type='number'
                              min='1'
                              value={
                                subproject.executionDuration.range?.min || ''
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
                                const newMin =
                                  raw === '' ? undefined : parseInt(raw, 10);
                                const currentMax =
                                  subproject.executionDuration.range?.max;

                                const hasError =
                                  typeof newMin === 'number' &&
                                  typeof currentMax === 'number' &&
                                  newMin > currentMax;

                                updateSubproject(subproject.id, {
                                  executionDuration: {
                                    ...subproject.executionDuration,
                                    range:
                                      newMin === undefined &&
                                        currentMax === undefined
                                        ? undefined
                                        : ({
                                          ...(newMin !== undefined
                                            ? { min: newMin }
                                            : {}),
                                          ...(currentMax !== undefined
                                            ? { max: currentMax }
                                            : {}),
                                        } as { min: number; max: number }),
                                  },
                                  errors: {
                                    ...subproject.errors,
                                    executionDurationRange: hasError
                                      ? 'Min duration must be less than or equal to max duration'
                                      : undefined,
                                  },
                                });
                              }}
                              placeholder='Min'
                              className={`w-20 ${subproject.errors?.executionDurationRange
                                ? 'border-red-500'
                                : ''
                                }`}
                            />
                            <span className='self-center text-gray-500'>
                              to
                            </span>
                            <Input
                              type='number'
                              min='1'
                              value={
                                subproject.executionDuration.range?.max || ''
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
                                const newMax =
                                  raw === '' ? undefined : parseInt(raw, 10);
                                const currentMin =
                                  subproject.executionDuration.range?.min;

                                const hasError =
                                  typeof currentMin === 'number' &&
                                  typeof newMax === 'number' &&
                                  currentMin > newMax;

                                updateSubproject(subproject.id, {
                                  executionDuration: {
                                    ...subproject.executionDuration,
                                    range:
                                      currentMin === undefined &&
                                        newMax === undefined
                                        ? undefined
                                        : ({
                                          ...(currentMin !== undefined
                                            ? { min: currentMin }
                                            : {}),
                                          ...(newMax !== undefined
                                            ? { max: newMax }
                                            : {}),
                                        } as { min: number; max: number }),
                                  },
                                  errors: {
                                    ...subproject.errors,
                                    executionDurationRange: hasError
                                      ? 'Min duration must be less than or equal to max duration'
                                      : undefined,
                                  },
                                });
                              }}
                              placeholder='Max'
                              className={`w-20 ${subproject.errors?.executionDurationRange
                                ? 'border-red-500'
                                : ''
                                }`}
                            />
                            <Select
                              value={subproject.executionDuration.unit}
                              onValueChange={(value: 'hours' | 'days') =>
                                updateSubproject(subproject.id, {
                                  executionDuration: {
                                    ...subproject.executionDuration,
                                    unit: value,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className='w-24'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='hours'>Hours</SelectItem>
                                <SelectItem value='days'>Days</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {subproject.errors?.executionDurationRange && (
                            <p className='text-xs text-red-500 mt-1 flex items-center'>
                              <AlertCircle className='w-3 h-3 mr-1' />
                              {subproject.errors.executionDurationRange}
                            </p>
                          )}
                          <p className='text-xs text-gray-500 mt-1'>
                            Estimated execution time range
                          </p>
                        </div>

                        <div>
                          <Label>Buffer Time (optional)</Label>
                          <div className='flex space-x-2'>
                            <Input
                              type='number'
                              min='0'
                              value={subproject.buffer?.value || ''}
                              onChange={(e) =>
                                updateSubproject(subproject.id, {
                                  buffer: e.target.value
                                    ? {
                                      value: parseInt(e.target.value),
                                      unit:
                                        subproject.buffer?.unit || 'hours',
                                    }
                                    : undefined,
                                })
                              }
                              placeholder='0'
                            />
                            <Select
                              value={subproject.buffer?.unit || 'hours'}
                              onValueChange={(value: 'hours' | 'days') =>
                                updateSubproject(subproject.id, {
                                  buffer: subproject.buffer
                                    ? {
                                      ...subproject.buffer,
                                      unit: value,
                                    }
                                    : { value: 0, unit: value },
                                })
                              }
                            >
                              <SelectTrigger className='w-24'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='hours'>Hours</SelectItem>
                                <SelectItem value='days'>Days</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <p className='text-xs text-gray-500 mt-1'>
                            Extra time to avoid delays
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <Label>Execution Duration *</Label>
                          <div className='flex space-x-2'>
                            <Input
                              type='number'
                              min='1'
                              value={subproject.executionDuration.value}
                              onChange={(e) =>
                                updateSubproject(subproject.id, {
                                  executionDuration: {
                                    ...subproject.executionDuration,
                                    value: parseInt(e.target.value) || 1,
                                  },
                                })
                              }
                            />
                            <Select
                              value={subproject.executionDuration.unit}
                              onValueChange={(value: 'hours' | 'days') =>
                                updateSubproject(subproject.id, {
                                  executionDuration: {
                                    ...subproject.executionDuration,
                                    unit: value,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className='w-24'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='hours'>Hours</SelectItem>
                                <SelectItem value='days'>Days</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label>Buffer Time (optional)</Label>
                          <div className='flex space-x-2'>
                            <Input
                              type='number'
                              min='0'
                              value={subproject.buffer?.value || ''}
                              onChange={(e) =>
                                updateSubproject(subproject.id, {
                                  buffer: e.target.value
                                    ? {
                                      value: parseInt(e.target.value),
                                      unit:
                                        subproject.buffer?.unit || 'hours',
                                    }
                                    : undefined,
                                })
                              }
                              placeholder='0'
                            />
                            <Select
                              value={subproject.buffer?.unit || 'hours'}
                              onValueChange={(value: 'hours' | 'days') =>
                                updateSubproject(subproject.id, {
                                  buffer: subproject.buffer
                                    ? {
                                      ...subproject.buffer,
                                      unit: value,
                                    }
                                    : { value: 0, unit: value },
                                })
                              }
                            >
                              <SelectTrigger className='w-24'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='hours'>Hours</SelectItem>
                                <SelectItem value='days'>Days</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <p className='text-xs text-gray-500 mt-1'>
                            Extra time to avoid delays
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Intake Meeting Duration - Only for Renovation */}
                  {data.category === 'Renovation' && (
                    <div className='mt-4 pt-4 border-t'>
                      <h5 className='font-medium mb-3'>
                        Intake Meeting Duration
                      </h5>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div>
                          <Label>Duration *</Label>
                          <div className='flex space-x-2'>
                            <Input
                              type='number'
                              min='0'
                              value={subproject.intakeDuration?.value || ''}
                              onChange={(e) =>
                                updateSubproject(subproject.id, {
                                  intakeDuration: {
                                    value: parseInt(e.target.value) || 0,
                                    unit:
                                      subproject.intakeDuration?.unit ||
                                      'hours',
                                    buffer: subproject.intakeDuration?.buffer,
                                  },
                                })
                              }
                              placeholder='0'
                            />
                            <Select
                              value={subproject.intakeDuration?.unit || 'hours'}
                              onValueChange={(value: 'hours' | 'days') =>
                                updateSubproject(subproject.id, {
                                  intakeDuration: {
                                    value:
                                      subproject.intakeDuration?.value || 0,
                                    unit: value,
                                    buffer: subproject.intakeDuration?.buffer,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className='w-24'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='hours'>Hours</SelectItem>
                                <SelectItem value='days'>Days</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label>Buffer (optional)</Label>
                          <Input
                            type='number'
                            min='0'
                            value={subproject.intakeDuration?.buffer || ''}
                            onChange={(e) =>
                              updateSubproject(subproject.id, {
                                intakeDuration: {
                                  value: subproject.intakeDuration?.value || 0,
                                  unit:
                                    subproject.intakeDuration?.unit || 'hours',
                                  buffer: parseInt(e.target.value) || undefined,
                                },
                              })
                            }
                            placeholder='0'
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      {subprojects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Package Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <table className='w-full border-collapse'>
                <thead>
                  <tr className='border-b'>
                    <th className='text-left p-2'>Package</th>
                    <th className='text-left p-2'>Pricing</th>
                    <th className='text-left p-2'>Duration</th>
                    <th className='text-left p-2'>Warranty</th>
                    <th className='text-left p-2'>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {subprojects.map((sub, index) => (
                    <tr key={sub.id} className='border-b'>
                      <td className='p-2 font-medium'>
                        {sub.name || `Package ${index + 1}`}
                      </td>
                      <td className='p-2'>
                        {sub.pricing.type === 'fixed' &&
                          sub.pricing.amount &&
                          `EUR ${sub.pricing.amount} (Total)`}
                        {sub.pricing.type === 'unit' &&
                          sub.pricing.amount &&
                          `EUR ${sub.pricing.amount}/${unitLabel}${sub.pricing.minOrderQuantity
                            ? ` (min ${sub.pricing.minOrderQuantity})`
                            : ''
                          }`}
                        {sub.pricing.type === 'rfq' && (
                          <>
                            Quote required
                            {sub.pricing.priceRange?.min &&
                              sub.pricing.priceRange?.max && (
                                <span className='text-gray-500 text-sm ml-1'>
                                  (EUR {sub.pricing.priceRange.min}-
                                  {sub.pricing.priceRange.max})
                                </span>
                              )}
                          </>
                        )}
                      </td>
                      <td className="p-2">
                        {sub.pricing.type === 'rfq' && sub.executionDuration.range?.min && sub.executionDuration.range?.max ? (
                          `${sub.executionDuration.range.min}-${sub.executionDuration.range.max} ${sub.executionDuration.unit}`
                        ) : (
                          `${sub.executionDuration.value} ${sub.executionDuration.unit}`
                        )}
                      </td>
                      <td className='p-2'>
                        {sub.warrantyPeriod.value === 0
                          ? 'No warranty'
                          : `${sub.warrantyPeriod.value} ${sub.warrantyPeriod.unit}`}
                      </td>
                      <td className='p-2'>{sub.included.length} items</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {subprojects.some(
              (s) => s.pricing.type === 'fixed' && s.pricing.amount
            ) && (
                <div className='mt-4 p-4 bg-blue-50 rounded-lg'>
                  <div className='flex items-center space-x-2'>
                    <Info className='w-4 h-4 text-blue-600' />
                    <span className='font-medium text-blue-900'>
                      Total fixed price packages: EUR{' '}
                      {calculateTotalPrice().toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
