'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Trash2,
  HelpCircle,
  Sparkles,
  Edit,
  Check,
  X,
  RefreshCw
} from "lucide-react"
import { toast } from 'sonner'

interface IFAQ {
  id: string
  question: string
  answer: string
  isGenerated: boolean
  isEditing?: boolean
}

interface ProjectData {
  faq?: IFAQ[]
  category?: string
  service?: string
  description?: string
  title?: string
}

interface Step4Props {
  data: ProjectData
  onChange: (data: ProjectData) => void
  onValidate: (isValid: boolean) => void
}

// Common FAQ templates by service category
const FAQ_TEMPLATES = {
  'plumber': [
    {
      question: 'Do you provide emergency plumbing services?',
      answer: 'Yes, we offer 24/7 emergency plumbing services for urgent issues like burst pipes, major leaks, or blocked drains.'
    },
    {
      question: 'Are your plumbers licensed and insured?',
      answer: 'All our plumbers are fully licensed, certified, and insured. We can provide proof of insurance upon request.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept cash, bank transfers, and major credit cards. Payment is typically due upon completion of work.'
    },
    {
      question: 'Do you provide warranties on your work?',
      answer: 'Yes, we provide warranties on all our work. The warranty period varies depending on the type of service provided.'
    },
    {
      question: 'What should I do to prepare for your visit?',
      answer: 'Please ensure clear access to the work area and shut off water supply if necessary. Remove any personal items from the immediate work area.'
    }
  ],
  'electrician': [
    {
      question: 'Are you certified and licensed electricians?',
      answer: 'Yes, all our electricians are fully certified, licensed, and regularly updated on current electrical codes and safety standards.'
    },
    {
      question: 'Do you handle both residential and commercial projects?',
      answer: 'We specialize in residential electrical work, including installations, repairs, and upgrades for homes and small businesses.'
    },
    {
      question: 'Will you provide a certificate after electrical work?',
      answer: 'Yes, we provide proper certification and documentation for all electrical work completed, ensuring compliance with local regulations.'
    },
    {
      question: 'What happens if there\'s an issue after the work is completed?',
      answer: 'We stand behind our work with a comprehensive warranty. If any issues arise, we will return to address them at no additional cost.'
    },
    {
      question: 'Do I need to turn off power before you arrive?',
      answer: 'For safety reasons, we will handle all power disconnections. Please do not attempt to turn off power yourself unless instructed.'
    }
  ],
  'painter': [
    {
      question: 'Do you provide the paint and materials?',
      answer: 'Yes, we can provide all paint and materials, or we can work with paint you\'ve already purchased. We\'ll discuss this during consultation.'
    },
    {
      question: 'How long does the painting process typically take?',
      answer: 'The duration depends on the size and complexity of the project. We\'ll provide a detailed timeline during our initial assessment.'
    },
    {
      question: 'Do you move furniture and protect floors?',
      answer: 'We provide basic furniture moving and floor protection. For valuable or heavy items, we recommend you arrange separate moving services.'
    },
    {
      question: 'What preparation work is included?',
      answer: 'Basic surface preparation is included, such as cleaning, light sanding, and minor repairs. Extensive prep work may be quoted separately.'
    },
    {
      question: 'Do you clean up after the job?',
      answer: 'Yes, we include complete cleanup in our service, including proper disposal of materials and returning the space to its original condition.'
    }
  ],
  'default': [
    {
      question: 'What is included in your service?',
      answer: 'Our service includes all the items listed in your selected package, plus professional execution and basic cleanup.'
    },
    {
      question: 'How far in advance should I book?',
      answer: 'We recommend booking at least 1-2 weeks in advance, though we may have earlier availability depending on the season and project complexity.'
    },
    {
      question: 'What happens if there are delays due to weather or other factors?',
      answer: 'We will communicate any delays immediately and work with you to reschedule at your convenience with no additional charges.'
    },
    {
      question: 'Do you provide estimates before starting work?',
      answer: 'Yes, we provide detailed estimates before any work begins. No work will start without your approval of the scope and pricing.'
    },
    {
      question: 'What is your cancellation policy?',
      answer: 'You can cancel or reschedule up to 24 hours before the scheduled service time without penalty. Same-day cancellations may incur a fee.'
    }
  ]
}

