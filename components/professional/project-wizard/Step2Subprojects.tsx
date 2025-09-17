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
import {
  Plus,
  Trash2,
  Package,
  DollarSign,
  Clock,
  Shield,
  AlertCircle,
  Info
} from "lucide-react"
import { toast } from 'sonner'

interface IIncludedItem {
  name: string
  description?: string
  isCustom: boolean
}

interface ISubproject {
  id: string
  name: string
  description: string
  pricing: {
    type: 'fixed' | 'unit' | 'rfq'
    amount?: number
    priceRange?: { min: number; max: number }
    minProjectValue?: number
  }
  included: IIncludedItem[]
  materialsIncluded: boolean
  deliveryPreparation: number
  executionDuration: {
    value: number
    unit: 'hours' | 'days'
    range?: { min: number; max: number }
  }
  buffer?: {
    value: number
    unit: 'hours' | 'days'
  }
  intakeDuration?: {
    value: number
    unit: 'hours' | 'days'
    buffer?: number
  }
  warrantyPeriod: number
}

interface ProjectData {
  subprojects?: ISubproject[]
  category?: string
  service?: string
}

interface Step2Props {
  data: ProjectData
  onChange: (data: ProjectData) => void
  onValidate: (isValid: boolean) => void
}

// Predefined included items by service category
const PREDEFINED_INCLUDED_ITEMS = {
  'plumber': [
    'Site inspection', 'Material calculation', 'Professional installation', 'Quality testing',
    'Cleanup after work', 'Basic warranty', 'Emergency support', 'Maintenance advice'
  ],
  'electrician': [
    'Safety inspection', 'Wiring assessment', 'Professional installation', 'Code compliance check',
    'Testing and certification', 'Cleanup', 'Safety documentation', 'Usage instructions'
  ],
  'painter': [
    'Surface preparation', 'Quality paint materials', 'Professional application', 'Clean lines and finish',
    'Cleanup and disposal', 'Touch-up service', 'Color consultation', 'Protection of furniture'
  ],
  'default': [
    'Initial consultation', 'Professional execution', 'Quality materials', 'Cleanup after work',
    'Basic warranty', 'Final inspection', 'Customer walkthrough', 'Maintenance tips'
  ]
}

