'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Upload, X, MapPin, Users, FileText, Star } from "lucide-react"

interface ProjectData {
  category?: string
  service?: string
  areaOfWork?: string
  distance?: {
    address: string
    useCompanyAddress: boolean
    maxKmRange: number
    noBorders: boolean
  }
  resources?: string[]
  projectType?: string[]
  description?: string
  priceModel?: string
  keywords?: string[]
  title?: string
  media?: {
    images: string[]
    video?: string
  }
}

interface Step1Props {
  data: ProjectData
  onChange: (data: ProjectData) => void
  onValidate: (isValid: boolean) => void
}

// Mock data - in real app, fetch from API
const CATEGORIES = [
  { id: 'exterior', name: 'Exterior', services: ['architect', 'demolition', 'roofing'] },
  { id: 'interior', name: 'Interior', services: ['plumber', 'electrician', 'painter'] },
  { id: 'outdoor', name: 'Outdoor work', services: ['garden', 'driveways', 'fences'] },
  { id: 'maintenance', name: 'Moving & small tasks', services: ['cleaning', 'handyman', 'moving'] },
  { id: 'inspections', name: 'Inspections', services: ['boiler', 'electrical', 'energy'] },
  { id: 'renovations', name: 'Large-scale renovation', services: ['full-renovation'] }
]

const PROJECT_TYPES = [
  'New installation', 'Repair', 'Maintenance', 'Replacement', 'Upgrade', 'Consultation'
]

const PRICE_MODELS = [
  { value: 'fixed', label: 'Fixed Price' },
  { value: 'hour', label: 'Per Hour' },
  { value: 'm2', label: 'Per m²' },
  { value: 'meter', label: 'Per Meter' },
  { value: 'day', label: 'Per Day' },
  { value: 'room', label: 'Per Room' }
]

