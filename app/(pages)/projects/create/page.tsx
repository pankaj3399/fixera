'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import WizardLayout from '@/components/professional/project-wizard/WizardLayout'
import Step1BasicInfo from '@/components/professional/project-wizard/Step1BasicInfo'
import Step2Subprojects from '@/components/professional/project-wizard/Step2Subprojects'
import Step3ExtraOptions from '@/components/professional/project-wizard/Step3ExtraOptions'
import Step4FAQ from '@/components/professional/project-wizard/Step4FAQ'
import Step5RFQQuestions from '@/components/professional/project-wizard/Step5RFQQuestions'
import Step6PostBookingQuestions from '@/components/professional/project-wizard/Step6PostBookingQuestions'
import Step7CustomMessage from '@/components/professional/project-wizard/Step7CustomMessage'
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

interface IFAQ {
  id: string
  question: string
  answer: string
  isGenerated: boolean
  isEditing?: boolean
}

interface IRFQQuestion {
  id: string
  question: string
  type: 'text' | 'multiple_choice' | 'attachment'
  options?: string[]
  isRequired: boolean
}

interface IPostBookingQuestion {
  id: string
  question: string
  type: 'text' | 'multiple_choice' | 'attachment'
  options?: string[]
  isRequired: boolean
}

interface ProjectData {
  id?: string
  category?: string
  service?: string
  areaOfWork?: string
  distance?: {
    address: string
    useCompanyAddress: boolean
    maxKmRange: number
    noBorders: boolean
  }
  resources?: string[]
  projectType?: string[]
  description?: string
  priceModel?: string
  keywords?: string[]
  title?: string
  media?: {
    images: string[]
    video?: string
  }
  subprojects?: ISubproject[]
  extraOptions?: IExtraOption[]
  termsConditions?: ITermCondition[]
  faq?: IFAQ[]
  rfqQuestions?: IRFQQuestion[]
  postBookingQuestions?: IPostBookingQuestion[]
  customConfirmationMessage?: string
  currentStep?: number
}

