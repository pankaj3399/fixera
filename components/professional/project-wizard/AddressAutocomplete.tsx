'use client'

import { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
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
  label = "Service Address",
  required = false
}: AddressAutocompleteProps) {
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const selectedFromDropdownRef = useRef(false);
  const validatedAddressRef = useRef<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const { isLoaded, validateAddress } = useGoogleMaps();
  const hasInitialized = useRef(false);

  // Initialize autocomplete
  useEffect(() => {
    if (!isLoaded || !inputRef.current || useCompanyAddress) return;

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['address']
    });

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace();
      if (place?.formatted_address) {
        console.log('✅ Address selected from dropdown:', place.formatted_address);
        onChange(place.formatted_address);
        selectedFromDropdownRef.current = true;
        validatedAddressRef.current = place.formatted_address;
        setIsValid(true);
        onValidation(true);
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

    console.log('🔍 handleBlur - validating manually typed address:', addressToValidate);

    if (!addressToValidate) {
      console.log('❌ Empty address');
      setIsValid(false);
      onValidation(false);
      return;
    }

    // Validate manually typed address using Google Maps API
    console.log('🌐 Validating address via API...');
    setValidating(true);
    const valid = await validateAddress(addressToValidate);
    console.log('📍 Validation result:', valid);

    if (valid) {
      validatedAddressRef.current = addressToValidate;
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

  const validateCompanyAddress = async () => {
    if (!companyAddress) return;

    setValidating(true);
    const valid = await validateAddress(companyAddress);
    setIsValid(valid);
    onValidation(valid);
    setValidating(false);
  };

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
  }, []);

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
        {label} {required && '*'}
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
              // Only reset validation state if user is actually typing (not from dropdown update)
              if (newValue !== validatedAddressRef.current) {
                console.log('⌨️ User typing - resetting validation');
                selectedFromDropdownRef.current = false;
                validatedAddressRef.current = '';
                setIsValid(null);
              }
            }
          }}
          onBlur={handleBlur}
          placeholder={useCompanyAddress ? "Using company address..." : "Start typing address..."}
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
          Please enter a valid address
        </p>
      )}
      {isValid === true && (
        <p className="text-sm text-green-600 mt-1">
          Address verified ✓
        </p>
      )}
    </div>
  );
}
