import { parseFlexibleNumber } from '@/lib/numberInput'

export const WIZARD_STEP_TITLES: Record<number, string> = {
  1: "Basic Info",
  2: "Subprojects & Pricing",
  3: "Extra Options",
  4: "FAQ",
  5: "RFQ Questions",
  6: "Post-Booking Questions",
  7: "Custom Message",
  8: "Review & Submit",
}

export type WizardStepError = {
  step: number
  stepTitle: string
  messages: string[]
}

type SubprojectSnapshot = {
  name?: string
  description?: string
  pricing?: {
    type?: "fixed" | "unit" | "rfq" | string
    amount?: number
    priceRange?: { min?: number; max?: number }
  }
  errors?: { priceRange?: string; executionDurationRange?: string }
  included?: Array<{ name?: string }>
  materialsIncluded?: boolean
  materials?: Array<{ name?: string }>
  preparationDuration?: { value?: number }
  executionDuration?: {
    value?: number
    range?: { min?: number; max?: number }
  }
  professionalInputs?: Array<{
    fieldName?: string
    value?: string | number | { min?: number; max?: number } | null
  }>
}

export type WizardProjectSnapshot = {
  category?: string
  service?: string
  areaOfWork?: string
  title?: string
  description?: string
  priceModel?: string
  distance?: { address?: string; maxKmRange?: number }
  resources?: string[]
  intakeMeeting?: { resources?: string[] }
  certifications?: Array<{ name?: string; fileUrl?: string }>
  vatProfessionalAnswers?: Array<{ fieldName: string; value: unknown }>
  customerPresence?: string
  subprojects?: SubprojectSnapshot[]
  extraOptions?: Array<{ name?: string; price?: number }>
  termsConditions?: Array<{ name?: string; description?: string }>
  faq?: Array<{ question?: string; answer?: string }>
  rfqQuestions?: Array<{ question?: string; type?: string; options?: string[] }>
  postBookingQuestions?: Array<{ question?: string; type?: string; options?: string[] }>
  requiredProfessionalFields?: Array<{ fieldName: string; label?: string }>
}

export type Step1ProfessionalVatQuestion = {
  question: string
  fieldName: string
  answerType: 'number' | 'yes_no' | 'checkboxes'
  unit?: string
  options?: string[]
  isRequired?: boolean
}

export type Step1ServiceConfig = {
  _id?: string
  pricingModels?: string[]
  pricingModel?: string
  pricingOptions?: Array<{ name: string; pricingType: 'fixed_price' | 'price_per_unit'; unit?: string }>
  certificationRequired?: boolean
  requiredCertifications?: string[]
  projectTypes?: string[]
  areaOfWorkRequired?: boolean
  vatManagement?: {
    enabled?: boolean
    article47Classification?: 'movable' | 'immovable' | 'project_dependent'
    professionalVatQuestions?: Step1ProfessionalVatQuestion[]
  }
}

export type Step1ValidationContext = {
  dataSignature: string
  addressValid: boolean
  serviceConfig: Step1ServiceConfig | null
  serviceConfigLoaded: boolean
}

const isProfessionalVatAnswered = (question: Step1ProfessionalVatQuestion, value: unknown): boolean => {
  if (question.answerType === 'yes_no') return value === true || value === false
  if (question.answerType === 'number') {
    if (value === '' || value == null) return false
    const parsed = typeof value === 'number' ? value : parseFlexibleNumber(String(value))
    return Number.isFinite(parsed)
  }
  if (question.answerType === 'checkboxes') return Array.isArray(value) && value.length > 0
  return value != null && String(value).trim() !== ''
}

export const getStep1DataSignature = (data: WizardProjectSnapshot): string => JSON.stringify({
  category: data.category || '',
  service: data.service || '',
  areaOfWork: data.areaOfWork || '',
  title: data.title || '',
  description: data.description || '',
  priceModel: data.priceModel || '',
  distance: { address: data.distance?.address || '', maxKmRange: data.distance?.maxKmRange ?? null },
  resources: data.resources || [],
  intakeResources: data.intakeMeeting?.resources || [],
  certifications: (data.certifications || []).map((certification) => ({ name: certification.name || '', fileUrl: certification.fileUrl || '' })),
  vatProfessionalAnswers: data.vatProfessionalAnswers || [],
})

