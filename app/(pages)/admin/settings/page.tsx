'use client'

import { getErrorMessage, messageFromApiBody } from '@/lib/apiErrors';

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { ArrowLeft, Settings, Save, Loader2, Euro, LifeBuoy } from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { formatVATNumber, validateVATFormat } from "@/lib/vatValidation"
import { getAuthToken } from "@/lib/utils"
import { EU_COUNTRIES } from "@/lib/countries"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { invalidateClientRequest } from "@/lib/clientRequestCache"
import { adminSetSupportChatEnabled } from "@/lib/support"
import AutoConversionSettingsCard from "@/components/admin/AutoConversionSettingsCard"

const normalizeCountryCode = (value?: string): string => {
  const trimmed = (value || '').trim()
  if (!trimmed) return 'BE'
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase()
  const match = EU_COUNTRIES.find((country) => country.name.toLowerCase() === trimmed.toLowerCase())
  return match?.code ?? trimmed.toUpperCase()
}

const adminRequestInit = (init: RequestInit = {}): RequestInit => {
  const token = getAuthToken()
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return {
    ...init,
    credentials: 'include',
    headers,
  }
}

const DEFAULT_COMPANY_ADDRESS = {
  name: 'Fixtract',
  street: '',
  city: '',
  postalCode: '',
  country: 'BE',
}

const DEFAULT_E_INVOICING = {
  peppolEnabled: false,
  provider: 'manual',
  peppolParticipantId: '',
  // null = the server's ODOO_COMPANY_ID default
  odooCompanyId: null as number | null,
  odooRecordPayments: false,
}

type OdooCompany = {
  id: number
  name: string
  vat?: string
  peppolCanSend?: boolean
  peppolState?: string
}

type CompanyAddressState = typeof DEFAULT_COMPANY_ADDRESS
type EInvoicingState = typeof DEFAULT_E_INVOICING

type EInvoicingResponse = Partial<EInvoicingState>

type PlatformSettingsFormState = {
  commissionPercent: number
  companyVatNumber: string
  companyAddress: CompanyAddressState
  eInvoicing: EInvoicingState
  supportChatEnabled: boolean
  lastModified: string | null
  version: number
}

const hydrateSettingsResponse = (data: {
  commissionPercent?: number
  companyVatNumber?: string
  companyAddress?: Partial<CompanyAddressState>
  eInvoicing?: EInvoicingResponse
  supportChatEnabled?: boolean
  lastModified?: string
  version?: number
}): PlatformSettingsFormState => ({
  commissionPercent: data.commissionPercent ?? 0,
  companyVatNumber: data.companyVatNumber || '',
  companyAddress: {
    ...DEFAULT_COMPANY_ADDRESS,
    ...(data.companyAddress || {}),
    country: normalizeCountryCode(data.companyAddress?.country ?? DEFAULT_COMPANY_ADDRESS.country),
  },
  eInvoicing: {
    ...DEFAULT_E_INVOICING,
    peppolEnabled: Boolean(data.eInvoicing?.peppolEnabled),
    provider: data.eInvoicing?.provider === 'odoo' ? 'odoo' : DEFAULT_E_INVOICING.provider,
    peppolParticipantId: data.eInvoicing?.peppolParticipantId || '',
    odooCompanyId: typeof data.eInvoicing?.odooCompanyId === 'number' ? data.eInvoicing.odooCompanyId : null,
    odooRecordPayments: data.eInvoicing?.odooRecordPayments === true,
  },
  supportChatEnabled: data.supportChatEnabled === true,
  lastModified: data.lastModified ?? null,
  version: data.version ?? 0,
})

const applySettingsState = (
  settings: PlatformSettingsFormState,
  setters: {
    setCommissionPercent: (value: number) => void
    setCompanyVatNumber: (value: string) => void
    setCompanyAddress: (value: CompanyAddressState) => void
    setEInvoicing: (value: EInvoicingState) => void
    setSupportChatEnabled: (value: boolean) => void
    setLastModified: (value: string | null) => void
    setVersion: (value: number) => void
  }
) => {
  setters.setCommissionPercent(settings.commissionPercent)
  setters.setCompanyVatNumber(settings.companyVatNumber)
  setters.setCompanyAddress(settings.companyAddress)
  setters.setEInvoicing(settings.eInvoicing)
  setters.setSupportChatEnabled(settings.supportChatEnabled)
  setters.setLastModified(settings.lastModified)
  setters.setVersion(settings.version)
}

