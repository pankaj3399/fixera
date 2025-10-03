import { useState, useEffect } from 'react';

interface GoogleMapsHook {
  isLoaded: boolean;
  validateAddress: (address: string) => Promise<boolean>;
}

export const useGoogleMaps = (): GoogleMapsHook => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Check if already loaded
    if ((window as any).google?.maps) {
      setIsLoaded(true);
      return;
    }

    // Load Google Maps script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => setIsLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Google Maps');
      setIsLoaded(false);
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  const validateAddress = async (address: string): Promise<boolean> => {
    if (!address || !isLoaded) return false;

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      return data.status === 'OK' && data.results.length > 0;
    } catch (error) {
      console.error('Address validation error:', error);
      return false;
    }
  };

  return { isLoaded, validateAddress };
};