export function collectStep1ComponentErrors(data: WizardProjectSnapshot, serviceConfig: Step1ServiceConfig | null, addressValid: boolean): string[] {
  const errors: string[] = []
  const isRenovation = (data.category || '').toLowerCase() === 'renovation'
  const requiredTypes = serviceConfig?.requiredCertifications || []
  const certRequired = !!serviceConfig?.certificationRequired
  if (!data.category) errors.push('Category is required')
  if (!data.service) errors.push('Service is required')
  if (serviceConfig?.areaOfWorkRequired && !data.areaOfWork) errors.push('Area of Work is required for this service')
  if (!data.title) errors.push('Title is required')
  else if (data.title.length < 30) errors.push('Title must be at least 30 characters long')
  if (requiredTypes.length > 0) {
    const missing = requiredTypes.filter((type) => !data.certifications?.some((certification) => certification.name === type && !!certification.fileUrl))
    if (missing.length > 0) errors.push(`Missing required certifications: ${missing.join(', ')}`)
  } else if (certRequired) {
    const hasValidCertification = Array.isArray(data.certifications) && data.certifications.length > 0 && data.certifications.every((certification) => !!certification.fileUrl)
    if (!hasValidCertification) errors.push('At least one valid certification is required for this service')
  }
  const hasExecutionResources = Array.isArray(data.resources) && data.resources.length > 0
  const hasIntakeResources = Array.isArray(data.intakeMeeting?.resources) && data.intakeMeeting.resources.length > 0
  if (isRenovation) {
    if (!hasIntakeResources) errors.push('At least one intake meeting resource is required for Renovation')
    if (!hasExecutionResources) errors.push('At least one execution resource is required for Renovation')
  } else if (!hasExecutionResources) errors.push('At least one team member must be assigned for execution')
  if (!data.description) errors.push('Description is required')
  else if (data.description.length < 100) errors.push(`Description must be at least 100 characters (currently ${data.description.length})`)
  if (!isRenovation && !data.priceModel) errors.push('Price Model is required')
  if (!data.distance?.address) errors.push('Service Address is required')
  if (!addressValid) errors.push('Please enter a valid address')
  if (!data.distance?.maxKmRange) errors.push('Maximum Service Range is required')
  else if (data.distance.maxKmRange <= 0) errors.push('Maximum Service Range must be positive')
  const requiredVatQuestions = serviceConfig?.vatManagement?.enabled ? serviceConfig.vatManagement.professionalVatQuestions || [] : []
  for (const question of requiredVatQuestions.filter((candidate) => candidate.isRequired !== false)) {
    const value = data.vatProfessionalAnswers?.find((answer) => answer.fieldName === question.fieldName)?.value
    if (!isProfessionalVatAnswered(question, value)) errors.push(`VAT question required: ${question.question}`)
  }
  return errors
}

function packageLabel(sub: SubprojectSnapshot, index: number): string {
  return sub.name?.trim() || `Package ${index + 1}`
}

