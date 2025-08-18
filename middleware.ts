import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Define protected routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/profile',
  '/settings',
  '/professional',
  '/services',
  '/bookings',
  '/earnings'
]

// Define public routes that don't require authentication
const publicRoutes = [
  '/',
  '/login',
  '/register',
  '/join',
  '/about',
  '/privacy-policy',
  '/verify-phone',
  '/forgot-password',
  '/reset-password'
]

// Define auth routes that should redirect to dashboard if already authenticated
const authRoutes = [
  '/login',
  '/register',
  '/join'
]

// Define role-based protected routes
const roleBasedRoutes: Record<string, string[]> = {
  admin: ['/admin'],
  professional: ['/professional', '/services', '/earnings'],
  customer: ['/bookings']
}

// Helper function to verify JWT token
async function verifyToken(token: string): Promise<{ valid: boolean; payload?: any; expired?: boolean }> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    return { valid: true, payload }
  } catch (error: any) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      return { valid: false, expired: true }
    }
    return { valid: false, expired: false }
  }
}

// Helper function to get user data from API (optional, for role checking)
async function getUserData(token: string, request: NextRequest): Promise<any> {
  try {
    const response = await fetch(new URL('/api/auth/me', request.url), {
      headers: {
        'Cookie': `auth-token=${token}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      return data.user
    }
  } catch (error) {
    console.error('Error fetching user data:', error)
  }
  
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Get token from cookies
  const token = request.cookies.get('auth-token')?.value

  // If user visits landing page and already has a valid token, redirect to dashboard
  if (pathname === '/') {
    if (token) {
      const verification = await verifyToken(token)
      if (verification.valid && !verification.expired) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      if (!verification.valid || verification.expired) {
        const response = NextResponse.next()
        response.cookies.delete('auth-token')
        return response
      }
    }
    return NextResponse.next()
  }
  
  // Check if the current path matches different route types
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  )
  
  const isAuthRoute = authRoutes.some(route => 
    pathname.startsWith(route)
  )
  
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )

  // Handle token validation for protected routes
  if (isProtectedRoute || isAuthRoute) {
    if (token) {
      const verification = await verifyToken(token)
      
      // If token is expired, clear it and redirect to login
      if (verification.expired) {
        const response = isProtectedRoute 
          ? NextResponse.redirect(new URL('/login?expired=true', request.url))
          : NextResponse.redirect(new URL('/dashboard', request.url))
        
        // Clear the expired cookie
        response.cookies.delete('auth-token')
        return response
      }
      
      // If token is invalid, clear it and redirect to login
      if (!verification.valid) {
        const response = isProtectedRoute 
          ? NextResponse.redirect(new URL('/login?invalid=true', request.url))
          : NextResponse.redirect(new URL('/dashboard', request.url))
        
        // Clear the invalid cookie
        response.cookies.delete('auth-token')
        return response
      }
      
      // Token is valid - handle route-specific logic
      if (isAuthRoute) {
        // User is authenticated and trying to access auth routes - redirect to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      
      // For protected routes, check role-based access
      if (isProtectedRoute) {
        // Check if route requires specific role
        for (const [role, routes] of Object.entries(roleBasedRoutes)) {
          const requiresRole = routes.some(route => pathname.startsWith(route))
          
          if (requiresRole) {
            // Get user data to check role (you might want to include role in JWT payload instead)
            const userData = await getUserData(token, request)
            
            if (!userData || userData.role !== role) {
              return NextResponse.redirect(new URL('/dashboard?unauthorized=true', request.url))
            }
          }
        }
        
        // User has valid token and appropriate role - continue
        return NextResponse.next()
      }
    } else {
      // No token present
      if (isProtectedRoute) {
        // Redirect to login with the current path as redirect parameter
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
      }
      
      if (isAuthRoute) {
        // No token and accessing auth route - allow access
        return NextResponse.next()
      }
    }
  }
  
  // Handle public routes and other cases
  if (isPublicRoute) {
    return NextResponse.next()
  }
  
  // For any other routes not explicitly defined, treat as protected
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }
  
  // Verify token for other routes
  const verification = await verifyToken(token)
  if (!verification.valid) {
    const response = NextResponse.redirect(new URL('/login?session=expired', request.url))
    response.cookies.delete('auth-token')
    return response
  }
  
  // All checks passed - continue
  return NextResponse.next()
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - images, icons, etc.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public|images|icons|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$).*)',
  ],
}