export default function AdminSettingsPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [commissionPercent, setCommissionPercent] = useState<number>(0)
  const [companyVatNumber, setCompanyVatNumber] = useState('')
  const [companyAddress, setCompanyAddress] = useState({ ...DEFAULT_COMPANY_ADDRESS })
  const [eInvoicing, setEInvoicing] = useState({ ...DEFAULT_E_INVOICING })
  const [supportChatEnabled, setSupportChatEnabled] = useState(false)
  const [supportChatSaving, setSupportChatSaving] = useState(false)
  const [odooCompanies, setOdooCompanies] = useState<OdooCompany[]>([])
  const [odooCompaniesError, setOdooCompaniesError] = useState<string | null>(null)
  const [lastModified, setLastModified] = useState<string | null>(null)
  const [version, setVersion] = useState<number>(0)
  // Raw `autoConversion` from the API; the card owns its own draft and save.
  const [autoConversion, setAutoConversion] = useState<unknown>(undefined)

  useEffect(() => {
    if (!loading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/login')
    }
  }, [isAuthenticated, loading, user, router])

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/platform-settings`, adminRequestInit())
      if (response.ok) {
        const data = await response.json()
        if (!data?.data) {
          toast.error('We could not read the server response. Please try again.')
          return
        }
        setAutoConversion(data.data.autoConversion)
        applySettingsState(hydrateSettingsResponse(data.data), {
          setCommissionPercent,
          setCompanyVatNumber,
          setCompanyAddress,
          setEInvoicing,
          setSupportChatEnabled,
          setLastModified,
          setVersion,
        })
      } else {
        toast.error('Failed to load platform settings')
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      toast.error('Failed to load platform settings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      fetchSettings()
    }
  }, [isAuthenticated, user, fetchSettings])

  const isOdooProvider = eInvoicing.provider === 'odoo'
  useEffect(() => {
    if (!isOdooProvider || !isAuthenticated || user?.role !== 'admin') return
    let cancelled = false
    const loadOdooCompanies = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/platform-settings/odoo-companies`,
          adminRequestInit(),
        )
        const data = await response.json().catch(() => null)
        if (cancelled) return
        if (response.ok && Array.isArray(data?.data?.companies)) {
          setOdooCompanies(data.data.companies)
          setOdooCompaniesError(null)
        } else {
          setOdooCompaniesError(messageFromApiBody(data, 'Could not load the Odoo companies'))
        }
      } catch {
        if (!cancelled) setOdooCompaniesError('Could not load the Odoo companies')
      }
    }
    loadOdooCompanies()
    return () => {
      cancelled = true
    }
  }, [isOdooProvider, isAuthenticated, user])

  const selectedOdooCompany = odooCompanies.find((company) => company.id === eInvoicing.odooCompanyId)

  const handleSupportChatToggle = async (enabled: boolean) => {
    if (supportChatSaving) return
    const previous = supportChatEnabled
    setSupportChatEnabled(enabled)
    setSupportChatSaving(true)
    try {
      const data = await adminSetSupportChatEnabled(enabled)
      setSupportChatEnabled(data.supportChatEnabled)
      toast.success(data.supportChatEnabled ? 'Support chat enabled' : 'Support chat disabled')
    } catch (error) {
      setSupportChatEnabled(previous)
      toast.error(getErrorMessage(error, 'Failed to update the support chat setting'))
    } finally {
      setSupportChatSaving(false)
    }
  }

  const handleSave = async () => {
    if (commissionPercent < 0 || commissionPercent > 100) {
      toast.error('Commission must be between 0% and 100%')
      return
    }

    const trimmedVatNumber = companyVatNumber.trim()
    if (trimmedVatNumber) {
      const vatCheck = validateVATFormat(trimmedVatNumber)
      if (!vatCheck.valid) {
        toast.error(vatCheck.error || 'Invalid company VAT number')
        return
      }
    }

    const trimmedParticipantId = eInvoicing.peppolParticipantId.trim()
    if (eInvoicing.peppolEnabled) {
      if (!trimmedParticipantId) {
        toast.error('Peppol participant ID is required when Peppol e-invoicing is enabled')
        return
      }
      if (!/^[^\s:]+:[^\s:]+$/.test(trimmedParticipantId)) {
        toast.error('Peppol participant ID should use scheme:identifier format (e.g. 0208:BE0123456789)')
        return
      }
    }

    const trimmedAddress = {
      name: companyAddress.name.trim(),
      street: companyAddress.street.trim(),
      city: companyAddress.city.trim(),
      postalCode: companyAddress.postalCode.trim(),
      country: normalizeCountryCode(companyAddress.country),
    }
    if (!/^[A-Z]{2}$/.test(trimmedAddress.country)) {
      toast.error('Country must be an ISO 3166-1 alpha-2 code (e.g. BE)')
      return
    }
    if (!trimmedVatNumber || !trimmedAddress.name || !trimmedAddress.street || !trimmedAddress.city || !trimmedAddress.postalCode || !trimmedAddress.country) {
      toast.error('Company VAT number and full invoice issuer address are required')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/platform-settings`, adminRequestInit({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commissionPercent,
          companyVatNumber: trimmedVatNumber ? formatVATNumber(trimmedVatNumber) : '',
          companyAddress: trimmedAddress,
          eInvoicing: {
            ...eInvoicing,
            peppolParticipantId: trimmedParticipantId,
          },
        }),
      }))

      if (response.ok) {
        const data = await response.json()
        if (!data?.data) {
          toast.error('We could not read the server response. Please try again.')
          return
        }
        setAutoConversion(data.data.autoConversion)
        applySettingsState(hydrateSettingsResponse(data.data), {
          setCommissionPercent,
          setCompanyVatNumber,
          setCompanyAddress,
          setEInvoicing,
          setSupportChatEnabled,
          setLastModified,
          setVersion,
        })
        invalidateClientRequest('commission-rate')
        toast.success('Platform settings updated successfully')
      } else {
        const errorData = await response.json().catch(() => null)
        toast.error(messageFromApiBody(errorData, 'Failed to update settings'))
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to update settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (loading || !isAuthenticated || user?.role !== 'admin') {
    return null
  }

  // Live preview calculations
  const exampleAmount = 100
  const commissionAmount = (exampleAmount * commissionPercent / 100)
  const professionalAmount = exampleAmount - commissionAmount

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/admin')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Platform Settings
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage platform-wide configuration
            </p>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardHeader>
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-80" />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <Skeleton className="h-10 w-36 rounded-lg" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Euro className="h-5 w-5" />
                Commission
              </CardTitle>
              <CardDescription>
                Platform commission percentage deducted from each payment before transferring to the professional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Commission Input */}
              <div className="space-y-2">
                <Label htmlFor="commission">Commission Percentage</Label>
                <div className="flex items-center gap-2 max-w-xs">
                  <Input
                    id="commission"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(Number(e.target.value))}
                    className="text-lg"
                  />
                  <span className="text-lg font-medium text-gray-500">%</span>
                </div>
              </div>

              {/* Live Preview */}
              <div className="bg-gray-100 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Preview</p>
                <p className="text-sm text-gray-600">
                  On a <span className="font-semibold">&euro;{exampleAmount.toFixed(2)}</span> payment:
                </p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-gray-500">Platform commission:</span>{' '}
                    <span className="font-semibold text-blue-600">&euro;{commissionAmount.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Professional receives:</span>{' '}
                    <span className="font-semibold text-green-600">&euro;{professionalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Invoice issuer</h2>
                  <p className="text-sm text-gray-500">Fixtract company details printed on generated invoices.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name</Label>
                    <Input
                      id="company-name"
                      value={companyAddress.name}
                      onChange={(e) => setCompanyAddress(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-vat">VAT Number</Label>
                    <Input
                      id="company-vat"
                      value={companyVatNumber}
                      onChange={(e) => setCompanyVatNumber(e.target.value)}
                      placeholder="BE..."
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="company-street">Street Address</Label>
                    <Input
                      id="company-street"
                      value={companyAddress.street}
                      onChange={(e) => setCompanyAddress(prev => ({ ...prev, street: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-city">City</Label>
                    <Input
                      id="company-city"
                      value={companyAddress.city}
                      onChange={(e) => setCompanyAddress(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-postal">Postal Code</Label>
                    <Input
                      id="company-postal"
                      value={companyAddress.postalCode}
                      onChange={(e) => setCompanyAddress(prev => ({ ...prev, postalCode: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-country">Country (ISO code)</Label>
                    <Select
                      value={companyAddress.country}
                      onValueChange={(value) => setCompanyAddress(prev => ({ ...prev, country: value }))}
                    >
                      <SelectTrigger id="company-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {EU_COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.flag} {country.name} ({country.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {eInvoicing.provider === 'odoo' && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                    Odoo connection credentials are read from server environment variables
                    (<code className="text-xs">ODOO_API_URL</code>, <code className="text-xs">ODOO_API_KEY</code>).
                    Income accounts, taxes, and journals are discovered automatically from your Odoo company chart.
                  </div>
                )}
              </div>

              <div className="border-t pt-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">E-invoicing</h2>
                  <p className="text-sm text-gray-500">
                    Generate UBL artifacts and sync Belgian B2B invoices to Odoo Accounting for Peppol delivery.
                    When Odoo is selected, accounting IDs are resolved automatically from your Odoo company.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={eInvoicing.peppolEnabled}
                    onChange={(event) => setEInvoicing(prev => ({ ...prev, peppolEnabled: event.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  Enable Peppol e-invoicing metadata
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="einvoice-provider">Provider</Label>
                    <select
                      id="einvoice-provider"
                      value={eInvoicing.provider}
                      onChange={(event) => setEInvoicing(prev => ({ ...prev, provider: event.target.value }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="manual">Manual upload/export</option>
                      <option value="odoo">Odoo Accounting</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="peppol-id">Peppol Participant ID</Label>
                    <Input
                      id="peppol-id"
                      value={eInvoicing.peppolParticipantId}
                      onChange={(event) => setEInvoicing(prev => ({ ...prev, peppolParticipantId: event.target.value }))}
                      placeholder="e.g. 0208:BE0123456789"
                    />
                  </div>
                </div>
                {isOdooProvider && (
                  <div className="space-y-2">
                    <Label htmlFor="odoo-company">Odoo company</Label>
                    <select
                      id="odoo-company"
                      value={eInvoicing.odooCompanyId ?? ''}
                      onChange={(event) => setEInvoicing(prev => ({
                        ...prev,
                        odooCompanyId: event.target.value ? Number(event.target.value) : null,
                      }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Server default (ODOO_COMPANY_ID)</option>
                      {eInvoicing.odooCompanyId != null && !selectedOdooCompany && (
                        <option value={eInvoicing.odooCompanyId}>Company #{eInvoicing.odooCompanyId}</option>
                      )}
                      {odooCompanies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name} (#{company.id}){company.peppolCanSend === false ? ' - not registered on Peppol' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500">
                      Fixtract invoices and self-bills are booked in, and sent on Peppol from, this Odoo company.
                    </p>
                    {selectedOdooCompany?.peppolCanSend === false && (
                      <p className="text-xs text-amber-700">
                        {selectedOdooCompany.name} cannot send on Peppol yet. Invoices will fail until its Peppol
                        registration is completed in Odoo (Accounting &gt; Settings &gt; Peppol).
                      </p>
                    )}
                    {odooCompaniesError && <p className="text-xs text-red-600">{odooCompaniesError}</p>}
                    <label className="flex items-start gap-2 pt-2 text-sm">
                      <input
                        type="checkbox"
                        checked={eInvoicing.odooRecordPayments}
                        onChange={(event) => setEInvoicing(prev => ({ ...prev, odooRecordPayments: event.target.checked }))}
                        className="mt-0.5 rounded border-gray-300"
                      />
                      <span>
                        Book Stripe payments in Odoo
                        <span className="block text-xs text-gray-500">
                          Registers what customers paid and what professionals were paid out as payments in a
                          &quot;Stripe (Fixtract)&quot; bank journal (created in the selected company if missing), so Odoo
                          shows those invoices as paid. This changes the company&apos;s bookkeeping; agree it with the accountant first.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Metadata */}
              {lastModified && (
                <p className="text-xs text-gray-400">
                  Last updated: {new Date(lastModified).toLocaleString()} &middot; Version {version}
                </p>
              )}

              {/* Save Button */}
              <div className="pt-2">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && <AutoConversionSettingsCard initial={autoConversion} />}

        {!isLoading && user?.adminRole === 'super' && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LifeBuoy className="h-5 w-5" />
                Support chat
              </CardTitle>
              <CardDescription>
                Enable the support chat tab for professional accounts. Customers keep ticket support.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={supportChatEnabled}
                  onChange={(event) => void handleSupportChatToggle(event.target.checked)}
                  disabled={supportChatSaving}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <span className="font-medium text-gray-900">Enable professional support chat</span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    The server enforces this for new support chats and messages. Historical conversations remain readable.
                  </span>
                </span>
              </label>
              <p className="text-xs text-gray-500">
                This is a superadmin-only setting and is off by default.
              </p>
              {supportChatSaving && (
                <p className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