export default function Step1BasicInfo({ data, onChange, onValidate }: Step1Props) {
  const [formData, setFormData] = useState<ProjectData>(data)
  const [keywordInput, setKeywordInput] = useState('')
  const [suggestedTitle, setSuggestedTitle] = useState('')

  useEffect(() => {
    onChange(formData)
    validateForm()
  }, [formData])

  const validateForm = () => {
    const isValid = !!(
      formData.category &&
      formData.service &&
      formData.description &&
      formData.description.length >= 100 &&
      formData.priceModel &&
      formData.distance?.address &&
      formData.distance?.maxKmRange &&
      formData.projectType?.length
    )
    onValidate(isValid)
  }

  const updateFormData = (updates: Partial<ProjectData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }

  const updateDistance = (updates: Partial<{ address: string; useCompanyAddress: boolean; maxKmRange: number; noBorders: boolean }>) => {
    setFormData(prev => ({
      ...prev,
      distance: {
        address: prev.distance?.address || '',
        useCompanyAddress: prev.distance?.useCompanyAddress || false,
        maxKmRange: prev.distance?.maxKmRange || 50,
        noBorders: prev.distance?.noBorders || false,
        ...updates
      }
    }))
  }

  const updateMedia = (updates: Partial<{ images: string[]; video?: string }>) => {
    setFormData(prev => ({
      ...prev,
      media: {
        images: prev.media?.images || [],
        video: prev.media?.video,
        ...updates
      }
    }))
  }

  const addKeyword = () => {
    if (keywordInput.trim() && !formData.keywords?.includes(keywordInput.trim())) {
      updateFormData({
        keywords: [...(formData.keywords || []), keywordInput.trim()]
      })
      setKeywordInput('')
    }
  }

  const removeKeyword = (keyword: string) => {
    updateFormData({
      keywords: formData.keywords?.filter(k => k !== keyword) || []
    })
  }

  const toggleProjectType = (type: string) => {
    const current = formData.projectType || []
    if (current.includes(type)) {
      updateFormData({
        projectType: current.filter(t => t !== type)
      })
    } else {
      updateFormData({
        projectType: [...current, type]
      })
    }
  }

  const generateTitle = async () => {
    if (!formData.service || !formData.description) return

    try {
      // Create a more intelligent title generation
      const serviceTitle = formData.service.charAt(0).toUpperCase() + formData.service.slice(1)
      const keywords = formData.keywords?.join(', ') || ''
      const projectTypes = formData.projectType?.join(', ') || ''

      // Generate multiple title variations
      const titleVariations = [
        `Expert ${serviceTitle} Services - ${formData.areaOfWork || 'Professional Solutions'}`,
        `Quality ${serviceTitle} - ${keywords ? keywords.split(',')[0] : 'Reliable'} & Professional`,
        `${serviceTitle} Specialist - ${projectTypes ? projectTypes.split(',')[0] : 'Complete'} Solutions`,
        `Professional ${serviceTitle} - Quality Work You Can Trust`,
        `${serviceTitle} Expert - ${formData.distance?.maxKmRange}km Range - Quality Guaranteed`
      ]

      // Simple AI-like selection based on content
      let bestTitle = titleVariations[0]

      // Prefer titles with keywords if available
      if (keywords) {
        bestTitle = titleVariations[1]
      }

      // Prefer titles with project types if available
      if (projectTypes && projectTypes.length > 5) {
        bestTitle = titleVariations[2]
      }

      // Ensure title is within length limits
      if (bestTitle.length > 90) {
        bestTitle = bestTitle.substring(0, 87) + '...'
      }

      if (bestTitle.length < 30) {
        bestTitle = `Professional ${serviceTitle} Services - Quality Work in ${formData.distance?.address || 'Your Area'}`
      }

      setSuggestedTitle(bestTitle)
    } catch (error) {
      console.error('Title generation error:', error)
      // Fallback to simple generation
      const serviceTitle = formData.service.charAt(0).toUpperCase() + formData.service.slice(1)
      setSuggestedTitle(`Professional ${serviceTitle} Services - Quality Work You Can Trust`)
    }
  }

  const useGeneratedTitle = () => {
    updateFormData({ title: suggestedTitle })
    setSuggestedTitle('')
  }

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return

    const maxFiles = 4
    const maxSize = 5 * 1024 * 1024 // 5MB
    const currentImages = formData.media?.images || []

    // Check if total files (current + new) exceed limit
    if (currentImages.length + files.length > maxFiles) {
      alert(`Maximum ${maxFiles} images allowed. You currently have ${currentImages.length} images. You can select ${maxFiles - currentImages.length} more.`)
      return
    }

    const validFiles = Array.from(files).filter(file => {
      if (file.size > maxSize) {
        alert(`File ${file.name} is too large. Maximum size is 5MB`)
        return false
      }

      if (!file.type.startsWith('image/')) {
        alert(`File ${file.name} is not an image`)
        return false
      }

      return true
    })

    // Process all valid files
    const newImages: string[] = []
    let processedCount = 0

    validFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) {
          newImages.push(e.target.result as string)
          processedCount++

          // Update state once all files are processed
          if (processedCount === validFiles.length) {
            updateMedia({ images: [...currentImages, ...newImages] })
          }
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const selectedCategory = CATEGORIES.find(cat => cat.id === formData.category)

  return (
    <div className="space-y-6">
      {/* Service Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Star className="w-5 h-5" />
            <span>Service Information</span>
          </CardTitle>
          <CardDescription>
            Select the category and specific service you want to offer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category || ''}
                onValueChange={(value) => updateFormData({ category: value, service: '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(category => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="service">Service *</Label>
              <Select
                value={formData.service || ''}
                onValueChange={(value) => updateFormData({ service: value })}
                disabled={!formData.category}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {selectedCategory?.services.map(service => (
                    <SelectItem key={service} value={service}>
                      {service.charAt(0).toUpperCase() + service.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="areaOfWork">Area of Work (Optional)</Label>
            <Input
              id="areaOfWork"
              value={formData.areaOfWork || ''}
              onChange={(e) => updateFormData({ areaOfWork: e.target.value })}
              placeholder="Specific area or sub-service"
            />
          </div>
        </CardContent>
      </Card>

      {/* Distance & Location */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MapPin className="w-5 h-5" />
            <span>Service Area</span>
          </CardTitle>
          <CardDescription>
            Define where you provide this service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="useCompanyAddress"
              checked={formData.distance?.useCompanyAddress || false}
              onCheckedChange={(checked) => updateDistance({ useCompanyAddress: checked as boolean })}
            />
            <Label htmlFor="useCompanyAddress">Use my company address</Label>
          </div>

          {!formData.distance?.useCompanyAddress && (
            <div>
              <Label htmlFor="address">Service Address *</Label>
              <Input
                id="address"
                value={formData.distance?.address || ''}
                onChange={(e) => updateDistance({ address: e.target.value })}
                placeholder="Enter address or area"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="maxKmRange">Maximum Range (km) *</Label>
              <Input
                id="maxKmRange"
                type="number"
                min="1"
                max="200"
                value={formData.distance?.maxKmRange || ''}
                onChange={(e) => updateDistance({ maxKmRange: parseInt(e.target.value) })}
                placeholder="50"
              />
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="noBorders"
                checked={formData.distance?.noBorders || false}
                onCheckedChange={(checked) => updateDistance({ noBorders: checked as boolean })}
              />
              <Label htmlFor="noBorders">Don&apos;t cross country borders</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project Type */}
      <Card>
        <CardHeader>
          <CardTitle>Project Type *</CardTitle>
          <CardDescription>
            Select all types of projects you can handle (check all that apply)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PROJECT_TYPES.map(type => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={type}
                  checked={formData.projectType?.includes(type) || false}
                  onCheckedChange={() => toggleProjectType(type)}
                />
                <Label htmlFor={type} className="text-sm">{type}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Description & Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="w-5 h-5" />
            <span>Project Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="description">Detailed Description *</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => updateFormData({ description: e.target.value })}
              placeholder="Describe your service in detail..."
              className="min-h-[120px]"
              maxLength={1300}
            />
            <p className="text-sm text-gray-500 mt-1">
              {formData.description?.length || 0}/1300 characters (minimum 100)
            </p>
          </div>

          <div>
            <Label htmlFor="priceModel">Price Model *</Label>
            <Select
              value={formData.priceModel || ''}
              onValueChange={(value) => updateFormData({ priceModel: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select pricing model" />
              </SelectTrigger>
              <SelectContent>
                {PRICE_MODELS.map(model => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Keywords */}
      <Card>
        <CardHeader>
          <CardTitle>Keywords/Tags</CardTitle>
          <CardDescription>
            Add keywords to help customers find your service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="Add keyword..."
              onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
            />
            <Button onClick={addKeyword} variant="outline">Add</Button>
          </div>

          {formData.keywords && formData.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.keywords.map(keyword => (
                <Badge key={keyword} variant="secondary" className="flex items-center space-x-1">
                  <span>{keyword}</span>
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-red-500"
                    onClick={() => removeKeyword(keyword)}
                  />
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Title Generation */}
      <Card>
        <CardHeader>
          <CardTitle>Project Title</CardTitle>
          <CardDescription>
            Generate or create a compelling title for your service (30-90 characters)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Button onClick={generateTitle} variant="outline" disabled={!formData.service || !formData.description}>
              Generate AI Title
            </Button>
            {suggestedTitle && (
              <Button onClick={useGeneratedTitle} variant="outline">
                Use Generated Title
              </Button>
            )}
          </div>

          {suggestedTitle && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900">Suggested Title:</p>
              <p className="text-blue-800">{suggestedTitle}</p>
            </div>
          )}

          <div>
            <Label htmlFor="title">Project Title *</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={(e) => updateFormData({ title: e.target.value })}
              placeholder="Enter project title..."
              minLength={30}
              maxLength={90}
            />
            <p className="text-sm text-gray-500 mt-1">
              {formData.title?.length || 0}/90 characters (minimum 30)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Media Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>Project Images</span>
          </CardTitle>
          <CardDescription>
            Upload up to 4 images to showcase your work
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Click to upload or drag and drop images here</p>
            <p className="text-sm text-gray-500 mt-2">PNG, JPG, WebP up to 5MB each</p>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              id="image-upload"
              onChange={(e) => handleImageUpload(e.target.files)}
            />
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => document.getElementById('image-upload')?.click()}
            >
              Choose Files
            </Button>
          </div>

          {formData.media?.images && formData.media.images.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {formData.media.images.map((image, index) => (
                <div key={index} className="relative">
                  <img src={image} alt={`Project ${index + 1}`} className="w-full h-24 object-cover rounded" />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 w-6 h-6 p-0"
                    onClick={() => {
                      const newImages = formData.media?.images?.filter((_, i) => i !== index) || []
                      updateMedia({ images: newImages })
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}