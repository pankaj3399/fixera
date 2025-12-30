import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const AUTH_TOKEN_KEY = 'authToken'
const AUTH_TOKEN_ISSUED_AT_KEY = 'authTokenIssuedAt'
const FALLBACK_TOKEN_TTL_MS = 1000 * 60 * 60 * 24

const parseJwtExpiry = (token: string): number | null => {
  if (typeof window === 'undefined') return null
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = atob(padded)
    const parsed = JSON.parse(decoded) as { exp?: number }
    return typeof parsed.exp === 'number' ? parsed.exp * 1000 : null
  } catch {
    return null
  }
}

const clearAuthToken = () => {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_TOKEN_ISSUED_AT_KEY)
}

/**
 * Get the auth token from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) return null

  const jwtExpiry = parseJwtExpiry(token)
  if (jwtExpiry && Date.now() >= jwtExpiry) {
    clearAuthToken()
    return null
  }

  const issuedAtRaw = localStorage.getItem(AUTH_TOKEN_ISSUED_AT_KEY)
  const issuedAt = issuedAtRaw ? Number(issuedAtRaw) : NaN
  if (!jwtExpiry && !Number.isFinite(issuedAt)) {
    localStorage.setItem(AUTH_TOKEN_ISSUED_AT_KEY, String(Date.now()))
    return token
  }
  if (Number.isFinite(issuedAt) && Date.now() - issuedAt > FALLBACK_TOKEN_TTL_MS) {
    clearAuthToken()
    return null
  }

  return token
}

export function setAuthToken(token?: string | null) {
  if (typeof window === 'undefined') return
  if (!token) {
    clearAuthToken()
    return
  }

  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.setItem(AUTH_TOKEN_ISSUED_AT_KEY, String(Date.now()))
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
    headers
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
    headers
  })
}
