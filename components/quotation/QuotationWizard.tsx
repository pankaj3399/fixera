'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, Plus, Trash2, Package, Clock, Shield, FileText, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { getAuthToken } from '@/lib/utils'
import type { QuoteVersion, QuoteMaterial, QuotationMilestone, QuotationWizardFormData } from '@/types/quotation'

interface QuotationWizardProps {
  bookingId: string
  existingVersion?: QuoteVersion
  isEditing?: boolean
  onSuccess: () => void
  onCancel: () => void
}

const EMPTY_MATERIAL: QuoteMaterial = { name: '', quantity: undefined, unit: '', description: '' }
const EMPTY_MILESTONE: QuotationMilestone = {
  title: '',
  amount: 0,
  description: '',
  dueCondition: 'on_milestone_completion',
  order: 0,
  status: 'pending',
}

const getDefaultFormData = (existing?: QuoteVersion): QuotationWizardFormData => {
  if (existing) {
    return {
      scope: existing.scope,
      warrantyDuration: { ...existing.warrantyDuration },
      materialsIncluded: existing.materialsIncluded,
      materials: existing.materials?.length ? [...existing.materials] : [{ ...EMPTY_MATERIAL }],
      description: existing.description,
      totalAmount: existing.totalAmount,
      currency: existing.currency || 'EUR',
      useMilestones: (existing.milestones?.length || 0) > 0,
      milestones: existing.milestones?.length
        ? existing.milestones.map(m => ({
            title: m.title,
            amount: m.amount,
            description: m.description || '',
            dueCondition: m.dueCondition,
            customDueDate: m.customDueDate,
            order: m.order,
            status: 'pending' as const,
          }))
        : [{ ...EMPTY_MILESTONE }],
      preparationDuration: { ...existing.preparationDuration },
      executionDuration: { ...existing.executionDuration },
      bufferDuration: existing.bufferDuration ? { ...existing.bufferDuration } : { value: 0, unit: 'days' },
      useBuffer: !!existing.bufferDuration?.value,
      validUntil: existing.validUntil ? (() => {
        const d = new Date(existing.validUntil)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })() : '',
      changeNote: '',
    }
  }

  const defaultValid = new Date()
  defaultValid.setDate(defaultValid.getDate() + 30)

  return {
    scope: '',
    warrantyDuration: { value: 12, unit: 'months' },
    materialsIncluded: false,
    materials: [{ ...EMPTY_MATERIAL }],
    description: '',
    totalAmount: 0,
    currency: 'EUR',
    useMilestones: false,
    milestones: [{ ...EMPTY_MILESTONE }],
    preparationDuration: { value: 1, unit: 'days' },
    executionDuration: { value: 1, unit: 'days' },
    bufferDuration: { value: 0, unit: 'days' },
    useBuffer: false,
    validUntil: `${defaultValid.getFullYear()}-${String(defaultValid.getMonth() + 1).padStart(2, '0')}-${String(defaultValid.getDate()).padStart(2, '0')}`,
    changeNote: '',
  }
}

