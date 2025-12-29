'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Calendar from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

type BookingDto = Record<string, unknown>

interface RFQFormProps {
  bookingType: 'professional' | 'project'
  professionalId?: string
  projectId?: string
  onSuccess?: (booking: BookingDto) => void
  onCancel?: () => void
}

export default function RFQForm({
  bookingType,
  professionalId,
  projectId,
  onSuccess,
  onCancel
}: RFQFormProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    serviceType: '',
    description: '',
    preferredStartDate: undefined as Date | undefined,
    urgency: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    budgetMin: '',
    budgetMax: '',
    currency: 'EUR'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.serviceType.trim()) {
      toast.error('Please enter the service type')
      return
    }

    if (!formData.description.trim()) {
      toast.error('Please provide a description')
      return
    }

    if (formData.description.length < 20) {
      toast.error('Description must be at least 20 characters')
      return
    }

    setLoading(true)

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'

      const requestData = {
        bookingType,
        ...(bookingType === 'professional' ? { professionalId } : { projectId }),
        rfqData: {
          serviceType: formData.serviceType,
          description: formData.description,
          urgency: formData.urgency,
          answers: [], // Can be extended with custom questions
          budget: formData.budgetMin || formData.budgetMax ? {
            min: formData.budgetMin ? parseFloat(formData.budgetMin) : undefined,
            max: formData.budgetMax ? parseFloat(formData.budgetMax) : undefined,
            currency: formData.currency
          } : undefined
        },
        preferredStartDate: formData.preferredStartDate?.toISOString()
      }

      const response = await fetch(`${backendUrl}/api/bookings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestData)
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success('Booking request submitted successfully!')
        if (onSuccess) {
          onSuccess(data.booking)
        }
      } else {
        toast.error(data.msg || 'Failed to submit booking request')
      }
    } catch (error) {
      console.error('RFQ submission error:', error)
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request for Quote (RFQ)</CardTitle>
        <CardDescription>
          Tell us about your project needs and get a custom quote from the professional
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Service Type */}
          <div className="space-y-2">
            <Label htmlFor="serviceType">Service Type *</Label>
            <Input
              id="serviceType"
              placeholder="e.g., Plumbing, Electrical, Renovation"
              value={formData.serviceType}
              onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe your project in detail. Include what needs to be done, any specific requirements, and expected outcomes."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              required
              className="resize-none"
            />
            <p className="text-xs text-gray-500">
              {formData.description.length} / minimum 20 characters
            </p>
          </div>

          {/* Preferred Start Date */}
          <div className="space-y-2">
            <Label>Preferred Start Date (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !formData.preferredStartDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.preferredStartDate ? (
                    format(formData.preferredStartDate, 'PPP')
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.preferredStartDate}
                  onSelect={(date) => setFormData({ ...formData, preferredStartDate: date })}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Urgency */}
          <div className="space-y-2">
            <Label htmlFor="urgency">Urgency Level</Label>
            <Select
              value={formData.urgency}
              onValueChange={(value: 'low' | 'medium' | 'high' | 'urgent') =>
                setFormData({ ...formData, urgency: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low - Flexible timeline</SelectItem>
                <SelectItem value="medium">Medium - Within a month</SelectItem>
                <SelectItem value="high">High - Within 2 weeks</SelectItem>
                <SelectItem value="urgent">Urgent - ASAP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Budget Range */}
          <div className="space-y-2">
            <Label>Budget Range (Optional)</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <Input
                  type="number"
                  placeholder="Min"
                  value={formData.budgetMin}
                  onChange={(e) => setFormData({ ...formData, budgetMin: e.target.value })}
                  min="0"
                />
              </div>
              <div className="col-span-1">
                <Input
                  type="number"
                  placeholder="Max"
                  value={formData.budgetMax}
                  onChange={(e) => setFormData({ ...formData, budgetMax: e.target.value })}
                  min="0"
                />
              </div>
              <div className="col-span-1">
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="CAD">CAD ($)</SelectItem>
                    <SelectItem value="AUD">AUD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>What happens next?</strong>
              <br />
              The professional will review your request and provide a detailed quote. You&apos;ll receive a notification once the quote is ready for review.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
