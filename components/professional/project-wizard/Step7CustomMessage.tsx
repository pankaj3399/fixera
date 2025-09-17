'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Mail,
  Eye,
  RotateCcw,
  Sparkles,
  User,
  Calendar,
  MapPin,
  MessageCircle,
  Info,
  CheckCircle
} from "lucide-react"
import { toast } from 'sonner'

interface ProjectData {
  customConfirmationMessage?: string
  title?: string
  service?: string
  category?: string
}

interface Step7Props {
  data: ProjectData
  onChange: (data: ProjectData) => void
  onValidate: (isValid: boolean) => void
}

// Message templates by service category
const MESSAGE_TEMPLATES = {
  'plumber': `Thank you for booking our plumbing service! 🔧

We're excited to help solve your plumbing needs. Here's what happens next:

📅 We'll contact you within 24 hours to confirm your appointment time
🛠️ Our licensed plumber will arrive with all necessary tools and materials
📋 We'll provide a detailed assessment before starting any work
✅ All work comes with our satisfaction guarantee

Important reminders:
• Please ensure someone 18+ is present during the appointment
• Clear access to the work area helps us work efficiently
• We'll call 30 minutes before arrival

Questions? Reply to this email or call us at [Your Phone Number].

Looking forward to serving you!
[Your Company Name]`,

  'electrician': `Thank you for choosing our electrical services! ⚡

Your booking has been confirmed. Here's what to expect:

🔌 A certified electrician will handle your project
📞 We'll call within 24 hours to schedule your appointment
🛡️ All work meets local electrical codes and safety standards
📄 You'll receive proper documentation and certificates

Safety first:
• Do not attempt any electrical work yourself
• Keep the electrical panel area clear
• Inform us of any existing electrical issues

We're committed to providing safe, reliable electrical solutions.

Best regards,
[Your Company Name]
📧 [Your Email] | 📱 [Your Phone]`,

  'painter': `Thank you for booking our painting service! 🎨

We're thrilled to transform your space! Here's what comes next:

🏠 We'll schedule a brief pre-work consultation
📅 Flexible scheduling to fit your timeline
🖌️ Professional-grade materials and techniques
🧹 Complete cleanup included in our service

Preparation tips:
• Move valuable items from the work area
• We'll handle furniture protection and floor covering
• Let us know about any color preferences or concerns

Ready to bring your vision to life!

Warm regards,
[Your Company Name]`,

  'cleaning': `Thank you for booking our cleaning service! ✨

Your space is about to sparkle! Here's what happens next:

🧽 Professional cleaning team will be assigned
📋 We'll confirm your cleaning preferences and schedule
🏡 Eco-friendly products used (unless you specify otherwise)
🔒 Fully insured and bonded team members

For the best results:
• Please secure valuable or fragile items
• Let us know about any specific areas of focus
• We appreciate access to cleaning supplies storage

We can't wait to exceed your expectations!

[Your Company Name]
Making your space shine! ✨`,

  'default': `Thank you for your booking! 🌟

We're excited to work with you on your project. Here's what happens next:

📞 We'll contact you within 24 hours to confirm details
📅 Flexible scheduling to meet your needs
👷 Professional and experienced team
✅ Quality work guaranteed

Important notes:
• Please ensure someone is available during the scheduled time
• We'll confirm all details before starting work
• Feel free to contact us with any questions

Looking forward to serving you!

Best regards,
[Your Company Name]`
}

