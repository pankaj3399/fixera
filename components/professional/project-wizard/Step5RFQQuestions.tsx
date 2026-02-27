'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Trash2,
  MessageSquare,
  FileText,
  Paperclip,
  CheckSquare,
  Info,
  AlertCircle
} from "lucide-react"
import { toast } from 'sonner'
import ProfessionalAttachments from "./ProfessionalAttachments"

interface IRFQQuestion {
  id: string
  question: string
  type: 'text' | 'multiple_choice' | 'attachment'
  options?: string[]
  isRequired: boolean
  professionalAttachments?: string[]
}

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
    priceRange?: { min?: number; max?: number }
    minProjectValue?: number
  }
  included: IIncludedItem[]
  materialsIncluded?: boolean
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

interface ProjectData {
  _id?: string
  rfqQuestions?: IRFQQuestion[]
  category?: string
  service?: string
  subprojects?: ISubproject[]
}

interface Step5Props {
  data: ProjectData
  onChange: (data: ProjectData) => void
  onValidate: (isValid: boolean) => void
}

// Common RFQ questions by service category
const RFQ_QUESTION_TEMPLATES = {
  'plumber': [
    {
      question: 'What type of plumbing issue are you experiencing?',
      type: 'multiple_choice' as const,
      options: ['Leak repair', 'Pipe installation', 'Drain cleaning', 'Fixture replacement', 'Emergency repair', 'Other'],
      isRequired: true
    },
    {
      question: 'Please describe the current problem in detail',
      type: 'text' as const,
      isRequired: true
    },
    {
      question: 'What is the age of your plumbing system?',
      type: 'multiple_choice' as const,
      options: ['Less than 5 years', '5-15 years', '15-30 years', 'Over 30 years', 'Unknown'],
      isRequired: false
    },
    {
      question: 'Upload photos of the area/problem (if applicable)',
      type: 'attachment' as const,
      isRequired: false
    },
    {
      question: 'What is your preferred timeframe for completion?',
      type: 'multiple_choice' as const,
      options: ['ASAP/Emergency', 'Within 1 week', 'Within 2 weeks', 'Within 1 month', 'Flexible'],
      isRequired: true
    }
  ],
  'electrician': [
    {
      question: 'What type of electrical work do you need?',
      type: 'multiple_choice' as const,
      options: ['New installation', 'Repair existing', 'Upgrade system', 'Safety inspection', 'Emergency service'],
      isRequired: true
    },
    {
      question: 'Describe your electrical requirements in detail',
      type: 'text' as const,
      isRequired: true
    },
    {
      question: 'What is the square footage of the area?',
      type: 'text' as const,
      isRequired: false
    },
    {
      question: 'Upload electrical plans or photos (if available)',
      type: 'attachment' as const,
      isRequired: false
    },
    {
      question: 'Do you have existing electrical permits?',
      type: 'multiple_choice' as const,
      options: ['Yes, all current', 'Some permits', 'No permits', 'Not sure'],
      isRequired: true
    }
  ],
  'painter': [
    {
      question: 'What areas need painting?',
      type: 'multiple_choice' as const,
      options: ['Interior walls', 'Exterior walls', 'Ceilings', 'Trim and doors', 'Furniture', 'Other'],
      isRequired: true
    },
    {
      question: 'What is the total square footage to be painted?',
      type: 'text' as const,
      isRequired: true
    },
    {
      question: 'Do you have color preferences or paint already purchased?',
      type: 'text' as const,
      isRequired: false
    },
    {
      question: 'Upload photos of the areas to be painted',
      type: 'attachment' as const,
      isRequired: false
    },
    {
      question: 'What is the current condition of the surfaces?',
      type: 'multiple_choice' as const,
      options: ['Excellent', 'Good', 'Fair', 'Poor - needs prep work', 'Unknown'],
      isRequired: true
    }
  ],
  'default': [
    {
      question: 'Please describe your project requirements in detail',
      type: 'text' as const,
      isRequired: true
    },
    {
      question: 'What is your estimated budget range?',
      type: 'multiple_choice' as const,
      options: ['Under €500', '€500-€1,000', '€1,000-€2,500', '€2,500-€5,000', 'Over €5,000'],
      isRequired: false
    },
    {
      question: 'When would you like the work to be completed?',
      type: 'multiple_choice' as const,
      options: ['ASAP', 'Within 1 week', 'Within 2 weeks', 'Within 1 month', 'More than 1 month'],
      isRequired: true
    },
    {
      question: 'Upload any relevant photos or documents',
      type: 'attachment' as const,
      isRequired: false
    },
    {
      question: 'Are there any specific requirements or constraints?',
      type: 'text' as const,
      isRequired: false
    }
  ]
}

const QUESTION_TYPE_ICONS = {
  text: FileText,
  multiple_choice: CheckSquare,
  attachment: Paperclip
}

