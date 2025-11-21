'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Briefcase, UserCircle, CheckCircle2, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default function JoinPage() {
  const router = useRouter()

  const features = {
    customer: [
      'Find verified property professionals',
      'Get custom quotes instantly',
      'Book services with confidence',
      'Track project progress',
      'Rate and review professionals',
      'Secure payment protection'
    ],
    professional: [
      'Reach thousands of customers',
      'Manage your projects easily',
      'Build your professional profile',
      'Accept bookings online',
      'Flexible schedule management',
      'Grow your business'
    ]
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234F46E5' fill-opacity='0.2'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      {/* Header */}
      <div className="relative z-10 container mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-8 hover:bg-white/50">
            ← Back to Home
          </Button>
        </Link>
      </div>

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 pb-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 rounded-full text-blue-700 font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            Join Fixera Today
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
            How would you like to join?
          </h1>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose your path and start your journey with Europe&apos;s leading property services platform
          </p>
        </div>

        {/* Role selection cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Customer Card */}
          <Card className="relative overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-all duration-300 hover:shadow-2xl group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-purple-400/20 blur-3xl group-hover:scale-150 transition-transform duration-500" />

            <CardHeader className="relative z-10">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UserCircle className="h-8 w-8 text-white" />
              </div>

              <CardTitle className="text-3xl font-bold text-gray-900">
                I&apos;m a Customer
              </CardTitle>

              <CardDescription className="text-lg text-gray-600 mt-2">
                Looking for trusted professionals to help with property services
              </CardDescription>
            </CardHeader>

            <CardContent className="relative z-10 space-y-6">
              <div className="space-y-3">
                {features.customer.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => router.push('/signup/customer')}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-lg group/btn"
                size="lg"
              >
                Join as Customer
                <ArrowRight className="ml-2 h-5 w-5 group-hover/btn:translate-x-1 transition-transform" />
              </Button>

              <p className="text-sm text-center text-gray-500">
                Free to join • No credit card required
              </p>
            </CardContent>
          </Card>

          {/* Professional Card */}
          <Card className="relative overflow-hidden border-2 border-gray-200 hover:border-purple-500 transition-all duration-300 hover:shadow-2xl group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-pink-400/20 blur-3xl group-hover:scale-150 transition-transform duration-500" />

            <CardHeader className="relative z-10">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Briefcase className="h-8 w-8 text-white" />
              </div>

              <CardTitle className="text-3xl font-bold text-gray-900">
                I&apos;m a Professional
              </CardTitle>

              <CardDescription className="text-lg text-gray-600 mt-2">
                Ready to offer my property services and grow my business
              </CardDescription>
            </CardHeader>

            <CardContent className="relative z-10 space-y-6">
              <div className="space-y-3">
                {features.professional.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => router.push('/register')}
                className="w-full h-12 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold text-lg group/btn"
                size="lg"
              >
                Join as Professional
                <ArrowRight className="ml-2 h-5 w-5 group-hover/btn:translate-x-1 transition-transform" />
              </Button>

              <p className="text-sm text-center text-gray-500">
                Free to join • Start getting bookings today
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <p className="text-gray-600 mb-4">
            Already have an account?
          </p>
          <Button
            onClick={() => router.push('/login')}
            variant="outline"
            size="lg"
            className="border-2 hover:bg-white/50"
          >
            Sign In
          </Button>
        </div>

        {/* Trust indicators */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">10K+</div>
            <div className="text-sm text-gray-600">Active Professionals</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">50K+</div>
            <div className="text-sm text-gray-600">Projects Completed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">4.8★</div>
            <div className="text-sm text-gray-600">Average Rating</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">20+</div>
            <div className="text-sm text-gray-600">Countries Served</div>
          </div>
        </div>
      </div>
    </div>
  )
}
