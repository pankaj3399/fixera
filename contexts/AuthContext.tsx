'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface User {
  _id: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'visitor' | 'customer' | 'professional' | 'employee'
  isEmailVerified: boolean
  isPhoneVerified: boolean
  vatNumber?: string
  isVatVerified?: boolean
  idProofUrl?: string
  idProofFileName?: string
  idProofUploadedAt?: string
  isIdVerified?: boolean
  professionalStatus?: 'pending' | 'approved' | 'rejected' | 'suspended'
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  businessInfo?: {
    companyName?: string
    description?: string
    website?: string
    address?: string
    city?: string
    country?: string
    postalCode?: string
    timezone?: string
  }
  hourlyRate?: number
  currency?: string
  serviceCategories?: string[]
  availability?: {
    monday?: { available: boolean; startTime?: string; endTime?: string }
    tuesday?: { available: boolean; startTime?: string; endTime?: string }
    wednesday?: { available: boolean; startTime?: string; endTime?: string }
    thursday?: { available: boolean; startTime?: string; endTime?: string }
    friday?: { available: boolean; startTime?: string; endTime?: string }
    saturday?: { available: boolean; startTime?: string; endTime?: string }
    sunday?: { available: boolean; startTime?: string; endTime?: string }
  }
  blockedDates?: {
    date: string;
    reason?: string;
  }[]
  blockedRanges?: {
    startDate: string;
    endDate: string;
    reason?: string;
  }[]
  // Company availability
  companyAvailability?: {
    monday?: { available: boolean; startTime?: string; endTime?: string }
    tuesday?: { available: boolean; startTime?: string; endTime?: string }
    wednesday?: { available: boolean; startTime?: string; endTime?: string }
    thursday?: { available: boolean; startTime?: string; endTime?: string }
    friday?: { available: boolean; startTime?: string; endTime?: string }
    saturday?: { available: boolean; startTime?: string; endTime?: string }
    sunday?: { available: boolean; startTime?: string; endTime?: string }
  }
  companyBlockedDates?: {
    date: string;
    reason?: string;
    isHoliday?: boolean;
  }[]
  companyBlockedRanges?: {
    startDate: string;
    endDate: string;
    reason?: string;
    isHoliday?: boolean;
  }[]
  location?: {
    type: 'Point'
    coordinates: [number, number] // [longitude, latitude]
    address?: string
    city?: string
    country?: string
    postalCode?: string
  }
  customerType?: 'individual' | 'business'
  profileCompletedAt?: string
  createdAt: string
  updatedAt: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<boolean>
  signup: (userData: SignupData) => Promise<boolean>
  logout: () => Promise<void>
  checkAuth: () => Promise<User | null>
  isAuthenticated: boolean
}

interface SignupData {
  name: string
  email: string
  phone: string
  password: string
  role?: 'customer' | 'professional'
}

const AUTH_TOKEN_KEY = 'authToken'

// Route Configuration
const ROUTE_CONFIG = {
  // Public routes - accessible to everyone
  PUBLIC: [
    '/',
    '/about',
    '/privacy-policy',
    '/professionals',
    '/services',
    '/search',
    '/categories',
  ],

  // Auth routes - only accessible when NOT authenticated
  AUTH: [
    '/login',
    '/register',
    '/join',
    '/forgot-password',
    '/reset-password',
    '/signup',
  ],

  // Protected routes - require authentication (any role)
  PROTECTED: [
    '/dashboard',
    '/profile',
    '/bookings',
  ],

  // Role-based routes - require specific roles
  ROLE_BASED: {
    admin: ['/admin'],
    professional: ['/professional', '/projects/create'],
    employee: ['/professional', '/projects/create'],
  } as Record<string, string[]>
  // Note: /professional covers /professional/earnings, /professional/projects/*, etc.
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper functions for route checking
const isPublicRoute = (pathname: string): boolean => {
  // Check standard public routes
  const isStandardPublic = ROUTE_CONFIG.PUBLIC.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )
  if (isStandardPublic) return true

  // Special case: /projects/[id] is public for viewing (but NOT /projects/create)
  if (pathname.startsWith('/projects/') && !pathname.startsWith('/projects/create')) {
    return true
  }

  return false
}

const isAuthRoute = (pathname: string): boolean => {
  return ROUTE_CONFIG.AUTH.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )
}

const isProtectedRoute = (pathname: string): boolean => {
  return ROUTE_CONFIG.PROTECTED.some(route => 
    pathname.startsWith(route)
  )
}

// Returns all roles that have access to this route
const getAllowedRoles = (pathname: string): string[] => {
  const allowedRoles: string[] = []
  for (const [role, routes] of Object.entries(ROUTE_CONFIG.ROLE_BASED)) {
    const hasAccess = routes.some(route => pathname.startsWith(route))
    if (hasAccess) {
      allowedRoles.push(role)
    }
  }
  return allowedRoles
}

