'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Menu, X, Hammer } from 'lucide-react'



const otherLinks = [
    { name: 'For Professionals', href: '/professionals' },
    { name: 'services', href: '/services' },
    { name: 'About', href: '/about' },
];


const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [isMenuOpen]);

  return (
    <>
      <header className={cn(
        "fixed top-0 w-full z-50 transition-all duration-300",
        isScrolled ? "bg-white/95 backdrop-blur-lg shadow-lg border-b border-gray-100" : "bg-white/80 backdrop-blur-sm"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2 shrink-0">
              <div className="w-9 h-9 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Hammer className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Fixera</span>
            </Link>

            {/* --- Desktop Navigation --- */}
            <nav className="hidden lg:flex items-center space-x-8">
              {otherLinks.map((link) => (
                <Link key={link.name} href={link.href} className="text-gray-700 hover:text-blue-600 transition-colors font-medium text-base">
                  {link.name}
                </Link>
              ))}
            </nav>

            <div className="hidden lg:flex items-center space-x-2">
              <Button asChild variant="ghost">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild>
                <Link href="/join">Join</Link>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button className="lg:hidden p-2" onClick={() => setIsMenuOpen(true)} aria-label="Open menu">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>
      
      {/* --- Mobile Sidebar --- */}
      <div className={cn("fixed inset-0 bg-black/50 z-[51] lg:hidden", isMenuOpen ? "opacity-100 visible" : "opacity-0 invisible")} onClick={() => setIsMenuOpen(false)} />
      <div className={cn("fixed top-0 right-0 h-full w-full max-w-sm bg-white z-[52] lg:hidden transition-transform duration-300 ease-in-out flex flex-col", isMenuOpen ? "transform-none" : "translate-x-full")} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between p-4 border-b">
            <span className="font-bold text-lg">Menu</span>
            <button onClick={() => setIsMenuOpen(false)} aria-label="Close menu">
                <X className="w-6 h-6" />
            </button>
        </div>
        <nav className="flex-grow p-4 space-y-2 overflow-y-auto">
            {otherLinks.map(link => (
                <Link key={link.name} href={link.href} className="block p-2 text-lg font-medium text-gray-800 hover:text-blue-600 rounded-lg hover:bg-gray-50 transition-colors" onClick={() => setIsMenuOpen(false)}>{link.name}</Link>
            ))}
            <hr className="my-2"/>
            
        </nav>
        <div className="p-4 border-t space-y-3 bg-gray-50">
            <Button asChild variant="outline" className="w-full">
                <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild className="w-full">
                <Link href="/join">Join</Link>
            </Button>
        </div>
      </div>
    </>
  )
}

export default Navbar;