'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, Circle, Save, ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { WIZARD_STEP_TITLES } from "@/lib/projectWizardValidation"

type StepDescriptionKey =
  | 'stepDescriptions.1'
  | 'stepDescriptions.2'
  | 'stepDescriptions.3'
  | 'stepDescriptions.4'
  | 'stepDescriptions.5'
  | 'stepDescriptions.6'
  | 'stepDescriptions.7'
  | 'stepDescriptions.8'

interface WizardStep {
  id: number
  descriptionKey: StepDescriptionKey
  isCompleted: boolean
}

interface WizardLayoutProps {
  currentStep: number
  onStepChange: (step: number) => void
  onSaveDraft?: () => Promise<void>
  onNext: () => void
  onPrevious: () => void
  onSubmit?: () => void
  onShowValidationErrors?: () => void
  validationMessages?: string[]
  children: React.ReactNode
  isLoading?: boolean
  isEditing?: boolean
  projectStatus?: 'draft' | 'pending_approval' | 'published' | 'rejected' | 'booked' | 'on_hold' | 'completed' | 'cancelled'
  stepValidation?: boolean[]
  visitedSteps?: boolean[]
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 1,
    descriptionKey: "stepDescriptions.1",
    isCompleted: false
  },
  {
    id: 2,
    descriptionKey: "stepDescriptions.2",
    isCompleted: false
  },
  {
    id: 3,
    descriptionKey: "stepDescriptions.3",
    isCompleted: false
  },
  {
    id: 4,
    descriptionKey: "stepDescriptions.4",
    isCompleted: false
  },
  {
    id: 5,
    descriptionKey: "stepDescriptions.5",
    isCompleted: false
  },
  {
    id: 6,
    descriptionKey: "stepDescriptions.6",
    isCompleted: false
  },
  {
    id: 7,
    descriptionKey: "stepDescriptions.7",
    isCompleted: false
  },
  {
    id: 8,
    descriptionKey: "stepDescriptions.8",
    isCompleted: false
  }
]

export default function WizardLayout({
  currentStep,
  onStepChange,
  onSaveDraft,
  onNext,
  onPrevious,
  onSubmit,
  onShowValidationErrors,
  validationMessages = [],
  children,
  isLoading = false,
  isEditing = false,
  projectStatus,
  stepValidation = [],
  visitedSteps = []
}: WizardLayoutProps) {
  const t = useTranslations('projectWizard')
  const steps = WIZARD_STEPS.map((step) => ({ ...step, isCompleted: step.id !== currentStep && Boolean(stepValidation[step.id - 1]) }))
  const progress = (currentStep / 8) * 100

  const handleStepClick = (stepId: number) => {
    if (isEditing || stepId <= currentStep || steps[stepId - 1].isCompleted) {
      onStepChange(stepId)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {t('layout.title')}
          </h1>
          <p className="text-gray-600">
            {steps[currentStep - 1]
              ? t('layout.stepOfWithTitle', {
                  step: currentStep,
                  title: t(WIZARD_STEP_TITLES[currentStep]),
                })
              : null}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">{t('layout.progress')}</span>
            <span className="text-sm text-gray-500">{t('layout.progressPercent', { percent: Math.round(progress) })}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Step Navigation */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">{t('layout.steps')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {steps.map((step) => (
                  <button
                    key={step.id}
                    onClick={() => handleStepClick(step.id)}
                    className={cn(
                      "w-full p-3 rounded-lg text-left transition-colors",
                      "flex items-start space-x-3",
                      step.id === currentStep
                        ? "bg-blue-100 border border-blue-300"
                        : step.isCompleted
                        ? "bg-green-50 border border-green-200 hover:bg-green-100"
                        : step.id < currentStep || isEditing
                        ? "bg-gray-50 border border-gray-200 hover:bg-gray-100"
                        : "bg-gray-50 border border-gray-200 opacity-50 cursor-not-allowed"
                    )}
                    disabled={!isEditing && step.id > currentStep && !step.isCompleted}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {step.isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <Circle
                          className={cn(
                            "w-5 h-5",
                            step.id === currentStep
                              ? "text-blue-600"
                              : "text-gray-400"
                          )}
                        />
                      )}
                    </div>
                    <div>
                      <div className={cn(
                        "font-medium text-sm",
                        step.id === currentStep
                          ? "text-blue-900"
                          : step.isCompleted
                          ? "text-green-900"
                          : "text-gray-700"
                      )}>
                        {t(WIZARD_STEP_TITLES[step.id])}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {step.id === currentStep ? `${t('layout.inProgress')} · ` : step.id >= 7 && !visitedSteps[step.id - 1] ? `${t('layout.optional')} · ` : ''}{t(step.descriptionKey)}
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {steps[currentStep - 1] ? t(WIZARD_STEP_TITLES[currentStep]) : null}
                    </CardTitle>
                    <p className="text-gray-600 mt-1">
                      {steps[currentStep - 1] ? t(steps[currentStep - 1].descriptionKey) : null}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">
                      {t('layout.stepOf', { step: currentStep })}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                {validationMessages.length > 0 && (
                  <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <p className="font-semibold mb-2">{t('layout.fixBeforeContinuing')}</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {validationMessages.map((message, index) => (
                        <li key={`${index}-${message}`}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {children}
              </CardContent>

              {/* Navigation */}
              <div className="border-t p-6">
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={onPrevious}
                    disabled={currentStep === 1 || isLoading}
                    className="flex items-center space-x-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t('layout.previous')}</span>
                  </Button>

                  <div className="flex space-x-3">
                    {onSaveDraft && (
                      <Button
                        variant="outline"
                        onClick={onSaveDraft}
                        disabled={isLoading}
                        className="flex items-center space-x-2"
                      >
                        <Save className="w-4 h-4" />
                        <span>{t('layout.saveDraft')}</span>
                      </Button>
                    )}

                    {currentStep === 8 ? (
                      <Button
                        onClick={() => {
                          if (onShowValidationErrors) {
                            onShowValidationErrors()
                          } else {
                            onSubmit?.()
                          }
                        }}
                        disabled={isLoading}
                        className={`flex items-center space-x-2 ${
                          projectStatus === 'pending_approval' 
                            ? 'bg-blue-600 hover:bg-blue-700' 
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>
                          {projectStatus === 'pending_approval' 
                            ? t('layout.alreadySubmitted')
                            : projectStatus === 'published' || projectStatus === 'on_hold'
                            ? t('layout.submitChanges')
                            : t('layout.submitForApproval')
                          }
                        </span>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          if (onShowValidationErrors) {
                            onShowValidationErrors()
                          } else {
                            onNext()
                          }
                        }}
                        disabled={isLoading}
                        className="flex items-center space-x-2"
                      >
                        <span>{t('layout.next')}</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
