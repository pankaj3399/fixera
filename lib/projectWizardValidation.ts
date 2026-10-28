import type { useTranslations } from 'next-intl'

import { parseFlexibleNumber } from '@/lib/numberInput'

/**
 * Translator for the `projectWizard` namespace. Validators live outside React,
 * so every consumer passes its `useTranslations("projectWizard")` result in and
 * the messages are resolved in the active locale.
 */
export type WizardTranslator = ReturnType<typeof useTranslations<'projectWizard'>>

export type WizardStepTitleKey =
  | 'steps.1'
  | 'steps.2'
  | 'steps.3'
  | 'steps.4'
  | 'steps.5'
  | 'steps.6'
  | 'steps.7'
  | 'steps.8'

/** Step title message keys — translate with the `projectWizard` namespace. */
export const WIZARD_STEP_TITLES: Record<number, WizardStepTitleKey> = {
  1: 'steps.1',
  2: 'steps.2',
  3: 'steps.3',
  4: 'steps.4',
  5: 'steps.5',
  6: 'steps.6',
  7: 'steps.7',
  8: 'steps.8',
}

export type WizardStepError = {
  step: number
  stepTitle: WizardStepTitleKey
  messages: string[]
}

/**
 * Quick-add detection. New projects store canonical English item names, while
 * drafts created before the canonical-name fix may still contain the translated
 * label; both must disable the chip instead of adding a duplicate.
 */
