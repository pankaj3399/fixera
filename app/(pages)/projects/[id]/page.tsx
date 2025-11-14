'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, MapPin, Calendar, Users, CheckCircle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import ProjectBookingForm from '@/components/project/ProjectBookingForm'

interface Project {
  _id: string
  title: string
  description: string
  category: string
  service: string
  media: {
    images: string[]
    video?: string
  }
  distance: {
    address: string
    maxKmRange: number
  }
  resources: string[]
  subprojects: Array<{
    name: string
    description: string
    pricing: {
      type: 'fixed' | 'unit' | 'rfq'
      amount?: number
      priceRange?: { min: number; max: number }
    }
    included: Array<{
      name: string
      description?: string
    }>
    executionDuration: {
      value: number
      unit: 'hours' | 'days'
    }
    warrantyPeriod: {
      value: number
      unit: 'months' | 'years'
    }
  }>
  rfqQuestions: Array<{
    question: string
    type: 'text' | 'multiple_choice' | 'attachment'
    options?: string[]
    isRequired: boolean
  }>
  extraOptions: Array<{
    name: string
    description?: string
    price: number
  }>
  faq: Array<{
    question: string
    answer: string
  }>
  professionalId: {
    name: string
    businessInfo?: {
      companyName?: string
    }
    email: string
    phone: string
  }
}

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBookingForm, setShowBookingForm] = useState(false)

  const projectId = params.id as string

  useEffect(() => {
    fetchProject()
  }, [projectId])

  const fetchProject = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/projects/${projectId}`
      )
      const data = await response.json()

      if (data.success) {
        setProject(data.project)
      } else {
        toast.error('Project not found')
        router.push('/search')
      }
    } catch (error) {
      console.error('Error fetching project:', error)
      toast.error('Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const handleBookNow = () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to book this project')
      router.push(`/login?redirect=/projects/${projectId}`)
      return
    }

    if (user?.role !== 'customer') {
      toast.error('Only customers can book projects')
      return
    }

    setShowBookingForm(true)
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Project not found</p>
      </div>
    )
  }

  if (showBookingForm) {
    return (
      <ProjectBookingForm
        project={project}
        onBack={() => setShowBookingForm(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Link href="/search">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image Gallery */}
            {project.media.images.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="relative h-96 w-full">
                    <Image
                      src={project.media.images[0]}
                      alt={project.title}
                      fill
                      className="object-cover rounded-t-lg"
                    />
                  </div>
                  {project.media.images.length > 1 && (
                    <div className="grid grid-cols-4 gap-2 p-4">
                      {project.media.images.slice(1, 5).map((img, idx) => (
                        <div key={idx} className="relative h-24">
                          <Image
                            src={img}
                            alt={`${project.title} ${idx + 2}`}
                            fill
                            className="object-cover rounded"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Project Details */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-3xl mb-2">{project.title}</CardTitle>
                    <CardDescription className="text-base">
                      <Badge className="mb-2">{project.category}</Badge>
                      <Badge className="ml-2 mb-2" variant="outline">{project.service}</Badge>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-2">Description</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{project.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Service Area</p>
                      <p className="font-medium">{project.distance.maxKmRange} km radius</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Team Size</p>
                      <p className="font-medium">{project.resources.length} members</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subprojects/Packages */}
            <Card>
              <CardHeader>
                <CardTitle>Available Packages</CardTitle>
                <CardDescription>Choose from our service packages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.subprojects.map((subproject, idx) => (
                  <div key={idx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-lg">{subproject.name}</h4>
                        <p className="text-gray-600 text-sm mt-1">{subproject.description}</p>
                      </div>
                      <div className="text-right">
                        {subproject.pricing.type === 'fixed' && subproject.pricing.amount && (
                          <p className="text-2xl font-bold text-blue-600">
                            €{subproject.pricing.amount}
                          </p>
                        )}
                        {subproject.pricing.type === 'unit' && subproject.pricing.priceRange && (
                          <p className="text-xl font-bold text-blue-600">
                            €{subproject.pricing.priceRange.min} - €{subproject.pricing.priceRange.max}
                          </p>
                        )}
                        {subproject.pricing.type === 'rfq' && (
                          <Badge variant="outline">Request Quote</Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Included:</p>
                      <ul className="space-y-1">
                        {subproject.included.slice(0, 3).map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                            <span>{item.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex gap-4 text-sm text-gray-600 pt-2 border-t">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{subproject.executionDuration.value} {subproject.executionDuration.unit}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" />
                        <span>{subproject.warrantyPeriod.value} {subproject.warrantyPeriod.unit} warranty</span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* FAQ */}
            {project.faq.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Frequently Asked Questions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {project.faq.map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <h4 className="font-semibold">{item.question}</h4>
                      <p className="text-gray-600 text-sm">{item.answer}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Professional Info */}
            {project.professionalId && (
              <Card>
                <CardHeader>
                  <CardTitle>Provided By</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="font-semibold text-lg">
                      {project.professionalId.businessInfo?.companyName || project.professionalId.name}
                    </p>
                    {project.professionalId.email && (
                      <p className="text-sm text-gray-600">{project.professionalId.email}</p>
                    )}
                    {project.professionalId.phone && (
                      <p className="text-sm text-gray-600">{project.professionalId.phone}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Book Now Card */}
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Ready to Book?</CardTitle>
                <CardDescription>Get started with your project today</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleBookNow}
                  className="w-full h-12 text-lg bg-blue-600 hover:bg-blue-700"
                >
                  Book This Project
                </Button>
                <p className="text-xs text-center text-gray-500 mt-3">
                  {!isAuthenticated ? 'Sign in required to book' : 'Fill out the booking form to get started'}
                </p>
              </CardContent>
            </Card>

            {/* Extra Options */}
            {project.extraOptions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Add-On Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {project.extraOptions.map((option, idx) => (
                    <div key={idx} className="flex justify-between items-start text-sm">
                      <div>
                        <p className="font-medium">{option.name}</p>
                        {option.description && (
                          <p className="text-gray-600 text-xs">{option.description}</p>
                        )}
                      </div>
                      <p className="font-semibold text-blue-600">+€{option.price}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
