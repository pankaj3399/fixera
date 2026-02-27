'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import WizardLayout from '@/components/professional/project-wizard/WizardLayout'
import Step1BasicInfo, { type Step1Ref } from '@/components/professional/project-wizard/Step1BasicInfo'
import Step2Subprojects from '@/components/professional/project-wizard/Step2Subprojects'
import Step3ExtraOptions from '@/components/professional/project-wizard/Step3ExtraOptions'
import Step4FAQ from '@/components/professional/project-wizard/Step4FAQ'
import Step5RFQQuestions from '@/components/professional/project-wizard/Step5RFQQuestions'
import Step6PostBookingQuestions from '@/components/professional/project-wizard/Step6PostBookingQuestions'
import Step7CustomMessage from '@/components/professional/project-wizard/Step7CustomMessage'
import { toast } from 'sonner'
import { getAuthToken } from '@/lib/utils'

interface IIncludedItem {
  name: string
  description?: string
  isCustom: boolean
}

interface ISubproject {
  id: string
  name: string
  description: string
  projectType?: string[]
  customProjectType?: string
  professionalInputs?: Array<{
    fieldName: string
    value: string | number | { min: number; max: number }
  }>
  pricing: {
    type: 'fixed' | 'unit' | 'rfq'
    amount?: number
    priceRange?: { min?: number; max?: number }
    minProjectValue?: number
    minOrderQuantity?: number
  }
  errors?: {
    priceRange?: string
  }
  included: Array<{
    name: string
    description?: string
    isCustom: boolean
  }>
  materialsIncluded?: boolean
  materials?: Array<{
    name: string
    quantity?: string
    unit?: string
    description?: string
  }>
  preparationDuration?: {
    value?: number
    unit: 'hours' | 'days'
  }
  executionDuration: {
    value?: number
    unit: 'hours' | 'days'
    range?: { min?: number; max?: number }
  }
  buffer?: {
    value?: number
    unit: 'hours' | 'days'
  }
  intakeDuration?: {
    value: number
    unit: 'hours' | 'days'
    buffer?: number
  }
  warrantyPeriod: { value: number; unit: 'months' | 'years' }
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
  type?: 'condition' | 'warning'
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
  professionalAttachments?: string[]
}

interface IPostBookingQuestion {
  id: string
  question: string
  type: 'text' | 'multiple_choice' | 'attachment'
  options?: string[]
  isRequired: boolean
  professionalAttachments?: string[]
}

interface ProjectData {
  _id?: string
  id?: string
  status?: 'draft' | 'pending_approval' | 'published' | 'rejected' | 'booked' | 'on_hold' | 'completed' | 'cancelled'
  timeMode?: 'hours' | 'days' | 'mixed'
  category?: string
  service?: string
  areaOfWork?: string
  distance?: {
    address: string
    useCompanyAddress: boolean
    maxKmRange?: number
    noBorders: boolean
    location?: {
      type: 'Point'
      coordinates: [number, number]
    }
  }
  resources?: string[]
  intakeMeeting?: {
    enabled: boolean
    resources: string[]
  }
  renovationPlanning?: {
    fixeraManaged: boolean
    resources: string[]
  }
  projectType?: string[]
  description?: string
  priceModel?: string
  keywords?: string[]
  title?: string
  media?: {
    images: string[]
    videos: string[]
  }
  serviceConfigurationId?: string
  certifications?: Array<{
    name: string
    fileUrl: string
    uploadedAt: Date
    isRequired: boolean
  }>
  subprojects?: ISubproject[]
  extraOptions?: IExtraOption[]
  termsConditions?: ITermCondition[]
  faq?: IFAQ[]
  rfqQuestions?: IRFQQuestion[]
  postBookingQuestions?: IPostBookingQuestion[]
  customConfirmationMessage?: string
  currentStep?: number
  minResources?: number
  minOverlapPercentage?: number
  preparationDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
  executionDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
  bufferDuration?: {
    value: number
    unit: 'hours' | 'days'
  }
}

