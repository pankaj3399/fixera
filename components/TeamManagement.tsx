'use client'

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import WeeklyAvailabilityCalendar, { CalendarEvent } from "@/components/calendar/WeeklyAvailabilityCalendar"
import {
  User,
  Mail,
  UserPlus,
  Calendar,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Loader2,
  Users,
  Trash2,
  UserX,
  X,
  Plus,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { toast } from "sonner"
import { toLocalInputValue, getDateValue, toIsoDateTime, type DateInput } from "@/lib/dateUtils"
import { getScheduleWindow, getVisibleScheduleDays } from "@/lib/scheduleUtils"
import { useFormatLocale } from "@/lib/i18n/useFormatLocale"

type Day =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

interface DayAvailability {
  available: boolean;
  startTime: string;
  endTime: string;
}

type WeeklyAvailability = {
  [day in Day]: DayAvailability;
};

interface Employee {
  _id: string
  name: string
  email?: string
  hasEmail: boolean
  role: string
  availabilityPreference: 'personal' | 'same_as_company'
  invitedAt: string
  acceptedAt?: string
  isActive: boolean
  managedByCompany: boolean
  availability?:WeeklyAvailability
  blockedDates?: Date[]
  blockedRanges?: {
    startDate: string;
    endDate: string;
    reason?: string;
  }[]
  bookingBlockedRanges?: {
    startDate: string;
    endDate: string;
    reason?: string;
    bookingId?: string;
    bookingNumber?: string;
    customerName?: string;
    location?: {
      address?: string;
      city?: string;
      country?: string;
      postalCode?: string;
    };
  }[]
}

export default function EmployeeManagement() {
  const router = useRouter()
  const t = useTranslations("proTools")
  const tCalendar = useTranslations("calendar")
  const { intl } = useFormatLocale()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  
  // Invite form states
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    hasEmail: true
  })

  // Password reset states
  const [resetPasswordDialog, setResetPasswordDialog] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  // Email update states
  const [emailDialog, setEmailDialog] = useState<{memberId: string, memberName: string, currentEmail?: string} | null>(null)
  const [emailValue, setEmailValue] = useState('')
  const [updatingEmail, setUpdatingEmail] = useState(false)

  // Deactivation confirmation states
  const [deactivateDialog, setDeactivateDialog] = useState<{memberId: string, memberName: string} | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  // Removal confirmation states
  const [removeDialog, setRemoveDialog] = useState<{memberId: string, memberName: string} | null>(null)
  const [removing, setRemoving] = useState(false)

  // Availability management states
  const [availabilityDialog, setAvailabilityDialog] = useState<Employee | null>(null)
  const [savingAvailability, setSavingAvailability] = useState(false)

  const [blockedRanges, setBlockedRanges] = useState<{startDate: string, endDate: string, reason?: string}[]>([])
  const [newBlockedRange, setNewBlockedRange] = useState({startDate: '', endDate: '', reason: ''})
  const [editingRange, setEditingRange] = useState<{
    index: number;
    startValue: string;
    endValue: string;
    reason: string;
  } | null>(null)

  const scheduleWindow = useMemo(
    () => getScheduleWindow(availabilityDialog?.availability),
    [availabilityDialog?.availability]
  )
  const visibleDays = useMemo(
    () => getVisibleScheduleDays(availabilityDialog?.availability),
    [availabilityDialog?.availability]
  )

  // Pagination states
  const EMPLOYEES_PER_PAGE = 10
  const [employeesPage, setEmployeesPage] = useState(1)

  // Clamp pagination states when list lengths shrink
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(employees.length / EMPLOYEES_PER_PAGE))
    if (employeesPage > maxPage) {
      setEmployeesPage(maxPage)
    }
  }, [employees.length, employeesPage])


  // Fetch employees
  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/list?includeInactive=true`, {
        method: 'GET',
        credentials: 'include'
      })

      const data = await response.json()

      if (data.success) {
        setEmployees(data.data.employees || [])
      } else {
        console.error('Failed to fetch employees:', data.msg)
      }
    } catch (error) {
      console.error('Error fetching employees:', error)
      toast.error(t("teamManagement.toast.loadFailed"))
    } finally {
      setLoading(false)
    }
  }

  // Invite employee
  const inviteEmployee = async () => {
    try {
      setInviting(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(inviteForm)
      })

      const data = await response.json()

      if (data.success) {
        toast.success(
          inviteForm.hasEmail
            ? t("teamManagement.toast.invitationSent")
            : t("teamManagement.toast.employeeAdded")
        )
        setInviteDialogOpen(false)
        setInviteForm({ name: '', email: '', hasEmail: true })
        fetchEmployees() // Refresh the list
      } else {
        toast.error(data.msg || t("teamManagement.toast.inviteFailed"))
      }
    } catch (error) {
      console.error('Error inviting employee:', error)
      toast.error(t("teamManagement.toast.inviteFailed"))
    } finally {
      setInviting(false)
    }
  }

  // Handle deactivation button click
  const handleDeactivate = (employeeId: string, employeeName: string) => {
    setDeactivateDialog({ memberId: employeeId, memberName: employeeName })
  }

  // Handle reactivation
  const handleReactivate = async (employeeId: string) => {
    await toggleEmployeeStatus(employeeId, true)
  }

  // Toggle employee status
  const toggleEmployeeStatus = async (employeeId: string, isActive: boolean) => {
    try {
      setDeactivating(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/${employeeId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ isActive })
      })

      const data = await response.json()

      if (data.success) {
        toast.success(
          isActive
            ? t("teamManagement.toast.activated")
            : t("teamManagement.toast.deactivated")
        )
        fetchEmployees() // Refresh the list
      } else {
        toast.error(data.msg || t("teamManagement.toast.statusFailed"))
      }
    } catch (error) {
      console.error('Error updating employee status:', error)
      toast.error(t("teamManagement.toast.statusFailed"))
    } finally {
      setDeactivating(false)
    }
  }

  // Confirm deactivation
  const confirmDeactivation = async () => {
    if (!deactivateDialog) return

    await toggleEmployeeStatus(deactivateDialog.memberId, false)
    setDeactivateDialog(null)
  }

  // Reset employee password
  const resetEmployeePassword = async () => {
    if (!resetPasswordDialog || !newPassword) return

    try {
      setResettingPassword(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/reset-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          employeeId: resetPasswordDialog,
          newPassword
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success(t("teamManagement.toast.passwordReset"))
        setResetPasswordDialog(null)
        setNewPassword('')
      } else {
        toast.error(data.msg || t("teamManagement.toast.passwordResetFailed"))
      }
    } catch (error) {
      console.error('Error resetting password:', error)
      toast.error(t("teamManagement.toast.passwordResetFailed"))
    } finally {
      setResettingPassword(false)
    }
  }

  const openEmailDialog = (employee: Employee) => {
    setEmailDialog({
      memberId: employee._id,
      memberName: employee.name,
      currentEmail: employee.email
    })
    setEmailValue(employee.email || '')
  }

  const updateEmployeeEmail = async () => {
    if (!emailDialog) return
    if (!emailValue.trim()) {
      toast.error(t("teamManagement.toast.emailRequired"))
      return
    }

    try {
      setUpdatingEmail(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/${emailDialog.memberId}/email`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: emailValue.trim() })
      })

      const data = await response.json()

      if (data.success) {
        toast.success(t("teamManagement.toast.emailUpdated"))
        setEmailDialog(null)
        setEmailValue('')
        fetchEmployees()
      } else {
        toast.error(data.msg || t("teamManagement.toast.emailUpdateFailed"))
      }
    } catch (error) {
      console.error('Error updating employee email:', error)
      toast.error(t("teamManagement.toast.emailUpdateFailed"))
    } finally {
      setUpdatingEmail(false)
    }
  }

  const handleRemove = (employeeId: string, employeeName: string) => {
    setRemoveDialog({ memberId: employeeId, memberName: employeeName })
  }

  const confirmRemove = async () => {
    if (!removeDialog) return

    try {
      setRemoving(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/${removeDialog.memberId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      const data = await response.json()

      if (data.success) {
        toast.success(t("teamManagement.toast.employeeRemoved"))
        setRemoveDialog(null)
        fetchEmployees()
      } else {
        toast.error(data.msg || t("teamManagement.toast.removeFailed"))
      }
    } catch (error) {
      console.error('Error removing employee:', error)
      toast.error(t("teamManagement.toast.removeFailed"))
    } finally {
      setRemoving(false)
    }
  }

  const formatDateTimeSafe = (value: DateInput): string => {
    const dateStr = getDateValue(value);
    if (!dateStr) return t("teamManagement.invalidDate");
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return t("teamManagement.invalidDate");
    return parsed.toLocaleString(intl);
  };

  // Open availability dialog
  const openAvailabilityDialog = (employee: Employee) => {
    setAvailabilityDialog(employee)
    // Reset pagination pages
    const mergedRanges = new Map<string, { startDate: string; endDate: string; reason?: string }>();
    const addRange = (range: { startDate: string; endDate: string; reason?: string }) => {
      const key = `${range.startDate}-${range.endDate}-${range.reason || ''}`;
      if (!mergedRanges.has(key)) {
        mergedRanges.set(key, range);
      }
    };

    if (employee.blockedRanges) {
      employee.blockedRanges.forEach((range) => {
        const startDate = toIsoDateTime(range.startDate, false);
        const endDate = toIsoDateTime(range.endDate, true);
        if (startDate && endDate) {
          addRange({ startDate, endDate, reason: range.reason });
        }
      });
    }

    if (employee.blockedDates) {
      employee.blockedDates.forEach((dateValue) => {
        const startDate = toIsoDateTime(dateValue, false);
        const endDate = toIsoDateTime(dateValue, true);
        if (startDate && endDate) {
          addRange({ startDate, endDate });
        }
      });
    }

    setBlockedRanges(Array.from(mergedRanges.values()))
  }

  // Add blocked range
  const addBlockedRange = () => {
    if (!newBlockedRange.startDate || !newBlockedRange.endDate) {
      toast.error(t("teamManagement.validation.selectStartEnd"))
      return
    }
    if (new Date(newBlockedRange.startDate) >= new Date(newBlockedRange.endDate)) {
      toast.error(t("teamManagement.validation.startBeforeEnd"))
      return
    }
    setBlockedRanges(prev => [...prev, {
      startDate: new Date(newBlockedRange.startDate).toISOString(),
      endDate: new Date(newBlockedRange.endDate).toISOString(),
      reason: newBlockedRange.reason || undefined
    }])
    setNewBlockedRange({startDate: '', endDate: '', reason: ''})
  }

  // Remove blocked range
  const removeBlockedRange = (index: number) => {
    setBlockedRanges(prev => prev.filter((_, i) => i !== index))
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

  const applyEditRange = () => {
    if (!editingRange) return
    const { index, startValue, endValue, reason } = editingRange
    if (!startValue || !endValue) {
      toast.error(t("teamManagement.validation.selectStartEndValues"))
      return
    }
    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error(t("teamManagement.validation.validStartEnd"))
      return
    }
    if (startDate >= endDate) {
      toast.error(t("teamManagement.validation.startBeforeEnd"))
      return
    }
    setBlockedRanges(prev =>
      prev.map((range, idx) =>
        idx === index
          ? {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              reason: reason || undefined
            }
          : range
      )
    )
    setEditingRange(null)
  }

  const removeEditingRange = () => {
    if (!editingRange) return
    setBlockedRanges(prev => prev.filter((_, idx) => idx !== editingRange.index))
    setEditingRange(null)
  }

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = []

    blockedRanges.forEach((range, index) => {
      const start = new Date(range.startDate)
      const end = new Date(range.endDate)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return
      events.push({
        id: `personal-${index}`,
        type: 'personal',
        title: tCalendar('eventTitles.personalBlock'),
        start,
        end,
        meta: { note: range.reason, rangeIndex: index }
      })
    })

    availabilityDialog?.bookingBlockedRanges?.forEach((range, index) => {
      const start = new Date(range.startDate)
      const end = new Date(range.endDate)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return
      const type = range.reason === 'booking-buffer' ? 'booking-buffer' : 'booking'
      events.push({
        id: `booking-${range.bookingId || index}`,
        type,
        title: type === 'booking-buffer' ? tCalendar('eventTitles.buffer') : tCalendar('eventTitles.booking'),
        start,
        end,
        meta: {
          bookingId: range.bookingId,
          bookingNumber: range.bookingNumber,
          customerName: range.customerName,
          location: range.location
        }
      })
    })

    return events
  }, [availabilityDialog?.bookingBlockedRanges, blockedRanges, tCalendar])

  // Save employee blocked dates (employees follow company weekly schedule)
  const saveEmployeeAvailability = async () => {
    if (!availabilityDialog) return

    try {
      setSavingAvailability(true)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/${availabilityDialog._id}/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          blockedDates: [],
          blockedRanges
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success(t("teamManagement.toast.availabilityUpdated"))
        setAvailabilityDialog(null)
        fetchEmployees() // Refresh the list
      } else {
        toast.error(data.msg || t("teamManagement.toast.availabilityUpdateFailed"))
      }
    } catch (error) {
      console.error('Error updating availability:', error)
      toast.error(t("teamManagement.toast.availabilityUpdateFailed"))
    } finally {
      setSavingAvailability(false)
    }
  }

  // Load employees on component mount
  useEffect(() => {
    fetchEmployees()
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("teamManagement.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 py-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gray-200/70 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-gray-200/70 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-gray-200/70 animate-pulse" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t("teamManagement.title")}
              </CardTitle>
              <CardDescription>
                {t("teamManagement.description")}
              </CardDescription>
            </div>

            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  {t("teamManagement.inviteEmployee")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("teamManagement.inviteEmployee")}</DialogTitle>
                  <DialogDescription>
                    {t("teamManagement.inviteDialog.description")}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="memberName">{t("teamManagement.inviteDialog.nameLabel")}</Label>
                    <Input
                      id="memberName"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={t("teamManagement.inviteDialog.namePlaceholder")}
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center space-x-2 mb-3">
                      <Switch
                        id="hasEmail"
                        checked={inviteForm.hasEmail}
                        onCheckedChange={(checked) => setInviteForm(prev => ({ 
                          ...prev, 
                          hasEmail: checked,
                          email: checked ? prev.email : ''
                        }))}
                      />
                      <Label htmlFor="hasEmail">{t("teamManagement.inviteDialog.hasEmail")}</Label>
                    </div>
                    
                    {inviteForm.hasEmail ? (
                      <div>
                        <Label htmlFor="memberEmail">{t("teamManagement.inviteDialog.emailLabel")}</Label>
                        <Input
                          id="memberEmail"
                          type="email"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                          placeholder={t("teamManagement.inviteDialog.emailPlaceholder")}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("teamManagement.inviteDialog.credentialsNote")}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-muted p-3 rounded-md">
                        <div className="flex items-center gap-2 text-sm">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                          <span className="font-medium">{t("teamManagement.inviteDialog.companyManaged")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("teamManagement.inviteDialog.companyManagedNote")}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setInviteDialogOpen(false)}
                      disabled={inviting}
                    >
                      {t("teamManagement.cancel")}
                    </Button>
                    <Button
                      onClick={inviteEmployee}
                      disabled={!inviteForm.name || (inviteForm.hasEmail && !inviteForm.email) || inviting}
                    >
                      {inviting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {inviteForm.hasEmail
                        ? t("teamManagement.inviteDialog.sendInvitation")
                        : t("teamManagement.inviteDialog.addEmployee")}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {employees.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">{t("teamManagement.empty.title")}</h3>
              <p className="text-muted-foreground mb-4">
                {t("teamManagement.empty.description")}
              </p>
              <Button onClick={() => setInviteDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t("teamManagement.inviteEmployee")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {t("teamManagement.employeeCount", { count: employees.length })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchEmployees}
                  className="h-8"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              {(() => {
                const totalEmployeesPages = Math.ceil(employees.length / EMPLOYEES_PER_PAGE)
                const paginatedEmployees = employees.slice(
                  (employeesPage - 1) * EMPLOYEES_PER_PAGE,
                  employeesPage * EMPLOYEES_PER_PAGE
                )
                return (
                  <>
                    <div className="border rounded-lg overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("teamManagement.table.name")}</TableHead>
                            <TableHead>{t("teamManagement.table.contact")}</TableHead>
                            <TableHead>{t("teamManagement.table.status")}</TableHead>
                            <TableHead>{t("teamManagement.table.actions")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedEmployees.map((member) => (
                      <TableRow key={member._id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium">{member.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {member.managedByCompany
                                  ? t("teamManagement.managedByCompany")
                                  : t("teamManagement.selfManaged")}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell>
                          {member.hasEmail ? (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{member.email}</span>
                            </div>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              {t("teamManagement.noEmail")}
                            </Badge>
                          )}
                        </TableCell>
                        
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {member.isActive ? (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <Badge variant="default" className="bg-green-100 text-green-800">
                                  {t("teamManagement.status.active")}
                                </Badge>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-4 w-4 text-gray-500" />
                                <Badge variant="secondary">
                                  {t("teamManagement.status.inactive")}
                                </Badge>
                              </>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAvailabilityDialog(member)}
                              className="h-8 px-2"
                              title={t("teamManagement.actions.manageAvailability")}
                            >
                              <Calendar className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEmailDialog(member)}
                              className="h-8 px-2"
                              disabled={updatingEmail}
                              title={member.hasEmail
                                ? t("teamManagement.actions.changeEmail")
                                : t("teamManagement.actions.linkEmail")}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>

                            {member.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeactivate(member._id, member.name)}
                                className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                disabled={deactivating}
                                title={t("teamManagement.actions.deactivate")}
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReactivate(member._id)}
                                className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                disabled={deactivating}
                                title={t("teamManagement.actions.reactivate")}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}

                            {member.hasEmail && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setResetPasswordDialog(member._id)}
                                className="h-8 px-2"
                                title={t("teamManagement.actions.resetPassword")}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemove(member._id, member.name)}
                              className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={removing}
                              title={t("teamManagement.actions.remove")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Employees Pagination */}
                  {totalEmployeesPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <div className="text-sm text-muted-foreground">
                        {t("teamManagement.pagination.showing", {
                          from: (employeesPage - 1) * EMPLOYEES_PER_PAGE + 1,
                          to: Math.min(employeesPage * EMPLOYEES_PER_PAGE, employees.length),
                          total: employees.length
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEmployeesPage(p => Math.max(1, p - 1))}
                          disabled={employeesPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          {t("teamManagement.pagination.previous")}
                        </Button>
                        <span className="text-sm">
                          {t("teamManagement.pagination.pageOf", {
                            page: employeesPage,
                            totalPages: totalEmployeesPages
                          })}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEmployeesPage(p => Math.min(totalEmployeesPages, p + 1))}
                          disabled={employeesPage === totalEmployeesPages}
                        >
                          {t("teamManagement.pagination.next")}
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Reset Dialog */}
      <Dialog open={!!resetPasswordDialog} onOpenChange={() => setResetPasswordDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teamManagement.passwordDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("teamManagement.passwordDialog.description")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="newPassword">{t("teamManagement.passwordDialog.newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("teamManagement.passwordDialog.placeholder")}
                minLength={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("teamManagement.passwordDialog.hint")}
              </p>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setResetPasswordDialog(null)
                  setNewPassword('')
                }}
                disabled={resettingPassword}
              >
                {t("teamManagement.cancel")}
              </Button>
              <Button
                onClick={resetEmployeePassword}
                disabled={!newPassword || newPassword.length < 6 || resettingPassword}
              >
                {resettingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t("teamManagement.passwordDialog.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Update Dialog */}
      <Dialog
        open={!!emailDialog}
        onOpenChange={(open) => {
          if (!open) {
            setEmailDialog(null)
            setEmailValue('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {emailDialog?.currentEmail
                ? t("teamManagement.emailDialog.changeTitle")
                : t("teamManagement.emailDialog.linkTitle")}
            </DialogTitle>
            <DialogDescription>
              {emailDialog?.currentEmail
                ? t("teamManagement.emailDialog.updateDescription", { name: emailDialog?.memberName ?? "" })
                : t("teamManagement.emailDialog.linkDescription", { name: emailDialog?.memberName ?? "" })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="employeeEmail">{t("teamManagement.emailDialog.label")}</Label>
              <Input
                id="employeeEmail"
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                placeholder={t("teamManagement.emailDialog.placeholder")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("teamManagement.emailDialog.note")}
            </p>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setEmailDialog(null)
                  setEmailValue('')
                }}
                disabled={updatingEmail}
              >
                {t("teamManagement.cancel")}
              </Button>
              <Button
                onClick={updateEmployeeEmail}
                disabled={!emailValue.trim() || updatingEmail}
              >
                {updatingEmail && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t("teamManagement.emailDialog.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivation Confirmation Dialog */}
      <Dialog open={!!deactivateDialog} onOpenChange={() => setDeactivateDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teamManagement.deactivateDialog.title")}</DialogTitle>
            <DialogDescription>
              {t.rich("teamManagement.deactivateDialog.confirm", {
                name: deactivateDialog?.memberName ?? "",
                strong: (chunks) => <strong>{chunks}</strong>
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {t("teamManagement.deactivateDialog.warningTitle")}
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    {t("teamManagement.deactivateDialog.warningBody")}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setDeactivateDialog(null)}
                disabled={deactivating}
              >
                {t("teamManagement.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeactivation}
                disabled={deactivating}
              >
                {deactivating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t("teamManagement.deactivateDialog.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Removal Confirmation Dialog */}
      <Dialog open={!!removeDialog} onOpenChange={() => setRemoveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teamManagement.removeDialog.title")}</DialogTitle>
            <DialogDescription>
              {t.rich("teamManagement.removeDialog.confirm", {
                name: removeDialog?.memberName ?? "",
                strong: (chunks) => <strong>{chunks}</strong>
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">
                    {t("teamManagement.removeDialog.warningTitle")}
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    {t("teamManagement.removeDialog.warningBody")}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setRemoveDialog(null)}
                disabled={removing}
              >
                {t("teamManagement.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRemove}
                disabled={removing}
              >
                {removing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t("teamManagement.removeDialog.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Availability Management Dialog */}
      <Dialog open={!!availabilityDialog} onOpenChange={() => setAvailabilityDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("teamManagement.availabilityDialog.title", { name: availabilityDialog?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("teamManagement.availabilityDialog.description")}
            </DialogDescription>
          </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-3">
              <Label className="text-base font-medium">{t("teamManagement.availabilityDialog.addBlockedPeriod")}</Label>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="employee-range-start">{t("teamManagement.availabilityDialog.start")}</Label>
                  <Input
                    id="employee-range-start"
                    type="datetime-local"
                    value={newBlockedRange.startDate}
                    onChange={(e) => setNewBlockedRange(prev => ({...prev, startDate: e.target.value}))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="employee-range-end">{t("teamManagement.availabilityDialog.end")}</Label>
                  <Input
                    id="employee-range-end"
                    type="datetime-local"
                    value={newBlockedRange.endDate}
                    onChange={(e) => setNewBlockedRange(prev => ({...prev, endDate: e.target.value}))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="employee-range-reason">{t("teamManagement.availabilityDialog.reasonOptional")}</Label>
                  <Input
                    id="employee-range-reason"
                    value={newBlockedRange.reason}
                    onChange={(e) => setNewBlockedRange(prev => ({...prev, reason: e.target.value}))}
                    placeholder={t("teamManagement.availabilityDialog.reasonPlaceholder")}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={addBlockedRange} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  {t("teamManagement.availabilityDialog.addBlock")}
                </Button>
              </div>
            </div>

            <WeeklyAvailabilityCalendar
              title={tCalendar('weeklyAvailabilityCalendar.defaultTitle')}
              description={tCalendar('weeklyAvailabilityCalendar.description')}
              events={calendarEvents}
              dayStart={scheduleWindow.dayStart}
              dayEnd={scheduleWindow.dayEnd}
              visibleDays={visibleDays}
              onEventClick={(event) => {
                if (event.type === 'personal' && typeof event.meta?.rangeIndex === 'number') {
                  openEditRange(event.meta.rangeIndex)
                }
                if (
                  (event.type === 'booking' || event.type === 'booking-buffer') &&
                  event.meta?.bookingId
                ) {
                  router.push(`/bookings/${event.meta.bookingId}`)
                }
              }}
            />

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {t("teamManagement.availabilityDialog.workingHoursNote")}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setAvailabilityDialog(null)}
                disabled={savingAvailability}
              >
                {t("teamManagement.cancel")}
              </Button>
              <Button
                onClick={saveEmployeeAvailability}
                disabled={savingAvailability}
              >
                {savingAvailability && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t("teamManagement.availabilityDialog.saveAvailability")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Blocked Period Dialog */}
      <Dialog
        open={!!editingRange}
        onOpenChange={(open) => {
          if (!open) setEditingRange(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teamManagement.editBlockDialog.title")}</DialogTitle>
            <DialogDescription>{t("teamManagement.editBlockDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-employee-start">{t("teamManagement.editBlockDialog.start")}</Label>
                <Input
                  id="edit-employee-start"
                  type="datetime-local"
                  value={editingRange?.startValue || ''}
                  onChange={(e) =>
                    setEditingRange((prev) =>
                      prev ? { ...prev, startValue: e.target.value } : prev
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-employee-end">{t("teamManagement.editBlockDialog.end")}</Label>
                <Input
                  id="edit-employee-end"
                  type="datetime-local"
                  value={editingRange?.endValue || ''}
                  onChange={(e) =>
                    setEditingRange((prev) =>
                      prev ? { ...prev, endValue: e.target.value } : prev
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-employee-reason">{t("teamManagement.editBlockDialog.reasonOptional")}</Label>
                <Input
                  id="edit-employee-reason"
                  value={editingRange?.reason || ''}
                  onChange={(e) =>
                    setEditingRange((prev) =>
                      prev ? { ...prev, reason: e.target.value } : prev
                    )
                  }
                  placeholder={t("teamManagement.editBlockDialog.reasonPlaceholder")}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="destructive" onClick={removeEditingRange}>
                {t("teamManagement.editBlockDialog.removeBlock")}
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setEditingRange(null)}>
                  {t("teamManagement.cancel")}
                </Button>
                <Button onClick={applyEditRange}>{t("teamManagement.editBlockDialog.saveChanges")}</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
