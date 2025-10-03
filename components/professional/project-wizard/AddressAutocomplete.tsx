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
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const { isLoaded, validateAddress } = useGoogleMaps();

  // Initialize autocomplete
  useEffect(() => {
    if (!isLoaded || !inputRef.current || useCompanyAddress) return;

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['address']
    });

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace();
      if (place?.formatted_address) {
        onChange(place.formatted_address);
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

  // Validate on blur
  const handleBlur = async () => {
    const addressToValidate = useCompanyAddress ? companyAddress : value;

    if (!addressToValidate) {
      setIsValid(false);
      onValidation(false);
      return;
    }

    setValidating(true);
    const valid = await validateAddress(addressToValidate);
    setIsValid(valid);
    onValidation(valid);
    setValidating(false);
  };

  // Validate company address when it changes
  useEffect(() => {
    if (useCompanyAddress && companyAddress) {
      handleBlur();
    }
  }, [useCompanyAddress, companyAddress]);

  const effectiveValue = useCompanyAddress ? companyAddress || '' : value;

  return (
    <div>
      <Label htmlFor="address">
        {label} {required && '*'}
      </Label>
      <div className="relative">
        <Input
          ref={inputRef}
          id="address"
          value={effectiveValue}
          onChange={(e) => {
            if (!useCompanyAddress) {
              onChange(e.target.value);
              setIsValid(null);
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
