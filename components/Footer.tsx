'use client'

import React from 'react'
import Link from 'next/link'
import { Hammer } from 'lucide-react'
import { footerSections, socialLinks, legalLinks } from '@/data/content'

const FooterLinkColumn = ({ title, links }: { title: string, links: {name: string, href: string}[] }) => (
    <div>
        <h4 className="text-lg font-semibold text-white mb-6">{title}</h4>
        <ul className="space-y-4">
            {links.map((link) => (
                <li key={link.name}>
                    <Link href={link.href} className="text-gray-300 hover:text-white hover:underline transition-colors">
                        {link.name}
                    </Link>
                </li>
            ))}
        </ul>
    </div>
);

const Footer = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gray-900 ">
      {/* --- Main Footer Content --- */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand & Contact Section */}
          <div className="lg:col-span-2">
            <Link href="#hero" className="inline-flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Hammer className="w-7 h-7 text-white" />
              </div>
              <span className="text-3xl font-bold text-white">Fixera</span>
            </Link>
            <p className="text-gray-300 mb-8 leading-relaxed">
              Fixera is a trusted platform connecting customers with verified professionals for any property service. From minor repairs to major renovations, we make it simple to get the job done with quality and security guaranteed.
            </p>
          </div>
          
          {footerSections.map((section) => (
            <FooterLinkColumn key={section.title} title={section.title} links={section.links} />
          ))}
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-6">
            <p className="text-gray-400 text-sm text-center sm:text-left">
              © {currentYear} Fixera. All rights reserved.
            </p>
            <div className="flex items-center space-x-6">
              {socialLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                    <Icon className="w-6 h-6" />
                    <span className="sr-only">{link.name}</span>
                  </a>
                );
              })}
            </div>
          </div>
           <div className="mt-6 flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-2">
              {legalLinks.map((link) => (
                <Link key={link.name} href={link.href} className="text-sm text-gray-400 hover:text-white hover:underline">
                  {link.name}
                </Link>
              ))}
            </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer