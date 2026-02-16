'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, User, Mail, Phone, Lock, Shield } from "lucide-react"
import { toast } from "sonner"
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import DualVerificationComponent from '@/components/DualVerificationComponent'
import { EU_COUNTRIES } from '@/lib/countries'
import { isValidPhoneNumber } from 'libphonenumber-js'

interface FormData {
  name: string
  email: string
  phone: string
  countryCode: string
  password: string
  confirmPassword: string
}

export default function RegisterPage() {
  const [currentStep, setCurrentStep] = useState<'form' | 'verification'>('form')
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    countryCode: '+32',
    password: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const { signup } = useAuth()
  const router = useRouter()

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error('Please enter your full name')
      return false
    }

    if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) {
      toast.error('Please enter a valid email address')
      return false
    }

    if (!formData.phone.trim() || !isValidPhoneNumber(formData.countryCode + formData.phone)) {
      toast.error('Please enter a valid phone number')
      return false
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters long')
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setLoading(true)
    try {
      const success = await signup({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.countryCode + formData.phone.trim(),
        password: formData.password,
        role: 'professional'
      })

      if (success) {
        setCurrentStep('verification')
      }
    } catch (error) {
      console.error('Registration error:', error)
    } finally {
      setLoading(false)
    }
  }
  const handleVerificationSuccess = () => {
    toast.success('Account verified successfully!')
    router.push('/profile?welcome=true')
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (currentStep === 'verification') {
    return (
      <DualVerificationComponent
        email={formData.email}
        phone={formData.countryCode + formData.phone}
        onVerificationSuccess={handleVerificationSuccess}
        onBack={() => setCurrentStep('form')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Link href="/">
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-6 left-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <Shield className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">Create Your Account</CardTitle>
            <CardDescription className="text-gray-600">
              Join thousands of satisfied customers and professionals on Fixera
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.countryCode}
                    onValueChange={(value) => handleInputChange('countryCode', value)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EU_COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.dialCode}>
                          {country.flag} {country.dialCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Enter your phone number"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Professional Info */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700 font-medium">Welcome, Professional!</p>
                <p className="text-xs text-blue-600 mt-1">
                  After verification, you&apos;ll complete your business profile including VAT validation and ID verification.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>

            <div className="text-center text-sm text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500">
                Sign in here
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