export function isQuickAddItemIncluded(
  includedNames: ReadonlyArray<string | null | undefined>,
  canonicalName: string,
  translatedLabel?: string
): boolean {
  return includedNames.some(
    (name) =>
      name === canonicalName ||
      (translatedLabel != null && name === translatedLabel)
  )
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

export function collectStep1ComponentErrors(
  data: WizardProjectSnapshot,
  serviceConfig: Step1ServiceConfig | null,
  addressValid: boolean,
  t: WizardTranslator,
): string[] {
  const errors: string[] = []
  const isRenovation = (data.category || '').toLowerCase() === 'renovation'
  const requiredTypes = serviceConfig?.requiredCertifications || []
  const certRequired = !!serviceConfig?.certificationRequired
  if (!data.category) errors.push(t('validation.categoryRequired'))
  if (!data.service) errors.push(t('validation.serviceRequired'))
  if (serviceConfig?.areaOfWorkRequired && !data.areaOfWork) errors.push(t('validation.areaOfWorkRequired'))
  if (!data.title) errors.push(t('validation.titleRequired'))
  else if (data.title.length < 30) errors.push(t('validation.titleMin30Long'))
  if (requiredTypes.length > 0) {
    const missing = requiredTypes.filter((type) => !data.certifications?.some((certification) => certification.name === type && !!certification.fileUrl))
    if (missing.length > 0) errors.push(t('validation.missingCertifications', { certifications: missing.join(', ') }))
  } else if (certRequired) {
    const hasValidCertification = Array.isArray(data.certifications) && data.certifications.length > 0 && data.certifications.every((certification) => !!certification.fileUrl)
    if (!hasValidCertification) errors.push(t('validation.validCertificationRequired'))
  }
  const hasExecutionResources = Array.isArray(data.resources) && data.resources.length > 0
  const hasIntakeResources = Array.isArray(data.intakeMeeting?.resources) && data.intakeMeeting.resources.length > 0
  if (isRenovation) {
    if (!hasIntakeResources) errors.push(t('validation.intakeResourceRenovation'))
    if (!hasExecutionResources) errors.push(t('validation.executionResourceRenovation'))
  } else if (!hasExecutionResources) errors.push(t('validation.teamMemberExecution'))
  if (!data.description) errors.push(t('validation.descriptionRequired'))
  else if (data.description.length < 100) errors.push(t('validation.descriptionMin100', { count: data.description.length }))
  if (!isRenovation && !data.priceModel) errors.push(t('validation.priceModelRequiredUpper'))
  if (!data.distance?.address) errors.push(t('validation.serviceAddressRequiredUpper'))
  if (!addressValid) errors.push(t('validation.invalidAddress'))
  if (!data.distance?.maxKmRange) errors.push(t('validation.maxRangeRequiredUpper'))
  else if (data.distance.maxKmRange <= 0) errors.push(t('validation.maxRangePositive'))
  const requiredVatQuestions = serviceConfig?.vatManagement?.enabled ? serviceConfig.vatManagement.professionalVatQuestions || [] : []
  for (const question of requiredVatQuestions.filter((candidate) => candidate.isRequired !== false)) {
    const value = data.vatProfessionalAnswers?.find((answer) => answer.fieldName === question.fieldName)?.value
    if (!isProfessionalVatAnswered(question, value)) errors.push(t('validation.vatQuestionRequired', { question: question.question }))
  }
  return errors
}

function packageLabel(sub: SubprojectSnapshot, index: number, t: WizardTranslator): string {
  return sub.name?.trim() || t('validation.packageFallback', { index: index + 1 })
}

export function collectSubprojectErrors(
  sub: SubprojectSnapshot,
  index: number,
  t: WizardTranslator,
  requiredFields: Array<{ fieldName: string; label?: string }> = [],
): string[] {
  const label = packageLabel(sub, index, t)
  const errors: string[] = []

  if (!sub.name?.trim()) errors.push(t('validation.packageNameRequired', { package: label }))
  if (!sub.description?.trim()) {
    errors.push(t('validation.packageScopeRequired', { package: label }))
  } else if (sub.description.trim().length < 10) {
    errors.push(t('validation.packageScopeMin10', { package: label }))
  }

  if (!sub.pricing?.type) {
    errors.push(t('validation.pricingTypeRequired', { package: label }))
  } else if (sub.pricing.type === "rfq") {
    const { min, max } = sub.pricing.priceRange || {}
    if (min !== undefined && max !== undefined && min > max) {
      errors.push(t('validation.rfqRangeMinMax', { package: label }))
    }
    const range = sub.executionDuration?.range
    const hasMin = typeof range?.min === "number" && Number.isFinite(range.min)
    const hasMax = typeof range?.max === "number" && Number.isFinite(range.max)
    if (!hasMin && !hasMax) {
      errors.push(t('validation.rfqDurationRangeRequired', { package: label }))
    } else {
      if (hasMin && range!.min! <= 0) errors.push(t('validation.executionDurationMinPositive', { package: label }))
      if (hasMax && range!.max! <= 0) errors.push(t('validation.executionDurationMaxPositive', { package: label }))
      if (hasMin && hasMax && range!.min! > range!.max!) {
        errors.push(t('validation.executionDurationMinMax', { package: label }))
      }
    }
  } else {
    if (sub.pricing.amount == null || sub.pricing.amount <= 0) {
      errors.push(t('validation.pricePositive', { package: label }))
    }
    if (!sub.executionDuration?.value || sub.executionDuration.value <= 0) {
      errors.push(t('validation.executionDurationRequired', { package: label }))
    }
  }

  const namedIncluded = (sub.included || []).filter((item) => item.name?.trim())
  if (namedIncluded.length < 3) {
    errors.push(t('validation.includedItemsMin3', { package: label }))
  }
  if ((sub.included || []).some((item) => !item.name?.trim())) {
    errors.push(t('validation.includedItemNameRequired', { package: label }))
  }

  if (typeof sub.materialsIncluded !== "boolean") {
    errors.push(t('validation.materialsIncludedRequired', { package: label }))
  } else if (sub.materialsIncluded) {
    const namedMaterials = (sub.materials || []).filter((item) => item.name?.trim())
    if (namedMaterials.length === 0) {
      errors.push(t('validation.materialRequired', { package: label }))
    }
  }

  if (typeof sub.preparationDuration?.value !== "number") {
    errors.push(t('validation.preparationDurationRequired', { package: label }))
  }

  if (sub.errors?.priceRange) errors.push(t('validation.packageError', { package: label, message: sub.errors.priceRange }))
  if (sub.errors?.executionDurationRange) errors.push(t('validation.packageError', { package: label, message: sub.errors.executionDurationRange }))

  errors.push(...collectRequiredProfessionalInputErrors(sub, index, t, requiredFields))
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
  t: WizardTranslator,
  requiredFields: Array<{ fieldName: string; label?: string }> = [],
): string[] {
  if (requiredFields.length === 0) return []
  const label = packageLabel(sub, index, t)
  return requiredFields.flatMap((field) => {
    const input = (sub.professionalInputs || []).find((item) => item.fieldName === field.fieldName)
    return isProfessionalInputMissing(input?.value)
      ? [t('validation.fieldRequired', { package: label, field: field.label || field.fieldName })]
      : []
  })
}

export function collectStepErrors(step: number, data: WizardProjectSnapshot, t: WizardTranslator): string[] {
  switch (step) {
    case 1: {
      const errors: string[] = []
      if (!data.category) errors.push(t('validation.categoryRequired'))
      if (!data.service) errors.push(t('validation.serviceRequired'))
      if (!data.title?.trim()) errors.push(t('validation.titleRequired'))
      else if (data.title.trim().length < 30) errors.push(t('validation.titleMin30'))
      if (!data.description?.trim()) errors.push(t('validation.descriptionRequired'))
      else if (data.description.trim().length < 100) {
        errors.push(t('validation.descriptionMin100', { count: data.description.trim().length }))
      }
      const isRenovation = (data.category || "").toLowerCase() === "renovation"
      if (!isRenovation && !data.priceModel) errors.push(t('validation.priceModelRequired'))
      if (!data.distance?.address?.trim()) errors.push(t('validation.serviceAddressRequired'))
      if (!data.distance?.maxKmRange || data.distance.maxKmRange <= 0) {
        errors.push(t('validation.maxRangeRequired'))
      }
      if (!Array.isArray(data.resources) || data.resources.length === 0) {
        errors.push(t('validation.teamMemberExecution'))
      }
      if (isRenovation && (!data.intakeMeeting?.resources || data.intakeMeeting.resources.length === 0)) {
        errors.push(t('validation.intakeResourceRenovationLower'))
      }
      return errors
    }
    case 2: {
      if (!data.subprojects || data.subprojects.length === 0) {
        return [t('validation.atLeastOnePackage')]
      }
      return data.subprojects.flatMap((sub, index) =>
        collectSubprojectErrors(sub, index, t, data.requiredProfessionalFields),
      )
    }
    case 3: {
      const errors: string[] = []
      if (!data.customerPresence) errors.push(t('validation.customerPresenceRequired'))
      for (const [index, option] of (data.extraOptions || []).entries()) {
        if (!option.name?.trim()) errors.push(t('validation.extraOptionName', { index: index + 1 }))
        if (option.price == null || option.price < 0) errors.push(t('validation.extraOptionPrice', { index: index + 1 }))
      }
      for (const [index, term] of (data.termsConditions || []).entries()) {
        if (!term.name?.trim()) errors.push(t('validation.termName', { index: index + 1 }))
        if (!term.description?.trim()) errors.push(t('validation.termDescription', { index: index + 1 }))
      }
      return errors
    }
    case 4:
      return (data.faq || [])
        .map((item, index) => {
          if (!item.question?.trim() || !item.answer?.trim()) {
            return t('validation.faqIncomplete', { index: index + 1 })
          }
          return null
        })
        .filter((message): message is string => Boolean(message))
    case 5:
      return (data.rfqQuestions || [])
        .map((item, index) => {
          if (!item.question?.trim()) return t('validation.rfqQuestionText', { index: index + 1 })
          if (item.type === "multiple_choice" && (!item.options || item.options.filter(Boolean).length < 2)) {
            return t('validation.rfqQuestionChoices', { index: index + 1 })
          }
          return null
        })
        .filter((message): message is string => Boolean(message))
    case 6:
      return (data.postBookingQuestions || [])
        .map((item, index) => {
          if (!item.question?.trim()) return t('validation.postBookingQuestionText', { index: index + 1 })
          if (item.type === "multiple_choice" && (!item.options || item.options.filter(Boolean).length < 2)) {
            return t('validation.postBookingQuestionChoices', { index: index + 1 })
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

export function collectBlockingWizardErrors(data: WizardProjectSnapshot, t: WizardTranslator): WizardStepError[] {
  const blocking: WizardStepError[] = []
  for (const step of VALIDATED_STEPS) {
    const messages = collectStepErrors(step, data, t)
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

export function parseProjectSaveError(
  payload: {
    error?: unknown
    details?: unknown
    qualityChecks?: Array<{ message?: string }>
  },
  t: WizardTranslator,
): { messages: string[]; step: number | null } {
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
    messages.push(t('validation.saveFailed'))
  }

  const blob = messages.join(" ")
  const pathMatch = blob.match(/subprojects|faq|rfq|postBooking|extraOptions|termsConditions|title|description|distance|service/i)
  return { messages, step: pathMatch ? mapBackendFieldToStep(pathMatch[0]) : null }
}
