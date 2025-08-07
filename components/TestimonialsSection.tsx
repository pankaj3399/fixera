'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Quote, ArrowLeft, ArrowRight, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { testimonials } from '@/data/content'

const TestimonialsSection = () => {
  const [activeTestimonial, setActiveTestimonial] = useState(0)

  const nextTestimonial = useCallback(() => {
    setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
  }, []);

  const prevTestimonial = () => {
    setActiveTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  useEffect(() => {
    const interval = setInterval(nextTestimonial, 7000); 
    return () => clearInterval(interval);
  }, [nextTestimonial]);

  return (
    <section id="testimonials" className="py-24 bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10 [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-white/10 text-white border-white/20 px-4 py-2">
            Customer Stories
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Loved by Customers Across Europe
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Real stories from real customers who transformed their properties with help from Fixera professionals.
          </p>
        </div>

        <div className="relative max-w-4xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.id}
              className={cn(
                "transition-opacity duration-500 ease-in-out absolute inset-0",
                { "opacity-100": activeTestimonial === index, "opacity-0": activeTestimonial !== index }
              )}
            >
              <Card className="bg-white/10 backdrop-blur-lg border-white/20 text-white shadow-2xl h-full">
                <CardContent className="p-8 sm:p-12 h-full flex flex-col justify-center">
                  <figure>
                    <Quote className="w-12 h-12 text-blue-300 mb-6" />
                    <blockquote className="text-xl sm:text-2xl font-medium mb-8 leading-relaxed">
                      &quot;{testimonial.text}&quot;
                    </blockquote>
                    <figcaption className="flex items-center space-x-4">
                      <div className="w-14 h-14 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-xl font-bold ring-2 ring-white/50">
                        {testimonial.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{testimonial.name}</div>
                        <div className="text-gray-300 flex items-center text-sm mt-1">
                          <MapPin className="w-4 h-4 mr-1.5" /> {testimonial.location}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className="bg-blue-500/80 border-blue-400 text-white mb-1">
                          {testimonial.service}
                        </Badge>
                        <div className="text-sm text-green-300 font-semibold">{testimonial.projectValue} Project</div>
                      </div>
                    </figcaption>
                  </figure>
                </CardContent>
              </Card>
            </div>
          ))}

          <div className="opacity-0 pointer-events-none">
            <Card className="bg-transparent border-transparent"><CardContent className="p-8 sm:p-12"><figure><Quote className="w-12 h-12 mb-6" />
            <blockquote className="text-xl sm:text-2xl font-medium mb-8 leading-relaxed">&quot;{testimonials[0].text}&quot;</blockquote><figcaption className="flex items-center space-x-4"><div className="w-14 h-14 rounded-full" /><div /></figcaption></figure></CardContent></Card>
          </div>

          {/* Navigation */}
          <button
            onClick={prevTestimonial}
            aria-label="Previous testimonial"
            className="absolute -left-4 sm:-left-16 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <button
            onClick={nextTestimonial}
            aria-label="Next testimonial"
            className="absolute -right-4 sm:-right-16 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>

        <div className="flex justify-center mt-12 gap-3">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveTestimonial(index)}
              aria-label={`Go to testimonial ${index + 1}`}
              className={cn(
                "w-3 h-3 rounded-full transition-all duration-300",
                { "bg-white scale-125": activeTestimonial === index, "bg-white/30 hover:bg-white/50": activeTestimonial !== index }
              )}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default TestimonialsSection