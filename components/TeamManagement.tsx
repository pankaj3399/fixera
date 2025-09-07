'use client'

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { 
  User, 
  Mail, 
  UserPlus, 
  Calendar, 
  Clock, 
  Eye, 
  EyeOff, 
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Loader2,
  Users
} from "lucide-react"
import { toast } from "sonner"

interface TeamMember {
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
  availability?: any
  blockedDates?: Date[]
  blockedRanges?: any[]
}

interface TeamManagementProps {
  companyName: string
}

export default function TeamManagement({ companyName }: TeamManagementProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
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

  // Fetch team members
  const fetchTeamMembers = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/team/members`, {
        method: 'GET',
        credentials: 'include'
      })
      
      const data = await response.json()
      
      if (data.success) {
        setTeamMembers(data.data.teamMembers || [])
      } else {
        console.error('Failed to fetch team members:', data.msg)
      }
    } catch (error) {
      console.error('Error fetching team members:', error)
      toast.error('Failed to load team members')
    } finally {
      setLoading(false)
    }
  }

  // Invite team member
  const inviteTeamMember = async () => {
    try {
      setInviting(true)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/team/invite`, {
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
            ? 'Team member invitation sent successfully!' 
            : 'Team member added successfully!'
        )
        setInviteDialogOpen(false)
        setInviteForm({ name: '', email: '', hasEmail: true })
        fetchTeamMembers() // Refresh the list
      } else {
        toast.error(data.msg || 'Failed to invite team member')
      }
    } catch (error) {
      console.error('Error inviting team member:', error)
      toast.error('Failed to invite team member')
    } finally {
      setInviting(false)
    }
  }

  // Toggle team member status
  const toggleTeamMemberStatus = async (teamMemberId: string, isActive: boolean) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/team/members/${teamMemberId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ isActive })
      })
      
      const data = await response.json()
      
      if (data.success) {
        toast.success(`Team member ${isActive ? 'activated' : 'deactivated'} successfully`)
        fetchTeamMembers() // Refresh the list
      } else {
        toast.error(data.msg || 'Failed to update team member status')
      }
    } catch (error) {
      console.error('Error updating team member status:', error)
      toast.error('Failed to update team member status')
    }
  }

  // Reset team member password
  const resetTeamMemberPassword = async () => {
    if (!resetPasswordDialog || !newPassword) return
    
    try {
      setResettingPassword(true)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/team/reset-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          teamMemberId: resetPasswordDialog,
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

  // Load team members on component mount
  useEffect(() => {
    fetchTeamMembers()
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading team members...</span>
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
                Team Management
              </CardTitle>
              <CardDescription>
                Invite and manage your team members
              </CardDescription>
            </div>
            
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Team Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Add a new team member to your company
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
                          You will manage this employee's availability directly
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
                      onClick={inviteTeamMember}
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
          {teamMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Team Members Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by inviting your first team member to collaborate
              </p>
              <Button onClick={() => setInviteDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Team Member
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchTeamMembers}
                  className="h-8"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
              
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
                    {teamMembers.map((member) => (
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
                            <Switch
                              checked={member.isActive}
                              onCheckedChange={(checked) => toggleTeamMemberStatus(member._id, checked)}
                            />
                            
                            {member.managedByCompany && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setResetPasswordDialog(member._id)}
                                className="h-8 px-2"
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Reset Dialog */}
      <Dialog open={!!resetPasswordDialog} onOpenChange={() => setResetPasswordDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Team Member Password</DialogTitle>
            <DialogDescription>
              Set a new password for this company-managed team member
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
                onClick={resetTeamMemberPassword}
                disabled={!newPassword || newPassword.length < 6 || resettingPassword}
              >
                {resettingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Reset Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}