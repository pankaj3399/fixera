'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";

export interface PlaceData {
  formatted_address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  address_components?: google.maps.GeocoderAddressComponent[];
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, placeData?: PlaceData) => void;
  onValidation: (isValid: boolean) => void;
  useCompanyAddress: boolean;
  companyAddress?: string;
  label?: string;
  required?: boolean;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onValidation,
  useCompanyAddress,
  companyAddress,
  label,
  required = false
}: AddressAutocompleteProps) {
  const t = useTranslations('projectWizard')
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const selectedFromDropdownRef = useRef(false);
  const validatedAddressRef = useRef<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const { isLoaded, loadGoogleMaps, validateAddress, geocodeAddress } = useGoogleMaps();
  const hasInitialized = useRef(false);

  const enableAutocomplete = useCallback(() => {
    if (!useCompanyAddress) {
      void loadGoogleMaps();
    }
  }, [loadGoogleMaps, useCompanyAddress]);

  // Store callbacks in refs so the autocomplete useEffect doesn't re-run on every render
  const onChangeRef = useRef(onChange);
  const onValidationRef = useRef(onValidation);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onValidationRef.current = onValidation; }, [onValidation]);

  // Initialize autocomplete
  useEffect(() => {
    if (!isLoaded || !inputRef.current || useCompanyAddress) {
      return;
    }

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      fields: ['formatted_address', 'geometry', 'address_components']
    });

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace();
        if (place?.formatted_address) {
          let coordinates: { lat: number; lng: number } | undefined;
          if (place.geometry?.location) {
            const location = place.geometry.location;
            const resolveCoordinate = (
              value: number | (() => number) | undefined
            ): number | undefined => {
              if (typeof value === 'function') {
                return value();
              }
              if (typeof value === 'number') {
                return value;
              }
              return undefined;
            };

            const latValue = resolveCoordinate(location.lat);
            const lngValue = resolveCoordinate(location.lng);

            if (latValue !== undefined && lngValue !== undefined) {
              coordinates = {
                lat: latValue,
                lng: lngValue
              };
            }
          }

          const placeData: PlaceData = {
            formatted_address: place.formatted_address,
            coordinates,
            address_components: place.address_components
          };

        // Call onChange with both parameters (second parameter is optional for backward compatibility)
        onChangeRef.current(place.formatted_address, placeData);
        selectedFromDropdownRef.current = true;
        validatedAddressRef.current = place.formatted_address;
        setIsValid(true);
        onValidationRef.current(true);
      }
    });

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [isLoaded, useCompanyAddress]);

  // Validate on blur - only for manually typed addresses
  const handleBlur = async () => {
    // If selected from dropdown, it's already valid - don't do anything
    if (selectedFromDropdownRef.current) {
      console.log('✅ Address from dropdown - already valid, skipping blur validation');
      return;
    }

    const addressToValidate = useCompanyAddress ? companyAddress : value;

    if (!addressToValidate) {
      setIsValid(false);
      onValidation(false);
      return;
    }

    setValidating(true);
    const valid = await validateAddress(addressToValidate);

    if (valid) {
      validatedAddressRef.current = addressToValidate;

      try {
        const mapsReady = isLoaded || await loadGoogleMaps();
        const coordinates = mapsReady ? await geocodeAddress(addressToValidate) : null;

        if (coordinates) {
          const placeData: PlaceData = {
            formatted_address: addressToValidate,
            coordinates: { lat: coordinates.lat, lng: coordinates.lng },
            address_components: coordinates.address_components,
          };
          onChange(addressToValidate, placeData);
        } else {
          onChange(addressToValidate);
        }
      } catch (geocodeError) {
        console.error('Geocoding error:', geocodeError);
        onChange(addressToValidate);
      }
    }

    setIsValid(valid);
    onValidation(valid);
    setValidating(false);
  };

  const validateCompanyAddress = async () => {
    if (!companyAddress) return;

    setValidating(true);
    const valid = await validateAddress(companyAddress);

    if (valid) {
      try {
        const mapsReady = isLoaded || await loadGoogleMaps();
        const coordinates = mapsReady ? await geocodeAddress(companyAddress) : null;

        if (coordinates) {
          const placeData: PlaceData = {
            formatted_address: companyAddress,
            coordinates: { lat: coordinates.lat, lng: coordinates.lng },
            address_components: coordinates.address_components,
          };
          onChange(companyAddress, placeData);
        } else {
          onChange(companyAddress);
        }
      } catch (geocodeError) {
        console.error('Geocoding error for company address:', geocodeError);
        onChange(companyAddress);
      }
    }

    setIsValid(valid);
    onValidation(valid);
    setValidating(false);
  };

  // Validate company address when it changes
  useEffect(() => {
    if (useCompanyAddress && companyAddress) {
      validateCompanyAddress();
    }
  }, [useCompanyAddress, companyAddress]);

  // Initialize: If value already exists on mount and hasn't been validated yet, validate it
  useEffect(() => {
    if (!hasInitialized.current && value && !validatedAddressRef.current) {
      hasInitialized.current = true;
      console.log('🔄 Initial address validation on mount:', value);
      // Validate the initial address
      (async () => {
        setValidating(true);
        const valid = await validateAddress(value);
        console.log('📍 Initial validation result:', valid);
        if (valid) {
          validatedAddressRef.current = value;
          selectedFromDropdownRef.current = true; // Treat pre-filled address as valid
        }
        setIsValid(valid);
        onValidation(valid);
        setValidating(false);
      })();
    }
  }, [value, validateAddress, onValidation]);

  // Watch for value changes from parent and preserve validation if it's the same validated address
  useEffect(() => {
    console.log('📝 Value changed from parent:', value, 'validated:', validatedAddressRef.current);
    if (value && validatedAddressRef.current === value && selectedFromDropdownRef.current) {
      console.log('✅ Value matches validated address - keeping it valid');
      // Don't let it go back to invalid
      if (isValid !== true) {
        setIsValid(true);
        onValidation(true);
      }
    }
  }, [value, isValid, onValidation]);

  const effectiveValue = useCompanyAddress ? companyAddress || '' : value;

  return (
    <div>
      <Label htmlFor="address">
        {label ?? t('address.defaultLabel')} {required && '*'}
      </Label>
      <div className="relative mt-2">
        <Input
          ref={inputRef}
          id="address"
          value={effectiveValue}
          onChange={(e) => {
            if (!useCompanyAddress) {
              const newValue = e.target.value;
              onChange(newValue);
              if (newValue !== validatedAddressRef.current) {
                selectedFromDropdownRef.current = false;
                validatedAddressRef.current = '';
                setIsValid(null);
              }
            }
          }}
          onFocus={enableAutocomplete}
          onPointerDown={enableAutocomplete}
          onBlur={handleBlur}
          placeholder={useCompanyAddress ? t('address.useCompanyPlaceholder') : t('address.typePlaceholder')}
          disabled={useCompanyAddress}
          className={
            isValid === true ? 'border-green-500' :
              isValid === false ? 'border-red-500' : ''
          }
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {validating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {!validating && isValid === true && <CheckCircle className="w-4 h-4 text-green-500" />}
          {!validating && isValid === false && <XCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>
      {isValid === false && (
        <p className="text-sm text-red-500 mt-1">
          {t('address.invalid')}
        </p>
      )}
      {isValid === true && (
        <p className="text-sm text-green-600 mt-1">
          {t('address.verified')}
        </p>
      )}
    </div>
  );
}
