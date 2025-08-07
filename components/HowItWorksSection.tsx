'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { CheckCircle } from 'lucide-react'
import { howItWorksSteps } from '@/data/content'
import Icon from './Icon'


const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-purple-100 text-purple-800 px-4 py-2 border-purple-200">
            Simple & Secure
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            Get Projects Done in 3 Easy Steps
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            From finding the right professional to completing the work, our process is designed
            to be seamless, transparent, and secure.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-1/2 left-0 w-full h-px -translate-y-1/2">
            <svg width="100%" height="2">
              <line 
                x1="0" y1="1" x2="100%" y2="1" 
                strokeWidth="2" strokeDasharray="8, 8" 
                className="stroke-gray-300" 
              />
            </svg>
          </div>
          
          <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-x-12 gap-y-16">
            {howItWorksSteps.map((step) => (
              <div key={step.step} className="relative bg-white text-center p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl hover:-translate-y-2 transition-all duration-300">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center justify-center shadow-lg">
                  <Icon name={step.icon} className="w-8 h-8" />
                </div>
                
                <h3 className="mt-8 text-2xl font-bold text-gray-900 mb-4">
                  {step.title}
                </h3>
                <p className="text-gray-600 mb-6">
                  {step.description}
                </p>

                {/* Semantically correct list for features */}
                <ul className="space-y-2 text-left">
                  {step.features.map((feature, i) => (
                    <li key={i} className="flex items-center text-gray-700">
                      <CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default HowItWorksSection