export default function ProjectCreatePage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [projectData, setProjectData] = useState<ProjectData>({
    currentStep: 1,
    distance: {
      address: '',
      useCompanyAddress: false,
      maxKmRange: 50,
      noBorders: false
    },
    media: {
      images: []
    },
    keywords: [],
    projectType: [],
    subprojects: [],
    extraOptions: [],
    termsConditions: [],
    faq: [],
    rfqQuestions: [],
    postBookingQuestions: []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [canProceed, setCanProceed] = useState(false)
  const [stepValidation, setStepValidation] = useState<boolean[]>(new Array(8).fill(false))

  // Manual save function for draft
  const saveProjectDraft = async () => {
    try {
      const response = await fetch('/api/projects/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...projectData,
          currentStep
        }),
        credentials: 'include'
      })

      if (response.ok) {
        const savedProject = await response.json()
        if (!projectData.id) {
          setProjectData(prev => ({ ...prev, id: savedProject._id }))
        }
        toast.success('Project draft saved successfully!')
        return savedProject
      } else {
        throw new Error('Failed to save')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save project draft')
    }
  }

  const handleStepChange = (step: number) => {
    setCurrentStep(step)
    setProjectData(prev => ({ ...prev, currentStep: step }))
    // Set canProceed based on target step validation
    const targetStepValid = stepValidation[step - 1] || false
    setCanProceed(targetStepValid)
  }

  const handleNext = () => {
    if (currentStep < 8 && canProceed) {
      setCurrentStep(currentStep + 1)
      // Reset canProceed for next step validation
      const nextStepValid = stepValidation[currentStep] || false
      setCanProceed(nextStepValid)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      // Set canProceed based on previous step validation
      const prevStepValid = stepValidation[currentStep - 2] || false
      setCanProceed(prevStepValid)
    }
  }

  const handleDataChange = (stepData: Partial<ProjectData>) => {
    setProjectData(prev => ({ ...prev, ...stepData }))
  }

  const handleStepValidation = (step: number, isValid: boolean) => {
    setStepValidation(prev => {
      const newValidation = [...prev]
      newValidation[step - 1] = isValid
      return newValidation
    })

    // Update canProceed based on current step validation
    if (step === currentStep) {
      setCanProceed(isValid)
    }
  }

  // Auto-validate step 8 when we reach it (it's just a review step)
  useEffect(() => {
    if (currentStep === 8) {
      handleStepValidation(8, true)
    }
  }, [currentStep])

  const handleSubmit = async () => {
    if (isLoading) return // Prevent multiple submissions
    setIsLoading(true)
    try {
      // If no project ID, save as draft first
      let projectId = projectData.id
      if (!projectId) {
        const savedProject = await saveProjectDraft()
        if (!savedProject) {
          toast.error('Failed to save project before submission')
          setIsLoading(false)
          return
        }
        projectId = savedProject._id
      }

      const response = await fetch(`/api/projects/${projectId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        toast.success('Project submitted for approval!')
        router.push('/dashboard')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to submit project')
      }
    } catch (error) {
      console.error('Submit error:', error)
      toast.error('Failed to submit project')
    }
    setIsLoading(false)
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1BasicInfo
            data={projectData}
            onChange={handleDataChange}
            onValidate={(isValid) => handleStepValidation(1, isValid)}
          />
        )
      case 2:
        return (
          <Step2Subprojects
            data={projectData}
            onChange={handleDataChange}
            onValidate={(isValid) => handleStepValidation(2, isValid)}
          />
        )
      case 3:
        return (
          <Step3ExtraOptions
            data={projectData}
            onChange={handleDataChange}
            onValidate={(isValid) => handleStepValidation(3, isValid)}
          />
        )
      case 4:
        return (
          <Step4FAQ
            data={projectData}
            onChange={handleDataChange}
            onValidate={(isValid) => handleStepValidation(4, isValid)}
          />
        )
      case 5:
        return (
          <Step5RFQQuestions
            data={projectData}
            onChange={handleDataChange}
            onValidate={(isValid) => handleStepValidation(5, isValid)}
          />
        )
      case 6:
        return (
          <Step6PostBookingQuestions
            data={projectData}
            onChange={handleDataChange}
            onValidate={(isValid) => handleStepValidation(6, isValid)}
          />
        )
      case 7:
        return (
          <Step7CustomMessage
            data={projectData}
            onChange={handleDataChange}
            onValidate={(isValid) => handleStepValidation(7, isValid)}
          />
        )
      case 8:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4">Step 8: Review & Submit</h3>
              <p className="text-gray-600 mb-6">Review your project and submit for admin approval</p>
            </div>

            <div className="bg-white border rounded-lg p-6">
              <h4 className="font-semibold mb-4">Project Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Category:</strong> {projectData.category || 'Not specified'}
                </div>
                <div>
                  <strong>Service:</strong> {projectData.service || 'Not specified'}
                </div>
                <div>
                  <strong>Price Model:</strong> {projectData.priceModel || 'Not specified'}
                </div>
                <div>
                  <strong>Service Range:</strong> {projectData.distance?.maxKmRange || 0} km
                </div>
              </div>

              {projectData.title && (
                <div className="mt-4">
                  <strong>Title:</strong>
                  <p className="mt-1 text-gray-700">{projectData.title}</p>
                </div>
              )}

              {projectData.description && (
                <div className="mt-4">
                  <strong>Description:</strong>
                  <p className="mt-1 text-gray-700">{projectData.description.substring(0, 200)}...</p>
                </div>
              )}
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <WizardLayout
      currentStep={currentStep}
      onStepChange={handleStepChange}
      onSaveDraft={saveProjectDraft}
      onNext={handleNext}
      onPrevious={handlePrevious}
      onSubmit={handleSubmit}
      isLoading={isLoading}
      canProceed={canProceed}
    >
      {renderCurrentStep()}
    </WizardLayout>
  )
}