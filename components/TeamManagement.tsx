'use client'

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
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
  X,
  Plus,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { toast } from "sonner"

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
  }[]
}

// Safe date formatting helper to handle invalid dates
// Handles date-only strings (YYYY-MM-DD) as local dates to avoid timezone shift
// Also handles MongoDB Extended JSON format ({$date: "..."})
const formatDateSafe = (dateStr: string | { $date: string } | undefined | null): string => {
  if (!dateStr) return 'Invalid Date';
  try {
    let dateValue: string;

    // Handle MongoDB Extended JSON format where date is {$date: "ISO string"}
    if (typeof dateStr === 'object' && dateStr !== null && '$date' in dateStr) {
      dateValue = dateStr.$date;
    } else if (typeof dateStr === 'string') {
      dateValue = dateStr;
    } else {
      return 'Invalid Date';
    }

    let date: Date;

    // Check if it's a date-only string (YYYY-MM-DD) without time component
    // These should be parsed as local dates to avoid UTC interpretation shifting the day
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-').map(Number);
      date = new Date(year, month - 1, day); // month is 0-indexed
    } else {
      // Full ISO timestamp or other format - parse normally
      date = new Date(dateValue);
    }

    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString();
  } catch {
    return 'Invalid Date';
  }
};

// Canonical date value extractor - handles string, Date, {$date: string}, null, undefined
// Returns validated date string or null
type DateInput = string | Date | { $date: string } | null | undefined;

const getDateValue = (dateValue: DateInput): string | null => {
  if (!dateValue) return null;

  // Handle MongoDB Extended JSON format {$date: "..."}
  if (typeof dateValue === 'object' && dateValue !== null && '$date' in dateValue) {
    const parsed = new Date(dateValue.$date);
    return isNaN(parsed.getTime()) ? null : dateValue.$date;
  }

  // Handle Date objects
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue.toISOString();
  }

  // Handle string dates - validate by parsing
  if (typeof dateValue === 'string') {
    const parsed = new Date(dateValue);
    return isNaN(parsed.getTime()) ? null : dateValue;
  }

  return null;
};

// Check if a date range has valid dates
// Handles string, Date, and MongoDB Extended JSON format ({$date: "..."})
const isValidDateRange = (range: { startDate: DateInput; endDate: DateInput }): boolean => {
  const startStr = getDateValue(range.startDate);
  const endStr = getDateValue(range.endDate);
  if (!startStr || !endStr) return false;
  const start = new Date(startStr);
  const end = new Date(endStr);
  return !isNaN(start.getTime()) && !isNaN(end.getTime());
};

