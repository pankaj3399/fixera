'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Trash2,
  Settings,
  DollarSign,
  AlertTriangle,
  FileText,
  User,
  Clock
} from "lucide-react"
import { toast } from 'sonner'

interface IExtraOption {
  id: string
  name: string
  description?: string
  price: number
  isCustom: boolean
}

interface ITermCondition {
  id: string
  name: string
  description: string
  additionalCost?: number
  isCustom: boolean
}

interface ProjectData {
  extraOptions?: IExtraOption[]
  termsConditions?: ITermCondition[]
  category?: string
  service?: string
  customerPresence?: string
  areaOfWork?: string
}

interface Step3Props {
  data: ProjectData
  onChange: (data: ProjectData) => void
  onValidate: (isValid: boolean) => void
}

// Predefined extra options by service category
const PREDEFINED_EXTRA_OPTIONS = {
  'plumber': [
    { name: 'Emergency call-out', price: 75 },
    { name: 'Weekend/holiday work', price: 50 },
    { name: 'Extended warranty (3 years)', price: 100 },
    { name: 'Premium materials upgrade', price: 150 },
    { name: 'Same-day service', price: 40 },
    { name: '24/7 support hotline', price: 30 }
  ],
  'electrician': [
    { name: 'Emergency electrical service', price: 85 },
    { name: 'Safety certificate', price: 60 },
    { name: 'Smart home integration', price: 200 },
    { name: 'Energy efficiency consultation', price: 120 },
    { name: 'Surge protection installation', price: 180 },
    { name: 'After-hours work', price: 45 }
  ],
  'painter': [
    { name: 'Premium paint finish', price: 80 },
    { name: 'Furniture protection service', price: 35 },
    { name: 'Color consultation', price: 50 },
    { name: 'Express completion', price: 100 },
    { name: 'Eco-friendly paint option', price: 60 },
    { name: 'Touch-up service (6 months)', price: 40 }
  ],
  'default': [
    { name: 'Rush delivery', price: 50 },
    { name: 'Weekend work', price: 40 },
    { name: 'Extended warranty', price: 75 },
    { name: 'Premium materials', price: 100 },
    { name: 'Additional consultation', price: 60 },
    { name: 'Express service', price: 80 }
  ]
}

// Predefined terms and conditions
const PREDEFINED_TERMS = {
  'plumber': [
    { name: 'Customer must be present', cost: 0, description: 'Customer or authorized representative must be present during work' },
    { name: 'Access to all work areas', cost: 25, description: 'If access is restricted, additional visit may be charged' },
    { name: 'Water supply available', cost: 0, description: 'Working water supply must be available for testing' },
    { name: 'Clear work area', cost: 30, description: 'Work area must be cleared of personal items' },
    { name: 'Parking availability', cost: 15, description: 'Free parking space within 50m of property' }
  ],
  'electrician': [
    { name: 'Power disconnection notice', cost: 0, description: 'Customer must arrange power disconnection with utility company' },
    { name: 'Safety clearance', cost: 0, description: 'All electrical panels must be accessible and clearly marked' },
    { name: 'Material storage space', cost: 20, description: 'Secure area required for storing electrical materials' },
    { name: 'Customer must be present', cost: 0, description: 'Customer presence required for safety briefing' },
    { name: 'Clean work environment', cost: 25, description: 'Dust-free environment required for sensitive electrical work' }
  ],
  'painter': [
    { name: 'Room preparation', cost: 40, description: 'Customer must remove all furniture and cover floors' },
    { name: 'Surface condition', cost: 60, description: 'Walls must be clean and free of major defects' },
    { name: 'Weather conditions', cost: 0, description: 'Exterior work depends on suitable weather conditions' },
    { name: 'Color approval', cost: 0, description: 'Customer must approve all colors before application' },
    { name: 'Ventilation requirements', cost: 15, description: 'Adequate ventilation must be available during work' }
  ],
  'default': [
    { name: 'Customer must be present', cost: 0, description: 'Customer or representative must be available during service' },
    { name: 'Work area access', cost: 20, description: 'Clear and safe access to all work areas required' },
    { name: 'Material storage', cost: 15, description: 'Secure space required for storing materials and tools' },
    { name: 'Parking availability', cost: 10, description: 'Parking space required within reasonable distance' },
    { name: 'Payment terms', cost: 0, description: 'Payment due upon completion unless otherwise agreed' }
  ]
}

const CUSTOMER_PRESENCE_OPTIONS = [
  { value: 'not_required', label: 'Not required' },
  { value: 'available', label: 'Yes - Customer should be available' },
  { value: 'first_hour_only', label: 'Yes - Only first hour' },
  { value: 'present_throughout', label: 'Yes - Customer must be present throughout' }
]

