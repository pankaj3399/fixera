"use client"

import { useTranslations } from "next-intl"
import { Loader2, Upload } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { fileLabel, isSafeHttpUrl } from "@/lib/bookingDetails"

export interface PostBookingQuestionFieldQuestion {
  question: string
  type: "text" | "multiple_choice" | "attachment"
  options?: string[]
  isRequired: boolean
}

/**
 * One recorded post-booking question. Label/control/error/help IDs are kept in
 * one place so every control type has an accessible name and the validation
 * error is associated with the control that failed.
 */
export function PostBookingQuestionField({
  question,
  index,
  value,
  hasError,
  uploading,
  onChange,
  onUpload,
}: {
  question: PostBookingQuestionFieldQuestion
  index: number
  value: string
  hasError: boolean
  uploading: boolean
  onChange: (value: string) => void
  onUpload: (file: File | null) => void
}) {
  const t = useTranslations("bookings")
  const labelId = `q${index}-label`
  const fieldId = `q${index}-field`
  const helpId = `q${index}-help`
  const errorId = hasError ? `q${index}-error` : undefined
  const describedBy = [question.type === "attachment" ? helpId : null, errorId].filter(Boolean).join(" ") || undefined
  const isChoice = question.type === "multiple_choice"
  const options = Array.isArray(question.options) ? question.options : []

  return (
    <div className="space-y-2">
      <Label
        id={labelId}
        htmlFor={isChoice ? undefined : fieldId}
        className="text-sm font-medium text-gray-900"
      >
        {question.question}
        {question.isRequired && <span className="text-red-500 ml-1">*</span>}
      </Label>

      {question.type === "text" && (
        <Textarea
          id={fieldId}
          name={fieldId}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          placeholder={t("postBooking.answerPlaceholder")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className="bg-white"
          aria-invalid={hasError}
          aria-required={question.isRequired}
        />
      )}

      {isChoice && (
        <RadioGroup
          id={`q${index}-group`}
          value={value}
          onValueChange={onChange}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={hasError}
          aria-required={question.isRequired}
        >
          {options.map((option, optionIndex) => {
            const optionId = `q${index}-opt${optionIndex}`
            return (
              <div key={optionIndex} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={optionId} />
                <Label htmlFor={optionId} className="font-normal cursor-pointer">
                  {option}
                </Label>
              </div>
            )
          })}
        </RadioGroup>
      )}

      {question.type === "attachment" && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-white">
          <Upload className="h-6 w-6 text-gray-400 mx-auto mb-2" aria-hidden="true" />
          <p id={helpId} className="text-sm text-gray-600">{t("postBooking.uploadHint")}</p>
          <Input
            id={fieldId}
            name={fieldId}
            aria-labelledby={labelId}
            type="file"
            accept=".pdf,image/*"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0] || null
              onUpload(file)
              event.currentTarget.value = ""
            }}
            className="mt-2"
            aria-invalid={hasError}
            aria-describedby={describedBy}
            aria-required={question.isRequired}
          />
          {uploading && (
            <div className="mt-2 inline-flex items-center text-xs text-indigo-600">
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              {t("common.uploading")}
            </div>
          )}
          {value && isSafeHttpUrl(value) ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex text-sm text-indigo-600 hover:underline"
            >
              {fileLabel(value, t("common.openAttachment"))}
            </a>
          ) : value ? (
            <span className="mt-2 inline-flex text-sm text-gray-700">
              {fileLabel(value, t("common.openAttachment"))}
            </span>
          ) : null}
        </div>
      )}

      {hasError && (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {t("postBooking.questionRequired")}
        </p>
      )}
    </div>
  )
}