export default function Step5RFQQuestions({ data, onChange, onValidate }: Step5Props) {
  const [rfqQuestions, setRfqQuestions] = useState<IRFQQuestion[]>(data.rfqQuestions || [])
  const [customQuestion, setCustomQuestion] = useState('')
  const [customType, setCustomType] = useState<'text' | 'multiple_choice' | 'attachment'>('text')
  const [customOptions, setCustomOptions] = useState<string[]>([''])
  const [customRequired, setCustomRequired] = useState(false)

  useEffect(() => {
    onChange({ ...data, rfqQuestions })
    validateForm()
    // intentionally excluding onChange and validateForm from dependencies to avoid loops if unmemoized by parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqQuestions, data])

  const validateForm = () => {
    // RFQ questions are optional but if added, must be valid
    const isValid = rfqQuestions.length <= 5 && rfqQuestions.every(q =>
      q.question.trim() &&
      (q.type !== 'multiple_choice' || (q.options && q.options.length >= 2))
    )
    onValidate(isValid)
  }

  const hasRFQPricing = () => {
    return data.subprojects?.some(sub => sub.pricing?.type === 'rfq') || false
  }

  const getQuestionTemplates = () => {
    const service = data.service || 'default'
    return RFQ_QUESTION_TEMPLATES[service as keyof typeof RFQ_QUESTION_TEMPLATES] ||
      RFQ_QUESTION_TEMPLATES.default
  }

  const addTemplateQuestion = (template: Omit<IRFQQuestion, 'id'>) => {
    if (rfqQuestions.length >= 5) {
      toast.error('Maximum 5 RFQ questions allowed')
      return
    }

    if (rfqQuestions.some(q => q.question === template.question)) {
      toast.error('This question is already added')
      return
    }

    const newQuestion: IRFQQuestion = {
      id: `template-${Date.now()}`,
      ...template
    }

    setRfqQuestions([...rfqQuestions, newQuestion])
  }

  const addCustomQuestion = () => {
    if (rfqQuestions.length >= 5) {
      toast.error('Maximum 5 RFQ questions allowed')
      return
    }

    if (!customQuestion.trim()) {
      toast.error('Please enter a question')
      return
    }

    if (customType === 'multiple_choice') {
      const validOptions = customOptions.filter(opt => opt.trim())
      if (validOptions.length < 2) {
        toast.error('Multiple choice questions need at least 2 options')
        return
      }
    }

    if (rfqQuestions.some(q => q.question === customQuestion.trim())) {
      toast.error('This question already exists')
      return
    }

    const newQuestion: IRFQQuestion = {
      id: `custom-${Date.now()}`,
      question: customQuestion.trim(),
      type: customType,
      options: customType === 'multiple_choice' ? customOptions.filter(opt => opt.trim()) : undefined,
      isRequired: customRequired
    }

    setRfqQuestions([...rfqQuestions, newQuestion])

    // Reset form
    setCustomQuestion('')
    setCustomType('text')
    setCustomOptions([''])
    setCustomRequired(false)

    toast.success('Question added successfully!')
  }

  const removeQuestion = (id: string) => {
    setRfqQuestions(rfqQuestions.filter(q => q.id !== id))
  }

  const updateQuestion = (id: string, updates: Partial<IRFQQuestion>) => {
    setRfqQuestions(rfqQuestions.map(q =>
      q.id === id ? { ...q, ...updates } : q
    ))
  }

  const updateQuestionByIndex = (index: number, updates: Partial<IRFQQuestion>) => {
    setRfqQuestions(rfqQuestions.map((q, i) =>
      i === index ? { ...q, ...updates } : q
    ))
  }

  const addOption = () => {
    setCustomOptions([...customOptions, ''])
  }

  const updateOption = (index: number, value: string) => {
    const newOptions = [...customOptions]
    newOptions[index] = value
    setCustomOptions(newOptions)
  }

  const removeOption = (index: number) => {
    if (customOptions.length > 1) {
      setCustomOptions(customOptions.filter((_, i) => i !== index))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5" />
            <span>Request for Quote (RFQ) Questions</span>
          </CardTitle>
          <CardDescription>
            Create up to 5 questions to gather information when customers request quotes.
            These questions help you provide accurate estimates for complex projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Questions created: {rfqQuestions.length}/5
            </div>
            {!hasRFQPricing() && (
              <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                <Info className="w-4 h-4" />
                <span className="text-sm">No RFQ pricing set in Step 2</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      {!hasRFQPricing() && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-800">RFQ Questions are Optional</h4>
                <p className="text-sm text-amber-700 mt-1">
                  Since you haven&apos;t set up RFQ pricing in Step 2, these questions are optional.
                  They can still be useful for gathering customer information for future quotes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Question Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Add Templates</CardTitle>
          <CardDescription>
            Common RFQ questions for {data.service || 'your service'} category
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getQuestionTemplates().map((template, index) => {
              const IconComponent = QUESTION_TYPE_ICONS[template.type]
              return (
                <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <IconComponent className="w-4 h-4 text-gray-500" />
                        <span className="font-medium text-sm">{template.question}</span>
                        {template.isRequired && (
                          <Badge variant="destructive" className="text-xs">Required</Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-gray-500">
                        <span className="capitalize">{template.type.replace('_', ' ')}</span>
                        {template.options && (
                          <span>• {template.options.length} options</span>
                        )}
                      </div>
                      {template.options && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.options.slice(0, 3).map((option, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {option}
                            </Badge>
                          ))}
                          {template.options.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{template.options.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addTemplateQuestion(template)}
                      disabled={
                        rfqQuestions.some(q => q.question === template.question) ||
                        rfqQuestions.length >= 5
                      }
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add Custom Question */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Custom Question</CardTitle>
          <CardDescription>
            Create your own question specific to your service needs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="customQuestion">Question Text *</Label>
            <Textarea
              id="customQuestion"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="What would you like to ask customers?"
              rows={2}
              maxLength={200}
            />
            <p className="text-sm text-gray-500 mt-1">{customQuestion.length}/200 characters</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Question Type *</Label>
              <Select
                value={customType}
                onValueChange={(value: 'text' | 'multiple_choice' | 'attachment') => {
                  setCustomType(value)
                  if (value !== 'multiple_choice') {
                    setCustomOptions([''])
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text Response</SelectItem>
                  <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                  <SelectItem value="attachment">File Attachment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="customRequired"
                checked={customRequired}
                onCheckedChange={(checked) => setCustomRequired(checked as boolean)}
              />
              <Label htmlFor="customRequired">Required question</Label>
            </div>
          </div>

          {/* Multiple Choice Options */}
          {customType === 'multiple_choice' && (
            <div>
              <Label>Answer Options * (minimum 2)</Label>
              <div className="space-y-2 mt-2">
                {customOptions.map((option, index) => (
                  <div key={index} className="flex space-x-2">
                    <Input
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      maxLength={100}
                    />
                    {customOptions.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeOption(index)}
                        className="text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                  disabled={customOptions.length >= 10}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Option
                </Button>
              </div>
            </div>
          )}

          <Button
            onClick={addCustomQuestion}
            disabled={
              !customQuestion.trim() ||
              rfqQuestions.length >= 5 ||
              (customType === 'multiple_choice' && customOptions.filter(opt => opt.trim()).length < 2)
            }
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Question
          </Button>
        </CardContent>
      </Card>

      {/* Current Questions */}
      {rfqQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Your RFQ Questions ({rfqQuestions.length})</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRfqQuestions([])}
                className="text-red-600 hover:text-red-700"
              >
                Clear All
              </Button>
            </CardTitle>
            <CardDescription>
              You can upload supporting documents for each question to help provide context or examples for customers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {rfqQuestions.map((question, index) => {
                const IconComponent = QUESTION_TYPE_ICONS[question.type]
                return (
                  <div key={question.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-medium text-blue-600">Q{index + 1}:</span>
                          <IconComponent className="w-4 h-4 text-gray-500" />
                          <span className="font-medium">{question.question}</span>
                          {question.isRequired && (
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                          <span className="capitalize">{question.type.replace('_', ' ')}</span>
                          {question.options && (
                            <span>• {question.options.length} options</span>
                          )}
                        </div>

                        {question.options && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {question.options.map((option, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {option}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Professional-provided file for customer to download/sign/fill in (only for attachment questions) */}
                        {question.type === 'attachment' && (
                          <div className="mt-3">
                            <ProfessionalAttachments
                              attachments={question.professionalAttachments || []}
                              onChange={(attachments) => updateQuestionByIndex(index, { professionalAttachments: attachments })}
                              questionId={`rfq-${index}`}
                              projectId={data._id}
                              label="Upload file for customer to sign or fill in (Optional)"
                            />
                          </div>
                        )}

                        {/* Required Toggle */}
                        <div className="flex items-center space-x-2 mt-3">
                          <Checkbox
                            id={`required-${question.id}`}
                            checked={question.isRequired}
                            onCheckedChange={(checked) =>
                              updateQuestion(question.id, { isRequired: checked as boolean })
                            }
                          />
                          <Label htmlFor={`required-${question.id}`} className="text-sm">
                            Required question
                          </Label>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(question.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {rfqQuestions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No RFQ questions yet</h3>
            <p className="text-gray-600 mb-6">
              Add questions to gather specific information when customers request quotes.
              This helps you provide more accurate estimates.
            </p>
            <p className="text-sm text-gray-500">
              {hasRFQPricing()
                ? "You have RFQ pricing set up, so these questions will be very useful!"
                : "These questions are optional since you don't have RFQ pricing in Step 2."
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