export default function ProjectCreatePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('id')
  const [currentStep, setCurrentStep] = useState(1)
  const step1Ref = useRef<Step1Ref>(null)
  const [projectData, setProjectData] = useState<ProjectData>({
    currentStep: 1,
    timeMode: 'days',
    distance: {
      address: '',
      useCompanyAddress: false,
      maxKmRange: undefined,
      noBorders: false
    },
    media: {
      images: [],
      videos: []
    },
    keywords: [],
    projectType: [],
    minResources: 1,
    minOverlapPercentage: 90,
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

  const normalizePreparationDuration = (subprojects?: ISubproject[]) => {
    if (!Array.isArray(subprojects)) return subprojects
    return subprojects.map((subproject) => {
      const preparationValue = subproject.preparationDuration?.value
      if (preparationValue == null) return subproject
      const preparationUnit =
        subproject.preparationDuration?.unit ??
        subproject.executionDuration?.unit ??
        'days'
      return {
        ...subproject,
        preparationDuration: {
          value: preparationValue,
          unit: preparationUnit
        }
      }
    })
  }

  // Load existing project data if editing
  useEffect(() => {
    if (projectId) {
      const loadProject = async () => {
        setIsLoading(true)
        try {
          console.log('[loading] Loading project:', projectId)
          const token = getAuthToken()
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          }
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
          }
          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}`, {
            credentials: 'include',
            headers
          })

          console.log('[loading] Project fetch response:', response.status, response.statusText)

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error('? Failed to load project:', {
              status: response.status,
              statusText: response.statusText,
              error: errorData
            })

            if (response.status === 401) {
              toast.error('Please log in to edit this project')
              router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)
              return
            } else if (response.status === 404) {
              toast.error('Project not found')
              router.replace('/professional/projects/manage')
              return
            } else if (response.status === 403) {
              toast.error('You do not have permission to edit this project')
              router.replace('/professional/projects/manage')
              return
            }

            throw new Error(errorData.msg || 'Failed to load project')
          }

          const project = await response.json()
          console.log('? Loaded project data:', project)
          console.log('[ok] Project status:', project.status)

          setProjectData({
            id: project._id,
            status: project.status,
            currentStep: project.currentStep || 1,
            timeMode: project.timeMode || 'days',
            category: project.category,
            service: project.service,
            areaOfWork: project.areaOfWork,
            intakeMeeting: project.intakeMeeting || { enabled: false, resources: [] },
            renovationPlanning: project.renovationPlanning || { fixeraManaged: false, resources: [] },
            distance: project.distance || {
              address: '',
              useCompanyAddress: false,
              maxKmRange: undefined,
              noBorders: false
            },
            media: project.media || { images: [] },
            keywords: project.keywords || [],
            projectType: project.projectType || [],
            subprojects: project.subprojects || [],
            extraOptions: project.extraOptions || [],
            termsConditions: project.termsConditions || [],
            faq: project.faq || [],
            rfqQuestions: project.rfqQuestions || [],
            postBookingQuestions: project.postBookingQuestions || [],
            resources: project.resources,
            minResources: project.minResources,
            minOverlapPercentage: project.minOverlapPercentage,
            preparationDuration: project.preparationDuration,
            executionDuration: project.executionDuration,
            bufferDuration: project.bufferDuration,
            description: project.description,
            priceModel: project.priceModel,
            title: project.title,
            customConfirmationMessage: project.customConfirmationMessage
          })
          setCurrentStep(project.currentStep || 1)
          // Enable all steps for existing projects
          setStepValidation(new Array(8).fill(true))
          setCanProceed(true)
        } catch (error) {
          console.error('Failed to load project:', error)
          toast.error('Failed to load project data')
        } finally {
          setIsLoading(false)
        }
      }

      loadProject()
    }
    // Next.js router is stable and we only want to run this effect when projectId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Manual save function for draft
  const saveProjectDraft = async (options?: { silent?: boolean }) => {
    try {
      // Ensure priceModel is always provided for backend requirements
      const computedPriceModel = (() => {
        const pm = (projectData.priceModel || '').trim()
        if (pm) return pm
        const isRenovation = (projectData.category || '').toLowerCase() === 'renovation'
        if (isRenovation) return 'rfq'
        // Derive from subprojects if available
        const subs = projectData.subprojects || []
        if (subs.length > 0) {
          if (subs.some(s => s.pricing?.type === 'rfq')) return 'rfq'
          return 'fixed'
        }
        return 'fixed'
      })()

      const dataToSave = {
        ...projectData,
        subprojects: normalizePreparationDuration(projectData.subprojects),
        priceModel: computedPriceModel,
        currentStep
      }

      console.log('Saving project data:', dataToSave)

      let response;
      const token = getAuthToken()
      // If projectData.id exists, it's an existing project, so use PUT. Otherwise, POST for a new project.
      if (projectData.id) {
        response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(dataToSave),
          credentials: 'include'
        })
      } else {
        response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/draft`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(dataToSave),
          credentials: 'include'
        })
      }

      if (response.ok) {
        const savedProject = await response.json()
        const savedProjectId = savedProject._id

        // Update project data with the saved project info, including status and ID if new
        setProjectData(prev => ({
          ...prev,
          id: savedProjectId, // Ensure ID is set for new projects
          status: savedProject.status // Update status in case it changed
        }))

        // If this was a new project (no existing projectData.id) and we got a new ID, update the URL
        if (!projectData.id && savedProjectId) {
          router.replace(`/projects/create?id=${savedProjectId}`, { scroll: false })
        }

        if (!options?.silent) {
          toast.success('Project draft saved successfully!')
        }
        return savedProject
      } else {
        const errorData = await response.json()
        console.error('Save failed:', errorData)
        throw new Error(errorData.error || 'Failed to save')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save project draft')
      return null
    }
  }

  const handleStepChange = (step: number) => {
    setCurrentStep(step)
    setProjectData(prev => ({ ...prev, currentStep: step }))
    // If editing existing project, always allow navigation
    if (projectId) {
      setCanProceed(true)
    } else {
      // Set canProceed based on target step validation for new projects
      const targetStepValid = stepValidation[step - 1] || false
      setCanProceed(targetStepValid)
    }
  }

  const handleNext = () => {
    if (currentStep < 8 && canProceed) {
      setCurrentStep(currentStep + 1)
      // If editing existing project, always allow navigation
      if (projectId) {
        setCanProceed(true)
      } else {
        // Reset canProceed for next step validation for new projects
        const nextStepValid = stepValidation[currentStep] || false
        setCanProceed(nextStepValid)
      }
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

  const handleStepValidation = useCallback((step: number, isValid: boolean) => {
    setStepValidation(prev => {
      const newValidation = [...prev]
      newValidation[step - 1] = isValid
      return newValidation
    })

    // Update canProceed based on current step validation
    setCanProceed(prevCanProceed => {
      // Only update if this is the current step
      return step === currentStep ? isValid : prevCanProceed
    })
  }, [currentStep])

  // Auto-validate step 8 when we reach it (it's just a review step)
  useEffect(() => {
    if (currentStep === 8) {
      handleStepValidation(8, true)
    }
  }, [currentStep, handleStepValidation])

  const handleSubmit = async () => {
    if (isLoading) return // Prevent multiple submissions
    setIsLoading(true)
    let shouldResetLoading = true
    try {
      console.log('Submit called - Current project status:', projectData.status)
      console.log('Full project data:', projectData)

      // Save current changes first before submitting
      let projectId = projectData.id
      if (!projectId) {
        const savedProject = await saveProjectDraft({ silent: true })
        if (!savedProject) {
          toast.error('Failed to save project before submission')
          return
        }
        projectId = savedProject._id
      } else {
        // For existing projects (including duplicates), save changes first
        const savedProject = await saveProjectDraft({ silent: true })
        if (!savedProject) {
          toast.error('Failed to save changes before submission')
          return
        }
      }

      // Refresh project status from server before attempting submission
      try {
        const statusResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}`, {
          credentials: 'include'
        })

        if (statusResponse.ok) {
          const currentProject = await statusResponse.json()
          console.log('Current project status from server:', currentProject.status)

          // Update local state with current status
          setProjectData(prev => ({ ...prev, status: currentProject.status }))

          // Check if project is already in pending_approval status
          if (currentProject.status === 'pending_approval') {
            console.log('Project already pending approval, redirecting...')
            toast.success('Project is already submitted and pending approval!')
            shouldResetLoading = false
            router.replace('/professional/projects/manage')
            return
          }

          // Handle on_hold projects - need to change to published first
          if (currentProject.status === 'on_hold') {
            console.log('On-hold project detected - changing to published status first')
            try {
              const statusChangeResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}/status`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ status: 'published' })
              })

              if (!statusChangeResponse.ok) {
                const statusError = await statusChangeResponse.json()
                console.error('Failed to change on_hold to published:', statusError)
                toast.error('Failed to prepare project for submission')
                return
              }

              console.log('Successfully changed on_hold project to published')
              setProjectData(prev => ({ ...prev, status: 'published' }))
            } catch (error) {
              console.error('Error changing status to published:', error)
              toast.error('Failed to prepare project for submission')
              return
            }
          }

          // For published projects, submission will change status to pending_approval
          if (currentProject.status === 'published') {
            console.log('Submitting published project - will change to pending_approval')
          }
        }
      } catch (error) {
        console.error('Failed to check project status:', error)
        // Continue with submission attempt if status check fails
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/${projectId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const submittedProject = await response.json()
        console.log('Project submitted successfully:', submittedProject)

        toast.success('Project submitted for approval!')
        shouldResetLoading = false
        router.replace('/professional/projects/manage')
      } else {
        const error = await response.json()
        console.error('Submission failed:', error)
        toast.error(error.error || 'Failed to submit project')
      }
    } catch (error) {
      console.error('Submit error:', error)
      toast.error('Failed to submit project')
    } finally {
      if (shouldResetLoading) {
        setIsLoading(false)
      }
    }
  }

  const handleShowValidationErrors = () => {
    if (currentStep === 1) {
      step1Ref.current?.showValidationErrors()
    } else if (currentStep === 2) {
      // Step 2 validation
      if (!projectData.subprojects || projectData.subprojects.length === 0) {
        toast.error('At least one subproject/package is required')
      } else {
        const allPackageErrors: string[] = []
        projectData.subprojects.forEach((sub, index) => {
          const label = sub.name || `Package ${index + 1}`
          const errors: string[] = []
          if (!sub.name) errors.push('Package name is required')
          if (!sub.description || sub.description.length < 10) errors.push('Package scope must be at least 10 characters')
          if (!sub.pricing?.type) errors.push('Pricing type is required')
          if ((sub.included ?? []).length < 3) errors.push('At least 3 included items are required')
          if (typeof sub.materialsIncluded !== 'boolean') errors.push('Please select whether materials are included')

          if (sub.pricing?.type === 'rfq') {
            const range = sub.executionDuration?.range
            const hasMin = typeof range?.min === 'number'
            const hasMax = typeof range?.max === 'number'

            if (!hasMin && !hasMax) {
              errors.push('Valid execution duration range is required for RFQ packages')
            } else {
              if (hasMin && range!.min! <= 0) errors.push('Valid execution duration range is required for RFQ packages')
              if (hasMax && range!.max! <= 0) errors.push('Valid execution duration range is required for RFQ packages')
              if (hasMin && hasMax && range!.min! > range!.max!) {
                errors.push('Valid execution duration range is required for RFQ packages')
              }
            }
          } else {
            if (!sub.executionDuration?.value || sub.executionDuration.value <= 0) {
              errors.push('Execution duration is required')
            }
          }

          if (errors.length > 0) {
            allPackageErrors.push(`${label}: ${errors.join(', ')}`)
          }
        })

        if (allPackageErrors.length > 0) {
          toast.error(allPackageErrors.join(' | '))
        }
      }
    } else if (currentStep === 3) {
      toast.info('Please specify customer presence requirement')
    } else if (currentStep === 4) {
      toast.info('Step 4 is optional - you can proceed to the next step')
    } else if (currentStep === 5) {
      toast.info('Step 5 is optional - you can proceed to the next step')
    } else if (currentStep === 6) {
      toast.info('Step 6 is optional - you can proceed to the next step')
    } else if (currentStep === 7) {
      toast.info('Step 7 is optional - you can proceed to the next step')
    }
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1BasicInfo
            ref={step1Ref}
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

            {/* Project Summary */}
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
                  <strong>Service Range:</strong> {projectData.distance?.noBorders ? 'No borders' : (projectData.distance?.maxKmRange != null ? `${projectData.distance.maxKmRange} km` : 'Not specified')}
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
                  <p className="mt-1 text-gray-700 break-words whitespace-pre-wrap">{projectData.description.length > 200 ? `${projectData.description.substring(0, 200)}...` : projectData.description}</p>
                </div>
              )}
            </div>

            {/* Subprojects side-by-side comparison */}
            {projectData.subprojects && projectData.subprojects.length > 0 && (
              <div className="bg-white border rounded-lg p-6">
                <h4 className="font-semibold mb-4">Service Packages ({projectData.subprojects.length})</h4>
                <div className={`grid gap-4 ${projectData.subprojects.length === 1 ? 'grid-cols-1' : projectData.subprojects.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                  {projectData.subprojects.map((sub, idx) => (
                    <div key={sub.id || idx} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-sm">{sub.name || `Package ${idx + 1}`}</h5>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{sub.pricing.type}</span>
                      </div>
                      {sub.description && <p className="text-xs text-gray-600 mb-3">{sub.description}</p>}

                      <div className="space-y-2 text-xs">
                        {/* Pricing */}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Price:</span>
                          <span className="font-medium">
                            {sub.pricing.type === 'fixed' && sub.pricing.amount != null ? `€${sub.pricing.amount}` : ''}
                            {sub.pricing.type === 'unit' && sub.pricing.amount != null ? `€${sub.pricing.amount}/unit` : ''}
                            {sub.pricing.type === 'rfq' ? 'Quote required' : ''}
                            {sub.pricing.type === 'rfq' && sub.pricing.priceRange?.min != null && sub.pricing.priceRange?.max != null && (
                              <span className="text-gray-500 ml-1">(€{sub.pricing.priceRange.min}-{sub.pricing.priceRange.max})</span>
                            )}
                          </span>
                        </div>
                        {sub.pricing.type === 'unit' && sub.pricing.minOrderQuantity != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Min order qty:</span>
                            <span className="font-medium">{sub.pricing.minOrderQuantity}</span>
                          </div>
                        )}

                        {/* Timing */}
                        {sub.preparationDuration?.value != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Preparation:</span>
                            <span>{sub.preparationDuration.value} {sub.preparationDuration.unit}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Execution:</span>
                          <span>
                            {sub.pricing.type === 'rfq'
                              ? (() => {
                                const r = sub.executionDuration.range;
                                if (r?.min != null && r?.max != null) {
                                  return `${r.min}-${r.max} ${sub.executionDuration.unit}`;
                                } else if (r?.min != null) {
                                  return `${r.min}- ${sub.executionDuration.unit}`;
                                } else if (r?.max != null) {
                                  return `- ${r.max} ${sub.executionDuration.unit}`;
                                }
                                return sub.executionDuration.value != null
                                  ? `${sub.executionDuration.value} ${sub.executionDuration.unit}`
                                  : 'Not set';
                              })()
                              : sub.executionDuration.value != null ? `${sub.executionDuration.value} ${sub.executionDuration.unit}` : 'Not set'}
                          </span>
                        </div>
                        {sub.buffer?.value != null && sub.buffer.value > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Buffer:</span>
                            <span>{sub.buffer.value} {sub.buffer.unit}</span>
                          </div>
                        )}

                        {/* Warranty */}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Warranty:</span>
                          <span>{sub.warrantyPeriod.value === 0 ? 'None' : `${sub.warrantyPeriod.value} ${sub.warrantyPeriod.unit}`}</span>
                        </div>

                        {/* Materials */}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Materials:</span>
                          <span>{sub.materialsIncluded ? 'Included' : 'Not included'}</span>
                        </div>
                        {sub.materialsIncluded && sub.materials && sub.materials.length > 0 && (
                          <div className="pl-2 border-l-2 border-gray-200">
                            {sub.materials.map((m, mi) => (
                              <div key={mi} className="text-gray-600">{m.name}{m.quantity ? ` (${m.quantity}${m.unit ? ` ${m.unit}` : ''})` : ''}</div>
                            ))}
                          </div>
                        )}

                        {/* Included items */}
                        {(sub.included ?? []).length > 0 && (
                          <div>
                            <span className="text-gray-500">Included ({(sub.included ?? []).length}):</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(sub.included ?? []).map((item, ii) => (
                                <span key={ii} className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded">{item.name}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Professional inputs / service parameters */}
                        {sub.professionalInputs && sub.professionalInputs.length > 0 && (
                          <div>
                            <span className="text-gray-500">Service Parameters:</span>
                            <div className="mt-1 space-y-0.5">
                              {sub.professionalInputs.map((input, ii) => (
                                <div key={ii} className="flex justify-between">
                                  <span className="text-gray-600">{input.fieldName}:</span>
                                  <span className="font-medium">
                                    {typeof input.value === 'object' && input.value !== null && 'min' in input.value && 'max' in input.value
                                      ? `${input.value.min}-${input.value.max}`
                                      : String(input.value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extra Options */}
            {projectData.extraOptions && projectData.extraOptions.length > 0 && (
              <div className="bg-white border rounded-lg p-6">
                <h4 className="font-semibold mb-4">Extra Options ({projectData.extraOptions.length})</h4>
                <div className="space-y-2 text-sm">
                  {projectData.extraOptions.map((opt) => (
                    <div key={opt.id} className="flex justify-between p-2 bg-gray-50 rounded">
                      <span>{opt.name}</span>
                      <span className="font-medium">€{(opt.price ?? 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Terms & Conditions */}
            {projectData.termsConditions && projectData.termsConditions.length > 0 && (
              <div className="bg-white border rounded-lg p-6">
                <h4 className="font-semibold mb-4">Terms & Conditions ({projectData.termsConditions.length})</h4>
                <div className="space-y-2 text-sm">
                  {projectData.termsConditions.map((term) => (
                    <div key={term.id} className="p-2 bg-gray-50 rounded">
                      <div className="flex justify-between">
                        <span className="font-medium">
                          {term.name}
                          {term.type === 'warning' && <span className="ml-1 text-xs text-yellow-600">(Warning)</span>}
                        </span>
                        {term.type !== 'warning' && term.additionalCost != null && term.additionalCost > 0 && (
                          <span className="text-red-600">+€{(term.additionalCost ?? 0).toFixed(2)}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{term.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FAQ */}
            {projectData.faq && projectData.faq.length > 0 && (
              <div className="bg-white border rounded-lg p-6">
                <h4 className="font-semibold mb-4">FAQ ({projectData.faq.length})</h4>
                <div className="space-y-3 text-sm">
                  {projectData.faq.map((item) => (
                    <div key={item.id} className="p-3 bg-gray-50 rounded">
                      <div className="font-medium">Q: {item.question}</div>
                      <div className="text-gray-600 mt-1">A: {item.answer}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Confirmation Message */}
            {projectData.customConfirmationMessage && (
              <div className="bg-white border rounded-lg p-6">
                <h4 className="font-semibold mb-4">Custom Confirmation Message</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{projectData.customConfirmationMessage}</p>
              </div>
            )}
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
      onShowValidationErrors={handleShowValidationErrors}
      isLoading={isLoading}
      canProceed={canProceed}
      isEditing={!!projectId}
      projectStatus={projectData.status}
    >
      {renderCurrentStep()}
    </WizardLayout>
  )
}