export function collectSubprojectErrors(
  sub: SubprojectSnapshot,
  index: number,
  requiredFields: Array<{ fieldName: string; label?: string }> = [],
): string[] {
  const label = packageLabel(sub, index)
  const errors: string[] = []

  if (!sub.name?.trim()) errors.push(`${label}: package name is required`)
  if (!sub.description?.trim()) {
    errors.push(`${label}: package scope is required`)
  } else if (sub.description.trim().length < 10) {
    errors.push(`${label}: package scope must be at least 10 characters`)
  }

  if (!sub.pricing?.type) {
    errors.push(`${label}: pricing type is required`)
  } else if (sub.pricing.type === "rfq") {
    const { min, max } = sub.pricing.priceRange || {}
    if (min !== undefined && max !== undefined && min > max) {
      errors.push(`${label}: RFQ price range minimum cannot be above maximum`)
    }
    const range = sub.executionDuration?.range
    const hasMin = typeof range?.min === "number" && Number.isFinite(range.min)
    const hasMax = typeof range?.max === "number" && Number.isFinite(range.max)
    if (!hasMin && !hasMax) {
      errors.push(`${label}: execution duration range is required for RFQ packages`)
    } else {
      if (hasMin && range!.min! <= 0) errors.push(`${label}: execution duration minimum must be greater than 0`)
      if (hasMax && range!.max! <= 0) errors.push(`${label}: execution duration maximum must be greater than 0`)
      if (hasMin && hasMax && range!.min! > range!.max!) {
        errors.push(`${label}: execution duration minimum cannot be above maximum`)
      }
    }
  } else {
    if (sub.pricing.amount == null || sub.pricing.amount <= 0) {
      errors.push(`${label}: a price greater than 0 is required`)
    }
    if (!sub.executionDuration?.value || sub.executionDuration.value <= 0) {
      errors.push(`${label}: execution duration is required`)
    }
  }

  const namedIncluded = (sub.included || []).filter((item) => item.name?.trim())
  if (namedIncluded.length < 3) {
    errors.push(`${label}: at least 3 included items with names are required`)
  }
  if ((sub.included || []).some((item) => !item.name?.trim())) {
    errors.push(`${label}: every included item needs a name`)
  }

  if (typeof sub.materialsIncluded !== "boolean") {
    errors.push(`${label}: say whether materials are included`)
  } else if (sub.materialsIncluded) {
    const namedMaterials = (sub.materials || []).filter((item) => item.name?.trim())
    if (namedMaterials.length === 0) {
      errors.push(`${label}: add at least one material when materials are included`)
    }
  }

  if (typeof sub.preparationDuration?.value !== "number") {
    errors.push(`${label}: preparation duration is required`)
  }

  if (sub.errors?.priceRange) errors.push(`${label}: ${sub.errors.priceRange}`)
  if (sub.errors?.executionDurationRange) errors.push(`${label}: ${sub.errors.executionDurationRange}`)

  errors.push(...collectRequiredProfessionalInputErrors(sub, index, requiredFields))
  return errors
}

type ProfessionalInputValue = string | number | { min?: number; max?: number } | null | undefined

export function isProfessionalInputMissing(value: ProfessionalInputValue): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  if (typeof value === "object") {
    return (value.min == null) && (value.max == null)
  }
  return false
}

export function collectRequiredProfessionalInputErrors(
  sub: SubprojectSnapshot,
  index: number,
  requiredFields: Array<{ fieldName: string; label?: string }> = [],
): string[] {
  if (requiredFields.length === 0) return []
  const label = packageLabel(sub, index)
  return requiredFields.flatMap((field) => {
    const input = (sub.professionalInputs || []).find((item) => item.fieldName === field.fieldName)
    return isProfessionalInputMissing(input?.value)
      ? [`${label}: ${field.label || field.fieldName} is required`]
      : []
  })
}

