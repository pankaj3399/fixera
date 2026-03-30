export interface QuotationMilestone {
  title: string
  amount: number
  description?: string
  dueCondition: 'on_start' | 'on_milestone_completion' | 'on_project_completion' | 'custom_date'
  customDueDate?: string
  order: number
  status: 'pending' | 'invoiced' | 'paid' | 'overdue'
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
  totalAmount: number
  currency: string
  milestones?: QuotationMilestone[]
  preparationDuration: { value: number; unit: 'hours' | 'days' }
  executionDuration: { value: number; unit: 'hours' | 'days' }
  bufferDuration?: { value: number; unit: 'hours' | 'days' }
  validUntil: string
  createdAt: string
  changeNote?: string
}

export interface QuotationWizardFormData {
  scope: string
  warrantyDuration: { value: number; unit: 'months' | 'years' }
  materialsIncluded: boolean
  materials: QuoteMaterial[]
  description: string
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
