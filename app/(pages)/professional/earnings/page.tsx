'use client'

import { Construction, TrendingUp, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export default function EarningsPage() {
  const router = useRouter()

  return (
    <div className="h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4 mt-16">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="relative">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
            <Construction className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center animate-bounce">
            <TrendingUp className="w-4 h-4 text-yellow-800" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">
            Earnings Dashboard
          </h1>
          <p className="text-lg text-amber-700 font-medium">
            Coming Soon
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-sm border border-amber-100 space-y-4">
          <p className="text-gray-600">
            We&apos;re building something great! Soon you&apos;ll be able to:
          </p>
          <ul className="text-sm text-gray-700 space-y-2 text-left">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
              Track your earnings in real-time
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
              View detailed payment history
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
              Download financial reports
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
              Manage payout settings
            </li>
          </ul>
        </div>

        <Button
          onClick={() => router.push('/dashboard')}
          variant="outline"
          className="bg-white/80 border-amber-200 hover:border-amber-300 hover:bg-amber-50"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  )
}