export default function Step4FAQ({ data, onChange, onValidate }: Step4Props) {
  const [faqs, setFaqs] = useState<IFAQ[]>(data.faq || [])
  const [isGenerating, setIsGenerating] = useState(false)
  const [customQuestion, setCustomQuestion] = useState('')
  const [customAnswer, setCustomAnswer] = useState('')

  useEffect(() => {
    onChange({ ...data, faq: faqs })
    validateForm()
  }, [faqs])

  const validateForm = () => {
    // FAQ is optional but if added, must have at least question and answer
    const isValid = faqs.length === 0 || faqs.every(faq => faq.question.trim() && faq.answer.trim())
    onValidate(isValid)
  }

  const getFAQTemplates = () => {
    const service = data.service || 'default'
    return FAQ_TEMPLATES[service as keyof typeof FAQ_TEMPLATES] || FAQ_TEMPLATES.default
  }

  const generateAIFAQs = async () => {
    setIsGenerating(true)
    try {
      // Simulate AI generation - in real app, call AI API
      await new Promise(resolve => setTimeout(resolve, 2000))

      const templates = getFAQTemplates()
      const serviceName = data.service || 'service'
      const description = data.description || ''

      // Create personalized FAQs based on project data
      const generatedFAQs: IFAQ[] = templates.slice(0, 5).map((template, index) => ({
        id: `generated-${Date.now()}-${index}`,
        question: template.question,
        answer: template.answer,
        isGenerated: true
      }))

      // Add project-specific FAQ if description is available
      if (description.length > 50) {
        generatedFAQs.unshift({
          id: `generated-specific-${Date.now()}`,
          question: `What makes your ${serviceName} service unique?`,
          answer: `Our ${serviceName} service is tailored to meet your specific needs. ${description.substring(0, 100)}... We ensure professional quality and customer satisfaction in every project.`,
          isGenerated: true
        })
      }

      setFaqs(generatedFAQs)
      toast.success('FAQs generated successfully!')
    } catch (error) {
      toast.error('Failed to generate FAQs')
    }
    setIsGenerating(false)
  }

  const addCustomFAQ = () => {
    if (!customQuestion.trim() || !customAnswer.trim()) {
      toast.error('Please provide both question and answer')
      return
    }

    const newFAQ: IFAQ = {
      id: `custom-${Date.now()}`,
      question: customQuestion.trim(),
      answer: customAnswer.trim(),
      isGenerated: false
    }

    setFaqs([...faqs, newFAQ])
    setCustomQuestion('')
    setCustomAnswer('')
    toast.success('FAQ added successfully!')
  }

  const addTemplateFAQ = (template: { question: string; answer: string }) => {
    if (faqs.some(faq => faq.question === template.question)) {
      toast.error('This FAQ is already added')
      return
    }

    const newFAQ: IFAQ = {
      id: `template-${Date.now()}`,
      question: template.question,
      answer: template.answer,
      isGenerated: false
    }

    setFaqs([...faqs, newFAQ])
  }

  const removeFAQ = (id: string) => {
    setFaqs(faqs.filter(faq => faq.id !== id))
  }

  const startEditing = (id: string) => {
    setFaqs(faqs.map(faq =>
      faq.id === id ? { ...faq, isEditing: true } : faq
    ))
  }

  const saveEdit = (id: string, question: string, answer: string) => {
    if (!question.trim() || !answer.trim()) {
      toast.error('Question and answer cannot be empty')
      return
    }

    setFaqs(faqs.map(faq =>
      faq.id === id
        ? { ...faq, question: question.trim(), answer: answer.trim(), isEditing: false, isGenerated: false }
        : faq
    ))
    toast.success('FAQ updated successfully!')
  }

  const cancelEdit = (id: string) => {
    setFaqs(faqs.map(faq =>
      faq.id === id ? { ...faq, isEditing: false } : faq
    ))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <HelpCircle className="w-5 h-5" />
            <span>Frequently Asked Questions</span>
          </CardTitle>
          <CardDescription>
            Create FAQs to help customers understand your service better. You can auto-generate common questions
            or add your own custom ones. FAQs will be displayed on your project page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Current FAQs: {faqs.length}
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={generateAIFAQs}
                disabled={isGenerating}
                className="flex items-center space-x-2"
              >
                {isGenerating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{isGenerating ? 'Generating...' : 'Generate AI FAQs'}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQ Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Add Templates</CardTitle>
          <CardDescription>
            Common questions for {data.service || 'your service'} category
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getFAQTemplates().map((template, index) => (
              <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1 pr-4">
                    <h4 className="font-medium text-sm mb-2">{template.question}</h4>
                    <p className="text-sm text-gray-600">{template.answer}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addTemplateFAQ(template)}
                    disabled={faqs.some(faq => faq.question === template.question)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Custom FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Custom FAQ</CardTitle>
          <CardDescription>
            Create your own questions specific to your service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="customQuestion">Question</Label>
            <Input
              id="customQuestion"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="What question do customers frequently ask?"
              maxLength={200}
            />
            <p className="text-sm text-gray-500 mt-1">{customQuestion.length}/200 characters</p>
          </div>

          <div>
            <Label htmlFor="customAnswer">Answer</Label>
            <Textarea
              id="customAnswer"
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              placeholder="Provide a clear, helpful answer..."
              rows={4}
              maxLength={1000}
            />
            <p className="text-sm text-gray-500 mt-1">{customAnswer.length}/1000 characters</p>
          </div>

          <Button
            onClick={addCustomFAQ}
            disabled={!customQuestion.trim() || !customAnswer.trim()}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Custom FAQ
          </Button>
        </CardContent>
      </Card>

      {/* Current FAQs */}
      {faqs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Your FAQs ({faqs.length})</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFaqs([])}
                className="text-red-600 hover:text-red-700"
              >
                Clear All
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <div key={faq.id} className="border rounded-lg p-4">
                  {faq.isEditing ? (
                    <EditFAQForm
                      faq={faq}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-sm font-medium text-blue-600">Q{index + 1}:</span>
                            <span className="font-medium">{faq.question}</span>
                            {faq.isGenerated && (
                              <Badge variant="outline" className="text-xs">
                                <Sparkles className="w-3 h-3 mr-1" />
                                AI Generated
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-start space-x-2">
                            <span className="text-sm font-medium text-green-600 mt-0.5">A:</span>
                            <p className="text-sm text-gray-700">{faq.answer}</p>
                          </div>
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditing(faq.id)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFAQ(faq.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {faqs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No FAQs yet</h3>
            <p className="text-gray-600 mb-6">
              Add FAQs to help customers understand your service better. You can generate
              common questions automatically or create your own.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={generateAIFAQs} disabled={isGenerating}>
                {isGenerating ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Generate AI FAQs
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Edit FAQ Form Component
function EditFAQForm({
  faq,
  onSave,
  onCancel
}: {
  faq: IFAQ
  onSave: (id: string, question: string, answer: string) => void
  onCancel: (id: string) => void
}) {
  const [question, setQuestion] = useState(faq.question)
  const [answer, setAnswer] = useState(faq.answer)

  return (
    <div className="space-y-4">
      <div>
        <Label>Question</Label>
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={200}
        />
      </div>
      <div>
        <Label>Answer</Label>
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          maxLength={1000}
        />
      </div>
      <div className="flex space-x-2">
        <Button
          size="sm"
          onClick={() => onSave(faq.id, question, answer)}
          disabled={!question.trim() || !answer.trim()}
        >
          <Check className="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCancel(faq.id)}
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  )
}