export default function Step3ExtraOptions({ data, onChange, onValidate }: Step3Props) {
  const [extraOptions, setExtraOptions] = useState<IExtraOption[]>(
    data.extraOptions || []
  )
  const [termsConditions, setTermsConditions] = useState<ITermCondition[]>(
    data.termsConditions || []
  )
  const [customerPresence, setCustomerPresence] = useState<string>(
    data.customerPresence || ''
  )
  const [customExtraName, setCustomExtraName] = useState('')
  const [customExtraPrice, setCustomExtraPrice] = useState('')
  const [customTermName, setCustomTermName] = useState('')
  const [customTermDescription, setCustomTermDescription] = useState('')
  const [customTermCost, setCustomTermCost] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  // Admin-configured defaults
  const [configExtraOptions, setConfigExtraOptions] = useState<Array<{ name: string; description?: string; isCustomizable?: boolean }>>([])
  const [configConditions, setConfigConditions] = useState<Array<{ text: string; type: 'condition' | 'warning' }>>([])

  // Fetch admin-configured items for the selected service
  const fetchServiceConfiguration = async () => {
    if (!data.category || !data.service) return
    try {
      const params = new URLSearchParams({ category: data.category, service: data.service })
      if (data.areaOfWork) params.append('areaOfWork', data.areaOfWork)

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/service-configuration?${params}`, {
        credentials: 'include'
      })
      if (res.ok) {
        const json = await res.json()
        setConfigExtraOptions(json?.data?.extraOptions || [])
        setConfigConditions(json?.data?.conditionsAndWarnings || [])
      } else {
        setConfigExtraOptions([])
        setConfigConditions([])
      }
    } catch {
      // silent fail to avoid noisy toasts on every render
      setConfigExtraOptions([])
      setConfigConditions([])
    }
  }

  useEffect(() => {
    fetchServiceConfiguration()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.category, data.service, data.areaOfWork])

  useEffect(() => {
    onChange({ ...data, extraOptions, termsConditions, customerPresence })
    validateForm()
  }, [extraOptions, termsConditions, customerPresence])

  const validateForm = () => {
    const errors: string[] = []

    // Customer presence is now required
    if (!customerPresence) {
      errors.push('Customer presence selection is required')
    }

    setValidationErrors(errors)
    const isValid = errors.length === 0
    onValidate(isValid)
  }

  const showValidationErrors = () => {
    if (validationErrors.length > 0) {
      validationErrors.forEach(error => {
        toast.error(error)
      })
    }
  }

  const getPredefinedExtraOptions = () => {
    if (configExtraOptions.length > 0) {
      // Backend does not supply price; default to 0 and let professional edit
      return configExtraOptions.map(o => ({ name: o.name, price: 0 }))
    }
    const service = data.service || 'default'
    return PREDEFINED_EXTRA_OPTIONS[service as keyof typeof PREDEFINED_EXTRA_OPTIONS] || PREDEFINED_EXTRA_OPTIONS.default
  }

  const getPredefinedTerms = () => {
    if (configConditions.length > 0) {
      return configConditions.map(c => ({
        name: c.text,
        description: c.text,
        cost: 0
      }))
    }
    const service = data.service || 'default'
    return PREDEFINED_TERMS[service as keyof typeof PREDEFINED_TERMS] || PREDEFINED_TERMS.default
  }

  const addPredefinedExtraOption = (option: { name: string; price: number }) => {
    if (extraOptions.length >= 10) {
      toast.error('Maximum 10 extra options allowed')
      return
    }

    if (extraOptions.some(opt => opt.name === option.name)) {
      toast.error('This option is already added')
      return
    }

    const newOption: IExtraOption = {
      id: Date.now().toString(),
      name: option.name,
      price: option.price,
      isCustom: false
    }

    setExtraOptions([...extraOptions, newOption])
  }

  const addCustomExtraOption = () => {
    if (extraOptions.length >= 10) {
      toast.error('Maximum 10 extra options allowed')
      return
    }

    if (!customExtraName.trim() || !customExtraPrice) {
      toast.error('Please fill in both name and price')
      return
    }

    if (extraOptions.some(opt => opt.name === customExtraName.trim())) {
      toast.error('This option name is already used')
      return
    }

    const newOption: IExtraOption = {
      id: Date.now().toString(),
      name: customExtraName.trim(),
      price: parseFloat(customExtraPrice),
      isCustom: true
    }

    setExtraOptions([...extraOptions, newOption])
    setCustomExtraName('')
    setCustomExtraPrice('')
  }

  const removeExtraOption = (id: string) => {
    setExtraOptions(extraOptions.filter(opt => opt.id !== id))
  }

  const updateExtraOption = (id: string, updates: Partial<IExtraOption>) => {
    setExtraOptions(extraOptions.map(opt =>
      opt.id === id ? { ...opt, ...updates } : opt
    ))
  }

  const addPredefinedTerm = (term: { name: string; cost: number; description: string }) => {
    if (termsConditions.length >= 5) {
      toast.error('Maximum 5 terms and conditions allowed')
      return
    }

    if (termsConditions.some(t => t.name === term.name)) {
      toast.error('This term is already added')
      return
    }

    const newTerm: ITermCondition = {
      id: Date.now().toString(),
      name: term.name,
      description: term.description,
      additionalCost: term.cost > 0 ? term.cost : undefined,
      isCustom: false
    }

    setTermsConditions([...termsConditions, newTerm])
  }

  const addCustomTerm = () => {
    if (termsConditions.length >= 5) {
      toast.error('Maximum 5 terms and conditions allowed')
      return
    }

    if (!customTermName.trim() || !customTermDescription.trim()) {
      toast.error('Please fill in both name and description')
      return
    }

    if (termsConditions.some(t => t.name === customTermName.trim())) {
      toast.error('This term name is already used')
      return
    }

    const newTerm: ITermCondition = {
      id: Date.now().toString(),
      name: customTermName.trim(),
      description: customTermDescription.trim(),
      additionalCost: customTermCost ? parseFloat(customTermCost) : undefined,
      isCustom: true
    }

    setTermsConditions([...termsConditions, newTerm])
    setCustomTermName('')
    setCustomTermDescription('')
    setCustomTermCost('')
  }

  const removeTerm = (id: string) => {
    setTermsConditions(termsConditions.filter(term => term.id !== id))
  }

  const updateTerm = (id: string, updates: Partial<ITermCondition>) => {
    setTermsConditions(termsConditions.map(term =>
      term.id === id ? { ...term, ...updates } : term
    ))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Extra Options & Project Conditions</span>
          </CardTitle>
          <CardDescription>
            Set customer presence requirements, add optional extra services and define terms & conditions for your project.
            Extra options give customers flexibility while terms protect your business.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Customer Presence Section - REQUIRED */}
      <Card className="border-2 border-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="w-5 h-5" />
            <span>Customer Presence Required *</span>
          </CardTitle>
          <CardDescription>
            Specify whether the customer needs to be present during the service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Select customer presence requirement *
            </Label>
            {validationErrors.includes('Customer presence selection is required') && (
              <div className="flex items-center space-x-2 text-red-600 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Please select a customer presence option</span>
              </div>
            )}
            <Select value={customerPresence} onValueChange={setCustomerPresence}>
              <SelectTrigger className={`w-full ${!customerPresence && validationErrors.length > 0 ? 'border-red-500' : ''}`}>
                <SelectValue placeholder="Select customer presence requirement..." />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_PRESENCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customerPresence && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">
                    Selected: {CUSTOMER_PRESENCE_OPTIONS.find(opt => opt.value === customerPresence)?.label}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Extra Options Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5" />
              <span>Extra Options (Optional, 0-10 items)</span>
            </div>
            <Badge variant="outline">
              {extraOptions.length}/10
            </Badge>
          </CardTitle>
          <CardDescription>
            Offer additional services that customers can add to their base package
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Predefined Options */}
          <div>
            <Label className="text-sm font-medium">Quick Add (Predefined Options)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {getPredefinedExtraOptions().map((option, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="justify-between h-auto p-3"
                  onClick={() => addPredefinedExtraOption(option)}
                  disabled={extraOptions.some(opt => opt.name === option.name) || extraOptions.length >= 10}
                >
                  <span className="text-left">
                    <div className="font-medium">{option.name}</div>
                    <div className="text-sm text-gray-500">€{option.price}</div>
                  </span>
                  <Plus className="w-4 h-4" />
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Option */}
          <div className="border rounded-lg p-4 bg-blue-50">
            <Label className="text-sm font-medium">Add Custom Option</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
              <Input
                placeholder="Option name..."
                value={customExtraName}
                onChange={(e) => setCustomExtraName(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Price (€)"
                min="0"
                step="0.01"
                value={customExtraPrice}
                onChange={(e) => setCustomExtraPrice(e.target.value)}
              />
              <Button
                onClick={addCustomExtraOption}
                disabled={!customExtraName.trim() || !customExtraPrice || extraOptions.length >= 10}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Option
              </Button>
            </div>
          </div>

          {/* Current Extra Options */}
          {extraOptions.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Current Extra Options</Label>
              {extraOptions.map((option) => (
                <div key={option.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{option.name}</span>
                      {option.isCustom && (
                        <Badge variant="outline" className="text-xs">Custom</Badge>
                      )}
                    </div>
                    {option.description && (
                      <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={option.price}
                        onChange={(e) => updateExtraOption(option.id, { price: parseFloat(e.target.value) || 0 })}
                        className="w-20 text-right"
                      />
                      <div className="text-xs text-gray-500">€</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeExtraOption(option.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Terms and Conditions Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5" />
              <span>Terms & Conditions (Optional, 0-5 items)</span>
            </div>
            <Badge variant="outline">
              {termsConditions.length}/5
            </Badge>
          </CardTitle>
          <CardDescription>
            Define conditions and requirements for your service. Include any additional costs for non-compliance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Predefined Terms */}
          <div>
            <Label className="text-sm font-medium">Quick Add (Predefined Terms)</Label>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {getPredefinedTerms().map((term, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="justify-between h-auto p-3 text-left"
                  onClick={() => addPredefinedTerm(term)}
                  disabled={termsConditions.some(t => t.name === term.name) || termsConditions.length >= 5}
                >
                  <div>
                    <div className="font-medium">{term.name}</div>
                    <div className="text-sm text-gray-500">{term.description}</div>
                  </div>
                  <div className="text-right">
                    {term.cost > 0 && (
                      <div className="text-sm font-medium text-red-600">+€{term.cost}</div>
                    )}
                    <Plus className="w-4 h-4" />
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Term */}
          <div className="border rounded-lg p-4 bg-blue-50">
            <Label className="text-sm font-medium">Add Custom Term/Condition</Label>
            <div className="space-y-3 mt-2">
              <Input
                placeholder="Term name..."
                value={customTermName}
                onChange={(e) => setCustomTermName(e.target.value)}
              />
              <Textarea
                placeholder="Detailed description of the requirement..."
                value={customTermDescription}
                onChange={(e) => setCustomTermDescription(e.target.value)}
                rows={2}
              />
              <div className="flex space-x-3">
                <Input
                  type="number"
                  placeholder="Additional cost (€) if not met"
                  min="0"
                  step="0.01"
                  value={customTermCost}
                  onChange={(e) => setCustomTermCost(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={addCustomTerm}
                  disabled={!customTermName.trim() || !customTermDescription.trim() || termsConditions.length >= 5}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Term
                </Button>
              </div>
            </div>
          </div>

          {/* Current Terms */}
          {termsConditions.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Current Terms & Conditions</Label>
              {termsConditions.map((term) => (
                <div key={term.id} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-medium">{term.name}</span>
                        {term.isCustom && (
                          <Badge variant="outline" className="text-xs">Custom</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{term.description}</p>
                      {term.additionalCost && term.additionalCost > 0 && (
                        <div className="flex items-center space-x-2">
                          <Label className="text-xs">Additional cost if not met:</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={term.additionalCost}
                            onChange={(e) => updateTerm(term.id, { additionalCost: parseFloat(e.target.value) || 0 })}
                            className="w-20 text-sm"
                          />
                          <span className="text-xs text-gray-500">€</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTerm(term.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {(extraOptions.length > 0 || termsConditions.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Extra Options Summary */}
              <div>
                <h4 className="font-medium mb-3">Extra Options ({extraOptions.length})</h4>
                {extraOptions.length === 0 ? (
                  <p className="text-sm text-gray-500">No extra options added</p>
                ) : (
                  <div className="space-y-2">
                    {extraOptions.map((option) => (
                      <div key={option.id} className="flex justify-between text-sm">
                        <span>{option.name}</span>
                        <span className="font-medium">€{option.price}</span>
                      </div>
                    ))}
                    <div className="border-t pt-2 flex justify-between font-medium">
                      <span>Total extra options value:</span>
                      <span>€{extraOptions.reduce((sum, opt) => sum + opt.price, 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Terms Summary */}
              <div>
                <h4 className="font-medium mb-3">Terms & Conditions ({termsConditions.length})</h4>
                {termsConditions.length === 0 ? (
                  <p className="text-sm text-gray-500">No terms added</p>
                ) : (
                  <div className="space-y-2">
                    {termsConditions.map((term) => (
                      <div key={term.id} className="text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{term.name}</span>
                          {term.additionalCost && term.additionalCost > 0 && (
                            <span className="text-red-600">+€{term.additionalCost}</span>
                          )}
                        </div>
                        <p className="text-gray-600 text-xs">{term.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
