import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the auth token from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('authToken')
}

/**
 * Get fetch options with authentication headers
 * Includes both credentials (for cookies) and Authorization header (for Bearer token fallback)
 */
export function getAuthFetchOptions(additionalHeaders?: Record<string, string>): RequestInit {
  const token = getAuthToken()
  const headers: Record<string, string> = { ...additionalHeaders }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return {
    credentials: 'include' as RequestCredentials,
    headers: Object.keys(headers).length > 0 ? headers : undefined
  }
}

/**
 * Authenticated fetch helper - includes both cookie and Bearer token
 */
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers: Record<string, string> = {}

  // Merge any existing headers
  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      Object.assign(headers, options.headers)
    }
  }

  // Add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined
  })
}
