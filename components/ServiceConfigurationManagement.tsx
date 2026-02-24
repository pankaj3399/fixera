'use client'

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  X,
  CheckCircle,
  AlertCircle,
  Package,
  Image as ImageIcon,
  Copy
} from "lucide-react"
import { toast } from "sonner"
import IconPicker from "@/components/IconPicker"
import { iconMapData } from "@/data/icons"

interface DynamicField {
  fieldName: string
  fieldType: 'range' | 'dropdown' | 'number' | 'text'
  unit?: string
  label: string
  placeholder?: string
  isRequired: boolean
  options?: string[]
  min?: number
  max?: number
}

interface IncludedItem {
  name: string
  description?: string
  isDynamic: boolean
  dynamicField?: Partial<DynamicField>
}

interface ExtraOption {
  name: string
  description?: string
  isCustomizable: boolean
}

interface ConditionWarning {
  text: string
  type: 'condition' | 'warning'
}

interface ServiceConfiguration {
  _id?: string
  category: string
  service: string
  areaOfWork?: string
  pricingModel?: string // Virtual from backend
  pricingModelName: string
  pricingModelType: 'Fixed price' | 'Price per unit'
  pricingModelUnit?: string
  icon?: string
  certificationRequired: boolean
  requiredCertifications?: string[]
  projectTypes: string[]
  includedItems: IncludedItem[]
  professionalInputFields: DynamicField[]
  extraOptions: ExtraOption[]
  conditionsAndWarnings: ConditionWarning[]
  isActive: boolean
  country?: string
  activeCountries?: string[]
  createdAt?: string
  updatedAt?: string
}

const CERTIFICATION_TYPES = [
  'ISO', 'EN', 'VCA', 'BREEAM', 'LEED', 'DGNB',
  'Architect', 'Demolition', 'EPC', 'Asbestos',
  'Gas & Oil', 'Electric', 'Waste Transport', 'Pest Control'
]

const EMPTY_FORM: ServiceConfiguration = {
  category: '',
  service: '',
  areaOfWork: '',
  pricingModelName: '',
  pricingModelType: 'Fixed price',
  pricingModelUnit: '',
  icon: '',
  certificationRequired: false,
  requiredCertifications: [],
  projectTypes: [],
  includedItems: [],
  professionalInputFields: [],
  extraOptions: [],
  conditionsAndWarnings: [],
  isActive: true,
  activeCountries: ['BE']
}

