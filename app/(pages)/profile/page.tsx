'use client'

import { Suspense } from "react"
import { useTranslations } from "next-intl"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { User, Mail, Phone, Shield, Calendar, Building, Check, X, AlertCircle, Loader2, Upload, FileText, CalendarX, Pencil, MapPin, AlertTriangle, CreditCard, Camera, Trash2 } from "lucide-react"
import EmployeeManagement from "@/components/TeamManagement"
import PasswordChange from "@/components/PasswordChange"
import PrivacyAndData from "@/components/PrivacyAndData"
import EmployeeAvailability from "@/components/EmployeeAvailability"
import NotificationPreferences from "@/components/notifications/NotificationPreferences"
import AdminAvailability from "@/components/AdminAvailability"
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/adminRbac"
import WeeklyAvailabilityCalendar, { CalendarEvent } from "@/components/calendar/WeeklyAvailabilityCalendar"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAuthToken, buildUsernameSuggestionParams } from "@/lib/utils"
import { EU_COUNTRIES } from "@/lib/countries"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"
import { CompanyAvailability, DEFAULT_COMPANY_AVAILABILITY } from "@/lib/defaults/companyAvailability"
import {
  validateVATFormat,
  validateVATWithAPI,
  updateUserVAT,
  validateAndPopulateVAT,
  submitForVerification,
  isEUVatNumber,
  formatVATNumber
} from "@/lib/vatValidation"
import { toLocalInputValue } from "@/lib/dateUtils"
import { getScheduleWindow, getVisibleScheduleDays } from "@/lib/scheduleUtils"


function normalizeCountryCode(raw: string): string {
  if (raw.length === 2) return raw.toUpperCase()
  return EU_COUNTRIES.find((c) => c.name.toLowerCase() === raw.toLowerCase())?.code || raw
}

const VAT_ERROR_KEYS = {
  required: 'vatFormat.required',
  tooShort: 'vatFormat.tooShort',
  tooLong: 'vatFormat.tooLong',
  countryPrefix: 'vatFormat.countryPrefix',
  invalidCharacters: 'vatFormat.invalidCharacters',
  invalidCountry: 'vatFormat.invalidCountry',
  validationFailed: 'vatFormat.validationFailed',
  network: 'vatFormat.network',
} as const

function toEventDate(value: string, isEnd = false): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0)
  }
  return new Date(value)
}

interface StripeAccountStatus {
  hasAccount: boolean
  onboardingCompleted?: boolean
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  payouts_enabled?: boolean
  detailsSubmitted?: boolean
  accountStatus?: string
  requirements?: {
    currentlyDue?: string[]
    pendingVerification?: string[]
  }
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" /></div>}>
      <ProfileContent />
    </Suspense>
  )
}

