'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Construction, ArrowLeft, Wrench, Clock, Lightbulb } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function ProjectCreatePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen mt-20 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-6 relative">
              <div className="w-24 h-24 bg-gradient-to-br from-orange-400 to-yellow-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
                <Construction className="w-12 h-12 text-white animate-pulse" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                <Wrench className="w-4 h-4 text-white rotate-45" />
              </div>
            </div>
            
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Under Construction
            </CardTitle>
            <CardDescription className="text-lg mt-3 text-gray-600">
              We're building something amazing for you!
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-8 pb-8">
            <div className="text-center space-y-4">
              <p className="text-gray-700 leading-relaxed">
                The <strong>Project Creation</strong> feature is currently under development. 
                Our team is working hard to bring you an intuitive and powerful project management experience.
              </p>
              
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-gray-800 flex items-center justify-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  Coming Soon Features
                </h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    Create and manage professional service projects
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                    Set project timelines and milestones
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    Collaborate with team members
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                    Track progress and deliverables
                  </li>
                </ul>
              </div>
              
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-center gap-2 text-green-700">
                  <Clock className="w-5 h-5" />
                  <span className="font-medium">Expected Launch: Q4 2025</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={() => router.back()} 
                variant="outline" 
                className="flex items-center gap-2 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Button>
              
              <Link href="/dashboard">
                <Button className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                  Visit Dashboard
                </Button>
              </Link>
            </div>
            
            <div className="text-center pt-4 border-t">
              <p className="text-sm text-gray-500">
                Have questions or suggestions? 
                <a href="mailto:support@fixera.com" className="text-blue-600 hover:underline ml-1">
                  Contact our team
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* Floating Elements for Visual Appeal */}
        <div className="absolute top-10 left-10 w-20 h-20 bg-blue-200 rounded-full opacity-20 animate-bounce" style={{animationDelay: '0s'}}></div>
        <div className="absolute top-32 right-20 w-16 h-16 bg-indigo-200 rounded-full opacity-20 animate-bounce" style={{animationDelay: '1s'}}></div>
        <div className="absolute bottom-20 left-32 w-12 h-12 bg-purple-200 rounded-full opacity-20 animate-bounce" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-32 right-16 w-14 h-14 bg-pink-200 rounded-full opacity-20 animate-bounce" style={{animationDelay: '0.5s'}}></div>
      </div>
    </div>
  )
}