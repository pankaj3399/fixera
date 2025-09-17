'use client'

import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { User, Mail, Phone, Shield, Calendar, Crown, Settings, TrendingUp, Users, Award, CheckCircle, XCircle, Clock, AlertTriangle, Plus, Briefcase } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface LoyaltyStats {
  tierDistribution: Array<{
    _id: string;
    count: number;
    totalSpent: number;
    totalPoints: number;
  }>;
  overallStats: {
    totalCustomers: number;
    totalRevenue: number;
    totalPointsIssued: number;
  };
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
  total: number;
}

export default function DashboardPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const router = useRouter()
  const [loyaltyStats, setLoyaltyStats] = useState<LoyaltyStats | null>(null)
  const [approvalStats, setApprovalStats] = useState<ApprovalStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login?redirect=/dashboard')
    }
  }, [isAuthenticated, loading, router])

  // Fetch admin-specific data
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAdminData()
    }
  }, [user])

  const fetchAdminData = async () => {
    setIsLoadingStats(true)
    try {
      const [loyaltyResponse, approvalResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/loyalty/analytics`, {
          credentials: 'include'
        }),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/stats/approvals`, {
          credentials: 'include'
        })
      ])

      if (loyaltyResponse.ok) {
        const loyaltyData = await loyaltyResponse.json()
        setLoyaltyStats(loyaltyData.data)
      }

      if (approvalResponse.ok) {
        const approvalData = await approvalResponse.json()
        setApprovalStats(approvalData.data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch admin data:', error)
    } finally {
      setIsLoadingStats(false)
    }
  }

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

  if (user?.role === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto pt-20">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Crown className="h-8 w-8 text-yellow-500" />
                Admin Dashboard
              </h1>
              <p className="text-gray-600">Welcome back, {user?.name}! Manage your platform here.</p>
            </div>
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="loyalty">Loyalty System</TabsTrigger>
              <TabsTrigger value="approvals">Professional Approvals</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Quick Stats */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-blue-500" />
                      Total Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isLoadingStats ? '...' : loyaltyStats?.overallStats.totalCustomers || 0}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Total Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${isLoadingStats ? '...' : (loyaltyStats?.overallStats.totalRevenue || 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-orange-500" />
                      Pending Approvals
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isLoadingStats ? '...' : approvalStats?.pending || 0}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Award className="h-4 w-4 text-purple-500" />
                      Points Issued
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {isLoadingStats ? '...' : (loyaltyStats?.overallStats.totalPointsIssued || 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="loyalty" className="space-y-6">
              {/* Loyalty System Management */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-purple-500" />
                      Loyalty Tier Distribution
                    </CardTitle>
                    <CardDescription>Customer distribution across loyalty tiers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingStats ? (
                      <div className="text-center py-8">Loading...</div>
                    ) : (
                      <div className="space-y-3">
                        {loyaltyStats?.tierDistribution.map((tier) => (
                          <div key={tier._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <span className="font-medium">{tier._id || 'Bronze'}</span>
                              <p className="text-sm text-gray-600">{tier.count} customers</p>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">${tier.totalSpent.toLocaleString()}</div>
                              <div className="text-sm text-gray-600">{tier.totalPoints} points</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5 text-gray-500" />
                      Loyalty Configuration
                    </CardTitle>
                    <CardDescription>Manage loyalty system settings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={() => window.open('/admin/loyalty/config', '_blank')} className="w-full">
                      Configure Loyalty Tiers
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/loyalty/recalculate`, {
                          method: 'POST',
                          credentials: 'include'
                        }).then(() => fetchAdminData())
                      }}
                      className="w-full"
                    >
                      Recalculate All Tiers
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="approvals" className="space-y-6">
              {/* Professional Approvals */}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-orange-500" />
                      Pending
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.pending || 0}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Approved
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.approved || 0}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Rejected
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.rejected || 0}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Suspended
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{approvalStats?.suspended || 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Professional Management
                  </CardTitle>
                  <CardDescription>Review and approve professional applications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button 
                      onClick={() => window.open('/admin/professionals?status=pending', '_blank')}
                      className="w-full"
                      variant={approvalStats?.pending ? 'default' : 'outline'}
                    >
                      Review Pending ({approvalStats?.pending || 0})
                    </Button>
                    <Button 
                      onClick={() => window.open('/admin/professionals?status=approved', '_blank')}
                      variant="outline"
                      className="w-full"
                    >
                      View Approved ({approvalStats?.approved || 0})
                    </Button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Button 
                      onClick={() => window.open('/admin/professionals?status=rejected', '_blank')}
                      variant="outline"
                      className="w-full"
                    >
                      View Rejected ({approvalStats?.rejected || 0})
                    </Button>
                    <Button 
                      onClick={() => window.open('/admin/professionals?status=suspended', '_blank')}
                      variant="outline"
                      className="w-full"
                    >
                      View Suspended ({approvalStats?.suspended || 0})
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    )
  }

  // Professional dashboard
  if (user?.role === 'professional') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-6xl mx-auto pt-20">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Briefcase className="h-8 w-8 text-blue-600" />
                Professional Dashboard
              </h1>
              <p className="text-gray-600">Manage your services and projects, {user?.name}!</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Create New Project Card */}
            <Card className="border-2 border-dashed border-blue-300 hover:border-blue-500 transition-colors">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 text-blue-600">
                  <Plus className="h-6 w-6" />
                  Create New Project
                </CardTitle>
                <CardDescription>Start offering a new service to customers</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button
                  onClick={() => router.push('/projects/create')}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  Create Project
                </Button>
              </CardContent>
            </Card>

            {/* Profile Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>Your professional account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{user?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{user?.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-gray-500" />
                  <span className="text-sm capitalize">{user?.role}</span>
                </div>
              </CardContent>
            </Card>

            {/* Verification Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Verification Status
                </CardTitle>
                <CardDescription>Professional verification progress</CardDescription>
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
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks for professionals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  onClick={() => router.push('/projects/create')}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/profile')}
                  className="flex items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/professional/projects/manage')}
                  className="flex items-center gap-2"
                >
                  <Briefcase className="h-4 w-4" />
                  Manage Projects
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/professional/earnings')}
                  className="flex items-center gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  View Earnings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Account Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Account Stats
              </CardTitle>
              <CardDescription>Your professional account activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Professional Since</span>
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

          {/* Action Buttons */}
          <div className="mt-8 flex gap-4">
            {(!user?.isEmailVerified || !user?.isPhoneVerified) && (
              <Button onClick={() => router.push('/verify-phone')}>
                Complete Verification
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Regular user dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto pt-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user?.name}!</h1>
          <p className="text-gray-600">Here&apos;s your dashboard overview</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <span className="text-sm">{user?.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-500" />
                <span className="text-sm capitalize">{user?.role}</span>
              </div>
            </CardContent>
          </Card>

          {/* Verification Status */}
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
            </CardContent>
          </Card>

          {/* Account Stats */}
          <Card>
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

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4">
          {(!user?.isEmailVerified || !user?.isPhoneVerified) && (
            <Button onClick={() => router.push('/verify-phone')}>
              Complete Verification
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