function ProfileContent() {
  const t = useTranslations('account')
  const { intl } = useFormatLocale()
  const { user, isAuthenticated, loading, checkAuth } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([intl], { type: 'region' })
    } catch {
      return null
    }
  }, [intl])
  const vatCountryName = (vatNumber: string) => {
    const code = vatNumber.slice(0, 2).toUpperCase()
    if (code.length !== 2) return ''
    return regionNames?.of(code) ?? code
  }
  const vatErrorMessage = (result: { errorCode?: string; error?: string; countryCode?: string }) => {
    const key = result.errorCode
      ? VAT_ERROR_KEYS[result.errorCode as keyof typeof VAT_ERROR_KEYS]
      : undefined
    return key ? t(key, { country: result.countryCode ?? '' }) : result.error
  }
  const weekdayLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(intl, { weekday: 'short' })
    return (dayIndex: number) =>
      formatter.format(new Date(Date.UTC(2024, 0, 7 + dayIndex)))
  }, [intl])
  const professionalStatusLabel = (status?: string) => {
    switch (status) {
      case 'approved':
        return t('professionalStatus.approved')
      case 'pending':
        return t('professionalStatus.pending')
      case 'rejected':
        return t('professionalStatus.rejected')
      default:
        return t('professionalStatus.notSubmitted')
    }
  }
  const roleLabel = (role?: string) => {
    switch (role) {
      case 'customer':
        return t('role.customer')
      case 'professional':
        return t('role.professional')
      case 'employee':
        return t('role.employee')
      case 'admin':
        return t('role.admin')
      default:
        return role ?? ''
    }
  }
  const dayLabels: Record<string, string> = {
    monday: t('companyAvailability.days.monday'),
    tuesday: t('companyAvailability.days.tuesday'),
    wednesday: t('companyAvailability.days.wednesday'),
    thursday: t('companyAvailability.days.thursday'),
    friday: t('companyAvailability.days.friday'),
    saturday: t('companyAvailability.days.saturday'),
    sunday: t('companyAvailability.days.sunday'),
  }
  const [profileTab, setProfileTab] = useState('profile')
  const [vatNumber, setVatNumber] = useState('')
  const [vatValidating, setVatValidating] = useState(false)
  const [vatSaving, setVatSaving] = useState(false)
  const [vatValidation, setVatValidation] = useState<{
    valid?: boolean
    transient?: boolean
    error?: string
    companyName?: string
    companyAddress?: string
    parsedAddress?: {
      streetAddress?: string;
      city?: string;
      postalCode?: string;
      country?: string;
    };
    autoPopulateRecommended?: boolean;
  }>({})

  // Professional profile states
  const [idProofFile, setIdProofFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [businessInfo, setBusinessInfo] = useState({
    companyName: '',
    description: '',
    website: '',
    address: '',
    city: '',
    country: '',
    postalCode: ''
  })
  const [username, setUsername] = useState('')
  const [usernameEdit, setUsernameEdit] = useState(false)
  const [usernameCheck, setUsernameCheck] = useState<{ available?: boolean; reason?: string; checking?: boolean }>({})
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([])
  const [usernameSaving, setUsernameSaving] = useState(false)
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const usernameAbortRef = useRef<AbortController | null>(null)
  const [hourlyRate, setHourlyRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [serviceCategories, setServiceCategories] = useState<string[]>([])
  const [serviceCatalog, setServiceCatalog] = useState<Array<{ name: string; services: Array<{ name: string }> }>>([])
  const [serviceCatalogLoading, setServiceCatalogLoading] = useState(false)
  const [serviceCatalogError, setServiceCatalogError] = useState(false)
  const [blockedRanges, setBlockedRanges] = useState<{ startDate: string, endDate: string, reason?: string }[]>([])
  const [newBlockedRange, setNewBlockedRange] = useState({ startDate: '', endDate: '', reason: '' })

  // Company availability (for team members to inherit)
  const [companyAvailability, setCompanyAvailability] = useState<CompanyAvailability>(DEFAULT_COMPANY_AVAILABILITY)
  const [companyBlockedRanges, setCompanyBlockedRanges] = useState<{ startDate: string, endDate: string, reason?: string, isHoliday?: boolean }[]>([])
  const [newCompanyBlockedRange, setNewCompanyBlockedRange] = useState({ startDate: '', endDate: '', reason: '', isHoliday: false })
  const [bookingEvents, setBookingEvents] = useState<CalendarEvent[]>([])
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileImageUploading, setProfileImageUploading] = useState(false)
  const profileImageInputRef = useRef<HTMLInputElement>(null)
  const renderAvatarEditor = () => (
    <div className="flex items-center gap-4 pb-3 border-b">
      <div className="relative group">
        <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden">
          {user?.profileImage ? (
            <img src={user.profileImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-semibold text-indigo-600">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => profileImageInputRef.current?.click()}
          disabled={profileImageUploading}
          aria-label={t('avatar.editPhoto')}
          className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-opacity cursor-pointer"
        >
          {profileImageUploading ? (
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          ) : (
            <Camera className="h-5 w-5 text-white" />
          )}
        </button>
        <input
          ref={profileImageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleProfileImageUpload}
        />
      </div>
      <div>
        <p className="text-sm font-medium">{user?.name}</p>
        <p className="text-xs text-gray-500">{t('avatar.clickToChange')}</p>
        {user?.profileImage && (
          <button
            type="button"
            onClick={handleDeleteProfileImage}
            disabled={profileImageUploading}
            className="text-xs text-red-500 hover:text-red-700 mt-0.5 flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> {t('avatar.remove')}
          </button>
        )}
      </div>
    </div>
  )

  const [showAutoPopulateDialog, setShowAutoPopulateDialog] = useState(false)
  const [pendingVatData, setPendingVatData] = useState<{
    vatNumber: string;
    companyName?: string;
    companyAddress?: string;
    parsedAddress?: {
      streetAddress?: string;
      city?: string;
      postalCode?: string;
      country?: string;
    };
  } | null>(null)
  const [verificationSubmitting, setVerificationSubmitting] = useState(false)
  const [editingRange, setEditingRange] = useState<{
    index: number;
    startValue: string;
    endValue: string;
    reason: string;
  } | null>(null)

  // Phone number update state
  const [isEditingPhone, setIsEditingPhone] = useState(false)
  const [newPhoneNumber, setNewPhoneNumber] = useState('')
  const [phoneUpdating, setPhoneUpdating] = useState(false)

  // Customer address state
  const [customerAddress, setCustomerAddress] = useState({
    address: '',
    city: '',
    country: '',
    postalCode: ''
  })
  const [customerBusinessName, setCustomerBusinessName] = useState('')
  const [customerCompanyAddress, setCustomerCompanyAddress] = useState({
    address: '',
    city: '',
    country: '',
    postalCode: ''
  })
  const [customerType, setCustomerType] = useState<'individual' | 'business'>('individual')
  const [customerProfileSaving, setCustomerProfileSaving] = useState(false)

  // ID metadata state (for professionals)
  const [idCountryOfIssue, setIdCountryOfIssue] = useState('')
  const [idExpirationDate, setIdExpirationDate] = useState('')
  const [idInfoSaving, setIdInfoSaving] = useState(false)
  const [showIdChangeWarning, setShowIdChangeWarning] = useState(false)
  const [showIdProofWarning, setShowIdProofWarning] = useState(false)
  const [stripeAccountStatus, setStripeAccountStatus] = useState<StripeAccountStatus | null>(null)
  const [stripeStatusLoading, setStripeStatusLoading] = useState(false)
  const [stripeStatusError, setStripeStatusError] = useState<string | null>(null)

  const loadStripeAccountStatus = useCallback(async () => {
    if (user?.role !== 'professional') {
      return
    }

    setStripeStatusLoading(true)
    setStripeStatusError(null)

    try {
      const token = getAuthToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stripe/connect/account-status`,
        {
          credentials: 'include',
          headers,
        }
      )

      if (response.status === 404) {
        setStripeAccountStatus({ hasAccount: false })
        return
      }

      const data = await response.json()

      if (response.ok && data?.success && data?.data) {
        const payoutsEnabled = Boolean(data.data.payoutsEnabled ?? data.data.payouts_enabled)
        setStripeAccountStatus({
          hasAccount: true,
          ...data.data,
          payoutsEnabled,
        })
        return
      }

      setStripeStatusError(data?.error?.message || data?.msg || '')
    } catch (error) {
      setStripeStatusError(error instanceof Error ? error.message : '')
    } finally {
      setStripeStatusLoading(false)
    }
  }, [user?.role])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login?redirect=/profile')
    }
  }, [isAuthenticated, loading, router])

  useEffect(() => {
    if (user?.vatNumber) {
      setVatNumber(user.vatNumber)
    }

    // Populate phone
    if (user?.phone) {
      setNewPhoneNumber(user.phone)
    }

    // Populate customer address
    if (user?.role === 'customer') {
      if (user.location) {
        setCustomerAddress({
          address: user.location.address || '',
          city: user.location.city || '',
          country: user.location.country || '',
          postalCode: user.location.postalCode || ''
        })
      }
      if (user.businessName) {
        setCustomerBusinessName(user.businessName)
      }
      if (user.companyAddress) {
        setCustomerCompanyAddress({
          address: user.companyAddress.address || '',
          city: user.companyAddress.city || '',
          country: user.companyAddress.country || '',
          postalCode: user.companyAddress.postalCode || ''
        })
      }
      if (user.customerType) {
        setCustomerType(user.customerType)
      }
    }

    // Populate ID metadata for professionals
    if (user?.role === 'professional') {
      if (user.idCountryOfIssue) {
        setIdCountryOfIssue(normalizeCountryCode(user.idCountryOfIssue))
      }
      if (user.idExpirationDate) setIdExpirationDate(user.idExpirationDate.split('T')[0])
    }

    // Populate professional data
    if (user?.role === 'professional') {
      if (user.businessInfo) {
        setBusinessInfo(prev => ({
          ...prev,
          ...user.businessInfo
        }))
      }
      if (user.username) setUsername(user.username)
      if (user.hourlyRate) setHourlyRate(user.hourlyRate.toString())
      if (user.currency) setCurrency(user.currency)
      if (user.serviceCategories) setServiceCategories(user.serviceCategories)
      const mergedRanges = new Map<string, { startDate: string; endDate: string; reason?: string }>()
      const addRange = (range: { startDate: string; endDate: string; reason?: string }) => {
        const key = `${range.startDate}-${range.endDate}-${range.reason || ''}`
        if (!mergedRanges.has(key)) {
          mergedRanges.set(key, range)
        }
      }

      if (user.blockedRanges) {
        user.blockedRanges.forEach((range: { startDate: string | Date; endDate: string | Date; reason?: string }) => {
          const startDateStr = typeof range.startDate === 'string' ? range.startDate : range.startDate.toISOString()
          const endDateStr = typeof range.endDate === 'string' ? range.endDate : range.endDate.toISOString()
          addRange({
            startDate: startDateStr,
            endDate: endDateStr,
            reason: range.reason || ''
          })
        })
      }

      if (user.blockedDates) {
        user.blockedDates.forEach((item: string | { date: string | Date; reason?: string }) => {
          const dateValue = typeof item === 'string'
            ? item
            : item.date
              ? (typeof item.date === 'string' ? item.date : item.date.toISOString())
              : ''
          const dateOnly = dateValue.split('T')[0]
          if (!dateOnly) return
          const startIso = new Date(`${dateOnly}T00:00:00`).toISOString()
          const endIso = new Date(`${dateOnly}T23:59:59`).toISOString()
          addRange({
            startDate: startIso,
            endDate: endIso,
            reason: typeof item === 'string' ? undefined : item.reason
          })
        })
      }

      setBlockedRanges(Array.from(mergedRanges.values()))

      // Load company availability
      if (user.companyAvailability) {
        // Check if ALL days are unavailable (old/bad data)
        const allDaysUnavailable = Object.values(user.companyAvailability).every(
          (dayAvail) => dayAvail && typeof dayAvail === 'object' && 'available' in dayAvail && !dayAvail.available
        )

        // If all days are unavailable, don't load it - keep the new defaults (Mon-Fri available)
        // Otherwise, load the saved company availability
        if (!allDaysUnavailable) {
          setCompanyAvailability(prev => {
            const updated = { ...prev }
            Object.entries(user.companyAvailability!).forEach(([day, dayAvailability]) => {
              if (dayAvailability) {
                updated[day as keyof typeof updated] = {
                  available: dayAvailability.available,
                  startTime: dayAvailability.startTime || '09:00',
                  endTime: dayAvailability.endTime || '17:00'
                }
              }
            })
            return updated
          })
        }
      }
      const mergedCompanyRanges = new Map<string, { startDate: string; endDate: string; reason?: string; isHoliday?: boolean }>()
      const addCompanyRange = (range: { startDate: string; endDate: string; reason?: string; isHoliday?: boolean }) => {
        const key = `${range.startDate}-${range.endDate}-${range.reason || ''}-${range.isHoliday ? 'holiday' : ''}`
        if (!mergedCompanyRanges.has(key)) {
          mergedCompanyRanges.set(key, range)
        }
      }

      if (user.companyBlockedRanges) {
        // Keep full ISO timestamps for consistency with personal ranges
        user.companyBlockedRanges.forEach((range: { startDate: string | Date; endDate: string | Date; reason?: string; isHoliday?: boolean }) => {
          const startDateStr = typeof range.startDate === 'string' ? range.startDate : range.startDate.toISOString()
          const endDateStr = typeof range.endDate === 'string' ? range.endDate : range.endDate.toISOString()
          addCompanyRange({
            startDate: startDateStr,
            endDate: endDateStr,
            reason: range.reason || '',
            isHoliday: range.isHoliday || false
          })
        })
      }

      if (user.companyBlockedDates) {
        user.companyBlockedDates.forEach((item: string | { date: string | Date; reason?: string; isHoliday?: boolean }) => {
          const dateValue = typeof item === 'string'
            ? item
            : item.date
              ? (typeof item.date === 'string' ? item.date : item.date.toISOString())
              : ''
          const dateOnly = dateValue.split('T')[0]
          if (!dateOnly) return
          // Normalize to full ISO timestamps for consistency with companyBlockedRanges
          const startIso = new Date(`${dateOnly}T00:00:00`).toISOString()
          const endIso = new Date(`${dateOnly}T23:59:59`).toISOString()
          addCompanyRange({
            startDate: startIso,
            endDate: endIso,
            reason: typeof item === 'string' ? undefined : item.reason,
            isHoliday: typeof item === 'string' ? false : item.isHoliday || false
          })
        })
      }

      setCompanyBlockedRanges(Array.from(mergedCompanyRanges.values()))
    }
  }, [user])

  useEffect(() => {
    if (user?.role !== 'professional') {
      setServiceCatalog([])
      setServiceCatalogError(false)
      setServiceCatalogLoading(false)
      return
    }

    const controller = new AbortController()

    const fetchServiceCatalog = async () => {
      try {
        setServiceCatalogLoading(true)
        setServiceCatalogError(false)
        const country = normalizeCountryCode(businessInfo.country || user?.businessInfo?.country || 'BE')
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=${encodeURIComponent(country)}`,
          { credentials: 'include', signal: controller.signal }
        )
        if (!response.ok) {
          throw new Error(`Failed to fetch service categories: ${response.status}`)
        }
        const data = await response.json()
        const items = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
        setServiceCatalog(items)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Failed to load service categories:', error)
        setServiceCatalogError(true)
      } finally {
        if (!controller.signal.aborted) {
          setServiceCatalogLoading(false)
        }
      }
    }

    fetchServiceCatalog()

    return () => {
      controller.abort()
    }
  }, [user?.role, user?.businessInfo?.country, businessInfo.country])

  useEffect(() => {
    if (loading || !isAuthenticated || user?.role !== 'professional') {
      return
    }

    const abortController = new AbortController()

    const fetchBookingEvents = async () => {
      try {
        const token = getAuthToken()
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/bookings/my-bookings`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: abortController.signal
        })
        const result = await response.json()

        if (!response.ok || !result.success) {
          return
        }

        interface BookingData {
          _id: string
          bookingNumber?: string
          customer?: { name?: string } | string | null
          scheduledStartDate?: string | Date | null
          scheduledExecutionEndDate?: string | Date | null
          scheduledBufferStartDate?: string | Date | null
          scheduledBufferEndDate?: string | Date | null
          status?: string
          resourcePlan?: { resourceId?: string | { _id?: string }; days?: (string | Date)[] }[]
          location?: {
            address?: string
            city?: string
            country?: string
            postalCode?: string
          }
        }

        const currentUserId = user?._id ? String(user._id) : ''
        const DAY_MS = 24 * 60 * 60 * 1000

        const parseDate = (value?: string | Date | null) => {
          if (!value) return null
          const date = new Date(value)
          return Number.isNaN(date.getTime()) ? null : date
        }

        const activeBookings = (result.bookings || []).filter((booking: BookingData) =>
          booking?.scheduledStartDate &&
          (booking?.scheduledExecutionEndDate || booking?.scheduledBufferEndDate) &&
          !['completed', 'cancelled', 'refunded'].includes(booking?.status || '')
        )

        const events: CalendarEvent[] = []

        activeBookings.forEach((booking: BookingData) => {
          const scheduledStart = parseDate(booking.scheduledStartDate)
          const executionEnd = parseDate(booking.scheduledExecutionEndDate)
          const bufferStart = parseDate(booking.scheduledBufferStartDate)
          const bufferEnd = parseDate(booking.scheduledBufferEndDate)
          const customerName = booking.customer && typeof booking.customer === 'object'
            ? booking.customer.name
            : undefined

          const plan = Array.isArray(booking.resourcePlan) ? booking.resourcePlan : []
          const hasPlan = plan.some((entry) => Array.isArray(entry?.days) && entry.days.length > 0)

          if (hasPlan) {
            const entry = plan.find(
              (e) => String((typeof e?.resourceId === 'object' ? e?.resourceId?._id : e?.resourceId) || '') === currentUserId
            )
            const plannedDays = entry && Array.isArray(entry.days) ? entry.days : []

            if (plannedDays.length === 0) {
              return
            }

            plannedDays.forEach((day, dayIndex) => {
              const dayStart = parseDate(day)
              if (!dayStart) return
              const dayStartUtc = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), 0, 0, 0, 0))
              events.push({
                id: `booking-${booking._id}-${dayIndex}`,
                type: 'booking',
                title: t('personalAvailability.bookingTitle'),
                start: dayStartUtc,
                end: new Date(dayStartUtc.getTime() + DAY_MS),
                meta: {
                  bookingId: booking._id,
                  bookingNumber: booking.bookingNumber,
                  customerName,
                  location: booking.location
                },
                readOnly: true
              })
            })

            return
          }

          if (scheduledStart && executionEnd && executionEnd > scheduledStart) {
            events.push({
              id: `booking-${booking._id}`,
              type: 'booking',
              title: t('personalAvailability.bookingTitle'),
              start: scheduledStart,
              end: executionEnd,
              meta: {
                bookingId: booking._id,
                bookingNumber: booking.bookingNumber,
                customerName,
                location: booking.location
              },
              readOnly: true
            })
          }

          if (bufferStart && bufferEnd && bufferEnd > bufferStart) {
            const bufferIntervalStart =
              executionEnd && bufferStart < executionEnd ? executionEnd : bufferStart
            if (bufferIntervalStart < bufferEnd) {
              events.push({
                id: `buffer-${booking._id}`,
                type: 'booking-buffer',
                title: t('personalAvailability.bufferTitle'),
                start: bufferIntervalStart,
                end: bufferEnd,
                meta: {
                  bookingId: booking._id,
                  bookingNumber: booking.bookingNumber,
                  customerName,
                  location: booking.location
                },
                readOnly: true
              })
            }
          }
        })

        setBookingEvents(events)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        console.error('Failed to load booking events:', error)
        toast.error(t('toasts.bookingEventsFailed'))
      }
    }

    fetchBookingEvents()

    return () => {
      abortController.abort()
    }
  }, [loading, isAuthenticated, user?.role, user?._id, t])

  useEffect(() => {
    if (loading || !isAuthenticated || user?.role !== 'professional') {
      setStripeAccountStatus(null)
      setStripeStatusError(null)
      setStripeStatusLoading(false)
      return
    }

    void loadStripeAccountStatus()
  }, [loading, isAuthenticated, user?.role, loadStripeAccountStatus])

  const handleVatNumberChange = (value: string) => {
    setVatNumber(value)
    setVatValidation({}) // Reset validation when user types
  }

  const validateVatNumber = async () => {
    if (!vatNumber.trim()) {
      setVatValidation({})
      return
    }

    const formatted = formatVATNumber(vatNumber)

    // Client-side format validation
    const formatValidation = validateVATFormat(formatted)
    if (!formatValidation.valid) {
      setVatValidation({
        valid: false,
        error: vatErrorMessage(formatValidation)
      })
      return
    }

    // If it's not an EU VAT number, just validate format
    if (!isEUVatNumber(formatted)) {
      setVatValidation({
        valid: false,
        error: t('vat.onlyEu')
      })
      return
    }

    setVatValidating(true)
    try {
      const result = await validateVATWithAPI(formatted)
      setVatValidation({
        valid: result.valid,
        transient: result.transient === true,
        error: vatErrorMessage(result),
        companyName: result.companyName,
        companyAddress: result.companyAddress,
        parsedAddress: result.parsedAddress,
        autoPopulateRecommended: result.autoPopulateRecommended
      })

      if (result.valid && result.autoPopulateRecommended && user?.role === 'professional') {
        setPendingVatData({
          vatNumber: formatted,
          companyName: result.companyName,
          companyAddress: result.companyAddress,
          parsedAddress: result.parsedAddress
        })
        setShowAutoPopulateDialog(true)
      }

      // Auto-prefill company info for business customers
      if (result.valid && user?.role === 'customer' && customerType === 'business') {
        let changed = false
        if (result.companyName && !customerBusinessName) {
          setCustomerBusinessName(result.companyName)
          changed = true
        }
        if (result.parsedAddress) {
          const pa = result.parsedAddress
          const wouldUpdate =
            (!customerCompanyAddress.address && pa.streetAddress) ||
            (!customerCompanyAddress.city && pa.city) ||
            (!customerCompanyAddress.country && pa.country) ||
            (!customerCompanyAddress.postalCode && pa.postalCode)
          if (wouldUpdate) {
            setCustomerCompanyAddress(prev => ({
              address: prev.address || pa.streetAddress || '',
              city: prev.city || pa.city || '',
              country: prev.country || pa.country || '',
              postalCode: prev.postalCode || pa.postalCode || ''
            }))
            changed = true
          }
        }
        if (changed) {
          toast.success(t('toasts.businessPrefilled'))
        }
      }
    } catch {
      setVatValidation({
        valid: false,
        error: t('vat.validateFailed')
      })
    } finally {
      setVatValidating(false)
    }
  }

  const saveVatNumber = async () => {
    if (!user) return

    setVatSaving(true)
    try {
      const result = await updateUserVAT(vatNumber)

      if (result.success) {
        if (result.viesUnavailable) {
          toast.warning(
            t('toasts.viesSavedWarning'),
            { duration: 8000 }
          )
        } else if (vatNumber && !result.isVatVerified) {
          toast.error(
            t('toasts.vatSavedNotVerified'),
            { duration: 8000 }
          )
        } else {
          toast.success(vatNumber ? t('toasts.vatUpdated') : t('toasts.vatRemoved'))
        }
        // Refresh user data
        await checkAuth()
        setVatValidation({})
      } else {
        toast.error(result.errorCode ? t('toasts.vatUpdateFailed') : result.error)
      }
    } catch {
      toast.error(t('toasts.vatUpdateFailed'))
    } finally {
      setVatSaving(false)
    }
  }

  const removeVatNumber = async () => {
    setVatNumber('')
    setVatValidation({})
    setVatSaving(true)
    try {
      const result = await updateUserVAT('')

      if (result.success) {
        toast.success(t('toasts.vatRemoved'))
        await checkAuth()
      } else {
        toast.error(result.errorCode ? t('toasts.vatRemoveFailed') : result.error)
      }
    } catch {
      toast.error(t('toasts.vatRemoveFailed'))
    } finally {
      setVatSaving(false)
    }
  }

  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (profileImageInputRef.current) profileImageInputRef.current.value = ''

    setProfileImageUploading(true)
    try {
      const formData = new FormData()
      formData.append('profileImage', file)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/profile-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })
      const result = await response.json()
      if (result.success) {
        toast.success(t('toasts.profileImageUpdated'))
        await checkAuth()
      } else {
        toast.error(result.msg || t('toasts.profileImageUploadFailed'))
      }
    } catch {
      toast.error(t('toasts.profileImageUploadFailed'))
    } finally {
      setProfileImageUploading(false)
    }
  }

  const handleDeleteProfileImage = async () => {
    setProfileImageUploading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/profile-image`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const result = await response.json()
      if (result.success) {
        toast.success(t('toasts.profileImageRemoved'))
        await checkAuth()
      } else {
        toast.error(result.msg || t('toasts.profileImageRemoveFailed'))
      }
    } catch {
      toast.error(t('toasts.profileImageRemoveFailed'))
    } finally {
      setProfileImageUploading(false)
    }
  }

  // Professional profile handlers
  const handleIdProofUpload = async () => {
    if (!idProofFile) return

    const formData = new FormData()
    formData.append('idProof', idProofFile)

    setUploading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/id-proof`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        toast.success(t('toasts.idProofUploaded'))
        setIdProofFile(null)
        await checkAuth() // Refresh user data
      } else {
        toast.error(result.msg || t('toasts.idProofUploadFailed'))
      }
    } catch {
      toast.error(t('toasts.idProofUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const saveBlockedRanges = async (
    customRanges?: { startDate: string, endDate: string, reason?: string }[]
  ) => {
    setProfileSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/professional-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockedDates: [],
          blockedRanges: customRanges || blockedRanges
        })
      })

      const result = await response.json()

      if (result.success) {
        await checkAuth() // Refresh user data
        return true
      } else {
        toast.error(result.msg || t('toasts.blockedRangesSaveFailed'))
        return false
      }
    } catch {
      toast.error(t('toasts.blockedRangesSaveFailed'))
      return false
    } finally {
      setProfileSaving(false)
    }
  }

  const openEditRange = (index: number) => {
    const range = blockedRanges[index]
    if (!range) return
    setEditingRange({
      index,
      startValue: toLocalInputValue(range.startDate),
      endValue: toLocalInputValue(range.endDate),
      reason: range.reason || ''
    })
  }

  const updateBlockedRange = async () => {
    if (!editingRange) return
    const { index, startValue, endValue, reason } = editingRange
    if (!startValue || !endValue) {
      toast.error(t('toasts.selectStartEnd'))
      return
    }
    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error(t('toasts.invalidTimes'))
      return
    }
    const now = Date.now()
    if (startDate.getTime() < now) {
      toast.error(t('toasts.cannotBlockPastTime'))
      return
    }
    if (endDate.getTime() < now) {
      toast.error(t('toasts.endInPast'))
      return
    }
    if (startDate >= endDate) {
      toast.error(t('toasts.startBeforeEnd'))
      return
    }
    const previousRanges = blockedRanges
    const updatedRanges = blockedRanges.map((range, rangeIndex) =>
      rangeIndex === index
        ? {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reason: reason || undefined
        }
        : range
    )
    setBlockedRanges(updatedRanges)
    const success = await saveBlockedRanges(updatedRanges)
    if (success) {
      toast.success(t('toasts.blockedUpdated'))
      setEditingRange(null)
    } else {
      setBlockedRanges(previousRanges)
    }
  }

  const deleteBlockedRange = async () => {
    if (!editingRange) return
    const previousRanges = blockedRanges
    const updatedRanges = blockedRanges.filter((_, index) => index !== editingRange.index)
    setBlockedRanges(updatedRanges)
    const success = await saveBlockedRanges(updatedRanges)
    if (success) {
      toast.success(t('toasts.blockedRemoved'))
      setEditingRange(null)
    } else {
      setBlockedRanges(previousRanges)
    }
  }

  const saveBusinessInfo = async () => {
    setProfileSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/professional-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          businessInfo,
          hourlyRate: parseFloat(hourlyRate) || 0,
          currency,
          serviceCategories,
          blockedDates: [],
          blockedRanges,
          companyAvailability,
          companyBlockedDates: [],
          companyBlockedRanges
        })
      })

      const result = await response.json()

      if (result.success) {
        toast.success(t('toasts.profileUpdated'))
        await checkAuth() // Refresh user data
      } else {
        toast.error(result.msg || t('toasts.profileUpdateFailed'))
      }
    } catch {
      toast.error(t('toasts.profileUpdateFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  const handleServiceCategoryToggle = (category: string) => {
    setServiceCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const addBlockedRangeEntry = async (startValue: string, endValue: string, reason?: string, isFullDayRange = false) => {
    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    const now = new Date()

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error(t('toasts.invalidTimes'))
      return false
    }

    // For full-day ranges from calendar, compare dates only (not timestamps)
    // This allows blocking "today" when the time is 00:00:00
    if (isFullDayRange) {
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
      const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (startDateOnly < todayDateOnly) {
        toast.error(t('toasts.cannotBlockPastDates'))
        return false
      }
    } else if (startDate < now) {
      toast.error(t('toasts.cannotBlockPastTime'))
      return false
    }

    if (startDate >= endDate) {
      toast.error(t('toasts.startBeforeEnd'))
      return false
    }

    const newRange = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      reason: reason || undefined
    }

    const updatedRanges = [...blockedRanges, newRange]
    setBlockedRanges(updatedRanges)

    const success = await saveBlockedRanges(updatedRanges)
    if (success) {
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
      if (durationHours >= 24) {
        const days = Math.ceil(durationHours / 24)
        toast.success(
          t('toasts.blockedDays', {
            days,
            start: startDate.toLocaleString(intl),
            end: endDate.toLocaleString(intl),
          })
        )
      } else {
        const roundedHours = Math.round(durationHours * 10) / 10
        toast.success(
          t('toasts.blockedHours', {
            hours: roundedHours,
            date: startDate.toLocaleDateString(intl),
          })
        )
      }
    }

    return success
  }

  const addBlockedRange = async () => {
    if (!newBlockedRange.startDate || !newBlockedRange.endDate) {
      toast.error(t('toasts.selectStartEnd'))
      return
    }
    const success = await addBlockedRangeEntry(newBlockedRange.startDate, newBlockedRange.endDate, newBlockedRange.reason)
    if (success) {
      setNewBlockedRange({ startDate: '', endDate: '', reason: '' })
    }
  }

  const removeBlockedRange = async (indexToRemove: number) => {
    const updatedRanges = blockedRanges.filter((_, index) => index !== indexToRemove)
    setBlockedRanges(updatedRanges)

    const success = await saveBlockedRanges(updatedRanges)
    if (success) {
      toast.success(t('toasts.blockedRemoved'))
    }
  }


  // Company blocked dates and ranges management
  const saveCompanyBlockedRanges = async (
    customRanges?: { startDate: string, endDate: string, reason?: string, isHoliday?: boolean }[]
  ) => {
    setProfileSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/professional-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          companyBlockedDates: [],
          companyBlockedRanges: customRanges || companyBlockedRanges
        })
      })

      const result = await response.json()

      if (result.success) {
        await checkAuth()
        return true
      } else {
        toast.error(result.msg || t('companyAvailability.saveFailed'))
        return false
      }
    } catch {
      toast.error(t('companyAvailability.saveFailed'))
      return false
    } finally {
      setProfileSaving(false)
    }
  }

  const addCompanyBlockedRange = async () => {
    if (!newCompanyBlockedRange.startDate || !newCompanyBlockedRange.endDate) return

    const startDate = new Date(newCompanyBlockedRange.startDate)
    const endDate = new Date(newCompanyBlockedRange.endDate)
    const now = new Date()

    if (startDate < now) {
      toast.error(t('toasts.cannotBlockPastTime'))
      return
    }

    if (startDate >= endDate) {
      toast.error(t('toasts.endAfterStart'))
      return
    }

    const newRange = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      reason: newCompanyBlockedRange.reason || undefined,
      isHoliday: newCompanyBlockedRange.isHoliday || false
    }

    const updatedRanges = [...companyBlockedRanges, newRange]
    setCompanyBlockedRanges(updatedRanges)
    setNewCompanyBlockedRange({ startDate: '', endDate: '', reason: '', isHoliday: false })

    const success = await saveCompanyBlockedRanges(updatedRanges)
    if (success) {
      toast.success(
        t('companyAvailability.savedToast', {
          start: startDate.toLocaleString(intl),
          end: endDate.toLocaleString(intl),
        })
      )
    }
  }

  const removeCompanyBlockedRange = async (indexToRemove: number) => {
    const removedRange = companyBlockedRanges[indexToRemove]
    const updatedRanges = companyBlockedRanges.filter((_, index) => index !== indexToRemove)
    setCompanyBlockedRanges(updatedRanges)

    const success = await saveCompanyBlockedRanges(updatedRanges)
    if (success) {
      toast.success(t('companyAvailability.removedToast'), {
        action: {
          label: t('companyAvailability.undo'),
          onClick: async () => {
            let restoredRanges: typeof companyBlockedRanges = []
            setCompanyBlockedRanges(prev => {
              const restored = [...prev]
              restored.splice(indexToRemove, 0, removedRange)
              restoredRanges = restored
              return restored
            })
            await saveCompanyBlockedRanges(restoredRanges)
          }
        }
      })
    }
  }

  const handleAutoPopulate = async (shouldPopulate: boolean) => {
    if (!pendingVatData || !shouldPopulate) {
      setShowAutoPopulateDialog(false)
      setPendingVatData(null)
      return
    }

    setVatSaving(true)
    try {
      const result = await validateAndPopulateVAT(pendingVatData.vatNumber, true)

      if (result.success && result.businessInfo) {
        // Update business info state with populated data
        setBusinessInfo(prev => ({
          ...prev,
          companyName: result.businessInfo?.companyName || prev.companyName,
          address: result.businessInfo?.parsedAddress?.streetAddress || prev.address,
          city: result.businessInfo?.parsedAddress?.city || prev.city,
          country: result.businessInfo?.parsedAddress?.country || prev.country,
          postalCode: result.businessInfo?.parsedAddress?.postalCode || prev.postalCode,
        }))

        toast.success(t('toasts.autoPopulated'))
        await checkAuth() // Refresh user data
      } else {
        toast.error(result.errorCode ? t('toasts.autoPopulateFailed') : result.error)
      }
    } catch {
      toast.error(t('toasts.autoPopulateFailed'))
    } finally {
      setVatSaving(false)
      setShowAutoPopulateDialog(false)
      setPendingVatData(null)
    }
  }


  const handleUpdatePhone = async () => {
    if (!newPhoneNumber || newPhoneNumber.trim() === '') {
      toast.error(t('toasts.phoneEmpty'))
      return
    }


    // Ensure phone has '+' prefix for international format
    const phoneToSend = newPhoneNumber.trim().startsWith('+') ? newPhoneNumber.trim() : '+' + newPhoneNumber.trim()

    setPhoneUpdating(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/phone`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ phone: phoneToSend })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        toast.success(result.msg || t('toasts.phoneUpdated'))
        setIsEditingPhone(false)
        await checkAuth() // Refresh user data
      } else {
        toast.error(result.msg || t('toasts.phoneUpdateFailed'))
      }
    } catch (error) {
      console.error('Phone update error:', error)
      toast.error(t('toasts.phoneUpdateFailed'))
    } finally {
      setPhoneUpdating(false)
    }
  }

  const handleSubmitForVerification = async () => {
    if (!user) return

    setVerificationSubmitting(true)
    try {
      const result = await submitForVerification()

      if (result.success) {
        toast.success(t('toasts.submitSuccess'), {
          duration: 5000,
        })
        await checkAuth() // Refresh user data to update professional status
      } else {
        if (result.missingRequirements && result.missingRequirements.length > 0) {
          toast.error(
            t('toasts.completeRequirements', { items: result.missingRequirements.join(', ') }),
            {
              duration: 6000,
            }
          )
        } else {
          toast.error(result.errorCode ? t('toasts.submitFailed') : result.error)
        }
      }
    } catch {
      toast.error(t('toasts.submitFailed'))
    } finally {
      setVerificationSubmitting(false)
    }
  }


  // Customer profile update handler
  const handleCustomerProfileUpdate = async () => {
    setCustomerProfileSaving(true)
    try {
      const token = getAuthToken()
      const body: Record<string, unknown> = {
        address: customerAddress.address,
        city: customerAddress.city,
        country: customerAddress.country,
        postalCode: customerAddress.postalCode,
        customerType
      }
      if (customerType === 'business') {
        body.businessName = customerBusinessName
        body.companyAddress = customerCompanyAddress
      } else {
        body.businessName = ''
        body.companyAddress = { address: '', city: '', country: '', postalCode: '' }
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/customer-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify(body)
      })

      const result = await response.json()

      if (result.success) {
        toast.success(t('toasts.customerProfileUpdated'))
        await checkAuth()
      } else {
        toast.error(result.msg || t('toasts.customerProfileUpdateFailed'))
      }
    } catch {
      toast.error(t('toasts.customerProfileUpdateFailed'))
    } finally {
      setCustomerProfileSaving(false)
    }
  }

  // ID info update handler (with warning dialog)
  const handleIdInfoUpdate = async () => {
    setIdInfoSaving(true)
    try {
      const token = getAuthToken()
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/id-info`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          idCountryOfIssue,
          idExpirationDate: idExpirationDate || undefined
        })
      })

      const result = await response.json()

      if (result.success) {
        toast.success(result.msg || t('toasts.idInfoUpdated'))
        setShowIdChangeWarning(false)
        await checkAuth()
      } else {
        toast.error(result.msg || t('toasts.idInfoUpdateFailed'))
      }
    } catch {
      toast.error(t('toasts.idInfoUpdateFailed'))
    } finally {
      setIdInfoSaving(false)
    }
  }

  const hasIdInfoChanges = () => {
    const currentCountry = normalizeCountryCode(user?.idCountryOfIssue || '')
    const currentExpiry = user?.idExpirationDate ? user.idExpirationDate.split('T')[0] : ''
    return idCountryOfIssue !== currentCountry || idExpirationDate !== currentExpiry
  }

  const calendarEvents = useMemo(() => {
    const personalEvents: CalendarEvent[] = blockedRanges.map((range, index) => ({
      id: `personal-${index}`,
      type: 'personal',
      title: t('personalAvailability.personalBlockTitle'),
      start: toEventDate(range.startDate, false),
      end: toEventDate(range.endDate, true),
      meta: { note: range.reason, rangeIndex: index }
    }))
    const companyEvents: CalendarEvent[] = companyBlockedRanges.map((range, index) => ({
      id: `company-${index}`,
      type: 'company',
      title: range.isHoliday ? t('companyAvailability.holidayTitle') : t('companyAvailability.closureTitle'),
      start: toEventDate(range.startDate, false),
      end: toEventDate(range.endDate, true),
      meta: { note: range.reason },
      readOnly: true
    }))
    return [...companyEvents, ...bookingEvents, ...personalEvents]
  }, [blockedRanges, companyBlockedRanges, bookingEvents, t])

  const scheduleWindow = useMemo(
    () => getScheduleWindow(companyAvailability),
    [companyAvailability]
  )
  const visibleDays = useMemo(
    () => getVisibleScheduleDays(companyAvailability),
    [companyAvailability]
  )
  const visibleDaysLabel = visibleDays
    .map((dayIndex) => weekdayLabel(dayIndex))
    .filter(Boolean)
    .join(', ')
  const companyCalendarEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = []
    companyBlockedRanges.forEach((range, index) => {
      const start = toEventDate(range.startDate, false)
      const end = toEventDate(range.endDate, true)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return
      }
      events.push({
        id: `company-closure-${index}`,
        type: 'company',
        title: range.isHoliday ? t('companyAvailability.holidayTitle') : t('companyAvailability.closureTitle'),
        start,
        end,
        meta: { note: range.reason, rangeIndex: index }
      })
    })
    return events
  }, [companyBlockedRanges, t])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (!tab) return

    const isProfessional = user?.role === 'professional'
    const professionalTabs = new Set([
      'profile', 'business', 'documents', 'payments', 'employees',
      'personal-availability', 'company-availability', 'security', 'notifications',
    ])
    const customerTabs = new Set(['profile', 'security', 'notifications'])

    if (isProfessional && professionalTabs.has(tab)) {
      setProfileTab(tab)
    } else if (!isProfessional && (customerTabs.has(tab) || (tab === 'availability' && (user?.role === 'employee' || user?.role === 'admin')))) {
      setProfileTab(tab)
    }
  }, [searchParams, user?.role])

  const handleProfileTabChange = useCallback((value: string) => {
    setProfileTab(value)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`/profile?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-6xl mx-auto pt-20">
          <div className="mb-8 space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {/* Left sidebar skeleton */}
            <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
              <div className="flex flex-col items-center space-y-3">
                <Skeleton className="h-24 w-24 rounded-full" />
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="space-y-3 pt-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </div>
            {/* Right content skeleton */}
            <div className="md:col-span-2 space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
                  <Skeleton className="h-6 w-40" />
                  <div className="grid md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(j => (
                      <div key={j} className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const hasVatChanges = vatNumber !== (user?.vatNumber || '')
  const canValidate =
    vatNumber.trim() &&
    (vatNumber !== (user?.vatNumber || '') || !user?.isVatVerified)

  const isProfessional = user?.role === 'professional'
  const stripePayoutsEnabled = Boolean(stripeAccountStatus?.payoutsEnabled ?? stripeAccountStatus?.payouts_enabled)
  const isStripeFullyReady = Boolean(
    stripeAccountStatus?.hasAccount &&
    stripeAccountStatus?.onboardingCompleted &&
    stripeAccountStatus?.chargesEnabled &&
    stripePayoutsEnabled
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('page.title')}</h1>
          <p className="text-gray-600">{t('page.subtitle')}</p>
          {isProfessional && (
            <div className="mt-4 space-y-3">
              <div className={`p-4 border rounded-lg ${user?.professionalStatus === 'approved' ? 'bg-green-50 border-green-200' :
                user?.professionalStatus === 'pending' ? 'bg-yellow-50 border-yellow-200' :
                  user?.professionalStatus === 'rejected' ? 'bg-red-50 border-red-200' :
                    'bg-gray-50 border-gray-200'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className={`h-4 w-4 ${user?.professionalStatus === 'approved' ? 'text-green-600' :
                      user?.professionalStatus === 'pending' ? 'text-yellow-600' :
                        user?.professionalStatus === 'rejected' ? 'text-red-600' :
                          'text-gray-600'
                      }`} />
                    <span className={`text-sm font-medium ${user?.professionalStatus === 'approved' ? 'text-green-800' :
                      user?.professionalStatus === 'pending' ? 'text-yellow-800' :
                        user?.professionalStatus === 'rejected' ? 'text-red-800' :
                          'text-gray-800'
                      }`}>
                      {t('professionalStatus.label', { status: professionalStatusLabel(user?.professionalStatus) })}
                    </span>
                  </div>

                  {(user?.professionalStatus === 'rejected' || !user?.professionalStatus) && (
                    <Button
                      onClick={handleSubmitForVerification}
                      disabled={verificationSubmitting}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {verificationSubmitting ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          {t('professionalStatus.submitting')}
                        </>
                      ) : (
                        t('professionalStatus.sendForVerification')
                      )}
                    </Button>
                  )}
                </div>

                {user?.professionalStatus === 'rejected' && user?.rejectionReason && (
                  <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700">
                    <strong>{t('professionalStatus.rejectionReason')}</strong> {user.rejectionReason}
                  </div>
                )}

                {user?.professionalStatus === 'pending' && (
                  <div className="mt-2 text-xs text-yellow-700">
                    {t('professionalStatus.pendingNotice')}
                  </div>
                )}

                {user?.professionalStatus === 'approved' && (
                  <div className="mt-2 text-xs text-green-700">
                    {t('professionalStatus.approvedNotice')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {isProfessional ? (
          <Tabs value={profileTab} onValueChange={handleProfileTabChange} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto scrollbar-thin sm:grid sm:grid-cols-9">
              <TabsTrigger value="profile">{t('tabs.profile')}</TabsTrigger>
              <TabsTrigger value="business">{t('tabs.business')}</TabsTrigger>
              <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
              <TabsTrigger value="payments">{t('tabs.payments')}</TabsTrigger>
              <TabsTrigger value="employees">{t('tabs.employees')}</TabsTrigger>
              <TabsTrigger value="personal-availability">{t('tabs.personalAvailability')}</TabsTrigger>
              <TabsTrigger value="company-availability">{t('tabs.companyAvailability')}</TabsTrigger>
              <TabsTrigger value="security">{t('tabs.security')}</TabsTrigger>
              <TabsTrigger value="notifications">{t('tabs.notifications')}</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* User Profile Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {t('profileInfo.title')}
                    </CardTitle>
                    <CardDescription>{t('profileInfo.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {renderAvatarEditor()}
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{user?.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      {isEditingPhone ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            value={newPhoneNumber}
                            onChange={(e) => setNewPhoneNumber(e.target.value)}
                            placeholder="+32123456789"
                            className="h-8 text-sm flex-1"
                          />
                          <Button size="sm" onClick={handleUpdatePhone} disabled={phoneUpdating} className="h-8">
                            {phoneUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : t('common.save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setIsEditingPhone(false); setNewPhoneNumber(user?.phone || '') }} className="h-8">
                            {t('common.cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm">{user?.phone}</span>
                          <Button size="sm" variant="ghost" onClick={() => setIsEditingPhone(true)} className="h-6 w-6 p-0">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {!user?.isPhoneVerified && (
                            <span className="text-xs text-orange-600">{t('profileInfo.notVerified')}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{roleLabel(user?.role)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Verification Status Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      {t('verification.title')}
                    </CardTitle>
                    <CardDescription>{t('verification.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t('verification.email')}</span>
                      <span className={`text-sm font-medium ${user?.isEmailVerified ? 'text-green-600' : 'text-red-600'}`}>
                        {user?.isEmailVerified ? t('verification.verified') : t('verification.notVerified')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t('verification.phone')}</span>
                      <span className={`text-sm font-medium ${user?.isPhoneVerified ? 'text-green-600' : 'text-red-600'}`}>
                        {user?.isPhoneVerified ? t('verification.verified') : t('verification.notVerified')}
                      </span>
                    </div>
                    {(user?.role === 'professional' || user?.role === 'customer') && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{t('verification.vat')}</span>
                        <span className={`text-sm font-medium ${user?.isVatVerified ? 'text-green-600' : 'text-red-600'}`}>
                          {user?.isVatVerified ? t('verification.verified') : t('verification.notVerified')}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* VAT Number Card - For professionals and customers */}
                {(user?.role === 'professional' || user?.role === 'customer') && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building className="h-5 w-5" />
                        {t('vat.title')}
                      </CardTitle>
                      <CardDescription>
                        {t('vat.description')}
                        {user?.role === 'customer' && ` ${t('vat.customerNote')}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="vatNumber">{t('vat.number')}</Label>
                        <div className="flex gap-2">
                          <Input
                            id="vatNumber"
                            placeholder={t('vat.placeholder')}
                            value={vatNumber}
                            onChange={(e) => handleVatNumberChange(e.target.value.toUpperCase())}
                            className="flex-1"
                          />
                          <Button
                            onClick={validateVatNumber}
                            disabled={!canValidate || vatValidating}
                            variant="outline"
                            className="shrink-0"
                          >
                            {vatValidating ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                {t('common.validating')}
                              </>
                            ) : (
                              t('common.validate')
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500">
                          {t('vat.formatHint')}
                        </p>
                      </div>

                      {/* Validation Results */}
                      {vatValidation.valid !== undefined && (
                        <div className={`p-3 rounded-lg border ${vatValidation.valid
                          ? 'bg-green-50 border-green-200'
                          : vatValidation.transient
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-red-50 border-red-200'
                          }`}>
                          <div className="flex items-start gap-2">
                            {vatValidation.valid ? (
                              <Check className="h-4 w-4 text-green-600 mt-0.5" />
                            ) : vatValidation.transient ? (
                              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 text-red-600 mt-0.5" />
                            )}
                            <div className="flex-1 text-sm">
                              {vatValidation.valid ? (
                                <div>
                                  <p className="font-medium text-green-800">{t('vat.valid')}</p>
                                  {isEUVatNumber(vatNumber) && (
                                    <p className="text-green-700">
                                      {t('vat.country', { country: vatCountryName(vatNumber) })}
                                    </p>
                                  )}
                                  {vatValidation.companyName && (
                                    <p className="text-green-700 mt-1">
                                      <span className="font-medium">{t('vat.company')}</span> {vatValidation.companyName}
                                    </p>
                                  )}
                                  {vatValidation.companyAddress && (
                                    <p className="text-green-700">
                                      <span className="font-medium">{t('vat.address')}</span> {vatValidation.companyAddress}
                                    </p>
                                  )}
                                </div>
                              ) : vatValidation.transient ? (
                                <div>
                                  <p className="font-medium text-amber-800">{t('vat.viesUnavailable')}</p>
                                  {vatValidation.error && (
                                    <p className="text-amber-700">{vatValidation.error}</p>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <p className="font-medium text-red-800">{t('vat.validationFailed')}</p>
                                  {vatValidation.error && (
                                    <p className="text-red-700">{vatValidation.error}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Current VAT Status */}
                      {user?.vatNumber && (
                        <div className={`p-3 rounded-lg border ${user.isVatVerified
                          ? 'bg-green-50 border-green-200'
                          : 'bg-amber-50 border-amber-200'
                          }`}>
                          <div className="flex items-start gap-2">
                            {user.isVatVerified ? (
                              <Check className="h-4 w-4 text-green-600 mt-0.5" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                            )}
                            <div className="flex-1 text-sm">
                              <p className={`font-medium ${user.isVatVerified ? 'text-green-800' : 'text-amber-800'}`}>
                                {user.isVatVerified ? t('vat.currentVerified') : t('vat.currentNotVerified')}
                              </p>
                              <p className={user.isVatVerified ? 'text-green-700' : 'text-amber-700'}>
                                {user.vatNumber} ({vatCountryName(user.vatNumber)})
                              </p>
                              {!user.isVatVerified && (
                                <p className="text-amber-700 mt-1">
                                  {t('vat.reverseChargeHint')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <Button
                          onClick={saveVatNumber}
                          disabled={!hasVatChanges || vatSaving}
                          className="flex-1"
                        >
                          {vatSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              {t('common.saving')}
                            </>
                          ) : (
                            vatNumber ? t('vat.save') : t('vat.remove')
                          )}
                        </Button>
                        {user?.vatNumber && (
                          <Button
                            onClick={removeVatNumber}
                            disabled={vatSaving}
                            variant="outline"
                          >
                            {t('common.remove')}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Account Stats Card */}
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      {t('stats.title')}
                    </CardTitle>
                    <CardDescription>{t('stats.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t('stats.memberSince')}</span>
                      <span className="text-sm font-medium">
                        {new Date(user?.createdAt || '').toLocaleDateString(intl)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t('stats.lastUpdated')}</span>
                      <span className="text-sm font-medium">
                        {new Date(user?.updatedAt || '').toLocaleDateString(intl)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Business Info Tab */}
            < TabsContent value="business" className="space-y-6" >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    {t('business.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('business.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">{t('business.companyName')}</Label>
                      <Input
                        id="companyName"
                        value={businessInfo.companyName}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder={t('business.companyNamePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">{t('business.website')}</Label>
                      <Input
                        id="website"
                        value={businessInfo.website}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, website: e.target.value }))}
                        placeholder="https://yourwebsite.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('business.usernameLabel')}</Label>
                    <p className="text-xs text-gray-500">{t('business.usernameHint')}</p>
                    {!usernameEdit ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-900">{username || t('business.usernameNotSet')}</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={username}
                            onChange={(e) => {
                              const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                              setUsername(val)
                              if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current)
                              if (usernameAbortRef.current) usernameAbortRef.current.abort()
                              if (!val || val.length < 3) { setUsernameCheck({}); return }
                              setUsernameCheck({ checking: true })
                              usernameTimerRef.current = setTimeout(async () => {
                                const controller = new AbortController()
                                usernameAbortRef.current = controller
                                try {
                                  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/check-username/${encodeURIComponent(val)}`, { credentials: 'include', signal: controller.signal })
                                  const data = await res.json()
                                  setUsernameCheck({ available: data.available, reason: data.reason })
                                } catch (err: unknown) {
                                  if (err instanceof Error && err.name === 'AbortError') return
                                  setUsernameCheck({ reason: t('toasts.usernameCheckFailed') })
                                }
                              }, 500)
                            }}
                            placeholder={t('business.usernamePlaceholder')}
                            maxLength={30}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const qs = buildUsernameSuggestionParams(businessInfo)
                                const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/generate-username${qs}`, { credentials: 'include' })
                                const data = await res.json()
                                if (data.suggestions?.length) {
                                  setUsernameSuggestions(data.suggestions)
                                  setUsername(data.suggestions[0])
                                  setUsernameCheck({ available: true })
                                }
                              } catch { toast.error(t('toasts.suggestionsFailed')) }
                            }}
                          >
                            {t('business.suggest')}
                          </Button>
                        </div>
                        {username && username.length >= 3 && (
                          <div className={`flex items-center gap-2 text-xs p-2 rounded-lg ${
                            usernameCheck.checking ? 'bg-gray-50 text-gray-600' :
                            usernameCheck.available ? 'bg-green-50 text-green-700' :
                            usernameCheck.available === false ? 'bg-red-50 text-red-700' : ''
                          }`}>
                            {usernameCheck.checking ? t('business.checking') :
                             usernameCheck.available ? t('business.usernameAvailable') :
                             usernameCheck.available === false ? usernameCheck.reason : null}
                          </div>
                        )}
                        <p className="text-xs text-gray-400">{t('business.usernameRules')}</p>
                        {usernameSuggestions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {usernameSuggestions.map((s) => (
                              <button key={s} type="button" onClick={() => { setUsername(s); setUsernameCheck({ available: true }) }}
                                className={`text-xs px-3 py-1 rounded-full border ${username === s ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={usernameSaving || !username || username.length < 3 || usernameCheck.available !== true}
                            onClick={async () => {
                              setUsernameSaving(true)
                              try {
                                const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/username`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ username }),
                                })
                                const data = await res.json()
                                if (data.success) {
                                  toast.success(t('toasts.usernameUpdated'))
                                  setUsernameEdit(false)
                                  await checkAuth()
                                } else {
                                  toast.error(data.msg || t('toasts.usernameUpdateFailed'))
                                }
                              } catch { toast.error(t('toasts.usernameUpdateFailed')) }
                              finally { setUsernameSaving(false) }
                            }}
                          >
                            {usernameSaving ? t('common.saving') : t('business.saveUsername')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setUsernameEdit(false)
                            setUsername(user?.username || '')
                            setUsernameCheck({})
                            setUsernameSuggestions([])
                          }}>{t('common.cancel')}</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{t('business.descriptionLabel')}</Label>
                    <Textarea
                      id="description"
                      value={businessInfo.description}
                      onChange={(e) => setBusinessInfo(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={t('business.descriptionPlaceholder')}
                      rows={3}
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t('common.city')}</Label>
                      <Input
                        id="city"
                        value={businessInfo.city}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, city: e.target.value }))}
                        placeholder={t('common.city')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">{t('common.country')}</Label>
                      <Input
                        id="country"
                        value={businessInfo.country}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, country: e.target.value }))}
                        placeholder={t('common.country')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">{t('common.postalCode')}</Label>
                      <Input
                        id="postalCode"
                        value={businessInfo.postalCode}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, postalCode: e.target.value }))}
                        placeholder={t('common.postalCode')}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">{t('customer.address')}</Label>
                    <Input
                      id="address"
                      value={businessInfo.address}
                      onChange={(e) => setBusinessInfo(prev => ({ ...prev, address: e.target.value }))}
                      placeholder={t('customer.companyAddressPlaceholder')}
                    />
                  </div>

                  {/* Hourly Rate */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hourlyRate">{t('business.hourlyRate')}</Label>
                      <Input
                        id="hourlyRate"
                        type="number"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        placeholder="50"
                        min="0"
                        max="10000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">{t('business.currency')}</Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                          <SelectItem value="CAD">CAD (C$)</SelectItem>
                          <SelectItem value="AUD">AUD (A$)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Service Categories */}
                  <div className="space-y-2">
                    <Label>{t('business.serviceCategories')}</Label>
                    {serviceCatalogLoading && (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-full" />)}
                      </div>
                    )}
                    {serviceCatalogError && (
                      <div className="text-sm text-red-600">{t('business.serviceCatalogError')}</div>
                    )}
                    {!serviceCatalogLoading && (
                      serviceCatalog.length > 0 ? (
                        <div className="space-y-4">
                          {serviceCatalog.map((category) => (
                            <div key={category.name} className="space-y-2">
                              <div className="text-sm font-semibold text-slate-700">{category.name}</div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {category.services.map((service) => (
                                  <Button
                                    key={`${category.name}-${service.name}`}
                                    type="button"
                                    variant={serviceCategories.includes(service.name) ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleServiceCategoryToggle(service.name)}
                                  >
                                    {service.name}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                          {t('business.noServices')}
                        </p>
                      )
                    )}
                  </div>

                  <Button
                    onClick={saveBusinessInfo}
                    disabled={profileSaving}
                    className="w-full"
                  >
                    {profileSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t('common.saving')}
                      </>
                    ) : (
                      t('business.saveInfo')
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent >

            {/* Documents Tab */}
            < TabsContent value="documents" className="space-y-6" >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {t('documents.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('documents.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current ID Status */}
                  {user?.idProofUrl && (
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                      <div className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-600 mt-0.5" />
                        <div className="flex-1 text-sm">
                          <p className="font-medium text-green-800">{t('documents.idUploaded')}</p>
                          <p className="text-green-700">
                            {t('documents.verificationStatus', {
                              status: user.isIdVerified ? t('documents.verified') : t('documents.pendingReview'),
                            })}
                          </p>
                          <p className="text-green-700 text-xs">
                            {t('documents.uploadedAt', {
                              date: new Date(user.idProofUploadedAt || '').toLocaleDateString(intl),
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* File Upload */}
                  <div className="space-y-2">
                    <Label htmlFor="idProof">{t('documents.uploadNew')}</Label>
                    <Input
                      id="idProof"
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={(e) => setIdProofFile(e.target.files?.[0] || null)}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-gray-500">
                      {t('documents.acceptedFormats')}
                    </p>
                  </div>

                  {idProofFile && (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">
                          {t('documents.selected', { name: idProofFile.name })}
                        </span>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={() => {
                      if (user?.professionalStatus === 'approved') {
                        setShowIdProofWarning(true)
                      } else {
                        handleIdProofUpload()
                      }
                    }}
                    disabled={!idProofFile || uploading}
                    className="w-full"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t('documents.uploading')}
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        {t('documents.upload')}
                      </>
                    )}
                  </Button>

                  {/* ID Metadata Fields */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-medium mb-3">{t('documents.idDetails')}</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="idCountryOfIssue">{t('documents.countryOfIssue')}</Label>
                        <Select value={idCountryOfIssue} onValueChange={setIdCountryOfIssue}>
                          <SelectTrigger id="idCountryOfIssue">
                            <SelectValue placeholder={t('documents.selectCountry')} />
                          </SelectTrigger>
                          <SelectContent>
                            {EU_COUNTRIES.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                {country.flag} {regionNames?.of(country.code) ?? country.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="idExpirationDate">{t('documents.expirationDate')}</Label>
                        <Input
                          id="idExpirationDate"
                          type="date"
                          value={idExpirationDate}
                          onChange={(e) => setIdExpirationDate(e.target.value)}
                        />
                      </div>
                    </div>

                    {user?.professionalStatus === 'approved' && hasIdInfoChanges() && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <p className="text-xs text-amber-700">
                            {t('documents.changeWarning')}
                          </p>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        if (user?.professionalStatus === 'approved' && hasIdInfoChanges()) {
                          setShowIdChangeWarning(true)
                        } else {
                          handleIdInfoUpdate()
                        }
                      }}
                      disabled={!hasIdInfoChanges() || idInfoSaving}
                      variant="outline"
                      className="w-full mt-4"
                    >
                      {idInfoSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {t('common.saving')}
                        </>
                      ) : (
                        t('documents.saveIdDetails')
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent >

            {/* Payments Tab - Stripe Setup */}
            <TabsContent value="payments" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    {t('payments.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('payments.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stripeStatusLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('payments.checking')}
                    </div>
                  ) : stripeAccountStatus?.hasAccount ? (
                    <div className="space-y-4">
                      <div className={`rounded-lg border p-3 ${isStripeFullyReady ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                        <p className={`text-sm font-medium ${isStripeFullyReady ? 'text-green-800' : 'text-amber-800'}`}>
                          {isStripeFullyReady ? t('payments.ready') : t('payments.incomplete')}
                        </p>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-3 text-sm">
                        <div className="rounded-md border p-3">
                          <p className="text-muted-foreground mb-1">{t('payments.onboarding')}</p>
                          <p className="font-medium flex items-center gap-1">
                            {stripeAccountStatus.onboardingCompleted ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
                            {stripeAccountStatus.onboardingCompleted ? t('payments.complete') : t('payments.incompleteStatus')}
                          </p>
                        </div>
                        <div className="rounded-md border p-3">
                          <p className="text-muted-foreground mb-1">{t('payments.charges')}</p>
                          <p className="font-medium flex items-center gap-1">
                            {stripeAccountStatus.chargesEnabled ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
                            {stripeAccountStatus.chargesEnabled ? t('payments.enabled') : t('payments.disabled')}
                          </p>
                        </div>
                        <div className="rounded-md border p-3">
                          <p className="text-muted-foreground mb-1">{t('payments.payouts')}</p>
                          <p className="font-medium flex items-center gap-1">
                            {stripePayoutsEnabled ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
                            {stripePayoutsEnabled ? t('payments.enabled') : t('payments.disabled')}
                          </p>
                        </div>
                      </div>

                      {stripeStatusError !== null && (
                        <p className="text-sm text-red-600">{stripeStatusError || t('payments.loadFailed')}</p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => router.push('/professional/stripe/setup')}
                          className="w-full sm:w-auto"
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          {isStripeFullyReady ? t('payments.manage') : t('payments.completeSetup')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void loadStripeAccountStatus()}
                          disabled={stripeStatusLoading}
                        >
                          {t('payments.refresh')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {t('payments.intro')}
                      </p>
                      {stripeStatusError !== null && (
                        <p className="text-sm text-red-600">{stripeStatusError || t('payments.loadFailed')}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => router.push('/professional/stripe/setup')}
                          className="w-full sm:w-auto"
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          {t('payments.goToSetup')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void loadStripeAccountStatus()}
                          disabled={stripeStatusLoading}
                        >
                          {t('payments.refresh')}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Personal Availability Tab */}
            < TabsContent value="personal-availability" className="space-y-6" >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarX className="h-5 w-5" />
                    {t('personalAvailability.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('personalAvailability.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-base font-medium">{t('personalAvailability.addBlocked')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('personalAvailability.addBlockedHint')}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">{t('personalAvailability.startDate')}</Label>
                        <Input
                          id="startDate"
                          type="datetime-local"
                          value={newBlockedRange.startDate}
                          onChange={(e) => setNewBlockedRange(prev => ({ ...prev, startDate: e.target.value }))}
                          min={toLocalInputValue(new Date().toISOString())}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endDate">{t('personalAvailability.endDate')}</Label>
                        <Input
                          id="endDate"
                          type="datetime-local"
                          value={newBlockedRange.endDate}
                          onChange={(e) => setNewBlockedRange(prev => ({ ...prev, endDate: e.target.value }))}
                          min={newBlockedRange.startDate || toLocalInputValue(new Date().toISOString())}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reason">{t('personalAvailability.reason')}</Label>
                        <Input
                          id="reason"
                          placeholder={t('personalAvailability.reasonPlaceholder')}
                          value={newBlockedRange.reason}
                          onChange={(e) => setNewBlockedRange(prev => ({ ...prev, reason: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={addBlockedRange}
                        disabled={
                          profileSaving ||
                          !newBlockedRange.startDate ||
                          !newBlockedRange.endDate ||
                          newBlockedRange.endDate <= newBlockedRange.startDate
                        }
                        variant="outline"
                      >
                        <CalendarX className="h-4 w-4 mr-2" />
                        {t('personalAvailability.blockPeriod')}
                      </Button>
                    </div>
                  </div>

                  <WeeklyAvailabilityCalendar
                    title={t('personalAvailability.calendarTitle')}
                    description={t('personalAvailability.calendarDescription')}
                    events={calendarEvents}
                    dayStart={scheduleWindow.dayStart}
                    dayEnd={scheduleWindow.dayEnd}
                    visibleDays={visibleDays}
                    onEventClick={(event) => {
                      if (event.type === 'personal' && typeof event.meta?.rangeIndex === 'number') {
                        openEditRange(event.meta.rangeIndex)
                      }
                    }}
                  />
                </CardContent>
              </Card>

              {/* Personal Weekly Schedule */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {t('personalAvailability.workingHoursTitle')}
                  </CardTitle>
                  <CardDescription>
                    {t('personalAvailability.workingHoursDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    {t('personalAvailability.calendarWindow', {
                      days: visibleDaysLabel || t('common.weekdaysMonToFri'),
                      start: scheduleWindow.dayStart,
                      end: scheduleWindow.dayEnd,
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent >

            {/* Company Availability Tab */}
            < TabsContent value="company-availability" className="space-y-6" >
              <div className="mb-6">
                <h3 className="text-lg font-semibold">{t('companyAvailability.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('companyAvailability.description')}</p>
              </div>

              {/* Company Closures Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarX className="h-5 w-5" />
                    {t('companyAvailability.closuresTitle')}
                  </CardTitle>
                  <CardDescription>
                    {t('companyAvailability.closuresDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-12 gap-4">
                      <div className="md:col-span-3">
                        <Label htmlFor="company-range-start">{t('companyAvailability.start')}</Label>
                        <Input
                          id="company-range-start"
                          type="datetime-local"
                          value={newCompanyBlockedRange.startDate}
                          onChange={(e) => setNewCompanyBlockedRange(prev => ({ ...prev, startDate: e.target.value }))}
                          min={toLocalInputValue(new Date().toISOString())}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <Label htmlFor="company-range-end">{t('companyAvailability.end')}</Label>
                        <Input
                          id="company-range-end"
                          type="datetime-local"
                          value={newCompanyBlockedRange.endDate}
                          onChange={(e) => setNewCompanyBlockedRange(prev => ({ ...prev, endDate: e.target.value }))}
                          min={newCompanyBlockedRange.startDate || toLocalInputValue(new Date().toISOString())}
                        />
                      </div>
                      <div className="md:col-span-4">
                        <Label htmlFor="company-range-reason">{t('companyAvailability.reason')}</Label>
                        <Input
                          id="company-range-reason"
                          placeholder={t('companyAvailability.reasonPlaceholder')}
                          value={newCompanyBlockedRange.reason}
                          onChange={(e) => setNewCompanyBlockedRange(prev => ({ ...prev, reason: e.target.value }))}
                        />
                      </div>
                      <div className="md:col-span-2 flex items-end">
                        <Button
                          onClick={addCompanyBlockedRange}
                          disabled={
                            !newCompanyBlockedRange.startDate ||
                            !newCompanyBlockedRange.endDate ||
                            newCompanyBlockedRange.endDate <= newCompanyBlockedRange.startDate
                          }
                          className="w-full"
                        >
                          {t('companyAvailability.blockPeriod')}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="company-range-is-holiday"
                        checked={newCompanyBlockedRange.isHoliday}
                        onCheckedChange={(value) => setNewCompanyBlockedRange(prev => ({ ...prev, isHoliday: Boolean(value) }))}
                      />
                      <Label htmlFor="company-range-is-holiday" className="text-sm font-normal cursor-pointer">
                        {t('companyAvailability.markHoliday')}
                      </Label>
                    </div>
                  </div>

                  <WeeklyAvailabilityCalendar
                    title={t('companyAvailability.calendarTitle')}
                    description={t('companyAvailability.calendarDescription')}
                    events={companyCalendarEvents}
                    dayStart={scheduleWindow.dayStart}
                    dayEnd={scheduleWindow.dayEnd}
                    visibleDays={visibleDays}
                    onEventClick={(event) => {
                      if (event.type === 'company' && typeof event.meta?.rangeIndex === 'number') {
                        removeCompanyBlockedRange(event.meta.rangeIndex)
                      }
                    }}
                  />
                </CardContent>
              </Card>

              {/* Company Weekly Schedule */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    {t('companyAvailability.workingHoursTitle')}
                  </CardTitle>
                  <CardDescription>
                    {t('companyAvailability.workingHoursDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(companyAvailability).map(([day, schedule]) => (
                    <div key={day} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="w-20 text-sm font-medium">{dayLabels[day] ?? day}</div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`company-day-${day}`}
                          checked={schedule.available}
                          onCheckedChange={(value) => {
                            setCompanyAvailability(prev => ({
                              ...prev,
                              [day]: { ...prev[day as keyof typeof prev], available: Boolean(value) }
                            }))
                          }}
                        />
                        <Label htmlFor={`company-day-${day}`} className="text-sm font-normal cursor-pointer">{t('common.available')}</Label>
                      </div>
                      {schedule.available && (
                        <>
                          <Input
                            type="time"
                            value={schedule.startTime}
                            onChange={(e) => {
                              setCompanyAvailability(prev => ({
                                ...prev,
                                [day]: { ...prev[day as keyof typeof prev], startTime: e.target.value }
                              }))
                            }}
                            className="w-32"
                          />
                          <span className="text-sm">{t('common.to')}</span>
                          <Input
                            type="time"
                            value={schedule.endTime}
                            onChange={(e) => {
                              setCompanyAvailability(prev => ({
                                ...prev,
                                [day]: { ...prev[day as keyof typeof prev], endTime: e.target.value }
                              }))
                            }}
                            className="w-32"
                          />
                        </>
                      )}
                    </div>
                  ))}

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    {t('personalAvailability.calendarWindow', {
                      days: visibleDaysLabel || t('common.weekdaysMonToFri'),
                      start: scheduleWindow.dayStart,
                      end: scheduleWindow.dayEnd,
                    })}
                  </div>

                  <Button
                    onClick={saveBusinessInfo}
                    disabled={profileSaving}
                    className="w-full mt-6"
                  >
                    {profileSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t('common.saving')}
                      </>
                    ) : (
                      t('companyAvailability.saveHours')
                    )}
                  </Button>
                </CardContent>
              </Card>


            </TabsContent >

            {/* Employees Tab */}
            < TabsContent value="employees" className="space-y-6" >
              <EmployeeManagement />
            </TabsContent >

            {/* Security Tab */}
            < TabsContent value="security" className="space-y-6" >
              <PasswordChange />
              <PrivacyAndData />
            </TabsContent >

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardContent className="pt-6">
                  <NotificationPreferences />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs >
        ) : (
          // Non-professional users (customers, employees, etc.)
          <Tabs value={profileTab} onValueChange={handleProfileTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile">{t('tabs.profile')}</TabsTrigger>
              <TabsTrigger value="security">{t('tabs.security')}</TabsTrigger>
              <TabsTrigger value="notifications">{t('tabs.notifications')}</TabsTrigger>
              {(user?.role === 'employee' || user?.role === 'admin') && (
                <TabsTrigger value="availability">{t('tabs.availability')}</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* User Profile Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {t('profileInfo.title')}
                    </CardTitle>
                    <CardDescription>{t('profileInfo.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {renderAvatarEditor()}
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{user?.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      {isEditingPhone ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            value={newPhoneNumber}
                            onChange={(e) => setNewPhoneNumber(e.target.value)}
                            placeholder="+32123456789"
                            className="h-8 text-sm flex-1"
                          />
                          <Button size="sm" onClick={handleUpdatePhone} disabled={phoneUpdating} className="h-8">
                            {phoneUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : t('common.save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setIsEditingPhone(false); setNewPhoneNumber(user?.phone || '') }} className="h-8">
                            {t('common.cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm">{user?.phone?.startsWith('+1000000') ? t('common.notProvided') : user?.phone}</span>
                          <Button size="sm" variant="ghost" onClick={() => setIsEditingPhone(true)} className="h-6 w-6 p-0">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {!user?.isPhoneVerified && (
                            <span className="text-xs text-orange-600">{t('profileInfo.notVerified')}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{roleLabel(user?.role)}</span>
                    </div>
                    {user?.role === 'admin' && user.adminRole && (
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{ADMIN_ROLE_LABELS[user.adminRole as AdminRole]}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Verification Status */}
                < Card >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      {t('verification.title')}
                    </CardTitle>
                    <CardDescription>{t('verification.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t('verification.email')}</span>
                      <span className={`text-sm font-medium ${user?.isEmailVerified ? 'text-green-600' : 'text-red-600'}`}>
                        {user?.isEmailVerified ? t('verification.verified') : t('verification.notVerified')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t('verification.phone')}</span>
                      <span className={`text-sm font-medium ${user?.isPhoneVerified ? 'text-green-600' : 'text-red-600'}`}>
                        {user?.isPhoneVerified ? t('verification.verified') : t('verification.notVerified')}
                      </span>
                    </div>
                  </CardContent>
                </Card >
              </div >

              {/* Customer Address Section */}
              {
                user?.role === 'customer' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        {t('customer.addressTitle')}
                      </CardTitle>
                      <CardDescription>
                        {t('customer.addressDescription')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Customer Type Toggle */}
                      <div className="flex flex-col space-y-2 mb-4">
                        <Label>{t('customer.accountType')}</Label>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="type-individual"
                              name="customerType"
                              value="individual"
                              checked={customerType === 'individual'}
                              onChange={() => setCustomerType('individual')}
                              className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <Label htmlFor="type-individual" className="font-normal cursor-pointer">{t('customer.individual')}</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="type-business"
                              name="customerType"
                              value="business"
                              checked={customerType === 'business'}
                              onChange={() => setCustomerType('business')}
                              className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <Label htmlFor="type-business" className="font-normal cursor-pointer">{t('customer.business')}</Label>
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="customer-address">{t('customer.address')}</Label>
                          <Input
                            id="customer-address"
                            value={customerAddress.address}
                            onChange={(e) => setCustomerAddress(prev => ({ ...prev, address: e.target.value }))}
                            placeholder={t('customer.addressPlaceholder')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customer-city">{t('common.city')}</Label>
                          <Input
                            id="customer-city"
                            value={customerAddress.city}
                            onChange={(e) => setCustomerAddress(prev => ({ ...prev, city: e.target.value }))}
                            placeholder={t('common.city')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customer-country">{t('common.country')}</Label>
                          <Input
                            id="customer-country"
                            value={customerAddress.country}
                            onChange={(e) => setCustomerAddress(prev => ({ ...prev, country: e.target.value }))}
                            placeholder={t('common.country')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customer-postalCode">{t('common.postalCode')}</Label>
                          <Input
                            id="customer-postalCode"
                            value={customerAddress.postalCode}
                            onChange={(e) => setCustomerAddress(prev => ({ ...prev, postalCode: e.target.value }))}
                            placeholder={t('common.postalCode')}
                          />
                        </div>
                      </div>



                      <Button
                        onClick={handleCustomerProfileUpdate}
                        disabled={customerProfileSaving}
                        className="w-full"
                      >
                        {customerProfileSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            {t('common.saving')}
                          </>
                        ) : (
                          t('customer.saveProfile')
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )
              }

              {/* VAT for business customers */}
              {
                user?.role === 'customer' && customerType === 'business' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building className="h-5 w-5" />
                        {t('customer.vatTitle')}
                      </CardTitle>
                      <CardDescription>
                        {t('customer.vatDescription')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* VAT Number Section */}
                      <div className="space-y-2">
                        <Label htmlFor="customer-vatNumber">{t('customer.vatNumber')}</Label>
                        <div className="flex gap-2">
                          <Input
                            id="customer-vatNumber"
                            placeholder={t('vat.placeholder')}
                            value={vatNumber}
                            onChange={(e) => handleVatNumberChange(e.target.value.toUpperCase())}
                            className="flex-1"
                          />
                          <Button
                            onClick={validateVatNumber}
                            disabled={!canValidate || vatValidating}
                            variant="outline"
                            className="shrink-0"
                          >
                            {vatValidating ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                {t('common.validating')}
                              </>
                            ) : (
                              t('common.validate')
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Validation Results */}
                      {vatValidation.valid !== undefined && (
                        <div className={`p-3 rounded-lg border ${vatValidation.valid
                          ? 'bg-green-50 border-green-200'
                          : vatValidation.transient
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-red-50 border-red-200'
                          }`}>
                          <div className="flex items-start gap-2">
                            {vatValidation.valid ? (
                              <Check className="h-4 w-4 text-green-600 mt-0.5" />
                            ) : vatValidation.transient ? (
                              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 text-red-600 mt-0.5" />
                            )}
                            <div className="flex-1 text-sm">
                              {vatValidation.valid ? (
                                <p className="font-medium text-green-800">{t('vat.valid')}</p>
                              ) : vatValidation.transient ? (
                                <div>
                                  <p className="font-medium text-amber-800">{t('vat.viesUnavailable')}</p>
                                  <p className="text-amber-700">{vatValidation.error}</p>
                                </div>
                              ) : (
                                <p className="text-red-700">{vatValidation.error}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* VAT Save/Remove buttons */}
                      <div className="flex gap-2">
                        <Button
                          onClick={saveVatNumber}
                          disabled={!hasVatChanges || vatSaving}
                          className="flex-1"
                        >
                          {vatSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              {t('common.saving')}
                            </>
                          ) : (
                            vatNumber ? t('vat.save') : t('vat.remove')
                          )}
                        </Button>
                        {user?.vatNumber && (
                          <Button onClick={removeVatNumber} disabled={vatSaving} variant="outline">
                            {t('common.remove')}
                          </Button>
                        )}
                      </div>

                      {/* Current VAT Status */}
                      {user?.vatNumber && (
                        <div className={`p-3 rounded-lg border ${user.isVatVerified
                          ? 'bg-green-50 border-green-200'
                          : 'bg-amber-50 border-amber-200'
                          }`}>
                          <div className="flex items-start gap-2">
                            {user.isVatVerified ? (
                              <Check className="h-4 w-4 text-green-600 mt-0.5" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                            )}
                            <div className="flex-1 text-sm">
                              <p className={`font-medium ${user.isVatVerified ? 'text-green-800' : 'text-amber-800'}`}>
                                {user.isVatVerified ? t('vat.currentVerified') : t('vat.currentNotVerified')}
                              </p>
                              <p className={user.isVatVerified ? 'text-green-700' : 'text-amber-700'}>
                                {user.vatNumber} ({vatCountryName(user.vatNumber)})
                              </p>
                              {!user.isVatVerified && (
                                <p className="text-amber-700 mt-1">
                                  {t('vat.reverseChargeHint')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Business Name & Company Address Section */}
                      <div className="border-t pt-4 mt-2 space-y-4">
                        <h4 className="text-sm font-medium">{t('customer.businessNameAddress')}</h4>
                        <p className="text-xs text-muted-foreground">{t('customer.prefillHint')}</p>
                        <div className="space-y-2">
                          <Label htmlFor="customer-businessName">{t('customer.businessName')}</Label>
                          <Input
                            id="customer-businessName"
                            value={customerBusinessName}
                            onChange={(e) => setCustomerBusinessName(e.target.value)}
                            placeholder={t('customer.businessNamePlaceholder')}
                          />
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="company-address">{t('customer.companyAddress')}</Label>
                            <Input
                              id="company-address"
                              value={customerCompanyAddress.address}
                              onChange={(e) => setCustomerCompanyAddress(prev => ({ ...prev, address: e.target.value }))}
                              placeholder={t('customer.companyAddressPlaceholder')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="company-city">{t('customer.companyCity')}</Label>
                            <Input
                              id="company-city"
                              value={customerCompanyAddress.city}
                              onChange={(e) => setCustomerCompanyAddress(prev => ({ ...prev, city: e.target.value }))}
                              placeholder={t('common.city')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="company-country">{t('customer.companyCountry')}</Label>
                            <Input
                              id="company-country"
                              value={customerCompanyAddress.country}
                              onChange={(e) => setCustomerCompanyAddress(prev => ({ ...prev, country: e.target.value }))}
                              placeholder={t('common.country')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="company-postalCode">{t('customer.companyPostalCode')}</Label>
                            <Input
                              id="company-postalCode"
                              value={customerCompanyAddress.postalCode}
                              onChange={(e) => setCustomerCompanyAddress(prev => ({ ...prev, postalCode: e.target.value }))}
                              placeholder={t('common.postalCode')}
                            />
                          </div>
                        </div>
                        <Button
                          onClick={handleCustomerProfileUpdate}
                          disabled={customerProfileSaving}
                          className="w-full"
                        >
                          {customerProfileSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              {t('common.saving')}
                            </>
                          ) : (
                            t('customer.saveBusinessInfo')
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              }
            </TabsContent >

            <TabsContent value="security" className="space-y-6">
              <PasswordChange />
              <PrivacyAndData />
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardContent className="pt-6">
                  <NotificationPreferences />
                </CardContent>
              </Card>
            </TabsContent>

            {
              user?.role === 'employee' && (
                <TabsContent value="availability" className="space-y-6">
                  <EmployeeAvailability />
                </TabsContent>
              )
            }
            {user?.role === 'admin' && (
              <TabsContent value="availability" className="space-y-6">
                <AdminAvailability />
              </TabsContent>
            )}
          </Tabs >
        )
        }

        {/* Back to Dashboard */}
        <div className="mt-8">
          <Button onClick={() => router.push('/dashboard')} variant="outline">
            {t('page.backToDashboard')}
          </Button>
        </div>

        {/* Edit Blocked Period Dialog */}
        <Dialog
          open={!!editingRange}
          onOpenChange={(open) => {
            if (!open) setEditingRange(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('dialogs.editTitle')}</DialogTitle>
              <DialogDescription>{t('dialogs.editDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-start">{t('dialogs.start')}</Label>
                  <Input
                    id="edit-start"
                    type="datetime-local"
                    value={editingRange?.startValue || ''}
                    min={toLocalInputValue(new Date().toISOString())}
                    onChange={(e) =>
                      setEditingRange((prev) =>
                        prev ? { ...prev, startValue: e.target.value } : prev
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-end">{t('dialogs.end')}</Label>
                  <Input
                    id="edit-end"
                    type="datetime-local"
                    value={editingRange?.endValue || ''}
                    min={editingRange?.startValue || toLocalInputValue(new Date().toISOString())}
                    onChange={(e) =>
                      setEditingRange((prev) =>
                        prev ? { ...prev, endValue: e.target.value } : prev
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-reason">{t('dialogs.reason')}</Label>
                  <Input
                    id="edit-reason"
                    value={editingRange?.reason || ''}
                    onChange={(e) =>
                      setEditingRange((prev) =>
                        prev ? { ...prev, reason: e.target.value } : prev
                      )
                    }
                    placeholder={t('dialogs.reasonPlaceholder')}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="destructive" disabled={profileSaving} onClick={deleteBlockedRange}>
                  {t('dialogs.removeBlock')}
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={profileSaving} onClick={() => setEditingRange(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button disabled={profileSaving} onClick={updateBlockedRange}>{t('dialogs.saveChanges')}</Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* PHASE 2: Auto-populate Dialog */}
        {
          showAutoPopulateDialog && pendingVatData && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <Card className="w-full max-w-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5 text-blue-600" />
                    {t('dialogs.autoPopulateTitle')}
                  </CardTitle>
                  <CardDescription>
                    {t('dialogs.autoPopulateDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Preview of data to be populated */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">{t('dialogs.companyInfoFound')}</h4>
                    {pendingVatData.companyName && (
                      <p className="text-sm text-blue-700"><strong>{t('dialogs.companyName')}</strong> {pendingVatData.companyName}</p>
                    )}
                    {pendingVatData.parsedAddress && (
                      <>
                        {pendingVatData.parsedAddress.streetAddress && (
                          <p className="text-sm text-blue-700"><strong>{t('dialogs.address')}</strong> {pendingVatData.parsedAddress.streetAddress}</p>
                        )}
                        {pendingVatData.parsedAddress.city && (
                          <p className="text-sm text-blue-700"><strong>{t('dialogs.city')}</strong> {pendingVatData.parsedAddress.city}</p>
                        )}
                        {pendingVatData.parsedAddress.postalCode && (
                          <p className="text-sm text-blue-700"><strong>{t('dialogs.postalCode')}</strong> {pendingVatData.parsedAddress.postalCode}</p>
                        )}
                        {pendingVatData.parsedAddress.country && (
                          <p className="text-sm text-blue-700"><strong>{t('dialogs.country')}</strong> {vatCountryName(pendingVatData.parsedAddress.country)}</p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-700">
                      {t('dialogs.onlyEmptyFields')}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAutoPopulate(true)}
                      disabled={vatSaving}
                      className="flex-1"
                    >
                      {vatSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {t('dialogs.autoFilling')}
                        </>
                      ) : (
                        t('dialogs.yesAutoFill')
                      )}
                    </Button>
                    <Button
                      onClick={() => handleAutoPopulate(false)}
                      variant="outline"
                      disabled={vatSaving}
                      className="flex-1"
                    >
                      {t('dialogs.noSkip')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        }

        {/* ID Change Warning Dialog */}
        <Dialog open={showIdChangeWarning} onOpenChange={setShowIdChangeWarning}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
                {t('dialogs.reverificationTitle')}
              </DialogTitle>
              <DialogDescription>
                {t.rich('dialogs.changeIdDescription', {
                  status: t('dialogs.pendingStatus'),
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <p className="font-medium text-amber-800 mb-1">{t('dialogs.changesToSubmit')}</p>
                {idCountryOfIssue !== normalizeCountryCode(user?.idCountryOfIssue || '') && (
                  <p className="text-amber-700">
                    {t('dialogs.countryOfIssueChange', {
                      from: user?.idCountryOfIssue || t('common.empty'),
                      to: idCountryOfIssue || t('common.empty'),
                    })}
                  </p>
                )}
                {idExpirationDate !== (user?.idExpirationDate ? user.idExpirationDate.split('T')[0] : '') && (
                  <p className="text-amber-700">
                    {t('dialogs.expirationChange', {
                      from: user?.idExpirationDate ? new Date(user.idExpirationDate).toLocaleDateString(intl) : t('common.empty'),
                      to: idExpirationDate ? new Date(idExpirationDate).toLocaleDateString(intl) : t('common.empty'),
                    })}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleIdInfoUpdate}
                  disabled={idInfoSaving}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  {idInfoSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('common.saving')}
                    </>
                  ) : (
                    t('dialogs.confirmChanges')
                  )}
                </Button>
                <Button
                  onClick={() => setShowIdChangeWarning(false)}
                  variant="outline"
                  disabled={idInfoSaving}
                  className="flex-1"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showIdProofWarning} onOpenChange={setShowIdProofWarning}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
                {t('dialogs.reverificationTitle')}
              </DialogTitle>
              <DialogDescription>
                {t.rich('dialogs.uploadIdDescription', {
                  status: t('dialogs.pendingStatus'),
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 justify-end mt-4">
              <Button
                onClick={() => setShowIdProofWarning(false)}
                variant="outline"
                disabled={uploading}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => {
                  setShowIdProofWarning(false)
                  handleIdProofUpload()
                }}
                disabled={uploading}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t('dialogs.uploading')}
                  </>
                ) : (
                  t('dialogs.confirmUpload')
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div >
    </div >
  )
}