export default function QuotationWizard({ bookingId, existingVersion, isEditing, onSuccess, onCancel }: QuotationWizardProps) {
  const [form, setForm] = useState<QuotationWizardFormData>(getDefaultFormData(existingVersion))
  const [submitting, setSubmitting] = useState(false)

  const updateForm = <K extends keyof QuotationWizardFormData>(key: K, value: QuotationWizardFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Materials helpers
  const addMaterial = () => updateForm('materials', [...form.materials, { ...EMPTY_MATERIAL }])
  const removeMaterial = (index: number) => updateForm('materials', form.materials.filter((_, i) => i !== index))
  const updateMaterial = (index: number, field: keyof QuoteMaterial, value: string | number | undefined) => {
    const updated = [...form.materials]
    updated[index] = { ...updated[index], [field]: value }
    updateForm('materials', updated)
  }

  // Milestones helpers
  const addMilestone = () => updateForm('milestones', [...form.milestones, { ...EMPTY_MILESTONE, order: form.milestones.length }])
  const removeMilestone = (index: number) => {
    const updated = form.milestones.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i }))
    updateForm('milestones', updated)
  }
  const updateMilestone = (index: number, field: keyof QuotationMilestone, value: string | number) => {
    const updated = [...form.milestones]
    updated[index] = { ...updated[index], [field]: value }
    updateForm('milestones', updated)
  }

  const milestoneSum = form.milestones.reduce((sum, m) => sum + (m.amount || 0), 0)
  const milestoneSumMatches = !form.useMilestones || Math.abs(milestoneSum - form.totalAmount) < 0.01

  const handleSubmit = async () => {
    // Validation
    if (!form.scope || form.scope.length < 10 || form.scope.length > 100) {
      toast.error('Scope must be between 10 and 100 characters')
      return
    }
    if (!form.description) {
      toast.error('Description is required')
      return
    }
    if (!form.totalAmount || form.totalAmount <= 0) {
      toast.error('Total amount must be greater than 0')
      return
    }
    if (!form.validUntil) {
      toast.error('Validity date is required')
      return
    }
    if (form.useMilestones) {
      const validMilestones = form.milestones.filter(m => m.title.trim())
      const validSum = validMilestones.reduce((sum, m) => sum + (m.amount || 0), 0)
      if (Math.abs(validSum - form.totalAmount) >= 0.01) {
        toast.error('Sum of milestone amounts must equal the total amount')
        return
      }
      const missingDate = validMilestones.find(m => m.dueCondition === 'custom_date' && !m.customDueDate)
      if (missingDate) {
        toast.error('Please set a date for all milestones with custom date condition')
        return
      }
    }
    if (isEditing && !form.changeNote) {
      toast.error('Please provide a reason for the changes')
      return
    }

    setSubmitting(true)
    try {
      const token = getAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const body: Record<string, unknown> = {
        scope: form.scope,
        warrantyDuration: form.warrantyDuration,
        materialsIncluded: form.materialsIncluded,
        materials: form.materialsIncluded ? form.materials.filter(m => m.name.trim()) : [],
        description: form.description,
        totalAmount: form.totalAmount,
        currency: form.currency,
        milestones: form.useMilestones ? form.milestones.filter(m => m.title.trim()) : [],
        preparationDuration: form.preparationDuration,
        executionDuration: form.executionDuration,
        bufferDuration: form.useBuffer ? form.bufferDuration : undefined,
        validUntil: form.validUntil,
        changeNote: form.changeNote || (isEditing ? 'Updated quotation' : 'Initial quotation'),
      }

      const url = isEditing
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/edit`
        : `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/quotations/${bookingId}/submit`

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (response.ok && data?.success) {
        toast.success(isEditing ? 'Quotation updated successfully!' : 'Quotation submitted successfully!')
        onSuccess()
      } else {
        toast.error(data?.error?.message || data?.msg || 'Failed to submit quotation')
      }
    } catch (err) {
      console.error('Error submitting quotation:', err)
      toast.error('Failed to submit quotation. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50/50 to-indigo-50/50">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-purple-900 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {isEditing ? 'Edit Quotation' : 'Create Quotation'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scope */}
        <div>
          <Label className="text-sm font-medium">Scope of Work *</Label>
          <p className="text-xs text-gray-500 mb-1">Brief summary of the work (10-100 characters)</p>
          <Input
            value={form.scope}
            onChange={e => updateForm('scope', e.target.value)}
            placeholder="e.g., Complete bathroom renovation including plumbing"
            maxLength={100}
          />
          <p className="text-xs text-gray-400 mt-1">{form.scope.length}/100</p>
        </div>

        {/* Warranty */}
        <div>
          <Label className="text-sm font-medium flex items-center gap-1">
            <Shield className="h-4 w-4" /> Warranty *
          </Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="number"
              min={0}
              value={form.warrantyDuration.value}
              onChange={e => updateForm('warrantyDuration', { ...form.warrantyDuration, value: parseInt(e.target.value) || 0 })}
              className="w-24"
            />
            <Select
              value={form.warrantyDuration.unit}
              onValueChange={v => updateForm('warrantyDuration', { ...form.warrantyDuration, unit: v as 'months' | 'years' })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="months">Months</SelectItem>
                <SelectItem value="years">Years</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Materials */}
        <div>
          <Label className="text-sm font-medium flex items-center gap-1">
            <Package className="h-4 w-4" /> Materials Included
          </Label>
          <RadioGroup
            value={form.materialsIncluded ? 'yes' : 'no'}
            onValueChange={v => updateForm('materialsIncluded', v === 'yes')}
            className="flex gap-4 mt-1"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="mat-yes" />
              <Label htmlFor="mat-yes" className="text-sm">Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="mat-no" />
              <Label htmlFor="mat-no" className="text-sm">No</Label>
            </div>
          </RadioGroup>

          {form.materialsIncluded && (
            <div className="mt-3 space-y-2">
              {form.materials.map((mat, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    placeholder="Material name"
                    value={mat.name}
                    onChange={e => updateMaterial(i, 'name', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={mat.quantity ?? ''}
                    onChange={e => updateMaterial(i, 'quantity', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-20"
                  />
                  <Input
                    placeholder="Unit"
                    value={mat.unit ?? ''}
                    onChange={e => updateMaterial(i, 'unit', e.target.value)}
                    className="w-20"
                  />
                  {form.materials.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMaterial(i)} className="shrink-0 text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                <Plus className="h-4 w-4 mr-1" /> Add Material
              </Button>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <Label className="text-sm font-medium">Description (What&apos;s Included) *</Label>
          <Textarea
            value={form.description}
            onChange={e => updateForm('description', e.target.value)}
            placeholder="Describe what is included in this quotation..."
            rows={4}
            className="mt-1"
          />
        </div>

        {/* Price */}
        <div>
          <Label className="text-sm font-medium flex items-center gap-1">
            <CreditCard className="h-4 w-4" /> Total Amount (EUR) *
          </Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={form.totalAmount || ''}
            onChange={e => updateForm('totalAmount', parseFloat(e.target.value) || 0)}
            placeholder="1500.00"
            className="mt-1"
          />

          {/* Milestone toggle */}
          <div className="mt-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.useMilestones}
                onChange={e => updateForm('useMilestones', e.target.checked)}
                className="rounded border-gray-300"
              />
              Split into milestone payments
            </label>
          </div>

          {form.useMilestones && (
            <div className="mt-3 space-y-3 bg-white/50 rounded-lg p-3 border">
              <p className="text-xs text-gray-500">Define payment milestones. Amounts must equal the total.</p>
              {form.milestones.map((ms, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="Milestone title"
                      value={ms.title}
                      onChange={e => updateMilestone(i, 'title', e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={ms.amount || ''}
                        onChange={e => updateMilestone(i, 'amount', parseFloat(e.target.value) || 0)}
                        className="w-32"
                      />
                      <Select
                        value={ms.dueCondition}
                        onValueChange={v => updateMilestone(i, 'dueCondition', v)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on_start">On Project Start</SelectItem>
                          <SelectItem value="on_milestone_completion">On Milestone Completion</SelectItem>
                          <SelectItem value="on_project_completion">On Project Completion</SelectItem>
                          <SelectItem value="custom_date">Custom Date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {ms.dueCondition === 'custom_date' && (
                      <Input
                        type="date"
                        value={ms.customDueDate || ''}
                        onChange={e => updateMilestone(i, 'customDueDate', e.target.value)}
                      />
                    )}
                  </div>
                  {form.milestones.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMilestone(i)} className="shrink-0 text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addMilestone}>
                <Plus className="h-4 w-4 mr-1" /> Add Milestone
              </Button>
              <div className={`text-xs font-medium ${milestoneSumMatches ? 'text-green-600' : 'text-red-600'}`}>
                Milestone total: EUR {milestoneSum.toFixed(2)} / {form.totalAmount.toFixed(2)}
                {!milestoneSumMatches && ' (must match)'}
              </div>
            </div>
          )}
        </div>

        {/* Durations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" /> Preparation Time *
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={form.preparationDuration.value}
                onChange={e => updateForm('preparationDuration', { ...form.preparationDuration, value: parseInt(e.target.value) || 0 })}
                className="w-20"
              />
              <Select
                value={form.preparationDuration.unit}
                onValueChange={v => updateForm('preparationDuration', { ...form.preparationDuration, unit: v as 'hours' | 'days' })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" /> Execution Time *
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={form.executionDuration.value}
                onChange={e => updateForm('executionDuration', { ...form.executionDuration, value: parseInt(e.target.value) || 0 })}
                className="w-20"
              />
              <Select
                value={form.executionDuration.unit}
                onValueChange={v => updateForm('executionDuration', { ...form.executionDuration, unit: v as 'hours' | 'days' })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Buffer */}
        <div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.useBuffer}
              onChange={e => updateForm('useBuffer', e.target.checked)}
              className="rounded border-gray-300"
            />
            Include buffer time
          </label>
          {form.useBuffer && (
            <div className="flex gap-2 mt-2">
              <Input
                type="number"
                min={0}
                value={form.bufferDuration.value}
                onChange={e => updateForm('bufferDuration', { ...form.bufferDuration, value: parseInt(e.target.value) || 0 })}
                className="w-20"
              />
              <Select
                value={form.bufferDuration.unit}
                onValueChange={v => updateForm('bufferDuration', { ...form.bufferDuration, unit: v as 'hours' | 'days' })}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Validity */}
        <div>
          <Label className="text-sm font-medium">Valid Until *</Label>
          <Input
            type="date"
            value={form.validUntil}
            onChange={e => updateForm('validUntil', e.target.value)}
            className="mt-1 w-48"
          />
        </div>

        {/* Change note (required for editing) */}
        {isEditing && (
          <div>
            <Label className="text-sm font-medium">Reason for Changes *</Label>
            <Textarea
              value={form.changeNote}
              onChange={e => updateForm('changeNote', e.target.value)}
              placeholder="Explain what changed and why..."
              rows={2}
              className="mt-1"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditing ? 'Updating...' : 'Submitting...'}
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                {isEditing ? 'Update Quotation' : 'Submit Quotation'}
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
