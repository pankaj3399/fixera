'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, Circle, Save, ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface WizardStep {
  id: number
  title: string
  description: string
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
  children: React.ReactNode
  isLoading?: boolean
  canProceed?: boolean
  isEditing?: boolean
  projectStatus?: 'draft' | 'pending_approval' | 'published' | 'rejected' | 'booked' | 'on_hold' | 'completed' | 'cancelled'
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 1,
    title: "Basic Info",
    description: "Service, distance, resources, type, terms, description",
    isCompleted: false
  },
  {
    id: 2,
    title: "Subprojects & Pricing",
    description: "Variation table and pricing logic",
    isCompleted: false
  },
  {
    id: 3,
    title: "Extra Options",
    description: "Additional options and terms",
    isCompleted: false
  },
  {
    id: 4,
    title: "FAQ",
    description: "Frequently asked questions",
    isCompleted: false
  },
  {
    id: 5,
    title: "RFQ Questions",
    description: "Request for quote questions",
    isCompleted: false
  },
  {
    id: 6,
    title: "Post-Booking Questions",
    description: "Questions after booking",
    isCompleted: false
  },
  {
    id: 7,
    title: "Custom Message",
    description: "Confirmation message",
    isCompleted: false
  },
  {
    id: 8,
    title: "Review & Submit",
    description: "Preview and submit for approval",
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
  children,
  isLoading = false,
  canProceed = true,
  isEditing = false,
  projectStatus
}: WizardLayoutProps) {
  const [steps] = useState(WIZARD_STEPS)
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
            Create Professional Service Project
          </h1>
          <p className="text-gray-600">
            Step {currentStep} of 8: {steps[currentStep - 1]?.title}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Step Navigation */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Steps</CardTitle>
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
                        {step.title}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {step.description}
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
                      {steps[currentStep - 1]?.title}
                    </CardTitle>
                    <p className="text-gray-600 mt-1">
                      {steps[currentStep - 1]?.description}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">
                      Step {currentStep} of 8
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6">
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
                    <span>Previous</span>
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
                        <span>Save Draft</span>
                      </Button>
                    )}

                    {currentStep === 8 ? (
                      <Button
                        onClick={() => {
                          if (!canProceed && onShowValidationErrors) {
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
                            ? 'Already Submitted - Go to Projects' 
                            : projectStatus === 'published' || projectStatus === 'on_hold'
                            ? 'Submit Changes for Re-approval'
                            : 'Submit for Approval'
                          }
                        </span>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          if (!canProceed && onShowValidationErrors) {
                            onShowValidationErrors()
                          } else {
                            onNext()
                          }
                        }}
                        disabled={isLoading}
                        className="flex items-center space-x-2"
                      >
                        <span>Next</span>
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