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
  ClipboardCheck,
  FileText,
  Paperclip,
  CheckSquare,
  Info,
  Calendar
} from "lucide-react"
import { toast } from 'sonner'
import ProfessionalAttachments from "./ProfessionalAttachments"

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
  postBookingQuestions?: IPostBookingQuestion[]
  category?: string
  service?: string
}

interface Step6Props {
  data: ProjectData
  onChange: (data: ProjectData) => void
  onValidate: (isValid: boolean) => void
}

// Common post-booking questions by service category
const POST_BOOKING_QUESTION_TEMPLATES = {
  'plumber': [
    {
      question: 'What is the best time to contact you to schedule the work?',
      type: 'multiple_choice' as const,
      options: ['Morning (8-12)', 'Afternoon (12-17)', 'Evening (17-20)', 'Flexible'],
      isRequired: true
    },
    {
      question: 'Are there any access restrictions we should know about?',
      type: 'text' as const,
      isRequired: false
    },
    {
      question: 'Do you have any specific brand preferences for fixtures or materials?',
      type: 'text' as const,
      isRequired: false
    }
  ],
  'electrician': [
    {
      question: 'When would you prefer us to start the electrical work?',
      type: 'multiple_choice' as const,
      options: ['ASAP', 'Within 1 week', 'Within 2 weeks', 'Specific date (will discuss)'],
      isRequired: true
    },
    {
      question: 'Are there any safety concerns or hazards we should be aware of?',
      type: 'text' as const,
      isRequired: false
    },
    {
      question: 'Upload any electrical diagrams or plans you have',
      type: 'attachment' as const,
      isRequired: false
    }
  ],
  'painter': [
    {
      question: 'When would you like us to start the painting work?',
      type: 'multiple_choice' as const,
      options: ['This week', 'Next week', 'Within 2 weeks', 'Flexible timing'],
      isRequired: true
    },
    {
      question: 'Do you have paint colors selected or need color consultation?',
      type: 'multiple_choice' as const,
      options: ['Colors already selected', 'Need color consultation', 'Have samples to show', 'Completely undecided'],
      isRequired: false
    },
    {
      question: 'Any special instructions or areas to avoid?',
      type: 'text' as const,
      isRequired: false
    }
  ],
  'cleaning': [
    {
      question: 'What is your preferred cleaning schedule?',
      type: 'multiple_choice' as const,
      options: ['One-time deep clean', 'Weekly', 'Bi-weekly', 'Monthly', 'As needed'],
      isRequired: true
    },
    {
      question: 'Are there any areas of special focus or concern?',
      type: 'text' as const,
      isRequired: false
    },
    {
      question: 'Do you have any allergies or sensitivities to cleaning products?',
      type: 'text' as const,
      isRequired: false
    }
  ],
  'default': [
    {
      question: 'What is your preferred start date for the work?',
      type: 'multiple_choice' as const,
      options: ['ASAP', 'Within 1 week', 'Within 2 weeks', 'Within 1 month', 'Flexible'],
      isRequired: true
    },
    {
      question: 'Are there any special requirements or considerations for this project?',
      type: 'text' as const,
      isRequired: false
    },
    {
      question: 'What is the best way to contact you for updates?',
      type: 'multiple_choice' as const,
      options: ['Phone call', 'Text message', 'Email', 'WhatsApp'],
      isRequired: false
    }
  ]
}

const QUESTION_TYPE_ICONS = {
  text: FileText,
  multiple_choice: CheckSquare,
  attachment: Paperclip
}

