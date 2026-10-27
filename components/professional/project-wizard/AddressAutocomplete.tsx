'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { shouldSkipBlurCommit } from "@/lib/address/blurCommitGuard";

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
  // Monotonic versions: a blur must never overwrite a newer dropdown selection.
  const inputVersionRef = useRef(0);
  const selectionVersionRef = useRef(0);
  // True while a pointer is down inside the Google suggestion dropdown. The
  // dropdown commits on mousedown (before input blur), so a blur observed in
  // this window belongs to a selection in flight and must be skipped — the
  // place_changed commit below is the single writer.
  const dropdownPointerDownRef = useRef(false);
  const { isLoaded, loadGoogleMaps, validateAddress, geocodeAddress } = useGoogleMaps();
  const hasInitialized = useRef(false);

  const enableAutocomplete = useCallback(() => {
    if (!useCompanyAddress) {
      void loadGoogleMaps();
    }
  }, [loadGoogleMaps, useCompanyAddress]);

  // Eager-load Maps as soon as the field mounts so the first click already
  // has suggestions. Focus/pointer-down remain as a backup trigger.
  useEffect(() => {
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
        selectionVersionRef.current = inputVersionRef.current + 1;
        inputVersionRef.current = selectionVersionRef.current;
        dropdownPointerDownRef.current = false;
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
    // A pointer-down inside the Google suggestion dropdown precedes both the
    // input blur and place_changed: the blur belongs to a selection in
    // flight, so skip it — place_changed commits once with full placeData.
    // A selection committed mid-validation (version drift) or already
    // committed for this input wins the same way.
    const inputVersionAtBlur = inputVersionRef.current;
    const dropdownPointerArmed = dropdownPointerDownRef.current;
    dropdownPointerDownRef.current = false;
    if (shouldSkipBlurCommit({
      dropdownPointerArmed,
      inputVersionAtBlur,
      currentInputVersion: inputVersionRef.current,
      selectionCommitted: selectedFromDropdownRef.current,
    })) {
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
    // A dropdown selection committed while validation was in flight wins:
    // never let this stale blur path overwrite its onChange(placeData).
    if (shouldSkipBlurCommit({
      dropdownPointerArmed: dropdownPointerDownRef.current,
      inputVersionAtBlur,
      currentInputVersion: inputVersionRef.current,
      selectionCommitted: false,
    })) {
      setValidating(false);
      return;
    }

    if (valid) {
      validatedAddressRef.current = addressToValidate;

      try {
        const mapsReady = isLoaded || await loadGoogleMaps();
        const coordinates = mapsReady ? await geocodeAddress(addressToValidate) : null;

        if (inputVersionAtBlur !== inputVersionRef.current) {
          setValidating(false);
          return;
        }
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
        if (inputVersionAtBlur !== inputVersionRef.current) { setValidating(false); return; }
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

  // Track pointer-downs inside the Google suggestion dropdown so the
  // subsequent blur is recognized as a selection in flight (the dropdown
  // commits on mousedown, before blur/place_changed ordering is guaranteed).
  useEffect(() => {
    if (useCompanyAddress || typeof document === 'undefined') return;
    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      if (document.activeElement === inputRef.current && target && typeof target.closest === 'function' && target.closest('.pac-container')) {
        dropdownPointerDownRef.current = true;
      }
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [useCompanyAddress]);

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
              dropdownPointerDownRef.current = false;
              inputVersionRef.current += 1;
              onChange(newValue);
              if (newValue !== validatedAddressRef.current) {
                selectedFromDropdownRef.current = false;
                validatedAddressRef.current = '';
                setIsValid(null);
              }
            }
          }}
          onFocus={() => { dropdownPointerDownRef.current = false; enableAutocomplete(); }}
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
