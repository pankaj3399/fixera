export interface ProjectProfessionalInput {
  fieldName: string
  value: string | number | { min: number; max: number } | undefined
}

export interface ProjectSubprojectPricing {
  type?: "fixed" | "unit" | "rfq"
  amount?: number
  priceRange?: { min: number; max: number }
  minOrderQuantity?: number
  minProjectValue?: number
}

export type ProjectIncludedItem =
  | string
  | {
      name: string
      description?: string
    }

export type ProjectAttachmentRef =
  | string
  | {
      url: string
      name?: string
      _id?: string
    }

export interface ProjectMaterial {
  name: string
  quantity?: string
  unit?: string
  description?: string
}

export interface ProjectSubproject {
  name: string
  description: string
  pricing: ProjectSubprojectPricing
  included: ProjectIncludedItem[]
  professionalInputs?: ProjectProfessionalInput[]
  materialsIncluded?: boolean
  materials?: ProjectMaterial[]
  preparationDuration?: {
    value: number
    unit: "hours" | "days"
  }
  executionDuration?: {
    value?: number
    unit: "hours" | "days"
    range?: { min?: number; max?: number }
  }
  buffer?: {
    value?: number
    unit: "hours" | "days"
  }
  warrantyPeriod?: {
    value: number
    unit: "months" | "years"
  }
}

export interface ProjectProfessionalDto {
  _id: string
  name: string
  username?: string
  profileImage?: string
  professionalLevel?: "New" | "Level 1" | "Level 2" | "Level 3" | "Expert"
  adminTags?: string[]
  createdAt?: string
  businessInfo?: {
    companyName?: string
    timezone?: string
    city?: string
    country?: string
  }
  email: string
  phone: string
  companyAvailability?: {
    monday?: { available: boolean; startTime?: string; endTime?: string }
    tuesday?: { available: boolean; startTime?: string; endTime?: string }
    wednesday?: { available: boolean; startTime?: string; endTime?: string }
    thursday?: { available: boolean; startTime?: string; endTime?: string }
    friday?: { available: boolean; startTime?: string; endTime?: string }
    saturday?: { available: boolean; startTime?: string; endTime?: string }
    sunday?: { available: boolean; startTime?: string; endTime?: string }
  }
  companyBlockedRanges?: Array<{
    startDate: string
    endDate: string
    reason?: string
    isHoliday?: boolean
  }>
}

export type PublicProfessionalDto = Omit<ProjectProfessionalDto, 'email' | 'phone'>

export interface ProjectDto {
  _id: string
  title: string
  description: string
  category: string
  service: string
  priceModel?: string
  timeMode?: "hours" | "days" | "mixed"
  preparationDuration?: {
    value: number
    unit: "hours" | "days"
  }
  executionDuration?: {
    value: number
    unit: "hours" | "days"
  }
  bufferDuration?: {
    value: number
    unit: "hours" | "days"
  }
  media: {
    images: string[]
    video?: string
  }
  distance: {
    address?: string
    maxKmRange?: number
    useCompanyAddress?: boolean
    noBorders?: boolean
    borderLevel?: "none" | "country" | "province"
    location?: {
      type: "Point"
      coordinates: [number, number]
    }
  }
  firstAvailableDate?: string | null
  certifications?: Array<{
    name: string
    isRequired?: boolean
    fileUrl?: string
  }>
  resources: string[]
  minResources?: number
  minOverlapPercentage?: number
  subprojects: ProjectSubproject[]
  rfqQuestions: Array<{
    question: string
    type: "text" | "multiple_choice" | "attachment"
    options?: string[]
    isRequired: boolean
    professionalAttachments?: ProjectAttachmentRef[]
  }>
  extraOptions: Array<{
    _id?: string
    name: string
    description?: string
    price: number
  }>
  repeatBuyerDiscount?: {
    enabled: boolean
    percentage: number
    minPreviousBookings: number
    maxDiscountAmount?: number | null
  }
  repeatBuyerEligibility?: {
    eligible: boolean
  } | null
  postBookingQuestions?: Array<{
    _id?: string
    id?: string
    question: string
    type: "text" | "multiple_choice" | "attachment"
    options?: string[]
    isRequired: boolean
    professionalAttachments?: ProjectAttachmentRef[]
  }>
  customerPresence?: string
  termsConditions?: Array<{
    name: string
    description: string
    type?: "condition" | "warning"
    additionalCost?: number
  }>
  faq: Array<{
    question: string
    answer: string
  }>
  professionalId: ProjectProfessionalDto
  projectAvgRating?: number
  projectTotalReviews?: number
  professionalStats?: {
    avgRating: number
    totalReviews: number
    avgCommunication: number
    avgValueOfDelivery: number
    avgQualityOfService: number
    avgResponseTimeMs: number
  }
}

export type PublicProjectDto = Omit<ProjectDto, 'professionalId'> & {
  professionalId: PublicProfessionalDto
}
