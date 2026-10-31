"use client"

import {
  DetailCard,
  useDetailT,
} from "./DetailPrimitives"
import type { AdminDetailLink } from "@/lib/bookingDetails"

const ADMIN_LINK_LABEL_KEYS: Record<string, string> = {
  booking: "admin.openBooking",
  warranty: "admin.warrantyClaims",
  disputes: "admin.disputes",
  payments: "admin.payments",
}

export function AdminReferencesCard({ links }: { links: AdminDetailLink[] }) {
  const dt = useDetailT()
  if (links.length === 0) return null
  return (
    <DetailCard
      title={dt("overview.adminTools", "Admin references")}
      description={dt("overview.adminToolsDescription", "Only visible to staff with the matching area permission.")}
    >
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {dt(ADMIN_LINK_LABEL_KEYS[link.key] || `admin.${link.key}`, link.key.replace(/_/g, " "))}
          </a>
        ))}
      </div>
    </DetailCard>
  )
}
