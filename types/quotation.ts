export interface QuotationPricingLine {
  clientKey?: string
  description: string
  price: number
  vatRate: number
  vatCountry?: string
  vatLabel?: string
  vatRateMode?: 'preset' | 'custom'
  vatRateExplicitlyEntered?: boolean
}

export interface QuotationMilestone {
  title: string
  amount: number
  description?: string
  dueCondition: 'on_start' | 'on_milestone_start' | 'on_milestone_completion' | 'custom_date'
  customDueDate?: string
  order: number
  status: 'pending' | 'invoiced' | 'paid' | 'overdue'
}

export interface BookingMilestone extends QuotationMilestone {
  workStatus?: 'pending' | 'in_progress' | 'completed'
  stripePaymentIntentId?: string
  stripeClientSecret?: string
  startedAt?: string
  completedAt?: string
  paidAt?: string
}

export interface QuoteMaterial {
  name: string
  quantity?: number
  unit?: string
  description?: string
}

export interface QuoteVersion {
  version: number
  quotationNumber: string
  scope: string
  warrantyDuration: { value: number; unit: 'months' | 'years' }
  materialsIncluded: boolean
  materials?: QuoteMaterial[]
  description: string
  pricingLines?: QuotationPricingLine[]
  totalAmount: number
  currency: string
  milestones?: QuotationMilestone[]
  preparationDuration: { value: number; unit: 'hours' | 'days' }
  executionDuration: { value: number; unit: 'hours' | 'days' }
  bufferDuration?: { value: number; unit: 'hours' | 'days' }
  validUntil: string
  createdAt: string
  changeNote?: string
  firstPossibleStart?: string | null
}

export interface QuotationServiceLocation {
  country: string
  address?: string
  city?: string
  postalCode?: string
}

export interface QuotationWizardFormData {
  scope: string
  serviceLocation?: QuotationServiceLocation
  warrantyDuration: { value: number; unit: 'months' | 'years' }
  materialsIncluded: boolean | null
  materials: QuoteMaterial[]
  description: string
  pricingLines: QuotationPricingLine[]
  totalAmount: number
  currency: string
  useMilestones: boolean
  milestones: QuotationMilestone[]
  preparationDuration: { value: number; unit: 'hours' | 'days' }
  executionDuration: { value: number; unit: 'hours' | 'days' }
  bufferDuration: { value: number; unit: 'hours' | 'days' }
  useBuffer: boolean
  validUntil: string
  changeNote: string
}
