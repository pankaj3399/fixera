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

    // Load Google Maps script from backend (public endpoint)
    const loadGoogleMapsScript = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/google-maps-config`);

        if (!response.ok) {
          throw new Error('Failed to get Google Maps configuration');
        }

        const data = await response.json();

        if (data.success && data.scriptUrl) {
          const script = document.createElement('script');
          script.src = data.scriptUrl;
          script.async = true;
          script.onload = () => setIsLoaded(true);
          script.onerror = () => {
            console.error('Failed to load Google Maps');
            setIsLoaded(false);
          };
          document.head.appendChild(script);
        }
      } catch (error) {
        console.error('Failed to load Google Maps configuration:', error);
        setIsLoaded(false);
      }
    };

    loadGoogleMapsScript();

    return () => {
      // Cleanup if needed
    };
  }, []);

  const validateAddress = async (address: string): Promise<boolean> => {
    if (!address) return false;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/validate-address`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ address })
        }
      );

      const data = await response.json();
      return data.success && data.isValid;
    } catch (error) {
      console.error('Address validation error:', error);
      return false;
    }
  };

  return { isLoaded, validateAddress };
};