export function collectStepErrors(step: number, data: WizardProjectSnapshot): string[] {
  switch (step) {
    case 1: {
      const errors: string[] = []
      if (!data.category) errors.push("Category is required")
      if (!data.service) errors.push("Service is required")
      if (!data.title?.trim()) errors.push("Title is required")
      else if (data.title.trim().length < 30) errors.push("Title must be at least 30 characters")
      if (!data.description?.trim()) errors.push("Description is required")
      else if (data.description.trim().length < 100) {
        errors.push(`Description must be at least 100 characters (currently ${data.description.trim().length})`)
      }
      const isRenovation = (data.category || "").toLowerCase() === "renovation"
      if (!isRenovation && !data.priceModel) errors.push("Price model is required")
      if (!data.distance?.address?.trim()) errors.push("Service address is required")
      if (!data.distance?.maxKmRange || data.distance.maxKmRange <= 0) {
        errors.push("Maximum service range is required")
      }
      if (!Array.isArray(data.resources) || data.resources.length === 0) {
        errors.push("At least one team member must be assigned for execution")
      }
      if (isRenovation && (!data.intakeMeeting?.resources || data.intakeMeeting.resources.length === 0)) {
        errors.push("At least one intake meeting resource is required for renovation")
      }
      return errors
    }
    case 2: {
      if (!data.subprojects || data.subprojects.length === 0) {
        return ["At least one package / subproject is required"]
      }
      return data.subprojects.flatMap((sub, index) =>
        collectSubprojectErrors(sub, index, data.requiredProfessionalFields),
      )
    }
    case 3: {
      const errors: string[] = []
      if (!data.customerPresence) errors.push("Customer presence selection is required")
      for (const [index, option] of (data.extraOptions || []).entries()) {
        if (!option.name?.trim()) errors.push(`Extra option ${index + 1}: name is required`)
        if (option.price == null || option.price < 0) errors.push(`Extra option ${index + 1}: price is required`)
      }
      for (const [index, term] of (data.termsConditions || []).entries()) {
        if (!term.name?.trim()) errors.push(`Term ${index + 1}: name is required`)
        if (!term.description?.trim()) errors.push(`Term ${index + 1}: description is required`)
      }
      return errors
    }
    case 4:
      return (data.faq || [])
        .map((item, index) => {
          if (!item.question?.trim() || !item.answer?.trim()) {
            return `FAQ ${index + 1}: question and answer are both required`
          }
          return null
        })
        .filter((message): message is string => Boolean(message))
    case 5:
      return (data.rfqQuestions || [])
        .map((item, index) => {
          if (!item.question?.trim()) return `RFQ question ${index + 1}: question text is required`
          if (item.type === "multiple_choice" && (!item.options || item.options.filter(Boolean).length < 2)) {
            return `RFQ question ${index + 1}: add at least two choices`
          }
          return null
        })
        .filter((message): message is string => Boolean(message))
    case 6:
      return (data.postBookingQuestions || [])
        .map((item, index) => {
          if (!item.question?.trim()) return `Post-booking question ${index + 1}: question text is required`
          if (item.type === "multiple_choice" && (!item.options || item.options.filter(Boolean).length < 2)) {
            return `Post-booking question ${index + 1}: add at least two choices`
          }
          return null
        })
        .filter((message): message is string => Boolean(message))
    default:
      return []
  }
}

// Steps 7 and 8 carry no blocking rules; 4-6 only fail when the user added incomplete entries.
const VALIDATED_STEPS = [1, 2, 3, 4, 5, 6]

export function collectBlockingWizardErrors(data: WizardProjectSnapshot): WizardStepError[] {
  const blocking: WizardStepError[] = []
  for (const step of VALIDATED_STEPS) {
    const messages = collectStepErrors(step, data)
    if (messages.length > 0) {
      blocking.push({ step, stepTitle: WIZARD_STEP_TITLES[step], messages })
    }
  }
  return blocking
}

export function mapBackendFieldToStep(path: string): number {
  const lower = path.toLowerCase()
  if (lower.includes("subproject")) return 2
  if (lower.includes("extraoption") || lower.includes("termscondition") || lower.includes("customerpresence")) return 3
  if (lower.includes("faq")) return 4
  if (lower.includes("rfq")) return 5
  if (lower.includes("postbooking")) return 6
  return 1
}

export function parseProjectSaveError(payload: {
  error?: unknown
  details?: unknown
  qualityChecks?: Array<{ message?: string }>
}): { messages: string[]; step: number | null } {
  const messages: string[] = []
  if (Array.isArray(payload.qualityChecks)) {
    for (const check of payload.qualityChecks) {
      if (check?.message) messages.push(check.message)
    }
  }
  if (typeof payload.details === "string" && payload.details.trim()) {
    messages.push(payload.details)
  } else if (Array.isArray(payload.details)) {
    for (const entry of payload.details) {
      if (typeof entry === "string" && entry.trim()) messages.push(entry)
    }
  }
  const error = typeof payload.error === "string" ? payload.error.trim() : ""
  if (error && !messages.includes(error)) messages.push(error)

  if (messages.length === 0) {
    messages.push("Could not save the project. Check the highlighted step and try again.")
  }

  const blob = messages.join(" ")
  const pathMatch = blob.match(/subprojects|faq|rfq|postBooking|extraOptions|termsConditions|title|description|distance|service/i)
  return { messages, step: pathMatch ? mapBackendFieldToStep(pathMatch[0]) : null }
}
