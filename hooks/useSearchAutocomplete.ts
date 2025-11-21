import { useState, useEffect, useCallback } from 'react';

export interface Suggestion {
  type: string;
  value: string;
  label: string;
}

interface UseSearchAutocompleteOptions {
  searchType: 'professionals' | 'projects';
  minQueryLength?: number;
  debounceMs?: number;
}

export const useSearchAutocomplete = (
  query: string,
  options: UseSearchAutocompleteOptions
) => {
  const { searchType, minQueryLength = 2, debounceMs = 300 } = options;
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < minQueryLength) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        type: searchType,
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/search/autocomplete?${params.toString()}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = (await response.json()) as { suggestions?: Suggestion[] };
        setSuggestions(data.suggestions ?? []);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchType, minQueryLength]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs, fetchSuggestions]);

  return { suggestions, isLoading };
};