export default function EmployeeManagement() {
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

  // Deactivation confirmation states
  const [deactivateDialog, setDeactivateDialog] = useState<{memberId: string, memberName: string} | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  // Availability management states
  const [availabilityDialog, setAvailabilityDialog] = useState<Employee | null>(null)
  const [savingAvailability, setSavingAvailability] = useState(false)

  const [blockedDates, setBlockedDates] = useState<{date: string, reason?: string}[]>([])
  const [blockedRanges, setBlockedRanges] = useState<{startDate: string, endDate: string, reason?: string}[]>([])
  const [newBlockedDate, setNewBlockedDate] = useState({date: '', reason: ''})
  const [newBlockedRange, setNewBlockedRange] = useState({startDate: '', endDate: '', reason: ''})

  // Pagination states
  const EMPLOYEES_PER_PAGE = 10
  const ITEMS_PER_PAGE = 5
  const [employeesPage, setEmployeesPage] = useState(1)
  const [blockedDatesPage, setBlockedDatesPage] = useState(1)
  const [blockedRangesPage, setBlockedRangesPage] = useState(1)
  const [bookingBlockedRangesPage, setBookingBlockedRangesPage] = useState(1)

  // Clamp pagination states when list lengths shrink
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(employees.length / EMPLOYEES_PER_PAGE))
    if (employeesPage > maxPage) {
      setEmployeesPage(maxPage)
    }
  }, [employees.length, employeesPage])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(blockedDates.length / ITEMS_PER_PAGE))
    if (blockedDatesPage > maxPage) {
      setBlockedDatesPage(maxPage)
    }
  }, [blockedDates.length, blockedDatesPage])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(blockedRanges.length / ITEMS_PER_PAGE))
    if (blockedRangesPage > maxPage) {
      setBlockedRangesPage(maxPage)
    }
  }, [blockedRanges.length, blockedRangesPage])

  useEffect(() => {
    const bookingRangesLength = availabilityDialog?.bookingBlockedRanges?.length ?? 0
    const maxPage = Math.max(1, Math.ceil(bookingRangesLength / ITEMS_PER_PAGE))
    if (bookingBlockedRangesPage > maxPage) {
      setBookingBlockedRangesPage(maxPage)
    }
  }, [availabilityDialog?.bookingBlockedRanges?.length, bookingBlockedRangesPage])

  // Fetch employees
  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/employee/list`, {
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
      toast.error('Failed to load employees')
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
            ? 'Employee invitation sent successfully!'
            : 'Employee added successfully!'
        )
        setInviteDialogOpen(false)
        setInviteForm({ name: '', email: '', hasEmail: true })
        fetchEmployees() // Refresh the list
      } else {
        toast.error(data.msg || 'Failed to invite employee')
      }
    } catch (error) {
      console.error('Error inviting employee:', error)
      toast.error('Failed to invite employee')
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
        toast.success(`Employee ${isActive ? 'activated' : 'deactivated'} successfully`)
        fetchEmployees() // Refresh the list
      } else {
        toast.error(data.msg || 'Failed to update employee status')
      }
    } catch (error) {
      console.error('Error updating employee status:', error)
      toast.error('Failed to update employee status')
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
        toast.success('Password reset successfully')
        setResetPasswordDialog(null)
        setNewPassword('')
      } else {
        toast.error(data.msg || 'Failed to reset password')
      }
    } catch (error) {
      console.error('Error resetting password:', error)
      toast.error('Failed to reset password')
    } finally {
      setResettingPassword(false)
    }
  }

  // Helper to format Date to local YYYY-MM-DD string (avoids UTC timezone shift)
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to extract date string from various formats (string, Date, {$date: "..."})
  // Returns local date string to avoid UTC timezone issues with date-only fields
  const extractDateValue = (d: string | Date | { $date: string } | null | undefined): string | null => {
    if (!d) return null;
    // Handle MongoDB Extended JSON format {$date: "..."}
    if (typeof d === 'object' && d !== null && '$date' in d) {
      return d.$date;
    }
    // Handle string - return as-is (preserve original format)
    if (typeof d === 'string') {
      return d;
    }
    // Handle Date object - use local date formatting to avoid UTC shift
    if (d instanceof Date && !isNaN(d.getTime())) {
      return formatLocalDate(d);
    }
    // Try to parse and use local date formatting
    const parsed = new Date(d as unknown as string);
    return isNaN(parsed.getTime()) ? null : formatLocalDate(parsed);
  };

  // Open availability dialog
  const openAvailabilityDialog = (employee: Employee) => {
    setAvailabilityDialog(employee)
    // Reset pagination pages
    setBlockedDatesPage(1)
    setBlockedRangesPage(1)
    setBookingBlockedRangesPage(1)
    // Load employee's blocked dates
    if (employee.blockedDates) {
      setBlockedDates(employee.blockedDates.map(d => {
        const dateStr = extractDateValue(d);
        // Convert to date-only format (YYYY-MM-DD) for the date input
        const dateOnly = dateStr ? dateStr.split('T')[0] : '';
        return { date: dateOnly, reason: undefined };
      }).filter(d => d.date))
    } else {
      setBlockedDates([])
    }
    if (employee.blockedRanges) {
      // Normalize blocked ranges - ensure dates are strings
      setBlockedRanges(employee.blockedRanges.map(range => ({
        startDate: extractDateValue(range.startDate) || '',
        endDate: extractDateValue(range.endDate) || '',
        reason: range.reason
      })).filter(r => r.startDate && r.endDate))
    } else {
      setBlockedRanges([])
    }
  }

  // Add blocked date
  const addBlockedDate = () => {
    if (!newBlockedDate.date) {
      toast.error('Please select a date')
      return
    }
    setBlockedDates(prev => [...prev, newBlockedDate])
    setNewBlockedDate({date: '', reason: ''})
  }

  // Remove blocked date
  const removeBlockedDate = (dateToRemove: string) => {
    setBlockedDates(prev => prev.filter(d => d.date !== dateToRemove))
  }

  // Add blocked range
  const addBlockedRange = () => {
    if (!newBlockedRange.startDate || !newBlockedRange.endDate) {
      toast.error('Please select both start and end dates')
      return
    }
    if (new Date(newBlockedRange.startDate) > new Date(newBlockedRange.endDate)) {
      toast.error('Start date must be before end date')
      return
    }
    setBlockedRanges(prev => [...prev, newBlockedRange])
    setNewBlockedRange({startDate: '', endDate: '', reason: ''})
  }

  // Remove blocked range
  const removeBlockedRange = (index: number) => {
    setBlockedRanges(prev => prev.filter((_, i) => i !== index))
  }

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
          blockedDates,
          blockedRanges
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Employee availability updated successfully')
        setAvailabilityDialog(null)
        fetchEmployees() // Refresh the list
      } else {
        toast.error(data.msg || 'Failed to update availability')
      }
    } catch (error) {
      console.error('Error updating availability:', error)
      toast.error('Failed to update availability')
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
            Employee Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading employees...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employee Management
              </CardTitle>
              <CardDescription>
                Invite and manage your employees
              </CardDescription>
            </div>

            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Employee
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Employee</DialogTitle>
                  <DialogDescription>
                    Add a new employee to your company
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="memberName">Name *</Label>
                    <Input
                      id="memberName"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter team member's name"
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
                      <Label htmlFor="hasEmail">Employee has email address</Label>
                    </div>
                    
                    {inviteForm.hasEmail ? (
                      <div>
                        <Label htmlFor="memberEmail">Email Address *</Label>
                        <Input
                          id="memberEmail"
                          type="email"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="Enter team member's email"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Credentials will be sent to this email
                        </p>
                      </div>
                    ) : (
                      <div className="bg-muted p-3 rounded-md">
                        <div className="flex items-center gap-2 text-sm">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                          <span className="font-medium">Company-managed employee</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          You will manage this employee&apos;s availability directly
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
                      Cancel
                    </Button>
                    <Button
                      onClick={inviteEmployee}
                      disabled={!inviteForm.name || (inviteForm.hasEmail && !inviteForm.email) || inviting}
                    >
                      {inviting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {inviteForm.hasEmail ? 'Send Invitation' : 'Add Employee'}
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
              <h3 className="text-lg font-medium mb-2">No Employees Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by inviting your first employee
              </p>
              <Button onClick={() => setInviteDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Employee
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {employees.length} employee{employees.length !== 1 ? 's' : ''}
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
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Availability</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
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
                                {member.managedByCompany ? 'Company managed' : 'Self-managed'}
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
                              No Email
                            </Badge>
                          )}
                        </TableCell>
                        
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm capitalize">
                              {member.availabilityPreference === 'same_as_company' 
                                ? 'Same as Company' 
                                : 'Personal Schedule'}
                            </span>
                          </div>
                        </TableCell>
                        
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {member.isActive ? (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <Badge variant="default" className="bg-green-100 text-green-800">
                                  Active
                                </Badge>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-4 w-4 text-gray-500" />
                                <Badge variant="secondary">
                                  Inactive
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
                              title="Manage Availability"
                            >
                              <Calendar className="h-4 w-4" />
                            </Button>

                            {member.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeactivate(member._id, member.name)}
                                className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                disabled={deactivating}
                                title="Deactivate"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReactivate(member._id)}
                                className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                disabled={deactivating}
                                title="Reactivate"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}

                            {member.managedByCompany && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setResetPasswordDialog(member._id)}
                                className="h-8 px-2"
                                title="Reset Password"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
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
                        Showing {(employeesPage - 1) * EMPLOYEES_PER_PAGE + 1} to{' '}
                        {Math.min(employeesPage * EMPLOYEES_PER_PAGE, employees.length)} of {employees.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEmployeesPage(p => Math.max(1, p - 1))}
                          disabled={employeesPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <span className="text-sm">
                          Page {employeesPage} of {totalEmployeesPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEmployeesPage(p => Math.min(totalEmployeesPages, p + 1))}
                          disabled={employeesPage === totalEmployeesPages}
                        >
                          Next
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
            <DialogTitle>Reset Employee Password</DialogTitle>
            <DialogDescription>
              Set a new password for this company-managed employee
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                minLength={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Password must be at least 6 characters long
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
                Cancel
              </Button>
              <Button
                onClick={resetEmployeePassword}
                disabled={!newPassword || newPassword.length < 6 || resettingPassword}
              >
                {resettingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Reset Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivation Confirmation Dialog */}
      <Dialog open={!!deactivateDialog} onOpenChange={() => setDeactivateDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Employee</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate <strong>{deactivateDialog?.memberName}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    This will deactivate the employee
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    The employee will no longer be able to access the system or be scheduled for appointments.
                    You can reactivate them at any time.
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
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeactivation}
                disabled={deactivating}
              >
                {deactivating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Deactivate Employee
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Availability Management Dialog */}
      <Dialog open={!!availabilityDialog} onOpenChange={() => setAvailabilityDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Availability - {availabilityDialog?.name}</DialogTitle>
            <DialogDescription>
              Set blocked dates for this employee. They will follow the company&apos;s weekly schedule.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Blocked Dates */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Blocked Dates</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={newBlockedDate.date}
                  onChange={(e) => setNewBlockedDate(prev => ({...prev, date: e.target.value}))}
                  className="flex-1"
                />
                <Input
                  type="text"
                  placeholder="Reason (optional)"
                  value={newBlockedDate.reason}
                  onChange={(e) => setNewBlockedDate(prev => ({...prev, reason: e.target.value}))}
                  className="flex-1"
                />
                <Button onClick={addBlockedDate} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {blockedDates.length > 0 && (() => {
                const totalBlockedDatesPages = Math.ceil(blockedDates.length / ITEMS_PER_PAGE)
                const paginatedBlockedDates = blockedDates.slice(
                  (blockedDatesPage - 1) * ITEMS_PER_PAGE,
                  blockedDatesPage * ITEMS_PER_PAGE
                )
                return (
                  <div className="space-y-2">
                    {paginatedBlockedDates.map((blocked) => (
                      <div key={blocked.date} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <span className="text-sm font-medium">
                            {new Date(blocked.date + 'T00:00:00').toLocaleDateString()}
                          </span>
                          {blocked.reason && <span className="text-xs text-muted-foreground ml-2">{blocked.reason}</span>}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBlockedDate(blocked.date)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {totalBlockedDatesPages > 1 && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {blockedDates.length} blocked date{blockedDates.length !== 1 ? 's' : ''}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBlockedDatesPage(p => Math.max(1, p - 1))}
                            disabled={blockedDatesPage === 1}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-xs px-2">
                            {blockedDatesPage}/{totalBlockedDatesPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBlockedDatesPage(p => Math.min(totalBlockedDatesPages, p + 1))}
                            disabled={blockedDatesPage === totalBlockedDatesPages}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Blocked Ranges */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Blocked Date Ranges</Label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={newBlockedRange.startDate}
                    onChange={(e) => setNewBlockedRange(prev => ({...prev, startDate: e.target.value}))}
                    placeholder="Start date"
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={newBlockedRange.endDate}
                    onChange={(e) => setNewBlockedRange(prev => ({...prev, endDate: e.target.value}))}
                    placeholder="End date"
                    className="flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Reason (optional)"
                    value={newBlockedRange.reason}
                    onChange={(e) => setNewBlockedRange(prev => ({...prev, reason: e.target.value}))}
                    className="flex-1"
                  />
                  <Button onClick={addBlockedRange} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Range
                  </Button>
                </div>
              </div>
              {blockedRanges.length > 0 && (() => {
                const totalBlockedRangesPages = Math.ceil(blockedRanges.length / ITEMS_PER_PAGE)
                const startIdx = (blockedRangesPage - 1) * ITEMS_PER_PAGE
                const paginatedBlockedRanges = blockedRanges.slice(
                  startIdx,
                  startIdx + ITEMS_PER_PAGE
                )
                return (
                  <div className="space-y-2">
                    {paginatedBlockedRanges.map((range, index) => (
                      <div key={`${range.startDate}-${range.endDate}${range.reason ? `-${range.reason}` : ''}-${index}`} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <span className="text-sm font-medium">
                            {formatDateSafe(range.startDate)} - {formatDateSafe(range.endDate)}
                          </span>
                          {range.reason && <span className="text-xs text-muted-foreground ml-2">{range.reason}</span>}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBlockedRange(startIdx + index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {totalBlockedRangesPages > 1 && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {blockedRanges.length} blocked range{blockedRanges.length !== 1 ? 's' : ''}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBlockedRangesPage(p => Math.max(1, p - 1))}
                            disabled={blockedRangesPage === 1}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-xs px-2">
                            {blockedRangesPage}/{totalBlockedRangesPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBlockedRangesPage(p => Math.min(totalBlockedRangesPages, p + 1))}
                            disabled={blockedRangesPage === totalBlockedRangesPages}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Booking Blocked Ranges (read-only, auto-generated from active bookings) */}
            {availabilityDialog?.bookingBlockedRanges && availabilityDialog.bookingBlockedRanges.length > 0 && (() => {
              const allBookingRanges = availabilityDialog.bookingBlockedRanges
              // Filter out invalid date ranges
              const validBookingRanges = allBookingRanges.filter(isValidDateRange)
              const invalidCount = allBookingRanges.length - validBookingRanges.length
              const totalBookingRangesPages = Math.ceil(validBookingRanges.length / ITEMS_PER_PAGE)
              const paginatedBookingRanges = validBookingRanges.slice(
                (bookingBlockedRangesPage - 1) * ITEMS_PER_PAGE,
                bookingBlockedRangesPage * ITEMS_PER_PAGE
              )
              return (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Blocked by Bookings (auto-generated)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    These dates are automatically blocked because the employee is assigned to active bookings.
                  </p>
                  {invalidCount > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-700 text-xs">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{invalidCount} booking(s) have invalid dates and are not shown</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    {paginatedBookingRanges.map((range, idx) => (
                      <div key={`booking-${idx}-${range.startDate}-${range.endDate}`} className="flex items-center justify-between p-2 border rounded bg-blue-50 border-blue-200">
                        <div>
                          <span className="text-sm font-medium text-blue-800">
                            {formatDateSafe(range.startDate)} - {formatDateSafe(range.endDate)}
                          </span>
                          <span className="text-xs text-blue-600 ml-2">
                            {range.reason === 'booking-buffer' ? 'Buffer period' : 'Booking'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {totalBookingRangesPages > 1 && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {validBookingRanges.length} booking block{validBookingRanges.length !== 1 ? 's' : ''}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBookingBlockedRangesPage(p => Math.max(1, p - 1))}
                            disabled={bookingBlockedRangesPage === 1}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-xs px-2">
                            {bookingBlockedRangesPage}/{totalBookingRangesPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBookingBlockedRangesPage(p => Math.min(totalBookingRangesPages, p + 1))}
                            disabled={bookingBlockedRangesPage === totalBookingRangesPages}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setAvailabilityDialog(null)}
                disabled={savingAvailability}
              >
                Cancel
              </Button>
              <Button
                onClick={saveEmployeeAvailability}
                disabled={savingAvailability}
              >
                {savingAvailability && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Blocked Dates
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}