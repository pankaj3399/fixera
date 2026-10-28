'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useFormatLocale } from '@/lib/i18n/useFormatLocale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Lock,
  Building2,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { logError } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthContext';
import DualVerificationComponent from '@/components/DualVerificationComponent';
import {
  validateVATFormat,
  validateVATWithAPI,
  formatVATNumber,
  isEUVatNumber,
} from '@/lib/vatValidation';
import AddressAutocomplete, {
  PlaceData,
} from '@/components/professional/project-wizard/AddressAutocomplete';
import { PhoneCountryCodeSelect } from '@/components/PhoneCountryCodeSelect';
import { isValidPhoneNumber } from 'libphonenumber-js';

interface FormData {
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  password: string;
  confirmPassword: string;
  customerType: 'individual' | 'business';
  // Business fields
  vatNumber: string;
  companyName: string;
  // Location fields
  address: string;
  city: string;
  country: string;
  postalCode: string;
  // Coordinates (auto-populated from geocoding)
  latitude?: number;
  longitude?: number;
  /** Normalized address|city|postal|country key coords were resolved for */
  resolvedLocationKey?: string;
  // Referral
  referralCode: string;
  // Marketing
  marketingOptIn: boolean;
}

interface VatValidationState {
  valid?: boolean;
  transient?: boolean;
  error?: string;
  companyName?: string;
  companyAddress?: string;
  parsedAddress?: {
    streetAddress?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
}

export default function CustomerSignupPage() {
  return (
    <Suspense>
      <CustomerSignupForm />
    </Suspense>
  );
}

const VAT_ERROR_KEYS = {
  required: 'vatFormat.required',
  tooShort: 'vatFormat.tooShort',
  tooLong: 'vatFormat.tooLong',
  countryPrefix: 'vatFormat.countryPrefix',
  invalidCharacters: 'vatFormat.invalidCharacters',
  invalidCountry: 'vatFormat.invalidCountry',
  validationFailed: 'vatFormat.validationFailed',
  network: 'vatFormat.network',
} as const;

function CustomerSignupForm() {
  const t = useTranslations('auth');
  const { intl } = useFormatLocale();
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([intl], { type: 'region' });
    } catch {
      return null;
    }
  }, [intl]);
  const vatCountryName = (vatNumber: string) => {
    const code = vatNumber.slice(0, 2).toUpperCase();
    if (code.length !== 2) return '';
    return regionNames?.of(code) ?? code;
  };
  const vatErrorMessage = (result: { errorCode?: string; error?: string; countryCode?: string }) => {
    const key = result.errorCode
      ? VAT_ERROR_KEYS[result.errorCode as keyof typeof VAT_ERROR_KEYS]
      : undefined;
    return key ? t(key, { country: result.countryCode ?? '' }) : result.error;
  };
  const [currentStep, setCurrentStep] = useState<'form' | 'verification'>(
    'form'
  );
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    countryCode: '+32',
    password: '',
    confirmPassword: '',
    customerType: 'individual',
    vatNumber: '',
    companyName: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    referralCode: '',
    marketingOptIn: false,
  });
  const [loading, setLoading] = useState(false);
  const [vatValidating, setVatValidating] = useState(false);
  const [vatValidation, setVatValidation] = useState<VatValidationState>({});
  const [addressValidating, setAddressValidating] = useState(false);
  const [isAddressValid, setIsAddressValid] = useState(false);
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralReferrer, setReferralReferrer] = useState<string>('');
  // Bumped whenever location fields change so in-flight geocode results are ignored
  const geocodeRequestIdRef = useRef(0);
  const { signup } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill referral code from URL query param
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setFormData(prev => ({ ...prev, referralCode: ref }));
    }
  }, [searchParams]);

  // Validate referral code whenever it changes (debounced)
  useEffect(() => {
    const code = formData.referralCode.trim();
    if (!code) {
      setReferralValid(null);
      setReferralReferrer('');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/referral/validate/${encodeURIComponent(code)}`, {
        signal: controller.signal,
      })
        .then(res => res.json())
        .then(data => {
          if (controller.signal.aborted) return;
          if (data.success) {
            setReferralValid(true);
            setReferralReferrer(data.data?.referrerName || '');
          } else {
            setReferralValid(false);
            setReferralReferrer('');
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          setReferralValid(false);
          setReferralReferrer('');
        });
    }, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [formData.referralCode]);

  const LOCATION_FIELDS: Array<keyof FormData> = [
    'address',
    'city',
    'postalCode',
    'country',
  ];

  const normalizeLocationKey = ({
    address,
    city,
    postalCode,
    country,
  }: {
    address: string;
    city: string;
    postalCode: string;
    country: string;
  }) =>
    [address, city, postalCode, country]
      .map((part) => part.trim().toLowerCase())
      .join('|');

  const clearResolvedCoordinates = (
    data: FormData
  ): FormData => ({
    ...data,
    latitude: undefined,
    longitude: undefined,
    resolvedLocationKey: undefined,
  });

  const invalidateResolvedCoordinates = () => {
    geocodeRequestIdRef.current += 1;
    // Drop validating UI if an in-flight geocode was just invalidated
    setAddressValidating(false);
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    const clearsCoordinates = LOCATION_FIELDS.includes(field);
    if (clearsCoordinates) {
      invalidateResolvedCoordinates();
    }
    setFormData((prev) => {
      const next: FormData = { ...prev, [field]: value };
      if (clearsCoordinates) {
        return clearResolvedCoordinates(next);
      }
      return next;
    });
  };

  // Handle address selection from autocomplete
  const handleAddressChange = (fullAddress: string, placeData?: PlaceData) => {
    if (!placeData?.coordinates) {
      // Typing / clearing — drop any previously resolved coordinates
      invalidateResolvedCoordinates();
      setFormData((prev) =>
        clearResolvedCoordinates({
          ...prev,
          address: fullAddress,
        })
      );
      return;
    }

    const coordinates = placeData.coordinates;
    const components = placeData.address_components;
    const cityComponent = components?.find(
      (component) =>
        component.types.includes('locality') ||
        component.types.includes('administrative_area_level_2')
    );
    const countryComponent = components?.find((component) =>
      component.types.includes('country')
    );
    const postalComponent = components?.find((component) =>
      component.types.includes('postal_code')
    );

    // New resolved coords — invalidate any in-flight geocode for the prior address
    invalidateResolvedCoordinates();
    setFormData((prev) => {
      const city = cityComponent?.long_name || prev.city;
      const country = countryComponent?.long_name || prev.country;
      const postalCode = postalComponent?.long_name || prev.postalCode;
      return {
        ...prev,
        address: fullAddress,
        city,
        country,
        postalCode,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        resolvedLocationKey: normalizeLocationKey({
          address: fullAddress,
          city,
          postalCode,
          country,
        }),
      };
    });
  };

  // Auto-populate business info from VAT validation
  useEffect(() => {
    if (!vatValidation.valid || formData.customerType !== 'business') {
      return;
    }

    const parsed = vatValidation.parsedAddress;
    const patch: Partial<FormData> = {};
    let locationChanged = false;

    if (!formData.companyName && vatValidation.companyName) {
      patch.companyName = vatValidation.companyName;
    }

    if (parsed) {
      if (parsed.streetAddress && !formData.address) {
        patch.address = parsed.streetAddress;
        locationChanged = true;
      }
      if (parsed.city && !formData.city) {
        patch.city = parsed.city;
        locationChanged = true;
      }
      if (parsed.postalCode && !formData.postalCode) {
        patch.postalCode = parsed.postalCode;
        locationChanged = true;
      }
      if (parsed.country && !formData.country) {
        patch.country = parsed.country;
        locationChanged = true;
      }
    }

    if (locationChanged) {
      // VAT may fill city/postal/country after Places set coords without
      // address_components — drop those coords so submit re-geocodes.
      patch.latitude = undefined;
      patch.longitude = undefined;
      patch.resolvedLocationKey = undefined;
      invalidateResolvedCoordinates();
    }

    if (Object.keys(patch).length === 0) {
      return;
    }

    setFormData((prev) => ({ ...prev, ...patch }));
  }, [
    vatValidation,
    formData.customerType,
    formData.companyName,
    formData.address,
    formData.city,
    formData.postalCode,
    formData.country,
  ]);

  const validateVatNumber = async () => {
    if (!formData.vatNumber.trim()) {
      setVatValidation({});
      return;
    }

    const formatted = formatVATNumber(formData.vatNumber);

    // Client-side format validation
    const formatValidation = validateVATFormat(formatted);
    if (!formatValidation.valid) {
      setVatValidation({
        valid: false,
        error: vatErrorMessage(formatValidation),
      });
      return;
    }

    // If it's not an EU VAT number, just validate format
    if (!isEUVatNumber(formatted)) {
      setVatValidation({
        valid: false,
        error: t('customerSignup.vatOnlyEu'),
      });
      return;
    }

    setVatValidating(true);
    try {
      const result = await validateVATWithAPI(formatted);
      setVatValidation({
        valid: result.valid,
        transient: result.transient === true,
        error: vatErrorMessage(result),
        companyName: result.companyName,
        companyAddress: result.companyAddress,
        parsedAddress: result.parsedAddress,
      });

      if (result.valid) {
        toast.success(
          t('customerSignup.vatValidatedToast', {
            company: result.companyName || t('customerSignup.vatValidFallback'),
          })
        );
      } else {
        // Don't show error toast - just update the state
        // VAT validation is optional, so errors shouldn't block the user
      }
    } catch (error) {
      logError(error, 'VAT validation error', { component: 'CustomerSignup', action: 'validateVat' });
      setVatValidation({
        valid: false,
        error: t('customerSignup.vatFailedOptional'),
      });
      // Don't show error toast - VAT is optional
    } finally {
      setVatValidating(false);
    }
  };

  // Geocode address to get coordinates
  const geocodeAddress = async (
    fullAddress: string
  ): Promise<{ lat: number; lng: number } | null> => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/validate-address`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ address: fullAddress }),
        }
      );

      const data = await response.json();

      if (!data.success || !data.isValid) {
        return null;
      }

      // Prefer explicit coordinates; fall back to Google result geometry
      const lat =
        data.coordinates?.lat ?? data.data?.geometry?.location?.lat;
      const lng =
        data.coordinates?.lng ?? data.data?.geometry?.location?.lng;

      if (typeof lat === 'number' && typeof lng === 'number') {
        return { lat, lng };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  const validateForm = async (): Promise<
    { latitude: number; longitude: number } | false
  > => {
    // Basic validations
    if (!formData.name.trim()) {
      toast.error(t('validation.fullNameRequired'));
      return false;
    }

    if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) {
      toast.error(t('validation.emailInvalid'));
      return false;
    }

    if (
      !formData.phone.trim() ||
      !isValidPhoneNumber(formData.countryCode + formData.phone)
    ) {
      toast.error(t('validation.phoneInvalid'));
      return false;
    }

    if (formData.password.length < 6) {
      toast.error(t('validation.passwordTooShort'));
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error(t('validation.passwordsDoNotMatch'));
      return false;
    }

    // Location validations
    if (!formData.address.trim()) {
      toast.error(t('validation.addressRequired'));
      return false;
    }

    if (!isAddressValid) {
      toast.error(t('validation.addressNotValidated'));
      return false;
    }

    if (!formData.city.trim()) {
      toast.error(t('validation.cityRequired'));
      return false;
    }

    if (!formData.country.trim()) {
      toast.error(t('validation.countryRequired'));
      return false;
    }

    if (!formData.postalCode.trim()) {
      toast.error(t('validation.postalCodeRequired'));
      return false;
    }

    // Business-specific validations
    if (formData.customerType === 'business') {
      if (!formData.companyName.trim()) {
        toast.error(t('validation.companyNameRequired'));
        return false;
      }
      if (!formData.vatNumber.trim()) {
        toast.error(t('validation.vatNumberRequired'));
        return false;
      }
      const vatFormatValidation = validateVATFormat(formatVATNumber(formData.vatNumber));
      if (!vatFormatValidation.valid) {
        toast.error(vatErrorMessage(vatFormatValidation) || t('validation.vatInvalid'));
        return false;
      }
    }

    // Reuse coords only when they were resolved for this exact location key
    const currentLocationKey = normalizeLocationKey(formData);
    if (
      typeof formData.latitude === 'number' &&
      typeof formData.longitude === 'number' &&
      formData.resolvedLocationKey === currentLocationKey
    ) {
      return {
        latitude: formData.latitude,
        longitude: formData.longitude,
      };
    }

    setAddressValidating(true);
    const requestId = ++geocodeRequestIdRef.current;
    const fullAddress = `${formData.address}, ${formData.city}, ${formData.postalCode}, ${formData.country}`;
    const coordinates = await geocodeAddress(fullAddress);

    // Address changed while geocoding — discard stale result. Do not clear
    // addressValidating here: a newer request may own it, or invalidate already did.
    if (requestId !== geocodeRequestIdRef.current) {
      return false;
    }

    setAddressValidating(false);

    if (!coordinates) {
      toast.error(t('customerSignup.addressValidationFailed'));
      return false;
    }

    setFormData((prev) => ({
      ...prev,
      latitude: coordinates.lat,
      longitude: coordinates.lng,
      resolvedLocationKey: currentLocationKey,
    }));

    // Return coords directly — setFormData is async and must not be read stale on submit
    return {
      latitude: coordinates.lat,
      longitude: coordinates.lng,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validatedLocation = await validateForm();
    if (!validatedLocation) return;

    setLoading(true);
    try {
      const trimmedReferralCode = formData.referralCode.trim();
      const submitData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.countryCode + formData.phone.trim(),
        password: formData.password,
        role: 'customer' as const,
        // Customer-specific fields
        customerType: formData.customerType,
        address: formData.address.trim(),
        city: formData.city.trim(),
        country: formData.country.trim(),
        postalCode: formData.postalCode.trim(),
        latitude: validatedLocation.latitude,
        longitude: validatedLocation.longitude,
        // Business fields (only if business type)
        ...(formData.customerType === 'business' && {
          companyName: formData.companyName.trim(),
          vatNumber: formData.vatNumber
            ? formatVATNumber(formData.vatNumber)
            : undefined,
          isVatValidated: vatValidation.valid || false,
        }),
        ...(trimmedReferralCode && referralValid === true && {
          referralCode: trimmedReferralCode,
        }),
        marketingOptIn: formData.marketingOptIn,
      };

      const success = await signup(submitData);

      if (success) {
        toast.success(t('customerSignup.accountCreated'));
        setCurrentStep('verification');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(t('customerSignup.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSuccess = () => {
    toast.success(t('customerSignup.verifiedToast'));
    router.push('/dashboard?welcome=true');
  };

  if (currentStep === 'verification') {
    return (
      <DualVerificationComponent
        email={formData.email}
        phone={formData.countryCode + formData.phone}
        onVerificationSuccess={handleVerificationSuccess}
        onBack={() => setCurrentStep('form')}
      />
    );
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4 py-12'>
      <div className='w-full max-w-2xl'>
        <Link href='/'>
          <Button
            variant='ghost'
            size='sm'
            className='absolute top-6 left-6 flex items-center gap-2 text-gray-600 hover:text-gray-900'
          >
            <ArrowLeft className='h-4 w-4' />
            {t('shared.backToHome')}
          </Button>
        </Link>

        <Card className='shadow-xl border-0'>
          <CardHeader className='text-center pb-6'>
            <div className='flex items-center justify-center mb-4'>
              <div className='p-3 bg-blue-100 rounded-full'>
                <User className='h-8 w-8 text-blue-600' />
              </div>
            </div>
            <CardTitle className='text-2xl font-bold text-gray-900'>
              {t('customerSignup.title')}
            </CardTitle>
            <CardDescription className='text-gray-600'>
              {t('customerSignup.description')}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-5'>
              {/* Customer Type Selection */}
              <div className='space-y-3'>
                <Label className='text-base font-semibold'>{t('customerSignup.accountType')}</Label>
                <RadioGroup
                  value={formData.customerType}
                  onValueChange={(value: 'individual' | 'business') => {
                    handleInputChange('customerType', value);
                    // Reset business fields when switching to individual
                    if (value === 'individual') {
                      setFormData((prev) => ({
                        ...prev,
                        vatNumber: '',
                        companyName: '',
                      }));
                      setVatValidation({});
                    }
                  }}
                  className='grid grid-cols-2 gap-4'
                >
                  <div>
                    <RadioGroupItem
                      value='individual'
                      id='individual'
                      className='peer sr-only'
                    />
                    <Label
                      htmlFor='individual'
                      className='flex flex-col items-center justify-between rounded-lg border-2 border-gray-200 bg-white p-4 hover:bg-gray-50 peer-data-[state=checked]:border-blue-600 peer-data-[state=checked]:bg-blue-50 cursor-pointer transition-all'
                    >
                      <User className='mb-2 h-6 w-6 text-gray-600' />
                      <span className='font-semibold'>{t('customerSignup.individual')}</span>
                      <span className='text-xs text-gray-500 text-center mt-1'>
                        {t('customerSignup.individualDescription')}
                      </span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem
                      value='business'
                      id='business'
                      className='peer sr-only'
                    />
                    <Label
                      htmlFor='business'
                      className='flex flex-col items-center justify-between rounded-lg border-2 border-gray-200 bg-white p-4 hover:bg-gray-50 peer-data-[state=checked]:border-blue-600 peer-data-[state=checked]:bg-blue-50 cursor-pointer transition-all'
                    >
                      <Building2 className='mb-2 h-6 w-6 text-gray-600' />
                      <span className='font-semibold'>{t('customerSignup.business')}</span>
                      <span className='text-xs text-gray-500 text-center mt-1'>
                        {t('customerSignup.businessDescription')}
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Basic Information */}
              <div className='space-y-4 pt-2'>
                <h3 className='text-sm font-semibold text-gray-700 uppercase tracking-wide'>
                  {t('customerSignup.basicInformation')}
                </h3>

                {/* Full Name */}
                <div className='space-y-2'>
                  <Label htmlFor='name'>{t('customerSignup.fullNameLabel')}</Label>
                  <div className='relative'>
                    <User className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
                    <Input
                      id='name'
                      type='text'
                      placeholder={t('shared.fullNamePlaceholder')}
                      value={formData.name}
                      onChange={(e) =>
                        handleInputChange('name', e.target.value)
                      }
                      className='pl-10'
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div className='space-y-2'>
                  <Label htmlFor='email'>{t('customerSignup.emailLabel')}</Label>
                  <div className='relative'>
                    <Mail className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
                    <Input
                      id='email'
                      type='email'
                      placeholder={t('shared.emailPlaceholder')}
                      value={formData.email}
                      onChange={(e) =>
                        handleInputChange('email', e.target.value)
                      }
                      className='pl-10'
                      required
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className='space-y-2'>
                  <Label htmlFor='phone'>{t('customerSignup.phoneLabel')}</Label>
                  <div className='flex gap-2'>
                    <PhoneCountryCodeSelect
                      value={formData.countryCode}
                      onValueChange={(value) =>
                        handleInputChange('countryCode', value)
                      }
                    />
                    <div className='relative flex-1'>
                      <Phone className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
                      <Input
                        id='phone'
                        type='tel'
                        placeholder={t('shared.phonePlaceholder')}
                        value={formData.phone}
                        onChange={(e) =>
                          handleInputChange('phone', e.target.value)
                        }
                        className='pl-10'
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Password */}
                <div className='space-y-2'>
                  <Label htmlFor='password'>{t('customerSignup.passwordLabel')}</Label>
                  <div className='relative'>
                    <Lock className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
                    <Input
                      id='password'
                      type='password'
                      placeholder={t('shared.createPasswordPlaceholder')}
                      value={formData.password}
                      onChange={(e) =>
                        handleInputChange('password', e.target.value)
                      }
                      className='pl-10'
                      required
                    />
                  </div>
                </div>

                {/* Confirm Password */}
                <div className='space-y-2'>
                  <Label htmlFor='confirmPassword'>{t('customerSignup.confirmPasswordLabel')}</Label>
                  <div className='relative'>
                    <Lock className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
                    <Input
                      id='confirmPassword'
                      type='password'
                      placeholder={t('shared.confirmPasswordPlaceholder')}
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        handleInputChange('confirmPassword', e.target.value)
                      }
                      className='pl-10'
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Business Information (only for business type) */}
              {formData.customerType === 'business' && (
                <div className='space-y-4 pt-2 border-t'>
                  <h3 className='text-sm font-semibold text-gray-700 uppercase tracking-wide'>
                    {t('customerSignup.businessInformation')}
                  </h3>

                  {/* Company Name */}
                  <div className='space-y-2'>
                    <Label htmlFor='companyName'>{t('customerSignup.companyNameLabel')}</Label>
                    <div className='relative'>
                      <Building2 className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
                      <Input
                        id='companyName'
                        type='text'
                        placeholder={t('customerSignup.companyNamePlaceholder')}
                        value={formData.companyName}
                        onChange={(e) =>
                          handleInputChange('companyName', e.target.value)
                        }
                        className='pl-10'
                        required={formData.customerType === 'business'}
                      />
                    </div>
                  </div>

                  {/* VAT Number */}
                  <div className='space-y-2'>
                    <Label htmlFor='vatNumber'>
                      {t('customerSignup.vatNumberLabel')}
                      {formData.vatNumber && vatValidation.valid && (
                        <span className='ml-2 text-xs text-green-600'>
                          {vatCountryName(formData.vatNumber)}
                        </span>
                      )}
                    </Label>
                    <div className='flex gap-2'>
                      <div className='relative flex-1'>
                        <FileText className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
                        <Input
                          id='vatNumber'
                          type='text'
                          placeholder={t('customerSignup.vatPlaceholder')}
                          value={formData.vatNumber}
                          onChange={(e) => {
                            handleInputChange('vatNumber', e.target.value);
                            setVatValidation({}); // Reset validation
                          }}
                          onBlur={validateVatNumber}
                          className='pl-10'
                          required={formData.customerType === 'business'}
                        />
                      </div>
                      <Button
                        type='button'
                        variant='outline'
                        onClick={validateVatNumber}
                        disabled={!formData.vatNumber || vatValidating}
                        className='shrink-0'
                      >
                        {vatValidating ? (
                          <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                          t('customerSignup.validate')
                        )}
                      </Button>
                    </div>

                    {/* VAT Validation Status */}
                    {vatValidation.valid !== undefined && (
                      <div
                        className={`flex items-start gap-2 text-sm p-3 rounded-lg ${
                          vatValidation.valid
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : vatValidation.transient
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {vatValidation.valid ? (
                          <>
                            <CheckCircle2 className='h-4 w-4 mt-0.5 shrink-0' />
                            <div>
                              <p className='font-medium'>
                                {t('customerSignup.vatValidated')}
                              </p>
                              {vatValidation.companyName && (
                                <p className='text-xs mt-1'>
                                  {vatValidation.companyName}
                                </p>
                              )}
                            </div>
                          </>
                        ) : vatValidation.transient ? (
                          <>
                            <AlertCircle className='h-4 w-4 mt-0.5 shrink-0' />
                            <div>
                              <p className='font-medium'>
                                {t('customerSignup.viesUnavailable')}
                              </p>
                              {vatValidation.error && (
                                <p className='text-xs mt-1'>
                                  {vatValidation.error}
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <XCircle className='h-4 w-4 mt-0.5 shrink-0' />
                            <div>
                              <p className='font-medium'>{t('customerSignup.validationFailed')}</p>
                              {vatValidation.error && (
                                <p className='text-xs mt-1'>
                                  {vatValidation.error}
                                </p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <p className='text-xs text-gray-500'>
                      {t('customerSignup.vatHint')}
                    </p>
                  </div>
                </div>
              )}

              {/* Location Information */}
              <div className='space-y-4 pt-2 border-t'>
                <h3 className='text-sm font-semibold text-gray-700 uppercase tracking-wide'>
                  {t('customerSignup.location')}
                </h3>

                {/* Address with Autocomplete */}
                <AddressAutocomplete
                  value={formData.address}
                  onChange={handleAddressChange}
                  onValidation={setIsAddressValid}
                  useCompanyAddress={false}
                  label={t('shared.streetAddress')}
                  required={true}
                />

                {/* City and Postal Code */}
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='city'>{t('customerSignup.cityLabel')}</Label>
                    <Input
                      id='city'
                      type='text'
                      placeholder={t('customerSignup.cityPlaceholder')}
                      value={formData.city}
                      onChange={(e) =>
                        handleInputChange('city', e.target.value)
                      }
                      required
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='postalCode'>{t('customerSignup.postalCodeLabel')}</Label>
                    <Input
                      id='postalCode'
                      type='text'
                      placeholder={t('customerSignup.postalCodePlaceholder')}
                      value={formData.postalCode}
                      onChange={(e) =>
                        handleInputChange('postalCode', e.target.value)
                      }
                      required
                    />
                  </div>
                </div>

                {/* Country */}
                <div className='space-y-2'>
                  <Label htmlFor='country'>{t('customerSignup.countryLabel')}</Label>
                  <Input
                    id='country'
                    type='text'
                    placeholder={t('customerSignup.countryPlaceholder')}
                    value={formData.country}
                    onChange={(e) =>
                      handleInputChange('country', e.target.value)
                    }
                    required
                  />
                </div>

                <div className='flex items-start gap-2 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200'>
                  <AlertCircle className='h-4 w-4 text-blue-600 mt-0.5 shrink-0' />
                  <p>
                    {t('customerSignup.locationNotice')}
                  </p>
                </div>
              </div>

              {/* Referral Code */}
              <div className='space-y-2'>
                <Label htmlFor='referralCode'>{t('shared.referralCode')}</Label>
                <div className='relative'>
                  <Gift className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
                  <Input
                    id='referralCode'
                    type='text'
                    placeholder={t('shared.referralCodePlaceholder')}
                    value={formData.referralCode}
                    onChange={(e) =>
                      handleInputChange('referralCode', e.target.value.toUpperCase())
                    }
                    className='pl-10'
                  />
                </div>
                {referralValid === true && referralReferrer && (
                  <p className='text-xs text-green-600 flex items-center gap-1'>
                    <CheckCircle2 className='h-3 w-3' />
                    {t('customerSignup.referredByFull', { name: referralReferrer })}
                  </p>
                )}
                {referralValid === false && formData.referralCode && (
                  <p className='text-xs text-amber-600 flex items-center gap-1'>
                    <AlertCircle className='h-3 w-3' />
                    {t('shared.invalidReferral')}
                  </p>
                )}
              </div>

              {/* Marketing opt-in (explicit, unchecked by default) */}
              <label className='flex items-start gap-2.5 rounded-lg border border-gray-200 p-3 cursor-pointer'>
                <input
                  id='marketingOptIn'
                  type='checkbox'
                  disabled={loading || addressValidating}
                  checked={formData.marketingOptIn}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      marketingOptIn: e.target.checked,
                    }))
                  }
                  className='mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                />
                <span className='text-xs text-gray-600 leading-relaxed'>
                  {t('shared.marketingOptIn')}
                </span>
              </label>

              {/* Submit Button */}
              <Button
                type='submit'
                disabled={loading || addressValidating}
                className='w-full h-11 bg-blue-600 hover:bg-blue-700'
                size='lg'
              >
                {loading ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    {t('customerSignup.creatingAccount')}
                  </>
                ) : addressValidating ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    {t('customerSignup.validatingAddress')}
                  </>
                ) : (
                  t('register.createAccount')
                )}
              </Button>
            </form>

            <div className='mt-6 text-center text-sm text-gray-600'>
              {t('shared.alreadyHaveAccount')}{' '}
              <Link
                href='/login'
                className='font-semibold text-blue-600 hover:text-blue-500'
              >
                {t('shared.signInHere')}
              </Link>
            </div>

            <div className='mt-4 text-center text-sm text-gray-600'>
              {t('customerSignup.wantToOffer')}{' '}
              <Link
                href='/register'
                className='font-semibold text-blue-600 hover:text-blue-500'
              >
                {t('customerSignup.registerAsProfessional')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
