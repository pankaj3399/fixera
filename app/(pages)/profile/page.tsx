'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { User, Mail, Phone, Shield, Calendar, Building, Check, X, AlertCircle, Loader2, Upload, FileText, CalendarX, Pencil, MapPin, AlertTriangle } from "lucide-react"
import EmployeeManagement from "@/components/TeamManagement"
import PasswordChange from "@/components/PasswordChange"
import EmployeeAvailability from "@/components/EmployeeAvailability"
import AvailabilityCalendar from "@/components/calendar/AvailabilityCalendar"
import WeeklyAvailabilityCalendar, { CalendarEvent } from "@/components/calendar/WeeklyAvailabilityCalendar"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAuthToken } from "@/lib/utils"
import { EU_COUNTRIES } from "@/lib/countries"
import { CompanyAvailability, DEFAULT_COMPANY_AVAILABILITY } from "@/lib/defaults/companyAvailability"
import {
  validateVATFormat,
  validateVATWithAPI,
  updateUserVAT,
  validateAndPopulateVAT,
  submitForVerification,
  isEUVatNumber,
  getVATCountryName,
  formatVATNumber
} from "@/lib/vatValidation"
import { toLocalInputValue } from "@/lib/dateUtils"


export default function ProfilePage() {
  const { user, isAuthenticated, loading, checkAuth } = useAuth()
  const router = useRouter()
  const [vatNumber, setVatNumber] = useState('')
  const [vatValidating, setVatValidating] = useState(false)
  const [vatSaving, setVatSaving] = useState(false)
  const [vatValidation, setVatValidation] = useState<{
    valid?: boolean
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
  const [hourlyRate, setHourlyRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [serviceCategories, setServiceCategories] = useState<string[]>([])
  const [serviceCatalog, setServiceCatalog] = useState<Array<{ name: string; services: Array<{ name: string }> }>>([])
  const [serviceCatalogLoading, setServiceCatalogLoading] = useState(false)
  const [serviceCatalogError, setServiceCatalogError] = useState<string | null>(null)
  const [blockedRanges, setBlockedRanges] = useState<{startDate: string, endDate: string, reason?: string}[]>([])
  const [newBlockedRange, setNewBlockedRange] = useState({startDate: '', endDate: '', reason: ''})

  // Company availability (for team members to inherit)
  const [companyAvailability, setCompanyAvailability] = useState<CompanyAvailability>(DEFAULT_COMPANY_AVAILABILITY)
  const [companyBlockedRanges, setCompanyBlockedRanges] = useState<{ startDate: string, endDate: string, reason?: string, isHoliday?: boolean }[]>([])
  const [newCompanyBlockedRange, setNewCompanyBlockedRange] = useState({ startDate: '', endDate: '', reason: '', isHoliday: false })
  const [bookingEvents, setBookingEvents] = useState<CalendarEvent[]>([])
  const [profileSaving, setProfileSaving] = useState(false)
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
  const [customerProfileSaving, setCustomerProfileSaving] = useState(false)

  // ID metadata state (for professionals)
  const [idCountryOfIssue, setIdCountryOfIssue] = useState('')
  const [idExpirationDate, setIdExpirationDate] = useState('')
  const [idInfoSaving, setIdInfoSaving] = useState(false)
  const [showIdChangeWarning, setShowIdChangeWarning] = useState(false)

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
    }

    // Populate ID metadata for professionals
    if (user?.role === 'professional') {
      if (user.idCountryOfIssue) {
        const rawCountry = user.idCountryOfIssue
        const normalizedCountryCode = rawCountry.length === 2
          ? rawCountry.toUpperCase()
          : (EU_COUNTRIES.find((country) => country.name.toLowerCase() === rawCountry.toLowerCase())?.code || '')
        setIdCountryOfIssue(normalizedCountryCode || user.idCountryOfIssue)
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
      setServiceCatalogError(null)
      setServiceCatalogLoading(false)
      return
    }

    const fetchServiceCatalog = async () => {
      try {
        setServiceCatalogLoading(true)
        setServiceCatalogError(null)
        const country = user?.businessInfo?.country || 'BE'
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/service-categories/active?country=${encodeURIComponent(country)}`,
          { credentials: 'include' }
        )
        if (!response.ok) {
          throw new Error(`Failed to fetch service categories: ${response.status}`)
        }
        const data = await response.json()
        setServiceCatalog(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Failed to load service categories:', error)
        setServiceCatalogError('Failed to load service categories')
      } finally {
        setServiceCatalogLoading(false)
      }
    }

    fetchServiceCatalog()
  }, [user?.role, user?.businessInfo?.country])

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
          scheduledStartDate?: string | Date | null
          scheduledExecutionEndDate?: string | Date | null
          scheduledBufferStartDate?: string | Date | null
          scheduledBufferEndDate?: string | Date | null
          status?: string
          location?: {
            address?: string
            city?: string
            country?: string
            postalCode?: string
          }
        }

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

          if (scheduledStart && executionEnd && executionEnd > scheduledStart) {
            events.push({
              id: `booking-${booking._id}`,
              type: 'booking',
              title: 'Booking',
              start: scheduledStart,
              end: executionEnd,
              meta: {
                bookingId: booking._id,
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
                title: 'Buffer',
                start: bufferIntervalStart,
                end: bufferEnd,
                meta: {
                  bookingId: booking._id,
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
        toast.error('Failed to load booking events. Please refresh to try again.')
      }
    }

    fetchBookingEvents()

    return () => {
      abortController.abort()
    }
  }, [loading, isAuthenticated, user?.role])

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
        error: formatValidation.error
      })
      return
    }

    // If it's not an EU VAT number, just validate format
    if (!isEUVatNumber(formatted)) {
      setVatValidation({
        valid: false,
        error: 'Only EU VAT numbers can be validated with VIES'
      })
      return
    }

    setVatValidating(true)
    try {
      const result = await validateVATWithAPI(formatted)
      setVatValidation({
        valid: result.valid,
        error: result.error,
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
    } catch {
      setVatValidation({
        valid: false,
        error: 'Failed to validate VAT number'
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
        toast.success(vatNumber ? 'VAT number updated successfully' : 'VAT number removed successfully')
        // Refresh user data
        await checkAuth()
        setVatValidation({})
      } else {
        toast.error(result.error || 'Failed to update VAT number')
      }
    } catch {
      toast.error('Failed to update VAT number')
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
        toast.success('VAT number removed successfully')
        await checkAuth()
      } else {
        toast.error(result.error || 'Failed to remove VAT number')
      }
    } catch {
      toast.error('Failed to remove VAT number')
    } finally {
      setVatSaving(false)
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
        toast.success('ID proof uploaded successfully')
        setIdProofFile(null)
        await checkAuth() // Refresh user data
      } else {
        toast.error(result.msg || 'Failed to upload ID proof')
      }
    } catch {
      toast.error('Failed to upload ID proof')
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
        toast.error(result.msg || 'Failed to save blocked periods')
        return false
      }
    } catch {
      toast.error('Failed to save blocked periods')
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
      toast.error('Select start and end values')
      return
    }
    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error('Please provide valid start and end times')
      return
    }
    const now = Date.now()
    if (startDate.getTime() < now) {
      toast.error('Cannot block time in the past')
      return
    }
    if (endDate.getTime() < now) {
      toast.error('End time cannot be in the past')
      return
    }
    if (startDate >= endDate) {
      toast.error('Start must be before end time')
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
      toast.success('Blocked period updated and saved')
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
      toast.success('Blocked period removed and saved')
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
        toast.success('Professional profile updated successfully')
        await checkAuth() // Refresh user data
      } else {
        toast.error(result.msg || 'Failed to update profile')
      }
    } catch {
      toast.error('Failed to update profile')
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
      toast.error('Please provide valid start and end times')
      return false
    }

    // For full-day ranges from calendar, compare dates only (not timestamps)
    // This allows blocking "today" when the time is 00:00:00
    if (isFullDayRange) {
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
      const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (startDateOnly < todayDateOnly) {
        toast.error('Cannot block dates in the past')
        return false
      }
    } else if (startDate < now) {
      toast.error('Cannot block time in the past')
      return false
    }

    if (startDate >= endDate) {
      toast.error('Start must be before end time')
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
        toast.success(`Blocked ${days} day${days === 1 ? '' : 's'} from ${startDate.toLocaleString()} to ${endDate.toLocaleString()}`)
      } else {
        const roundedHours = Math.round(durationHours * 10) / 10
        toast.success(`Blocked ${roundedHours} hour${roundedHours === 1 ? '' : 's'} on ${startDate.toLocaleDateString()}`)
      }
    }

    return success
  }

  const addBlockedRange = async () => {
    if (!newBlockedRange.startDate || !newBlockedRange.endDate) {
      toast.error('Select start and end values')
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
      toast.success('Blocked period removed and saved')
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
        toast.error(result.msg || 'Failed to save company blocked periods')
        return false
      }
    } catch {
      toast.error('Failed to save company blocked periods')
      return false
    } finally {
      setProfileSaving(false)
    }
  }

  const addCompanyBlockedRange = async () => {
    if (!newCompanyBlockedRange.startDate || !newCompanyBlockedRange.endDate) return

    const startDate = new Date(newCompanyBlockedRange.startDate)
    const endDate = new Date(newCompanyBlockedRange.endDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (startDate < today) {
      toast.error('Cannot block dates in the past')
      return
    }

    if (startDate > endDate) {
      toast.error('End date cannot be before start date')
      return
    }

    const newRange = {
      startDate: newCompanyBlockedRange.startDate,
      endDate: newCompanyBlockedRange.endDate,
      reason: newCompanyBlockedRange.reason || undefined,
      isHoliday: newCompanyBlockedRange.isHoliday || false
    }

    const updatedRanges = [...companyBlockedRanges, newRange]
    setCompanyBlockedRanges(updatedRanges)
    setNewCompanyBlockedRange({ startDate: '', endDate: '', reason: '', isHoliday: false })

    const success = await saveCompanyBlockedRanges(updatedRanges)
    if (success) {
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      toast.success(`Blocked ${days} day${days === 1 ? '' : 's'} from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()} and saved`)
    }
  }

  const removeCompanyBlockedRange = async (indexToRemove: number) => {
    const updatedRanges = companyBlockedRanges.filter((_, index) => index !== indexToRemove)
    setCompanyBlockedRanges(updatedRanges)

    const success = await saveCompanyBlockedRanges(updatedRanges)
    if (success) {
      toast.success('Company blocked period removed and saved')
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

        toast.success('Business information auto-populated from VAT data!')
        await checkAuth() // Refresh user data
      } else {
        toast.error(result.error || 'Failed to auto-populate business information')
      }
    } catch {
      toast.error('Failed to auto-populate business information')
    } finally {
      setVatSaving(false)
      setShowAutoPopulateDialog(false)
      setPendingVatData(null)
    }
  }


  const handleUpdatePhone = async () => {
    if (!newPhoneNumber || newPhoneNumber.trim() === '') {
      toast.error('Phone number cannot be empty')
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
        toast.success(result.msg || 'Phone number updated successfully')
        setIsEditingPhone(false)
        await checkAuth() // Refresh user data
      } else {
        toast.error(result.msg || 'Failed to update phone number')
      }
    } catch (error) {
      console.error('Phone update error:', error)
      toast.error('Failed to update phone number')
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
        toast.success('Thanks for submitting. Your profile will be checked within 48 hours.', {
          duration: 5000,
        })
        await checkAuth() // Refresh user data to update professional status
      } else {
        if (result.missingRequirements && result.missingRequirements.length > 0) {
          toast.error(`Please complete: ${result.missingRequirements.join(', ')}`, {
            duration: 6000,
          })
        } else {
          toast.error(result.error || 'Failed to submit for verification')
        }
      }
    } catch {
      toast.error('Failed to submit for verification')
    } finally {
      setVerificationSubmitting(false)
    }
  }


  // Customer profile update handler
  const handleCustomerProfileUpdate = async () => {
    setCustomerProfileSaving(true)
    try {
      const token = getAuthToken()
      const body: Record<string, string> = {
        address: customerAddress.address,
        city: customerAddress.city,
        country: customerAddress.country,
        postalCode: customerAddress.postalCode,
      }
      if (user?.customerType === 'business') {
        body.businessName = customerBusinessName
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
        toast.success('Profile updated successfully')
        await checkAuth()
      } else {
        toast.error(result.msg || 'Failed to update profile')
      }
    } catch {
      toast.error('Failed to update profile')
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
        toast.success(result.msg || 'ID information updated. Re-verification required.')
        setShowIdChangeWarning(false)
        await checkAuth()
      } else {
        toast.error(result.msg || 'Failed to update ID information')
      }
    } catch {
      toast.error('Failed to update ID information')
    } finally {
      setIdInfoSaving(false)
    }
  }

  const hasIdInfoChanges = () => {
    const rawCountry = user?.idCountryOfIssue || ''
    const currentCountry = rawCountry.length === 2
      ? rawCountry.toUpperCase()
      : (EU_COUNTRIES.find((country) => country.name.toLowerCase() === rawCountry.toLowerCase())?.code || rawCountry)
    const currentExpiry = user?.idExpirationDate ? user.idExpirationDate.split('T')[0] : ''
    return idCountryOfIssue !== currentCountry || idExpirationDate !== currentExpiry
  }

  const calendarEvents = useMemo(() => {
    const toEventDate = (value: string, isEnd = false) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number)
        return new Date(year, month - 1, day, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0)
      }
      return new Date(value)
    }
    const personalEvents: CalendarEvent[] = blockedRanges.map((range, index) => ({
      id: `personal-${index}`,
      type: 'personal',
      title: 'Personal Block',
      start: toEventDate(range.startDate, false),
      end: toEventDate(range.endDate, true),
      meta: { note: range.reason, rangeIndex: index }
    }))
    const companyEvents: CalendarEvent[] = companyBlockedRanges.map((range, index) => ({
      id: `company-${index}`,
      type: 'company',
      title: range.isHoliday ? 'Holiday' : 'Company Closure',
      start: toEventDate(range.startDate, false),
      end: toEventDate(range.endDate, true),
      meta: { note: range.reason },
      readOnly: true
    }))
    return [...companyEvents, ...bookingEvents, ...personalEvents]
  }, [blockedRanges, companyBlockedRanges, bookingEvents])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const hasVatChanges = vatNumber !== (user?.vatNumber || '')
  const canValidate = vatNumber.trim() && vatNumber !== (user?.vatNumber || '')

  const fallbackServiceOptions = [
    'Plumbing', 'Electrical', 'Carpentry', 'Painting', 'Cleaning',
    'IT Support', 'Home Repair', 'Gardening', 'Moving', 'Tutoring'
  ]

  const isProfessional = user?.role === 'professional'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile Settings</h1>
          <p className="text-gray-600">Manage your account information and settings</p>
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
                      Professional Status: {user?.professionalStatus || 'not submitted'}
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
                          Submitting...
                        </>
                      ) : (
                        'Send for Verification'
                      )}
                    </Button>
                  )}
                </div>

                {user?.professionalStatus === 'rejected' && user?.rejectionReason && (
                  <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700">
                    <strong>Rejection Reason:</strong> {user.rejectionReason}
                  </div>
                )}

                {user?.professionalStatus === 'pending' && (
                  <div className="mt-2 text-xs text-yellow-700">
                    Your profile is under review. You will be notified within 48 hours.
                  </div>
                )}

                {user?.professionalStatus === 'approved' && (
                  <div className="mt-2 text-xs text-green-700">
                    Your professional profile has been approved. You can now receive project bookings.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {isProfessional ? (
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="business">Business Info</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="employees">Employees</TabsTrigger>
              <TabsTrigger value="personal-availability">Personal Availability</TabsTrigger>
              <TabsTrigger value="company-availability">Company Availability</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* User Profile Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Profile Information
                    </CardTitle>
                    <CardDescription>Your account details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                            {phoneUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setIsEditingPhone(false); setNewPhoneNumber(user?.phone || '') }} className="h-8">
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm">{user?.phone}</span>
                          <Button size="sm" variant="ghost" onClick={() => setIsEditingPhone(true)} className="h-6 w-6 p-0">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {!user?.isPhoneVerified && (
                            <span className="text-xs text-orange-600">(Not verified)</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-500" />
                      <span className="text-sm capitalize">{user?.role}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Verification Status Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Verification Status
                    </CardTitle>
                    <CardDescription>Account verification progress</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Email Verification</span>
                      <span className={`text-sm font-medium ${user?.isEmailVerified ? 'text-green-600' : 'text-red-600'}`}>
                        {user?.isEmailVerified ? 'Verified' : 'Not Verified'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Phone Verification</span>
                      <span className={`text-sm font-medium ${user?.isPhoneVerified ? 'text-green-600' : 'text-red-600'}`}>
                        {user?.isPhoneVerified ? 'Verified' : 'Not Verified'}
                      </span>
                    </div>
                    {(user?.role === 'professional' || user?.role === 'customer') && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">VAT Verification</span>
                        <span className={`text-sm font-medium ${user?.isVatVerified ? 'text-green-600' : 'text-red-600'}`}>
                          {user?.isVatVerified ? 'Verified' : 'Not Verified'}
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
                        VAT Information
                      </CardTitle>
                      <CardDescription>
                        Add your VAT number for EU tax compliance. EU VAT numbers will be verified using VIES.
                        {user?.role === 'customer' && ' Useful for business customers who need VAT invoices.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="vatNumber">VAT Number</Label>
                        <div className="flex gap-2">
                          <Input
                            id="vatNumber"
                            placeholder="e.g., DE123456789"
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
                                Validating
                              </>
                            ) : (
                              'Validate'
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500">
                          Format: 2-letter country code + 4-15 characters (e.g., DE123456789, FR12345678901)
                        </p>
                      </div>

                      {/* Validation Results */}
                      {vatValidation.valid !== undefined && (
                        <div className={`p-3 rounded-lg border ${vatValidation.valid
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                          }`}>
                          <div className="flex items-start gap-2">
                            {vatValidation.valid ? (
                              <Check className="h-4 w-4 text-green-600 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 text-red-600 mt-0.5" />
                            )}
                            <div className="flex-1 text-sm">
                              {vatValidation.valid ? (
                                <div>
                                  <p className="font-medium text-green-800">VAT number is valid</p>
                                  {isEUVatNumber(vatNumber) && (
                                    <p className="text-green-700">
                                      Country: {getVATCountryName(vatNumber)}
                                    </p>
                                  )}
                                  {vatValidation.companyName && (
                                    <p className="text-green-700 mt-1">
                                      <span className="font-medium">Company:</span> {vatValidation.companyName}
                                    </p>
                                  )}
                                  {vatValidation.companyAddress && (
                                    <p className="text-green-700">
                                      <span className="font-medium">Address:</span> {vatValidation.companyAddress}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <p className="font-medium text-red-800">Validation failed</p>
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
                        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                            <div className="flex-1 text-sm">
                              <p className="font-medium text-blue-800">Current VAT Number</p>
                              <p className="text-blue-700">
                                {user.vatNumber} ({getVATCountryName(user.vatNumber)})
                              </p>
                              <p className="text-blue-700">
                                Status: {user.isVatVerified ? 'Verified' : 'Not Verified'}
                              </p>
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
                              Saving...
                            </>
                          ) : (
                            vatNumber ? 'Save VAT Number' : 'Remove VAT Number'
                          )}
                        </Button>
                        {user?.vatNumber && (
                          <Button
                            onClick={removeVatNumber}
                            disabled={vatSaving}
                            variant="outline"
                          >
                            Remove
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
                      Account Stats
                    </CardTitle>
                    <CardDescription>Your account activity</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Member Since</span>
                      <span className="text-sm font-medium">
                        {new Date(user?.createdAt || '').toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Last Updated</span>
                      <span className="text-sm font-medium">
                        {new Date(user?.updatedAt || '').toLocaleDateString()}
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
                    Business Information
                  </CardTitle>
                  <CardDescription>
                    Complete your business profile to attract more clients
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        value={businessInfo.companyName}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="Your business name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={businessInfo.website}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, website: e.target.value }))}
                        placeholder="https://yourwebsite.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Business Description</Label>
                    <Textarea
                      id="description"
                      value={businessInfo.description}
                      onChange={(e) => setBusinessInfo(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe your business and services..."
                      rows={3}
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={businessInfo.city}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, city: e.target.value }))}
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={businessInfo.country}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, country: e.target.value }))}
                        placeholder="Country"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">Postal Code</Label>
                      <Input
                        id="postalCode"
                        value={businessInfo.postalCode}
                        onChange={(e) => setBusinessInfo(prev => ({ ...prev, postalCode: e.target.value }))}
                        placeholder="Postal Code"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={businessInfo.address}
                      onChange={(e) => setBusinessInfo(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="Full business address"
                    />
                  </div>

                  {/* Hourly Rate */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hourlyRate">Hourly Rate</Label>
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
                      <Label htmlFor="currency">Currency</Label>
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
                    <Label>Service Categories</Label>
                    {serviceCatalogLoading && (
                      <div className="text-sm text-muted-foreground">Loading services...</div>
                    )}
                    {serviceCatalogError && (
                      <div className="text-sm text-red-600">{serviceCatalogError}</div>
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
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {fallbackServiceOptions.map((service) => (
                            <Button
                              key={service}
                              type="button"
                              variant={serviceCategories.includes(service) ? "default" : "outline"}
                              size="sm"
                              onClick={() => handleServiceCategoryToggle(service)}
                            >
                              {service}
                            </Button>
                          ))}
                        </div>
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
                        Saving...
                      </>
                    ) : (
                      'Save Business Information'
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
                    Identity Documents
                  </CardTitle>
                  <CardDescription>
                    Upload your ID proof for verification. Required for professional approval.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current ID Status */}
                  {user?.idProofUrl && (
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                      <div className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-600 mt-0.5" />
                        <div className="flex-1 text-sm">
                          <p className="font-medium text-green-800">ID Proof Uploaded</p>
                          <p className="text-green-700">
                            Verification Status: {user.isIdVerified ? 'Verified' : 'Pending Review'}
                          </p>
                          <p className="text-green-700 text-xs">
                            Uploaded: {new Date(user.idProofUploadedAt || '').toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* File Upload */}
                  <div className="space-y-2">
                    <Label htmlFor="idProof">Upload New ID Proof</Label>
                    <Input
                      id="idProof"
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={(e) => setIdProofFile(e.target.files?.[0] || null)}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-gray-500">
                      Accepted formats: JPEG, PNG, PDF. Maximum size: 5MB
                    </p>
                  </div>

                  {idProofFile && (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">
                          Selected: {idProofFile.name}
                        </span>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleIdProofUpload}
                    disabled={!idProofFile || uploading}
                    className="w-full"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload ID Proof
                      </>
                    )}
                  </Button>

                  {/* ID Metadata Fields */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-medium mb-3">ID Document Details</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="idCountryOfIssue">Country of Issue</Label>
                        <Select value={idCountryOfIssue} onValueChange={setIdCountryOfIssue}>
                          <SelectTrigger id="idCountryOfIssue">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent>
                            {EU_COUNTRIES.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                {country.flag} {country.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="idExpirationDate">Expiration Date</Label>
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
                            Changing ID information will trigger a re-verification. Your professional status will be set to pending until an admin re-approves your profile.
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
                          Saving...
                        </>
                      ) : (
                        'Save ID Details'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent >

            {/* Personal Availability Tab */}
            < TabsContent value="personal-availability" className="space-y-6" >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarX className="h-5 w-5" />
                    Availability Calendar
                  </CardTitle>
                  <CardDescription>
                    Weekly view with bookings, buffers, personal blocks, and company closures. Click personal blocks to edit.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-base font-medium">Add Blocked Period</Label>
                    <p className="text-xs text-muted-foreground">
                      Use the same date for start and end to block a single day.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Start Date</Label>
                        <Input
                          id="startDate"
                          type="datetime-local"
                          value={newBlockedRange.startDate}
                          onChange={(e) => setNewBlockedRange(prev => ({ ...prev, startDate: e.target.value }))}
                          min={toLocalInputValue(new Date().toISOString())}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endDate">End Date</Label>
                        <Input
                          id="endDate"
                          type="datetime-local"
                          value={newBlockedRange.endDate}
                          onChange={(e) => setNewBlockedRange(prev => ({ ...prev, endDate: e.target.value }))}
                          min={newBlockedRange.startDate || toLocalInputValue(new Date().toISOString())}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reason">Reason (Optional)</Label>
                        <Input
                          id="reason"
                          placeholder="Vacation, Holiday, etc."
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
                        Block Period
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Manual Blocked Periods</Label>
                    {blockedRanges.length > 0 ? (
                      <div className="space-y-2">
                        {blockedRanges.map((range, index) => (
                          <div key={`range-${index}`} className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3">
                            <div>
                              <div className="text-sm font-medium text-rose-900">
                                {new Date(range.startDate).toLocaleString()}{" -> "}{new Date(range.endDate).toLocaleString()}
                              </div>
                              {range.reason && (
                                <div className="text-xs text-rose-700">{range.reason}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => openEditRange(index)}
                                variant="ghost"
                                size="sm"
                                className="text-rose-700 hover:text-rose-900 hover:bg-rose-100"
                              >
                                Edit
                              </Button>
                              <Button
                                onClick={() => removeBlockedRange(index)}
                                variant="ghost"
                                size="sm"
                                disabled={profileSaving}
                                className="text-rose-700 hover:text-rose-900 hover:bg-rose-100"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
                        No blocked periods yet.
                      </div>
                    )}
                  </div>

                  <WeeklyAvailabilityCalendar
                    title="Weekly Availability"
                    description="Hover for details. Click personal blocks to edit."
                    events={calendarEvents}
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
                    Personal Working Hours
                  </CardTitle>
                  <CardDescription>
                    Read-only. Working hours are fixed to Monday-Friday, 09:00-17:00.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    Working hours are fixed to Monday-Friday, 09:00-17:00.
                  </div>
                </CardContent>
              </Card>
            </TabsContent >

            {/* Company Availability Tab */}
            < TabsContent value="company-availability" className="space-y-6" >
              <div className="mb-6">
                <h3 className="text-lg font-semibold">Company Availability & Holidays</h3>
                <p className="text-sm text-muted-foreground">Set company-wide schedule that team members can inherit</p>
              </div>

              {/* Company Calendar View (read-only for company blocks) */}
              <AvailabilityCalendar
                title="Company Availability"
                description="Month view with company working days and company blocks"
                weeklySchedule={companyAvailability}
                personalBlockedDates={[]}
                personalBlockedRanges={[]}
                companyBlockedDates={[]}
                companyBlockedRanges={companyBlockedRanges}
                mode="professional"
                compact
              />

              {/* Company Weekly Schedule */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Company Working Hours
                  </CardTitle>
                  <CardDescription>
                    Set company office hours for your team
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(companyAvailability).map(([day, schedule]) => (
                    <div key={day} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="w-20 text-sm font-medium capitalize">{day}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={schedule.available}
                          onChange={(e) => {
                            setCompanyAvailability(prev => ({
                              ...prev,
                              [day]: { ...prev[day as keyof typeof prev], available: e.target.checked }
                            }))
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">Available</span>
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
                          <span className="text-sm">to</span>
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

                  <Button
                    onClick={saveBusinessInfo}
                    disabled={profileSaving}
                    className="w-full mt-6"
                  >
                    {profileSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      'Save Company Hours'
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Company Holidays */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarX className="h-5 w-5" />
                    Company Holidays & Closures
                  </CardTitle>
                  <CardDescription>
                    Set company-wide closures for one or more days.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-12 gap-4">
                      <div className="md:col-span-3">
                        <Label htmlFor="company-range-start">Start Date</Label>
                        <Input
                          id="company-range-start"
                          type="date"
                          value={newCompanyBlockedRange.startDate}
                          onChange={(e) => setNewCompanyBlockedRange(prev => ({ ...prev, startDate: e.target.value }))}
                          min={toLocalInputValue(new Date().toISOString()).split('T')[0]}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <Label htmlFor="company-range-end">End Date</Label>
                        <Input
                          id="company-range-end"
                          type="date"
                          value={newCompanyBlockedRange.endDate}
                          onChange={(e) => setNewCompanyBlockedRange(prev => ({ ...prev, endDate: e.target.value }))}
                          min={newCompanyBlockedRange.startDate
                            ? newCompanyBlockedRange.startDate
                            : toLocalInputValue(new Date().toISOString()).split('T')[0]}
                        />
                      </div>
                      <div className="md:col-span-4">
                        <Label htmlFor="company-range-reason">Reason</Label>
                        <Input
                          id="company-range-reason"
                          placeholder="Holiday period"
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
                            newCompanyBlockedRange.endDate < newCompanyBlockedRange.startDate
                          }
                          className="w-full"
                        >
                          Add Period
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="company-range-is-holiday"
                        checked={newCompanyBlockedRange.isHoliday}
                        onChange={(e) => setNewCompanyBlockedRange(prev => ({ ...prev, isHoliday: e.target.checked }))}
                        className="rounded"
                      />
                      <Label htmlFor="company-range-is-holiday" className="text-sm font-normal cursor-pointer">
                        Mark as official company holiday
                      </Label>
                    </div>
                  </div>

                  {companyBlockedRanges.length > 0 && (
                    <div className="space-y-3 mt-6">
                      <Label>Company Closures:</Label>
                      {companyBlockedRanges.map((range, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <div className="flex items-center gap-2">
                            <CalendarX className="h-4 w-4 text-orange-600" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-orange-800">
                                {new Date(range.startDate).toLocaleDateString() === new Date(range.endDate).toLocaleDateString()
                                  ? new Date(range.startDate).toLocaleDateString()
                                  : `${new Date(range.startDate).toLocaleDateString()} - ${new Date(range.endDate).toLocaleDateString()}`}
                              </span>
                              {range.reason && (
                                <span className="text-xs text-orange-600">{range.reason}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            onClick={() => removeCompanyBlockedRange(index)}
                            variant="ghost"
                            size="sm"
                            disabled={profileSaving}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {companyBlockedRanges.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <CalendarX className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No company holidays set</p>
                      <p className="text-xs">Add holidays when your company is closed</p>
                    </div>
                  )}

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
            </TabsContent >
          </Tabs >
        ) : (
          // Non-professional users (customers, employees, etc.)
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              {user?.role === 'employee' && (
                <TabsTrigger value="availability">Availability</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* User Profile Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Profile Information
                    </CardTitle>
                    <CardDescription>Your account details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                            {phoneUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setIsEditingPhone(false); setNewPhoneNumber(user?.phone || '') }} className="h-8">
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm">{user?.phone?.startsWith('+1000000') ? 'Not provided' : user?.phone}</span>
                          <Button size="sm" variant="ghost" onClick={() => setIsEditingPhone(true)} className="h-6 w-6 p-0">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {!user?.isPhoneVerified && (
                            <span className="text-xs text-orange-600">(Not verified)</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-500" />
                      <span className="text-sm capitalize">{user?.role?.replace('_', ' ')}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Verification Status */}
                < Card >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Verification Status
                    </CardTitle>
                    <CardDescription>Account verification progress</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Email Verification</span>
                      <span className={`text-sm font-medium ${user?.isEmailVerified ? 'text-green-600' : 'text-red-600'}`}>
                        {user?.isEmailVerified ? 'Verified' : 'Not Verified'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Phone Verification</span>
                      <span className={`text-sm font-medium ${user?.isPhoneVerified ? 'text-green-600' : 'text-red-600'}`}>
                        {user?.isPhoneVerified ? 'Verified' : 'Not Verified'}
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
                        Address Information
                      </CardTitle>
                      <CardDescription>
                        Your address details
                        {user.customerType === 'business' && ' and business information'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="customer-address">Address</Label>
                          <Input
                            id="customer-address"
                            value={customerAddress.address}
                            onChange={(e) => setCustomerAddress(prev => ({ ...prev, address: e.target.value }))}
                            placeholder="Street address"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customer-city">City</Label>
                          <Input
                            id="customer-city"
                            value={customerAddress.city}
                            onChange={(e) => setCustomerAddress(prev => ({ ...prev, city: e.target.value }))}
                            placeholder="City"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customer-country">Country</Label>
                          <Input
                            id="customer-country"
                            value={customerAddress.country}
                            onChange={(e) => setCustomerAddress(prev => ({ ...prev, country: e.target.value }))}
                            placeholder="Country"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customer-postalCode">Postal Code</Label>
                          <Input
                            id="customer-postalCode"
                            value={customerAddress.postalCode}
                            onChange={(e) => setCustomerAddress(prev => ({ ...prev, postalCode: e.target.value }))}
                            placeholder="Postal Code"
                          />
                        </div>
                      </div>

                      {user.customerType === 'business' && (
                        <>
                          <div className="border-t pt-4 mt-4">
                            <h4 className="text-sm font-medium mb-3">Business Information</h4>
                            <div className="space-y-2">
                              <Label htmlFor="customer-businessName">Business Name</Label>
                              <Input
                                id="customer-businessName"
                                value={customerBusinessName}
                                onChange={(e) => setCustomerBusinessName(e.target.value)}
                                placeholder="Your business name"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      <Button
                        onClick={handleCustomerProfileUpdate}
                        disabled={customerProfileSaving}
                        className="w-full"
                      >
                        {customerProfileSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Save Profile'
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )
              }

              {/* VAT for business customers */}
              {
                user?.role === 'customer' && user.customerType === 'business' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building className="h-5 w-5" />
                        VAT Information
                      </CardTitle>
                      <CardDescription>
                        Add your VAT number for EU tax compliance and invoicing.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="customer-vatNumber">VAT Number</Label>
                        <div className="flex gap-2">
                          <Input
                            id="customer-vatNumber"
                            placeholder="e.g., DE123456789"
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
                                Validating
                              </>
                            ) : (
                              'Validate'
                            )}
                          </Button>
                        </div>
                      </div>

                      {vatValidation.valid !== undefined && (
                        <div className={`p-3 rounded-lg border ${vatValidation.valid
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                          }`}>
                          <div className="flex items-start gap-2">
                            {vatValidation.valid ? (
                              <Check className="h-4 w-4 text-green-600 mt-0.5" />
                            ) : (
                              <X className="h-4 w-4 text-red-600 mt-0.5" />
                            )}
                            <div className="flex-1 text-sm">
                              {vatValidation.valid ? (
                                <p className="font-medium text-green-800">VAT number is valid</p>
                              ) : (
                                <p className="text-red-700">{vatValidation.error}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          onClick={saveVatNumber}
                          disabled={!hasVatChanges || vatSaving}
                          className="flex-1"
                        >
                          {vatSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Saving...
                            </>
                          ) : (
                            vatNumber ? 'Save VAT Number' : 'Remove VAT Number'
                          )}
                        </Button>
                        {user?.vatNumber && (
                          <Button onClick={removeVatNumber} disabled={vatSaving} variant="outline">
                            Remove
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              }
            </TabsContent >

            <TabsContent value="security" className="space-y-6">
              <PasswordChange />
            </TabsContent>

            {
              user?.role === 'employee' && (
                <TabsContent value="availability" className="space-y-6">
                  <EmployeeAvailability />
                </TabsContent>
              )
            }
          </Tabs >
        )
        }

        {/* Back to Dashboard */}
        <div className="mt-8">
          <Button onClick={() => router.push('/dashboard')} variant="outline">
            Back to Dashboard
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
              <DialogTitle>Edit Blocked Period</DialogTitle>
              <DialogDescription>Adjust the time range or remove the block.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-start">Start</Label>
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
                  <Label htmlFor="edit-end">End</Label>
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
                  <Label htmlFor="edit-reason">Reason (optional)</Label>
                  <Input
                    id="edit-reason"
                    value={editingRange?.reason || ''}
                    onChange={(e) =>
                      setEditingRange((prev) =>
                        prev ? { ...prev, reason: e.target.value } : prev
                      )
                    }
                    placeholder="Vacation, appointment, etc."
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="destructive" disabled={profileSaving} onClick={deleteBlockedRange}>
                  Remove Block
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={profileSaving} onClick={() => setEditingRange(null)}>
                    Cancel
                  </Button>
                  <Button disabled={profileSaving} onClick={updateBlockedRange}>Save Changes</Button>
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
                    Auto-populate Business Information?
                  </CardTitle>
                  <CardDescription>
                    We found company information from your VAT registration. Would you like to auto-fill your business details?
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Preview of data to be populated */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">Company Information Found:</h4>
                    {pendingVatData.companyName && (
                      <p className="text-sm text-blue-700"><strong>Company Name:</strong> {pendingVatData.companyName}</p>
                    )}
                    {pendingVatData.parsedAddress && (
                      <>
                        {pendingVatData.parsedAddress.streetAddress && (
                          <p className="text-sm text-blue-700"><strong>Address:</strong> {pendingVatData.parsedAddress.streetAddress}</p>
                        )}
                        {pendingVatData.parsedAddress.city && (
                          <p className="text-sm text-blue-700"><strong>City:</strong> {pendingVatData.parsedAddress.city}</p>
                        )}
                        {pendingVatData.parsedAddress.postalCode && (
                          <p className="text-sm text-blue-700"><strong>Postal Code:</strong> {pendingVatData.parsedAddress.postalCode}</p>
                        )}
                        {pendingVatData.parsedAddress.country && (
                          <p className="text-sm text-blue-700"><strong>Country:</strong> {getVATCountryName(pendingVatData.parsedAddress.country)}</p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-700">
                      Only empty fields will be filled. Your existing data will not be overwritten.
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
                          Auto-filling...
                        </>
                      ) : (
                        'Yes, Auto-fill'
                      )}
                    </Button>
                    <Button
                      onClick={() => handleAutoPopulate(false)}
                      variant="outline"
                      disabled={vatSaving}
                      className="flex-1"
                    >
                      No, Skip
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
                Re-verification Required
              </DialogTitle>
              <DialogDescription>
                Changing your ID information will require admin re-verification. Your professional status will be set to <strong>pending</strong> and you will not be able to receive new bookings until an admin re-approves your profile.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <p className="font-medium text-amber-800 mb-1">Changes to be submitted:</p>
                {idCountryOfIssue !== (user?.idCountryOfIssue || '') && (
                  <p className="text-amber-700">
                    Country of Issue: {user?.idCountryOfIssue || '(empty)'} → {idCountryOfIssue || '(empty)'}
                  </p>
                )}
                {idExpirationDate !== (user?.idExpirationDate ? user.idExpirationDate.split('T')[0] : '') && (
                  <p className="text-amber-700">
                    Expiration Date: {user?.idExpirationDate ? new Date(user.idExpirationDate).toLocaleDateString() : '(empty)'} → {idExpirationDate ? new Date(idExpirationDate).toLocaleDateString() : '(empty)'}
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
                      Saving...
                    </>
                  ) : (
                    'Confirm Changes'
                  )}
                </Button>
                <Button
                  onClick={() => setShowIdChangeWarning(false)}
                  variant="outline"
                  disabled={idInfoSaving}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div >
    </div >
  )
}