export default function ServiceConfigurationManagement() {
  const router = useRouter()
  const [services, setServices] = useState<ServiceConfiguration[]>([])
  const [loading, setLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [formData, setFormData] = useState<ServiceConfiguration>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [countryFilter, setCountryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Compute unique countries
  const uniqueCountries = React.useMemo(() => {
    const countries = new Set<string>()
    services.forEach(service => {
      if (service.activeCountries?.length) {
        service.activeCountries.forEach(c => countries.add(c))
      } else if (service.country) {
        countries.add(service.country)
      }
    })
    return Array.from(countries).sort()
  }, [services])

  // Compute filtered services
  const filteredServices = React.useMemo(() => {
    return services.filter(service => {
      const serviceCountries = service.activeCountries?.length ? service.activeCountries : (service.country ? [service.country] : [])
      const matchCountry = countryFilter === 'all' || serviceCountries.includes(countryFilter)

      const matchStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && service.isActive) ||
        (statusFilter === 'inactive' && !service.isActive)

      const matchSearch = searchQuery.trim() === '' ||
        service.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (service.areaOfWork && service.areaOfWork.toLowerCase().includes(searchQuery.toLowerCase()))

      return matchCountry && matchStatus && matchSearch
    })
  }, [services, countryFilter, statusFilter, searchQuery])


  // Fetch all services
  const fetchServices = async () => {
    console.log('📡 Fetching services from:', `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations`)
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      console.log('📥 Response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('✅ Services fetched:', data)
        setServices(data.data || [])
      } else {
        const error = await response.json()
        console.error('❌ Fetch failed:', error)
        toast.error(error.message || 'Failed to fetch service configurations')
      }
    } catch (error) {
      console.error('💥 Error fetching services:', error)
      toast.error('Failed to load service configurations')
    } finally {
      setLoading(false)
    }
  }

  // Create new service
  const createService = async (dataOverride?: ServiceConfiguration) => {
    const cleanedActive = (formData.activeCountries || []).filter(Boolean)
    if (cleanedActive.length === 0) {
      toast.error('Please select at least one active country')
      return
    }
    const payload = dataOverride || { ...formData, activeCountries: cleanedActive }
    console.log('Creating service:', payload)
    try {
      setSaving(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      console.log('Create response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('Service created:', data)
        toast.success('Service created successfully!')
        setEditDialogOpen(false)
        setFormData(EMPTY_FORM)
        setEditingId(null)
        await fetchServices()
        router.refresh()
      } else {
        const error = await response.json()
        console.error('Create failed:', error)
        toast.error(error.message || 'Failed to create service')
      }
    } catch (error) {
      console.error('Error creating service:', error)
      toast.error('Failed to create service')
    } finally {
      setSaving(false)
    }
  }

  // Update existing service
  const updateService = async (id: string, dataOverride?: ServiceConfiguration) => {
    const cleanedActive = (dataOverride?.activeCountries ?? formData.activeCountries ?? []).filter(Boolean)
    if (cleanedActive.length === 0) {
      toast.error('Please select at least one active country')
      return
    }
    const payload = dataOverride || { ...formData, activeCountries: cleanedActive }
    console.log(`Updating service ${id}:`, payload)
    try {
      setSaving(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      console.log('Update response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('Service updated:', data)
        toast.success('Service updated successfully!')
        setEditDialogOpen(false)
        setFormData(EMPTY_FORM)
        setEditingId(null)
        await fetchServices()
        router.refresh()
      } else {
        const error = await response.json()
        console.error('Update failed:', error)
        toast.error(error.message || 'Failed to update service')
      }
    } catch (error) {
      console.error('Error updating service:', error)
      toast.error('Failed to update service')
    } finally {
      setSaving(false)
    }
  }

  // Delete service
  const deleteService = async (id: string) => {
    console.log(`🗑️ Deleting service: ${id}`)
    try {
      setDeleting(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/service-configurations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      console.log('📥 Delete response status:', response.status)

      if (response.ok) {
        console.log('✅ Service deleted')
        toast.success('Service deleted successfully')
        setDeleteDialogOpen(false)
        setDeleteId(null)
        await fetchServices()
        router.refresh()
      } else {
        const error = await response.json()
        console.error('❌ Delete failed:', error)
        toast.error(error.message || 'Failed to delete service')
      }
    } catch (error) {
      console.error('💥 Error deleting service:', error)
      toast.error('Failed to delete service')
    } finally {
      setDeleting(false)
    }
  }

  // Open dialog for adding new service
  const handleAddClick = () => {
    console.log('🆕 Opening add dialog')
    setFormData(EMPTY_FORM)
    setEditingId(null)
    setEditDialogOpen(true)
  }

  // Open dialog for editing service
  const handleEditClick = (service: ServiceConfiguration) => {
    console.log('✏️ Opening edit dialog for:', service)
    const legacyCountry = service.country
    const resolvedActiveCountries = Array.isArray(service.activeCountries) && service.activeCountries.length > 0
      ? service.activeCountries
      : legacyCountry ? [legacyCountry] : []
    setFormData({ ...service, activeCountries: resolvedActiveCountries })
    setEditingId(service._id || null)
    setEditDialogOpen(true)
    console.log('✏️ Edit dialog state set to:', true)
  }

  // Open dialog for duplicating a service
  const handleDuplicateClick = (service: ServiceConfiguration) => {
    console.log('📋 Opening duplicate dialog for:', service)
    const legacyCountry = service.country
    const resolvedActiveCountries = Array.isArray(service.activeCountries) && service.activeCountries.length > 0
      ? service.activeCountries
      : legacyCountry ? [legacyCountry] : []

    const { _id, createdAt, updatedAt, ...rest } = service

    setFormData({
      ...rest,
      service: `${service.service} (Copy)`,
      activeCountries: resolvedActiveCountries
    })
    setEditingId(null)
    setEditDialogOpen(true)
  }

  // Open delete confirmation dialog
  const handleDeleteClick = (id: string) => {
    console.log('🗑️ Opening delete dialog for:', id)
    setDeleteId(id)
    setDeleteDialogOpen(true)
    console.log('🗑️ Delete dialog state set to:', true)
  }

  // Handle save button click
  const handleSave = () => {
    if (formData.pricingModelType === 'Price per unit' && !formData.pricingModelUnit?.trim()) {
      toast.error('Pricing unit is required for unit-based pricing')
      return
    }
    if (editingId) {
      updateService(editingId)
    } else {
      createService()
    }
  }

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (deleteId) {
      deleteService(deleteId)
    }
  }

  // Project Type handlers
  const addProjectType = () => {
    setFormData(prev => ({
      ...prev,
      projectTypes: [...prev.projectTypes, '']
    }))
  }

  const removeProjectType = (index: number) => {
    setFormData(prev => ({
      ...prev,
      projectTypes: prev.projectTypes.filter((_, i) => i !== index)
    }))
  }

  const updateProjectType = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      projectTypes: prev.projectTypes.map((item, i) => i === index ? value : item)
    }))
  }

  // Included Item handlers
  const addIncludedItem = () => {
    setFormData(prev => ({
      ...prev,
      includedItems: [...prev.includedItems, { name: '', description: '', isDynamic: false }]
    }))
  }

  const removeIncludedItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      includedItems: prev.includedItems.filter((_, i) => i !== index)
    }))
  }

  const updateIncludedItem = (index: number, field: keyof IncludedItem, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      includedItems: prev.includedItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  // Extra Options handlers
  const addExtraOption = () => {
    setFormData(prev => ({
      ...prev,
      extraOptions: [...prev.extraOptions, { name: '', description: '', isCustomizable: false }]
    }))
  }

  const removeExtraOption = (index: number) => {
    setFormData(prev => ({
      ...prev,
      extraOptions: prev.extraOptions.filter((_, i) => i !== index)
    }))
  }

  const updateExtraOption = (index: number, field: keyof ExtraOption, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      extraOptions: prev.extraOptions.map((opt, i) => i === index ? { ...opt, [field]: value } : opt)
    }))
  }

  // Conditions & Warnings handlers
  const addConditionWarning = () => {
    setFormData(prev => ({
      ...prev,
      conditionsAndWarnings: [...prev.conditionsAndWarnings, { text: '', type: 'condition' }]
    }))
  }

  const removeConditionWarning = (index: number) => {
    setFormData(prev => ({
      ...prev,
      conditionsAndWarnings: prev.conditionsAndWarnings.filter((_, i) => i !== index)
    }))
  }

  const updateConditionWarning = <K extends keyof ConditionWarning>(
    index: number,
    field: K,
    value: ConditionWarning[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      conditionsAndWarnings: prev.conditionsAndWarnings.map((cw, i) =>
        i === index ? ({ ...cw, [field]: value } as ConditionWarning) : cw
      )
    }))
  }

  useEffect(() => {
    fetchServices()
  }, [])

  useEffect(() => {
    console.log('🔄 Edit dialog state changed:', editDialogOpen)
  }, [editDialogOpen])

  useEffect(() => {
    console.log('🔄 Delete dialog state changed:', deleteDialogOpen)
  }, [deleteDialogOpen])

  if (loading) {
    return (
      <Card className="border-2 border-transparent bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Service Configuration Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading services...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 border-transparent bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg relative before:absolute before:inset-0 before:rounded-lg before:p-[2px] before:bg-gradient-to-br before:from-purple-300 before:via-pink-300 before:to-blue-300 before:-z-10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-600" />
                Service Configuration Management
              </CardTitle>
              <CardDescription>
                Manage your service configurations, pricing models, and requirements
              </CardDescription>
            </div>

            <Button
              onClick={handleAddClick}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {services.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Services Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by adding your first service configuration
              </p>
              <Button onClick={handleAddClick} className="bg-gradient-to-r from-purple-500 to-pink-500">
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} configured {services.length !== filteredServices.length && `(filtered from ${services.length})`}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-[300px]">
                    <Input
                      placeholder="Search service or area of work..."
                      value={searchQuery || ''}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="country-filter" className="text-sm font-medium">Country:</Label>
                    <select
                      id="country-filter"
                      className="border rounded-md px-3 py-1.5 bg-white text-sm"
                      value={countryFilter}
                      onChange={(e) => setCountryFilter(e.target.value)}
                    >
                      <option value="all">All Countries</option>
                      {uniqueCountries.map(country => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label htmlFor="status-filter" className="text-sm font-medium">Status:</Label>
                    <select
                      id="status-filter"
                      className="border rounded-md px-3 py-1.5 bg-white text-sm"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-2 border-transparent bg-white rounded-lg overflow-hidden relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-blue-200 before:via-purple-200 before:to-pink-200 before:-z-10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Icon</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Area of Work</TableHead>
                      <TableHead>Pricing Model</TableHead>
                      <TableHead>Active Country</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServices.map((service) => (
                      <TableRow key={service._id}>
                        <TableCell>
                          {service.icon && iconMapData[service.icon as keyof typeof iconMapData] ? (
                            React.createElement(iconMapData[service.icon as keyof typeof iconMapData], { className: "h-5 w-5 text-gray-500" })
                          ) : (
                            <ImageIcon className="h-5 w-5 text-gray-300" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{service.category}</TableCell>
                        <TableCell>{service.service}</TableCell>
                        <TableCell>{service.areaOfWork || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {service.pricingModelName}
                          {service.pricingModelType === 'Price per unit' && (
                            <div className="text-xs text-muted-foreground">
                              Type: {service.pricingModelType} ({service.pricingModelUnit})
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {service.activeCountries?.length ? (
                              service.activeCountries.map(c => (
                                <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                              ))
                            ) : service.country ? (
                              <Badge variant="outline" className="text-xs">{service.country}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {service.isActive ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClick(service)}
                              className="h-8 px-2 hover:bg-blue-50"
                              title="Edit service"
                            >
                              <Edit2 className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(service._id!)}
                              className="h-8 px-2 hover:bg-red-50"
                              title="Delete service"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDuplicateClick(service)}
                              className="h-8 px-2 hover:bg-green-50"
                              title="Duplicate service"
                            >
                              <Copy className="h-4 w-4 text-green-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        console.log('🔄 Dialog onOpenChange called with:', open)
        setEditDialogOpen(open)
        if (!open) {
          setFormData(EMPTY_FORM)
          setEditingId(null)
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {editingId ? 'Edit Service Configuration' : 'Add New Service Configuration'}
            </DialogTitle>
            <DialogDescription>
              Configure the service details, pricing model, and requirements
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Basic Information */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-purple-200 before:to-pink-200 before:-z-10">
              <h3 className="font-semibold text-lg">Basic Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g., Exterior, Interior"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="service">Service *</Label>
                  <Input
                    id="service"
                    value={formData.service}
                    onChange={(e) => setFormData(prev => ({ ...prev, service: e.target.value }))}
                    placeholder="e.g., Architect, Plumbing"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Icon</Label>
                  <IconPicker
                    value={formData.icon || ''}
                    onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
                  />
                </div>

              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="areaOfWork">Area of Work</Label>
                  <Input
                    id="areaOfWork"
                    value={formData.areaOfWork}
                    onChange={(e) => setFormData(prev => ({ ...prev, areaOfWork: e.target.value }))}
                    placeholder="e.g., Strip Foundations, Raft Foundation"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pricingModelName">Pricing Model Name *</Label>
                  <Input
                    id="pricingModelName"
                    value={formData.pricingModelName}
                    onChange={(e) => setFormData(prev => ({ ...prev, pricingModelName: e.target.value }))}
                    placeholder="e.g., Total price, Per m²"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pricingModelType">Pricing Type *</Label>
                  <select
                    id="pricingModelType"
                    className="w-full border rounded-md px-3 py-2 bg-white text-sm"
                    value={formData.pricingModelType}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      pricingModelType: e.target.value as 'Fixed price' | 'Price per unit',
                      pricingModelUnit: e.target.value === 'Fixed price' ? '' : prev.pricingModelUnit
                    }))}
                  >
                    <option value="Fixed price">Fixed price</option>
                    <option value="Price per unit">Price per unit</option>
                  </select>
                </div>

                {formData.pricingModelType === 'Price per unit' && (
                  <div className="space-y-2">
                    <Label htmlFor="pricingModelUnit">Pricing Unit *</Label>
                    <Input
                      id="pricingModelUnit"
                      value={formData.pricingModelUnit || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, pricingModelUnit: e.target.value }))}
                      placeholder="e.g., m2, hour, day"
                    />
                  </div>
                )}
              </div>

              {/* Active Countries */}
              <div className="space-y-2">
                <Label htmlFor="activeCountries">Active Countries</Label>
                <Input
                  id="activeCountries"
                  value={(formData.activeCountries || []).join(', ')}
                  onChange={(e) => {
                    console.log('ActiveCountries input change:', e.target.value)
                    const parts = e.target.value.split(',').map(s => s.trim())
                    setFormData(prev => ({ ...prev, activeCountries: parts }))
                  }}
                  placeholder="e.g., BE, NL, FR"
                />
                <p className="text-xs text-muted-foreground">Comma-separated ISO country codes</p>
              </div>

              {/* Required Certifications */}
              <div className="space-y-2">
                <Label>Required Certifications</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {CERTIFICATION_TYPES.map((type) => {
                    const checked = (formData.requiredCertifications || []).includes(type)
                    return (
                      <div key={type} className="flex items-center space-x-2 p-2 border rounded">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const isChecked = Boolean(v)
                            setFormData(prev => ({
                              ...prev,
                              requiredCertifications: isChecked
                                ? [...(prev.requiredCertifications || []), type]
                                : (prev.requiredCertifications || []).filter(t => t !== type)
                            }))
                          }}
                        />
                        <Label className="cursor-pointer text-sm">{type}</Label>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="isActive">Service Active</Label>
              </div>
            </div>

            {/* Project Types */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-blue-200 before:to-purple-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Project Types</h3>
                <Button onClick={addProjectType} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Type
                </Button>
              </div>

              <div className="space-y-2">
                {formData.projectTypes.map((type, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={type}
                      onChange={(e) => updateProjectType(index, e.target.value)}
                      placeholder="e.g., New Built, Extension, Refurbishment"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => removeProjectType(index)}
                      variant="ghost"
                      size="sm"
                      className="hover:bg-red-50"
                    >
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
                {formData.projectTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No project types added yet</p>
                )}
              </div>
            </div>

            {/* Extra Options */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-yellow-200 before:to-orange-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Extra Options</h3>
                <Button onClick={addExtraOption} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Extra
                </Button>
              </div>
              <div className="space-y-3">
                {(formData.extraOptions || []).map((opt, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2 bg-gray-50">
                    <div className="flex gap-2">
                      <Input
                        value={opt.name}
                        onChange={(e) => updateExtraOption(index, 'name', e.target.value)}
                        placeholder="Extra name"
                        className="flex-1 bg-white"
                      />
                      <Button
                        onClick={() => removeExtraOption(index)}
                        variant="ghost"
                        size="sm"
                        className="hover:bg-red-50"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                    <Input
                      value={opt.description || ''}
                      onChange={(e) => updateExtraOption(index, 'description', e.target.value)}
                      placeholder="Description (optional)"
                      className="bg-white"
                    />
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`extra-customizable-${index}`}
                        checked={!!opt.isCustomizable}
                        onCheckedChange={(checked) => updateExtraOption(index, 'isCustomizable', checked)}
                      />
                      <Label htmlFor={`extra-customizable-${index}`}>Customizable by professional</Label>
                    </div>
                  </div>
                ))}
                {(!formData.extraOptions || formData.extraOptions.length === 0) && (
                  <p className="text-sm text-muted-foreground">No extras added yet</p>
                )}
              </div>
            </div>

            {/* Conditions & Warnings */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-red-200 before:to-pink-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Conditions & Warnings</h3>
                <Button onClick={addConditionWarning} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-3">
                {(formData.conditionsAndWarnings || []).map((cw, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2 bg-gray-50">
                    <div className="flex gap-2">
                      <Input
                        value={cw.text}
                        onChange={(e) => updateConditionWarning(index, 'text', e.target.value)}
                        placeholder="Condition or warning text"
                        className="flex-1 bg-white"
                      />
                      <select
                        className="border rounded px-2 py-1 bg-white"
                        value={cw.type}
                        onChange={(e) => updateConditionWarning(index, 'type', e.target.value as 'condition' | 'warning')}
                      >
                        <option value="condition">Condition</option>
                        <option value="warning">Warning</option>
                      </select>
                      <Button
                        onClick={() => removeConditionWarning(index)}
                        variant="ghost"
                        size="sm"
                        className="hover:bg-red-50"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(!formData.conditionsAndWarnings || formData.conditionsAndWarnings.length === 0) && (
                  <p className="text-sm text-muted-foreground">No conditions or warnings added yet</p>
                )}
              </div>
            </div>

            {/* Included Items */}
            <div className="space-y-4 p-4 rounded-lg border-2 border-transparent bg-white relative before:absolute before:inset-0 before:rounded-lg before:p-[1px] before:bg-gradient-to-br before:from-green-200 before:to-blue-200 before:-z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Included Items</h3>
                <Button onClick={addIncludedItem} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {formData.includedItems.map((item, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2 bg-gray-50">
                    <div className="flex gap-2">
                      <Input
                        value={item.name}
                        onChange={(e) => updateIncludedItem(index, 'name', e.target.value)}
                        placeholder="Item name"
                        className="flex-1 bg-white"
                      />
                      <Button
                        onClick={() => removeIncludedItem(index)}
                        variant="ghost"
                        size="sm"
                        className="hover:bg-red-50"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                    <Input
                      value={item.description || ''}
                      onChange={(e) => updateIncludedItem(index, 'description', e.target.value)}
                      placeholder="Description (optional)"
                      className="bg-white"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={!!item.isDynamic}
                          onCheckedChange={(checked) => updateIncludedItem(index, 'isDynamic', Boolean(checked))}
                        />
                        <Label className="text-sm">Parameter?</Label>
                      </div>
                      {item.isDynamic && (
                        <>
                          <Input
                            value={item.dynamicField?.fieldName || ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setFormData(prev => ({
                                ...prev,
                                includedItems: prev.includedItems.map((it, i) => i === index ? ({
                                  ...it,
                                  dynamicField: { ...(it.dynamicField || {}), fieldName: v }
                                }) : it)
                              }))
                            }}
                            placeholder="Field name (unique id)"
                            className="bg-white"
                          />
                          <Input
                            value={item.dynamicField?.label || ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setFormData(prev => ({
                                ...prev,
                                includedItems: prev.includedItems.map((it, i) => i === index ? ({
                                  ...it,
                                  dynamicField: { ...(it.dynamicField || {}), label: v }
                                }) : it)
                              }))
                            }}
                            placeholder="Label"
                            className="bg-white"
                          />
                        </>
                      )}
                    </div>
                    {item.isDynamic && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Type</Label>
                          <select
                            className="border rounded px-2 py-1 bg-white w-full"
                            value={item.dynamicField?.fieldType || 'text'}
                            onChange={(e) => {
                              const v = e.target.value as DynamicField['fieldType']
                              setFormData(prev => ({
                                ...prev,
                                includedItems: prev.includedItems.map((it, i) => i === index ? ({
                                  ...it,
                                  dynamicField: { ...(it.dynamicField || {}), fieldType: v }
                                }) : it)
                              }))
                            }}
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="dropdown">Dropdown</option>
                            <option value="range">Range</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Unit</Label>
                          <Input
                            value={item.dynamicField?.unit || ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setFormData(prev => ({
                                ...prev,
                                includedItems: prev.includedItems.map((it, i) => i === index ? ({
                                  ...it,
                                  dynamicField: { ...(it.dynamicField || {}), unit: v }
                                }) : it)
                              }))
                            }}
                            placeholder="e.g. m2, kW"
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Placeholder</Label>
                          <Input
                            value={item.dynamicField?.placeholder || ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setFormData(prev => ({
                                ...prev,
                                includedItems: prev.includedItems.map((it, i) => i === index ? ({
                                  ...it,
                                  dynamicField: { ...(it.dynamicField || {}), placeholder: v }
                                }) : it)
                              }))
                            }}
                            placeholder="Helper text"
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Min</Label>
                          <Input
                            type="number"
                            value={item.dynamicField?.min ?? ''}
                            onChange={(e) => {
                              const v = e.target.value ? Number(e.target.value) : undefined
                              setFormData(prev => ({
                                ...prev,
                                includedItems: prev.includedItems.map((it, i) => i === index ? ({
                                  ...it,
                                  dynamicField: { ...(it.dynamicField || {}), min: v }
                                }) : it)
                              }))
                            }}
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Max</Label>
                          <Input
                            type="number"
                            value={item.dynamicField?.max ?? ''}
                            onChange={(e) => {
                              const v = e.target.value ? Number(e.target.value) : undefined
                              setFormData(prev => ({
                                ...prev,
                                includedItems: prev.includedItems.map((it, i) => i === index ? ({
                                  ...it,
                                  dynamicField: { ...(it.dynamicField || {}), max: v }
                                }) : it)
                              }))
                            }}
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Options (comma separated)</Label>
                          <Input
                            value={(item.dynamicField?.options || []).join(', ')}
                            onChange={(e) => {
                              const v = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                              setFormData(prev => ({
                                ...prev,
                                includedItems: prev.includedItems.map((it, i) => i === index ? ({
                                  ...it,
                                  dynamicField: { ...(it.dynamicField || {}), options: v }
                                }) : it)
                              }))
                            }}
                            placeholder="Only for dropdown"
                            className="bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {formData.includedItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">No included items added yet</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false)
                  setFormData(EMPTY_FORM)
                  setEditingId(null)
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  !formData.category ||
                  !formData.service ||
                  !formData.pricingModelName ||
                  (formData.pricingModelType === 'Price per unit' && !formData.pricingModelUnit?.trim()) ||
                  saving
                }
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingId ? 'Update Service' : 'Create Service'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        console.log('🔄 Delete dialog onOpenChange called with:', open)
        setDeleteDialogOpen(open)
      }}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Service Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this service configuration? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeleteId(null)
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Service
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