export default function Step7CustomMessage({ data, onChange, onValidate }: Step7Props) {
  const [customMessage, setCustomMessage] = useState<string>(data.customConfirmationMessage || '')
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    onChange({ ...data, customConfirmationMessage: customMessage })
    // Custom message is optional, so always valid
    onValidate(true)
  }, [customMessage])

  const getTemplate = () => {
    const service = data.service || 'default'
    return MESSAGE_TEMPLATES[service as keyof typeof MESSAGE_TEMPLATES] || MESSAGE_TEMPLATES.default
  }

  const generateMessage = async () => {
    setIsGenerating(true)
    try {
      // Simulate AI generation - in real app, call AI API
      await new Promise(resolve => setTimeout(resolve, 1500))

      const template = getTemplate()
      const serviceName = data.service?.charAt(0).toUpperCase() + (data.service?.slice(1) || '')
      const projectTitle = data.title || `${serviceName} Service`

      // Personalize the template
      let personalizedMessage = template
        .replace('[Your Company Name]', 'Your Company')
        .replace('[Your Phone Number]', 'Your Phone Number')
        .replace('[Your Email]', 'your@email.com')
        .replace('[Your Phone]', 'Your Phone Number')

      // Add project-specific intro
      personalizedMessage = `🎉 Booking Confirmed: ${projectTitle}

${personalizedMessage}`

      setCustomMessage(personalizedMessage)
      toast.success('Confirmation message generated!')
    } catch (error) {
      toast.error('Failed to generate message')
    }
    setIsGenerating(false)
  }

  const useTemplate = () => {
    const template = getTemplate()
    setCustomMessage(template)
    toast.success('Template applied!')
  }

  const clearMessage = () => {
    setCustomMessage('')
    toast.success('Message cleared')
  }

  const previewMessage = () => {
    setIsPreviewMode(true)
  }

  const exitPreview = () => {
    setIsPreviewMode(false)
  }

  const renderPreview = () => {
    if (!customMessage.trim()) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No custom message to preview</p>
          <p className="text-sm">The default system message will be used</p>
        </div>
      )
    }

    return (
      <div className="bg-white border rounded-lg overflow-hidden">
        {/* Email Header Simulation */}
        <div className="bg-gray-50 border-b p-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <User className="w-4 h-4" />
            <span>From: your@company.com</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600 mt-1">
            <Mail className="w-4 h-4" />
            <span>To: customer@email.com</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600 mt-1">
            <span className="font-medium">Subject: Booking Confirmation - {data.title || 'Your Service'}</span>
          </div>
        </div>

        {/* Message Body */}
        <div className="p-6">
          <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
            {customMessage}
          </div>

          {/* System Info Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Booking Details:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-blue-800">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>Booking ID: #FX-2024-001</span>
                </div>
                <div className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4" />
                  <span>Service: {data.service || 'Professional Service'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isPreviewMode) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Eye className="w-5 h-5" />
                <span>Email Preview</span>
              </CardTitle>
              <Button variant="outline" onClick={exitPreview}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Back to Edit
              </Button>
            </div>
            <CardDescription>
              This is how your confirmation email will appear to customers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderPreview()}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="w-5 h-5" />
            <span>Custom Confirmation Message</span>
          </CardTitle>
          <CardDescription>
            Create a personalized message that customers receive after booking your service.
            This is optional - if not provided, a standard confirmation will be sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {customMessage.trim() ? 'Custom message configured' : 'Using default message'}
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={generateMessage}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {isGenerating ? 'Generating...' : 'Generate AI Message'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={useTemplate}
              >
                Use Template
              </Button>
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
              <h4 className="font-medium text-blue-800">When is this message sent?</h4>
              <p className="text-sm text-blue-700 mt-1">
                This message is automatically sent to customers immediately after they complete their booking
                and payment. It should include next steps, contact information, and any preparation instructions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Message Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Your Confirmation Message</span>
            <div className="flex space-x-2">
              {customMessage.trim() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={previewMessage}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </Button>
              )}
              {customMessage.trim() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearMessage}
                  className="text-red-600 hover:text-red-700"
                >
                  Clear
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="confirmationMessage">
              Custom Message (Optional)
            </Label>
            <Textarea
              id="confirmationMessage"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Enter your custom confirmation message here...

Example:
Thank you for booking our service! We're excited to work with you.

What happens next:
• We'll call you within 24 hours to confirm details
• Our team will arrive on time and ready to work
• All work comes with our quality guarantee

Questions? Feel free to contact us at [your contact info].

Best regards,
[Your Company Name]"
              className="min-h-[300px] font-mono text-sm"
              maxLength={1000}
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-sm text-gray-500">
                {customMessage.length}/1000 characters
              </p>
              {customMessage.length > 800 && (
                <Badge variant="secondary" className="text-xs">
                  Getting long - consider keeping it concise
                </Badge>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="bg-gray-50 border rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3">Tips for a great confirmation message:</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Start with a warm thank you and confirmation</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Explain what happens next and when</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Include your contact information for questions</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Add any preparation instructions or reminders</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Keep it friendly but professional</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Use emojis sparingly for a modern touch</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Template Preview */}
      {!customMessage.trim() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Default Message Preview</CardTitle>
            <CardDescription>
              Since you haven&apos;t added a custom message, here&apos;s what customers will receive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 border rounded-lg p-4">
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {`🎉 Booking Confirmed!

Thank you for booking "${data.title || 'our service'}"!

Your booking has been successfully confirmed. Here are the next steps:

📞 We'll contact you within 24 hours to confirm scheduling details
📅 Our team will work with you to find the perfect time
✅ You'll receive all necessary information before our arrival

If you have any questions, please don't hesitate to contact us.

Best regards,
The Fixera Team`}
              </div>
            </div>
            <div className="mt-4 text-center">
              <Button onClick={useTemplate} variant="outline">
                Customize This Message
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {customMessage.trim() && (
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-lg text-green-800">Message Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-medium text-green-800">Message Length</div>
                <div className="text-green-700">{customMessage.length} characters</div>
              </div>
              <div>
                <div className="font-medium text-green-800">Estimated Read Time</div>
                <div className="text-green-700">{Math.ceil(customMessage.split(' ').length / 200)} minute</div>
              </div>
              <div>
                <div className="font-medium text-green-800">Status</div>
                <div className="text-green-700">Ready to use</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}