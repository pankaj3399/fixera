'use client'

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Eye, EyeOff, User, Mail, Lock, Briefcase, Phone } from "lucide-react"
import { CountryCode, countryCodes } from "@/lib/helpers"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import DualVerificationComponent from "@/components/DualVerificationComponent"

interface FormData {
  name: string;
  email: string;
  countryCode: string;
  phone: string;
  password: string;
  role: string;
}

const JoinPage: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    countryCode: "+1",
    phone: "",
    password: "",
    role: "",
  })
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [showVerification, setShowVerification] = useState<boolean>(false)

  const { signup, user } = useAuth()
  const router = useRouter()

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error("Please enter your full name")
      return false
    }
    if (!formData.email.trim()) {
      toast.error("Please enter your email address")
      return false
    }
    if (!formData.phone.trim()) {
      toast.error("Please enter your phone number")
      return false
    }
    if (!formData.password.trim()) {
      toast.error("Please enter a password")
      return false
    }
    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters long")
      return false
    }
    if (!formData.role) {
      toast.error("Please select your role")
      return false
    }
    return true
  }

  const sendVerificationCodes = async (): Promise<void> => {
    setShowVerification(true)
  }

  const handleSubmit = async (): Promise<void> => {
    if (!validateForm()) return

    setIsLoading(true)

    try {
      const fullPhoneNumber = `${formData.countryCode}${formData.phone}`
      const submitData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: fullPhoneNumber,
        password: formData.password,
        role: formData.role as 'customer' | 'professional'
      }

      // Use the auth context register method
      const success = await signup(submitData)
      
      if (success) {
        toast.success("Account created successfully! We've sent verification codes to your email and phone.")
        await sendVerificationCodes()
      }
      
    } catch (error: any) {
      console.error("Submission error:", error)
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string): void => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleVerificationSuccess = (): void => {
    toast.success("Account verified successfully! Welcome to Fixera!")
    
    // Redirect based on user role
    if (user?.role === 'professional') {
      router.push('/dashboard/professional')
    } else if (user?.role === 'customer') {
      router.push('/dashboard/customer')
    } else {
      router.push('/dashboard')
    }
  }

  const handleBackToSignup = (): void => {
    setShowVerification(false)
  }

  // Show verification component if user is registered but not verified
  if (showVerification) {
    return (
      <DualVerificationComponent
        email={formData.email}
        phone={`${formData.countryCode}${formData.phone}`}
        onVerificationSuccess={handleVerificationSuccess}
        onBack={handleBackToSignup}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">Join Fixera</CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            Create your professional account to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Full Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">
                Phone Number
              </Label>
              <div className="flex gap-2">
                <div className="relative w-28">
                  <Select 
                    value={formData.countryCode} 
                    onValueChange={(value: string) => handleInputChange("countryCode", value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countryCodes.map((country: CountryCode) => (
                        <SelectItem key={country.code} value={country.code}>
                          <span className="flex items-center gap-4 ">
                            <span>{country.country}</span>
                            <span>{country.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Enter phone number"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value.replace(/\D/g, ''))} // Only allow numbers
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Password must be at least 6 characters long
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-sm font-medium">
                Professional Role
              </Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-3 h-4 w-4 text-gray-400 z-10" />
                <Select 
                  value={formData.role} 
                  onValueChange={(value: string) => handleInputChange("role", value)}
                >
                  <SelectTrigger className="pl-10">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !formData.name || !formData.email || !formData.phone || !formData.password || !formData.role}
            >
              {isLoading ? "Creating Account..." : "Create Account"}
            </Button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{" "}
              <a href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                Sign in
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default JoinPage