// Check if a user's role has access to the route
const hasRoleAccess = (userRole: string, pathname: string): boolean => {
  // Admin has access to everything
  if (userRole === 'admin') return true

  const allowedRoles = getAllowedRoles(pathname)

  // If no role restrictions, anyone authenticated can access
  if (allowedRoles.length === 0) return true

  // Check if user's role is in the allowed list
  return allowedRoles.includes(userRole)
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const getStoredToken = () => {
    if (typeof window === 'undefined') {
      return null
    }
    return window.localStorage.getItem(AUTH_TOKEN_KEY)
  }

  const persistToken = (token?: string | null) => {
    if (typeof window === 'undefined') {
      return
    }

    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  }

  const checkAuth = async () => {
    try {
      const token = getStoredToken()
      const headers: Record<string, string> = {}

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/me`, {
        credentials: 'include',
        headers: Object.keys(headers).length ? headers : undefined
      })
      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        return data.user
      } else {
        setUser(null)
        persistToken(null)
        return null
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setUser(null)
      persistToken(null)
      return null
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setUser(data.user)
        persistToken(data.token)
        toast.success('Login successful!')
        
        // Handle redirect after successful login
        const intendedPath = sessionStorage.getItem('redirectAfterAuth')
        if (intendedPath && intendedPath !== pathname) {
          sessionStorage.removeItem('redirectAfterAuth')
          router.push(intendedPath)
        } else {
          // Default redirect based on role
          const dashboardPath = '/dashboard'
          router.push(dashboardPath)
        }
        
        return true
      } else {
        toast.error(data.msg || 'Login failed')
        return false
      }
    } catch (error) {
      console.error('Login error:', error)
      toast.error('Login failed. Please try again.')
      return false
    }
  }

  const signup = async (userData: SignupData): Promise<boolean> => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setUser(data.user)
        persistToken(data.token)
        toast.success('Account created successfully!')
        
        if (data.welcomeEmailSent) {
          setTimeout(() => {
            toast.success('📧 Welcome email sent! Check your inbox to get started.', {
              duration: 4000,
            })
          }, 1000)
        }
        
        return true
      } else {
        toast.error(data.msg || 'Signup failed')
        return false
      }
    } catch (error) {
      console.error('Signup error:', error)
      toast.error('Signup failed. Please try again.')
      return false
    }
  }

  const logout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      persistToken(null)
      sessionStorage.removeItem('redirectAfterAuth')
      toast.success('Logged out successfully')
      router.push('/login')
    }
  }

  // Middleware-like logic for route protection
  const handleRouteProtection = async (currentUser: User | null) => {
    const isUserAuthenticated = !!currentUser

    // Check if this is a role-restricted route
    const allowedRoles = getAllowedRoles(pathname)
    const isRoleRestrictedRoute = allowedRoles.length > 0

    // Handle protected routes (require authentication)
    if (isProtectedRoute(pathname) || isRoleRestrictedRoute) {
      if (!isUserAuthenticated) {
        // Store the intended path for redirect after login
        sessionStorage.setItem('redirectAfterAuth', pathname)
        router.replace('/login')
        return
      }

      // Check role-based access for role-restricted routes
      if (isRoleRestrictedRoute && !hasRoleAccess(currentUser.role, pathname)) {
        toast.error('You do not have permission to access this page')
        router.replace('/dashboard?unauthorized=true')
        return
      }
    }
  }

  // Initial auth check and route protection
  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true)

      // Check if this route has role restrictions (takes priority over public routes)
      const allowedRoles = getAllowedRoles(pathname)
      const isRoleRestrictedRoute = allowedRoles.length > 0
      const needsProtection = isRoleRestrictedRoute || isProtectedRoute(pathname) || !isPublicRoute(pathname)

      // Always check auth on first load to properly show user state in navbar
      // On subsequent navigations to truly public routes, we can skip if already initialized
      const skipAuthCheck = isInitialized && !needsProtection

      let currentUser = user

      if (!skipAuthCheck) {
        currentUser = await checkAuth()
      } else {
        setLoading(false)
      }

      // Apply route protection logic for protected/role-restricted routes
      if (needsProtection) {
        await handleRouteProtection(currentUser)
      }

      setIsInitialized(true)
    }

    initializeAuth()
  }, [pathname]) // Re-run on pathname change

  // Handle route protection when user state changes
  useEffect(() => {
    if (isInitialized && !loading) {
      handleRouteProtection(user)
    }
  }, [user, isInitialized, loading])

  const value: AuthContextType = {
    user,
    loading,
    login,
    signup,
    logout,
    checkAuth,
    isAuthenticated: !!user,
  }

  const isPublic = isPublicRoute(pathname)
  const isAuth = isAuthRoute(pathname)
  const shouldBlockRender = loading && (!isPublic || pathname === '/') && !isAuth

  return (
    <AuthContext.Provider value={value}>
      {shouldBlockRender ? <AuthLoadingScreen /> : children}
    </AuthContext.Provider>
  )
}

// Loading Component
export const AuthLoadingScreen: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
)

