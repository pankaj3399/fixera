'use client';

import React, { useRef, useEffect } from 'react';
import { Loader2, Search, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Suggestion } from '@/hooks/useSearchAutocomplete';

interface SearchAutocompleteProps {
  suggestions: Suggestion[];
  isLoading: boolean;
  onSelect: (suggestion: Suggestion) => void;
  isOpen: boolean;
  onClose: () => void;
}

const SearchAutocomplete = ({
  suggestions,
  isLoading,
  onSelect,
  isOpen,
  onClose,
}: SearchAutocompleteProps) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin mr-2" />
          <span className="text-gray-600">Loading suggestions...</span>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-6 text-center text-gray-500">
          No suggestions found
        </div>
      ) : (
        <ul className="py-2">
          {suggestions.map((suggestion, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => {
                  onSelect(suggestion);
                  onClose();
                }}
                className={cn(
                  "w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3",
                  "focus:bg-gray-50 focus:outline-none"
                )}
              >
                {suggestion.type === 'category' ? (
                  <Tag className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {suggestion.label}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">
                    {suggestion.type}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchAutocomplete;
