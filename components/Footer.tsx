import React from 'react'
import Link from 'next/link'
import { Hammer, Facebook, Twitter, Instagram, Linkedin, Youtube, Music2 } from 'lucide-react'
import { footerSections } from '@/data/content'
import { publicListPolicyLinks, PolicyLink, CMS_RESERVED_POLICIES } from '@/lib/cms'
import { publicGetSiteSettings, SiteSettings } from '@/lib/siteSettings'

const LEGAL_SLOTS = CMS_RESERVED_POLICIES.map(({ slug, label }) => ({ slug, label }))

const MANDATORY_FALLBACKS: PolicyLink[] = CMS_RESERVED_POLICIES.map(({ slug, label, path }) => ({
  slug,
  title: label,
  path,
}))

function isSafeHttpUrl(href: string): boolean {
  try {
    const parsed = new URL(href)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const SOCIAL_DEFS: Array<{ key: keyof NonNullable<SiteSettings['socialLinks']>; name: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'facebook', name: 'Facebook', icon: Facebook },
  { key: 'twitter', name: 'Twitter', icon: Twitter },
  { key: 'instagram', name: 'Instagram', icon: Instagram },
  { key: 'linkedin', name: 'LinkedIn', icon: Linkedin },
  { key: 'tiktok', name: 'TikTok', icon: Music2 },
  { key: 'youtube', name: 'YouTube', icon: Youtube },
]

const FooterLinkColumn = ({ title, links }: { title: string; links: { name: string; href: string }[] }) => (
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
)

export default async function Footer() {
  const currentYear = new Date().getFullYear()

  const [policies, settings] = await Promise.all([
    publicListPolicyLinks(),
    publicGetSiteSettings().catch(() => ({ socialLinks: {} } as SiteSettings)),
  ])

  const sourceLinks = [...MANDATORY_FALLBACKS, ...policies]
  const bySlug: Record<string, PolicyLink> = Object.fromEntries(
    sourceLinks.map((p) => [p.slug, p])
  )

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
              {SOCIAL_DEFS.map(({ key, name, icon: Icon }) => {
                const href = settings?.socialLinks?.[key]
                if (!href || !isSafeHttpUrl(href)) return null
                return (
                  <a key={name} href={href} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                    <Icon className="w-6 h-6" />
                    <span className="sr-only">{name}</span>
                  </a>
                )
              })}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-2">
            {LEGAL_SLOTS.map((slot) => {
              const match = bySlug[slot.slug]
              if (!match) return null
              return (
                <Link key={slot.slug} href={match.path} className="text-sm text-gray-400 hover:text-white hover:underline">
                  {slot.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </footer>
  )
}