export default function Step6PostBookingQuestions({ data, onChange, onValidate }: Step6Props) {
  const [postBookingQuestions, setPostBookingQuestions] = useState<IPostBookingQuestion[]>(
    data.postBookingQuestions || []
  )
  const [customQuestion, setCustomQuestion] = useState('')
  const [customType, setCustomType] = useState<'text' | 'multiple_choice' | 'attachment'>('text')
  const [customOptions, setCustomOptions] = useState<string[]>([''])
  const [customRequired, setCustomRequired] = useState(false)

  useEffect(() => {
    onChange({ ...data, postBookingQuestions })
    validateForm()
  }, [postBookingQuestions])

  const validateForm = () => {
    // Post-booking questions are optional but if added, must be valid (max 3)
    const isValid = postBookingQuestions.length <= 3 && postBookingQuestions.every(q =>
      q.question.trim() &&
      (q.type !== 'multiple_choice' || (q.options && q.options.length >= 2))
    )
    onValidate(isValid)
  }

  const getQuestionTemplates = () => {
    const service = data.service || 'default'
    return POST_BOOKING_QUESTION_TEMPLATES[service as keyof typeof POST_BOOKING_QUESTION_TEMPLATES] ||
      POST_BOOKING_QUESTION_TEMPLATES.default
  }

  const addTemplateQuestion = (template: Omit<IPostBookingQuestion, 'id'>) => {
    if (postBookingQuestions.length >= 3) {
      toast.error('Maximum 3 post-booking questions allowed')
      return
    }

    if (postBookingQuestions.some(q => q.question === template.question)) {
      toast.error('This question is already added')
      return
    }

    const newQuestion: IPostBookingQuestion = {
      id: `template-${Date.now()}`,
      ...template
    }

    setPostBookingQuestions([...postBookingQuestions, newQuestion])
  }

  const addCustomQuestion = () => {
    if (postBookingQuestions.length >= 3) {
      toast.error('Maximum 3 post-booking questions allowed')
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

    if (postBookingQuestions.some(q => q.question === customQuestion.trim())) {
      toast.error('This question already exists')
      return
    }

    const newQuestion: IPostBookingQuestion = {
      id: `custom-${Date.now()}`,
      question: customQuestion.trim(),
      type: customType,
      options: customType === 'multiple_choice' ? customOptions.filter(opt => opt.trim()) : undefined,
      isRequired: customRequired
    }

    setPostBookingQuestions([...postBookingQuestions, newQuestion])

    // Reset form
    setCustomQuestion('')
    setCustomType('text')
    setCustomOptions([''])
    setCustomRequired(false)

    toast.success('Question added successfully!')
  }

  const removeQuestion = (id: string) => {
    setPostBookingQuestions(postBookingQuestions.filter(q => q.id !== id))
  }

  const updateQuestion = (id: string, updates: Partial<IPostBookingQuestion>) => {
    setPostBookingQuestions(postBookingQuestions.map(q =>
      q.id === id ? { ...q, ...updates } : q
    ))
  }

  const updateQuestionByIndex = (index: number, updates: Partial<IPostBookingQuestion>) => {
    setPostBookingQuestions(postBookingQuestions.map((q, i) =>
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
            <ClipboardCheck className="w-5 h-5" />
            <span>Post-Booking Questions</span>
          </CardTitle>
          <CardDescription>
            Create up to 3 questions to ask customers after they book your service.
            These help you gather additional details needed to complete the work successfully.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Questions created: {postBookingQuestions.length}/3
            </div>
            <div className="flex items-center space-x-2 text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Asked after booking</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800">When are these questions asked?</h4>
              <p className="text-sm text-blue-700 mt-1">
                These questions appear immediately after a customer completes their booking.
                They help you gather final details needed to prepare for and execute the work.
                Keep them focused on logistics, timing, and specific requirements.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Question Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Add Templates</CardTitle>
          <CardDescription>
            Common post-booking questions for {data.service || 'your service'} category
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
                        postBookingQuestions.some(q => q.question === template.question) ||
                        postBookingQuestions.length >= 3
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
            Create your own question to gather specific information after booking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="customQuestion">Question Text *</Label>
            <Textarea
              id="customQuestion"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="What would you like to ask customers after they book?"
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
              postBookingQuestions.length >= 3 ||
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
      {postBookingQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Your Post-Booking Questions ({postBookingQuestions.length})</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPostBookingQuestions([])}
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
              {postBookingQuestions.map((question, index) => {
                const IconComponent = QUESTION_TYPE_ICONS[question.type]
                return (
                  <div key={question.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-medium text-green-600">Q{index + 1}:</span>
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
                              questionId={`post-booking-${index}`}
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
      {postBookingQuestions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No post-booking questions yet</h3>
            <p className="text-gray-600 mb-6">
              Add questions to gather important details after customers book your service.
              This helps ensure you have all the information needed for successful completion.
            </p>
            <div className="bg-gray-50 border rounded-lg p-4 max-w-md mx-auto">
              <h4 className="font-medium text-gray-900 mb-2">Examples of good post-booking questions:</h4>
              <ul className="text-sm text-gray-600 space-y-1 text-left">
                <li>• &quot;What&apos;s your preferred start time?&quot;</li>
                <li>• &quot;Any access restrictions we should know about?&quot;</li>
                <li>• &quot;Do you have material preferences?&quot;</li>
                <li>• &quot;Best way to contact you for updates?&quot;</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {postBookingQuestions.length > 0 && (
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-lg text-green-800">Question Flow Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-green-700">
              <p className="mb-3">
                <strong>When customers book your service, they will:</strong>
              </p>
              <ol className="space-y-2 ml-4">
                <li>1. Complete payment and booking confirmation</li>
                <li>2. See a success message with booking details</li>
                <li>3. Answer your {postBookingQuestions.length} post-booking question{postBookingQuestions.length > 1 ? 's' : ''}</li>
                <li>4. Receive final confirmation with next steps</li>
              </ol>
              <p className="mt-3">
                <strong>Required questions:</strong> {postBookingQuestions.filter(q => q.isRequired).length} of {postBookingQuestions.length}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}