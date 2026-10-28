'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
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
import { useFormatLocale } from '@/lib/i18n/useFormatLocale'

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
  const t = useTranslations('checkout')
  const { dateFns } = useFormatLocale()
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
      toast.error(t('rfqForm.validation.serviceTypeRequired'))
      return
    }

    if (!formData.description.trim()) {
      toast.error(t('rfqForm.validation.descriptionRequired'))
      return
    }

    if (formData.description.length < 20) {
      toast.error(t('rfqForm.validation.descriptionTooShort'))
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
        toast.success(t('rfqForm.validation.submitSuccess'))
        if (onSuccess) {
          onSuccess(data.booking)
        }
      } else {
        toast.error(data.msg || t('rfqForm.validation.submitFailed'))
      }
    } catch (error) {
      console.error('RFQ submission error:', error)
      toast.error(t('rfqForm.validation.genericError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('rfqForm.title')}</CardTitle>
        <CardDescription>
          {t('rfqForm.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Service Type */}
          <div className="space-y-2">
            <Label htmlFor="serviceType">{t('rfqForm.serviceTypeLabel')}</Label>
            <Input
              id="serviceType"
              placeholder={t('rfqForm.serviceTypePlaceholder')}
              value={formData.serviceType}
              onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('rfqForm.descriptionLabel')}</Label>
            <Textarea
              id="description"
              placeholder={t('rfqForm.descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              required
              className="resize-none"
            />
            <p className="text-xs text-gray-500">
              {t('rfqForm.descriptionCounter', { count: formData.description.length })}
            </p>
          </div>

          {/* Preferred Start Date */}
          <div className="space-y-2">
            <Label>{t('rfqForm.preferredStartDate')}</Label>
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
                    format(formData.preferredStartDate, 'PPP', { locale: dateFns })
                  ) : (
                    <span>{t('rfqForm.pickDate')}</span>
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
            <Label htmlFor="urgency">{t('rfqForm.urgencyLabel')}</Label>
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
                <SelectItem value="low">{t('rfqForm.urgency.low')}</SelectItem>
                <SelectItem value="medium">{t('rfqForm.urgency.medium')}</SelectItem>
                <SelectItem value="high">{t('rfqForm.urgency.high')}</SelectItem>
                <SelectItem value="urgent">{t('rfqForm.urgency.urgent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Budget Range */}
          <div className="space-y-2">
            <Label>{t('rfqForm.budgetRange')}</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <Input
                  type="number"
                  placeholder={t('rfqForm.minPlaceholder')}
                  value={formData.budgetMin}
                  onChange={(e) => setFormData({ ...formData, budgetMin: e.target.value })}
                  min="0"
                />
              </div>
              <div className="col-span-1">
                <Input
                  type="number"
                  placeholder={t('rfqForm.maxPlaceholder')}
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
              <strong>{t('rfqForm.whatNextTitle')}</strong>
              <br />
              {t('rfqForm.whatNextBody')}
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
                {t('rfqForm.cancel')}
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
                  {t('rfqForm.submitting')}
                </>
              ) : (
                t('rfqForm.submitRequest')
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