export default function Step2Subprojects({ data, onChange, onValidate }: Step2Props) {
  const [subprojects, setSubprojects] = useState<ISubproject[]>(
    data.subprojects || []
  )

  useEffect(() => {
    onChange({ ...data, subprojects })
    validateForm()
  }, [subprojects])

  const validateForm = () => {
    const isValid = subprojects.length > 0 && subprojects.every(sub =>
      sub.name &&
      sub.description &&
      sub.pricing.type &&
      (sub.pricing.type === 'rfq' || sub.pricing.amount) &&
      sub.included.length >= 3 &&
      sub.executionDuration.value > 0
    )
    onValidate(isValid)
  }

  const addSubproject = () => {
    if (subprojects.length >= 5) {
      toast.error('Maximum 5 subprojects allowed')
      return
    }

    const newSubproject: ISubproject = {
      id: Date.now().toString(),
      name: '',
      description: '',
      pricing: {
        type: 'fixed',
        amount: 0
      },
      included: [],
      materialsIncluded: false,
      deliveryPreparation: 1,
      executionDuration: {
        value: 1,
        unit: 'hours'
      },
      warrantyPeriod: 1
    }

    setSubprojects([...subprojects, newSubproject])
  }

  const removeSubproject = (id: string) => {
    setSubprojects(subprojects.filter(sub => sub.id !== id))
  }

  const updateSubproject = (id: string, updates: Partial<ISubproject>) => {
    setSubprojects(subprojects.map(sub =>
      sub.id === id ? { ...sub, ...updates } : sub
    ))
  }

  const addIncludedItem = (subprojectId: string, itemName: string, isCustom: boolean = false) => {
    updateSubproject(subprojectId, {
      included: [
        ...subprojects.find(s => s.id === subprojectId)?.included || [],
        { name: itemName, isCustom }
      ]
    })
  }

  const removeIncludedItem = (subprojectId: string, itemIndex: number) => {
    const subproject = subprojects.find(s => s.id === subprojectId)
    if (subproject) {
      updateSubproject(subprojectId, {
        included: subproject.included.filter((_, index) => index !== itemIndex)
      })
    }
  }

  const getPredefinedItems = () => {
    const service = data.service || 'default'
    return PREDEFINED_INCLUDED_ITEMS[service as keyof typeof PREDEFINED_INCLUDED_ITEMS] ||
           PREDEFINED_INCLUDED_ITEMS.default
  }

  const calculateTotalPrice = () => {
    return subprojects.reduce((total, sub) => {
      if (sub.pricing.type === 'fixed' && sub.pricing.amount) {
        return total + sub.pricing.amount
      }
      return total
    }, 0)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="w-5 h-5" />
            <span>Service Packages & Pricing</span>
          </CardTitle>
          <CardDescription>
            Create up to 5 different service packages with varying prices and inclusions.
            Think of these as &quot;Basic&quot;, &quot;Standard&quot;, and &quot;Premium&quot; tiers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Packages created: {subprojects.length}/5
            </div>
            <Button onClick={addSubproject} disabled={subprojects.length >= 5}>
              <Plus className="w-4 h-4 mr-2" />
              Add Package
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subprojects List */}
      {subprojects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No packages yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first service package to get started. You can offer different
              pricing tiers to give customers options.
            </p>
            <Button onClick={addSubproject}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Package
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {subprojects.map((subproject, index) => (
            <Card key={subproject.id} className="border-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    Package {index + 1}
                    {subproject.name && `: ${subproject.name}`}
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeSubproject(subproject.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`name-${subproject.id}`}>Package Name *</Label>
                    <Input
                      id={`name-${subproject.id}`}
                      value={subproject.name}
                      onChange={(e) => updateSubproject(subproject.id, { name: e.target.value })}
                      placeholder="e.g., Basic, Standard, Premium"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`warranty-${subproject.id}`}>Warranty Period *</Label>
                    <Select
                      value={subproject.warrantyPeriod.toString()}
                      onValueChange={(value) => updateSubproject(subproject.id, { warrantyPeriod: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(year => (
                          <SelectItem key={year} value={year.toString()}>
                            {year === 0 ? 'No warranty' : `${year} year${year > 1 ? 's' : ''}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor={`description-${subproject.id}`}>Package Description *</Label>
                  <Textarea
                    id={`description-${subproject.id}`}
                    value={subproject.description}
                    onChange={(e) => updateSubproject(subproject.id, { description: e.target.value })}
                    placeholder="Describe what's included in this package..."
                    maxLength={500}
                    rows={3}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    {subproject.description.length}/500 characters
                  </p>
                </div>

                {/* Pricing */}
                <div className="border rounded-lg p-4 bg-blue-50">
                  <h4 className="font-semibold mb-4 flex items-center">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Pricing Configuration
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Pricing Type *</Label>
                      <Select
                        value={subproject.pricing.type}
                        onValueChange={(value: 'fixed' | 'unit' | 'rfq') =>
                          updateSubproject(subproject.id, {
                            pricing: { ...subproject.pricing, type: value }
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed Price</SelectItem>
                          <SelectItem value="unit">Price per Unit</SelectItem>
                          <SelectItem value="rfq">Request for Quote</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {subproject.pricing.type === 'fixed' && (
                      <div>
                        <Label>Fixed Price (€) *</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={subproject.pricing.amount || ''}
                          onChange={(e) => updateSubproject(subproject.id, {
                            pricing: { ...subproject.pricing, amount: parseFloat(e.target.value) }
                          })}
                          placeholder="0.00"
                        />
                      </div>
                    )}

                    {subproject.pricing.type === 'unit' && (
                      <>
                        <div>
                          <Label>Price per Unit (€) *</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={subproject.pricing.amount || ''}
                            onChange={(e) => updateSubproject(subproject.id, {
                              pricing: { ...subproject.pricing, amount: parseFloat(e.target.value) }
                            })}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <Label>Minimum Order Value (€)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={subproject.pricing.minProjectValue || ''}
                            onChange={(e) => updateSubproject(subproject.id, {
                              pricing: { ...subproject.pricing, minProjectValue: parseFloat(e.target.value) }
                            })}
                            placeholder="50.00"
                          />
                        </div>
                      </>
                    )}

                    {subproject.pricing.type === 'rfq' && (
                      <div className="md:col-span-2">
                        <Label>Estimated Price Range (€)</Label>
                        <div className="flex space-x-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={subproject.pricing.priceRange?.min || ''}
                            onChange={(e) => updateSubproject(subproject.id, {
                              pricing: {
                                ...subproject.pricing,
                                priceRange: {
                                  min: parseFloat(e.target.value),
                                  max: subproject.pricing.priceRange?.max || 0
                                }
                              }
                            })}
                            placeholder="Min price"
                          />
                          <span className="self-center">to</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={subproject.pricing.priceRange?.max || ''}
                            onChange={(e) => updateSubproject(subproject.id, {
                              pricing: {
                                ...subproject.pricing,
                                priceRange: {
                                  min: subproject.pricing.priceRange?.min || 0,
                                  max: parseFloat(e.target.value)
                                }
                              }
                            })}
                            placeholder="Max price"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* What's Included */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold flex items-center">
                      <Shield className="w-4 h-4 mr-2" />
                      What&apos;s Included (3-10 items required)
                    </h4>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`materials-${subproject.id}`}
                        checked={subproject.materialsIncluded}
                        onCheckedChange={(checked) =>
                          updateSubproject(subproject.id, { materialsIncluded: checked as boolean })
                        }
                      />
                      <Label htmlFor={`materials-${subproject.id}`} className="text-sm">
                        Materials included
                      </Label>
                    </div>
                  </div>

                  {/* Predefined Items */}
                  <div className="mb-4">
                    <Label className="text-sm font-medium">Quick Add (Predefined)</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {getPredefinedItems().map((item, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => addIncludedItem(subproject.id, item)}
                          disabled={subproject.included.some(inc => inc.name === item)}
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Item Input */}
                  <div className="flex space-x-2 mb-4">
                    <Input
                      placeholder="Add custom item..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.target as HTMLInputElement
                          if (input.value.trim()) {
                            addIncludedItem(subproject.id, input.value.trim(), true)
                            input.value = ''
                          }
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        const input = (e.target as HTMLElement).parentElement?.querySelector('input')
                        if (input?.value.trim()) {
                          addIncludedItem(subproject.id, input.value.trim(), true)
                          input.value = ''
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>

                  {/* Included Items List */}
                  {subproject.included.length > 0 && (
                    <div className="space-y-2">
                      {subproject.included.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm">{item.name}</span>
                          <div className="flex items-center space-x-2">
                            {item.isCustom && (
                              <Badge variant="outline" className="text-xs">Custom</Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeIncludedItem(subproject.id, index)}
                              className="w-6 h-6 p-0 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {subproject.included.length < 3 && (
                    <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 p-2 rounded mt-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">Add at least 3 items to continue</span>
                    </div>
                  )}
                </div>

                {/* Timing */}
                <div className="border rounded-lg p-4 bg-green-50">
                  <h4 className="font-semibold mb-4 flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    Timing & Duration
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Preparation Time (days) *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={subproject.deliveryPreparation}
                        onChange={(e) => updateSubproject(subproject.id, {
                          deliveryPreparation: parseInt(e.target.value) || 0
                        })}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Time needed before starting work
                      </p>
                    </div>

                    <div>
                      <Label>Execution Duration *</Label>
                      <div className="flex space-x-2">
                        <Input
                          type="number"
                          min="1"
                          value={subproject.executionDuration.value}
                          onChange={(e) => updateSubproject(subproject.id, {
                            executionDuration: {
                              ...subproject.executionDuration,
                              value: parseInt(e.target.value) || 1
                            }
                          })}
                        />
                        <Select
                          value={subproject.executionDuration.unit}
                          onValueChange={(value: 'hours' | 'days') =>
                            updateSubproject(subproject.id, {
                              executionDuration: {
                                ...subproject.executionDuration,
                                unit: value
                              }
                            })
                          }
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
                      <Label>Buffer Time (optional)</Label>
                      <div className="flex space-x-2">
                        <Input
                          type="number"
                          min="0"
                          value={subproject.buffer?.value || ''}
                          onChange={(e) => updateSubproject(subproject.id, {
                            buffer: e.target.value ? {
                              value: parseInt(e.target.value),
                              unit: subproject.buffer?.unit || 'hours'
                            } : undefined
                          })}
                          placeholder="0"
                        />
                        <Select
                          value={subproject.buffer?.unit || 'hours'}
                          onValueChange={(value: 'hours' | 'days') =>
                            updateSubproject(subproject.id, {
                              buffer: subproject.buffer ? {
                                ...subproject.buffer,
                                unit: value
                              } : { value: 0, unit: value }
                            })
                          }
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
                      <p className="text-xs text-gray-500 mt-1">
                        Extra time to avoid delays
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      {subprojects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Package Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Package</th>
                    <th className="text-left p-2">Pricing</th>
                    <th className="text-left p-2">Duration</th>
                    <th className="text-left p-2">Warranty</th>
                    <th className="text-left p-2">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {subprojects.map((sub, index) => (
                    <tr key={sub.id} className="border-b">
                      <td className="p-2 font-medium">{sub.name || `Package ${index + 1}`}</td>
                      <td className="p-2">
                        {sub.pricing.type === 'fixed' && sub.pricing.amount && `€${sub.pricing.amount}`}
                        {sub.pricing.type === 'unit' && sub.pricing.amount && `€${sub.pricing.amount}/unit`}
                        {sub.pricing.type === 'rfq' && 'Quote required'}
                      </td>
                      <td className="p-2">
                        {sub.executionDuration.value} {sub.executionDuration.unit}
                      </td>
                      <td className="p-2">
                        {sub.warrantyPeriod === 0 ? 'No warranty' : `${sub.warrantyPeriod} year${sub.warrantyPeriod > 1 ? 's' : ''}`}
                      </td>
                      <td className="p-2">{sub.included.length} items</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {subprojects.some(s => s.pricing.type === 'fixed' && s.pricing.amount) && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-900">
                    Total fixed price packages: €{calculateTotalPrice().toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}