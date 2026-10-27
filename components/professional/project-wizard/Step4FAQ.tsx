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
import { useLocale, useTranslations } from 'next-intl'
import { mergeFAQSuggestions } from '@/lib/projectWizardContent'
import { generateProjectCopy, ProjectCopyApiError } from '@/lib/projectCopyApi'

interface IFAQ {
  id: string
  question: string
  answer: string
  isGenerated: boolean
  isEditing?: boolean
}

interface ProjectData {
  _id?: string
  id?: string
  faq?: IFAQ[]
  category?: string
  service?: string
  areaOfWork?: string
  description?: string
  title?: string
}

interface Step4Props<T extends ProjectData> {
  data: T
  onChange: (data: T) => void
  onValidate: (isValid: boolean) => void
}

export default function Step4FAQ<T extends ProjectData>({ data, onChange, onValidate }: Step4Props<T>) {
  const t = useTranslations('projectWizardSteps')
  const locale = useLocale()
  const [faqs, setFaqs] = useState<IFAQ[]>(data.faq || [])
  const [isGenerating, setIsGenerating] = useState(false)
  const [showLocalFallbackNotice, setShowLocalFallbackNotice] = useState(false)
  const [customQuestion, setCustomQuestion] = useState('')
  const [customAnswer, setCustomAnswer] = useState('')

  useEffect(() => {
    onChange({ ...data, faq: faqs } as T)
    validateForm()
  }, [faqs])

  const validateForm = () => {
    // FAQ is optional but if added, must have at least question and answer
    const isValid = faqs.length === 0 || faqs.every(faq => faq.question.trim() && faq.answer.trim())
    onValidate(isValid)
  }

  const generateAIFAQs = async () => {
    setIsGenerating(true)
    setShowLocalFallbackNotice(false)
    const context = data as ProjectData & {
      keywords?: string[]
      selectedPricingOption?: { name: string; pricingType: 'fixed_price' | 'price_per_unit'; unit?: string }
      subprojects?: Array<{ name?: string; description?: string; pricing?: Record<string, unknown>; included?: Array<{ name: string; description?: string }>; materialsIncluded?: boolean; materials?: Array<{ name: string; quantity?: string; unit?: string; description?: string }>; preparationDuration?: Record<string, unknown>; executionDuration?: Record<string, unknown>; buffer?: Record<string, unknown>; warrantyPeriod?: { value?: number; unit?: string } }>
      extraOptions?: Array<{ name: string; description?: string; price?: number }>
      termsConditions?: Array<{ name: string; description?: string; type?: string; additionalCost?: number }>
    }
    try {
      const result = await generateProjectCopy<{ faqs: Array<{ question: string; answer: string }> }>({
        kind: 'faqs',
        locale: locale as 'en' | 'nl' | 'fr',
        projectId: data._id || data.id,
        context: {
          category: data.category,
          service: data.service || '',
          areaOfWork: data.areaOfWork,
          description: data.description || '',
          title: data.title,
          keywords: context.keywords,
          selectedPricingOption: context.selectedPricingOption,
          subprojects: (context.subprojects || []).map(({ name, description, pricing, included, materialsIncluded, materials, preparationDuration, executionDuration, buffer, warrantyPeriod }) => ({ name, description, pricing, included, materialsIncluded, materials, preparationDuration, executionDuration, buffer, warrantyPeriod })),
          extraOptions: (context.extraOptions || []).map(({ name, description, price }) => ({ name, description, price })),
          termsConditions: (context.termsConditions || []).map(({ name, description, type, additionalCost }) => ({ name, description, type, additionalCost })),
          faq: faqs.slice(0, 8).map(({ question, answer }) => ({ question, answer })),
        },
      })
      const suggestions: IFAQ[] = result.faqs.map((faq, index) => ({
        id: `generated-${Date.now()}-${index}`,
        question: faq.question,
        answer: faq.answer,
        isGenerated: true,
      }))
      setFaqs(current => mergeFAQSuggestions(current, suggestions))
      toast.success(t('step4.generatedSuccess'))
    } catch (error) {
      if (!(error instanceof ProjectCopyApiError && error.code === 'AI_NOT_CONFIGURED')) {
        toast.error(t('step4.generateFailed'))
        setIsGenerating(false)
        return
      }
      setShowLocalFallbackNotice(true)
      const facts = [
        ...(context.subprojects || []).flatMap(packageItem => [packageItem.name, packageItem.description]),
        ...(context.extraOptions || []).flatMap(option => [option.name, option.description]),
        ...(context.termsConditions || []).flatMap(condition => [condition.name, condition.description]),
        data.description,
      ].map(value => value?.replace(/\s+/g, ' ').trim()).filter((value): value is string => Boolean(value))
      const uniqueFacts = [...new Set(facts)].slice(0, 5)
      const copy = locale === 'fr'
        ? { included: (name: string) => `Que comprend le forfait ${name} ?`, about: (fact: string) => `Que faut-il savoir sur « ${fact.slice(0, 50)} » ?`, states: 'Les détails du projet indiquent :', confirm: ' Confirmez avec le professionnel les points qui ne sont pas précisés.' }
        : locale === 'nl'
          ? { included: (name: string) => `Wat is inbegrepen bij het pakket ${name}?`, about: (fact: string) => `Wat moeten klanten weten over “${fact.slice(0, 50)}”?`, states: 'De projectgegevens vermelden:', confirm: ' Bevestig ontbrekende details met de vakprofessional.' }
          : { included: (name: string) => `What is included in the ${name} package?`, about: (fact: string) => `What should customers know about “${fact.slice(0, 50)}”?`, states: 'The project details state:', confirm: ' Confirm details not specified here with the professional.' }
      const suggestions = uniqueFacts.map((fact, index) => ({
        id: `grounded-${Date.now()}-${index}`,
        question: index === 0 && context.subprojects?.[0]?.name
          ? copy.included(context.subprojects[0].name)
          : copy.about(fact),
        answer: `${copy.states} “${fact}”.${copy.confirm}`,
        isGenerated: false,
      }))
      setFaqs(current => mergeFAQSuggestions(current, suggestions))
      toast.info(uniqueFacts.length ? t('step4.groundedGenerated') : t('step4.groundedEmpty'))
    } finally {
      setIsGenerating(false)
    }
  }

  const addCustomFAQ = () => {
    if (!customQuestion.trim() || !customAnswer.trim()) {
      toast.error(t('step4.needQuestionAndAnswer'))
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
    toast.success(t('step4.addedSuccess'))
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
      toast.error(t('step4.cantBeEmpty'))
      return
    }

    setFaqs(faqs.map(faq =>
      faq.id === id
        ? { ...faq, question: question.trim(), answer: answer.trim(), isEditing: false, isGenerated: false }
        : faq
    ))
    toast.success(t('step4.updatedSuccess'))
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
            <span>{t('step4.title')}</span>
          </CardTitle>
          <CardDescription>
            {t('step4.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {t('step4.currentCount', { count: faqs.length })}
              {showLocalFallbackNotice && <p className="mt-1 text-xs">{t('step4.groundedSource')}</p>}
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
                <span>{isGenerating ? t('step4.generating') : t('step4.generate')}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Custom FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('step4.addTitle')}</CardTitle>
          <CardDescription>
            {t('step4.addDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="customQuestion">{t('step4.questionLabel')}</Label>
            <Input
              id="customQuestion"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder={t('step4.questionPlaceholder')}
              maxLength={200}
            />
            <p className="text-sm text-gray-500 mt-1">
              {t('common.characters', { count: customQuestion.length, max: 200 })}
            </p>
          </div>

          <div>
            <Label htmlFor="customAnswer">{t('step4.answerLabel')}</Label>
            <Textarea
              id="customAnswer"
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              placeholder={t('step4.answerPlaceholder')}
              rows={4}
              maxLength={1000}
            />
            <p className="text-sm text-gray-500 mt-1">
              {t('common.characters', { count: customAnswer.length, max: 1000 })}
            </p>
          </div>

          <Button
            onClick={addCustomFAQ}
            disabled={!customQuestion.trim() || !customAnswer.trim()}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('step4.addTitle')}
          </Button>
        </CardContent>
      </Card>

      {/* Current FAQs */}
      {faqs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('step4.yourFaqs', { count: faqs.length })}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFaqs([])}
                className="text-red-600 hover:text-red-700"
              >
                {t('common.clearAll')}
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
                            <span className="text-sm font-medium text-blue-600">
                              {t('common.questionIndex', { index: index + 1 })}
                            </span>
                            <span className="font-medium">{faq.question}</span>
                            {faq.isGenerated && (
                              <Badge variant="outline" className="text-xs">
                                <Sparkles className="w-3 h-3 mr-1" />
                                {t('step4.aiGenerated')}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-start space-x-2">
                            <span className="text-sm font-medium text-green-600 mt-0.5">{t('step4.answerIndex')}</span>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('step4.noFaqsTitle')}</h3>
            <p className="text-gray-600 mb-6">
              {t('step4.noFaqsDescription')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={generateAIFAQs} disabled={isGenerating}>
                {isGenerating ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {t('step4.generate')}
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
  const t = useTranslations('projectWizardSteps')
  const [question, setQuestion] = useState(faq.question)
  const [answer, setAnswer] = useState(faq.answer)

  return (
    <div className="space-y-4">
      <div>
        <Label>{t('step4.questionLabel')}</Label>
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={200}
        />
      </div>
      <div>
        <Label>{t('step4.answerLabel')}</Label>
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
          {t('step4.save')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCancel(faq.id)}
        >
          <X className="w-4 h-4 mr-2" />
          {t('step4.cancel')}
        </Button>
      </div>
    </div>
  )
}
