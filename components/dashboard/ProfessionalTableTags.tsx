"use client"

import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { formatAdminTagLabel, getAdminTagStyle } from "@/lib/professionalLevel"

export default function ProfessionalTableTags({ tags }: { tags?: string[] }) {
  const t = useTranslations("search")
  return <div className="mt-1 flex flex-wrap gap-1">{(tags || []).map(tag => (
    <Badge key={tag} variant="outline" className={`text-[10px] ${getAdminTagStyle(tag)}`}>
      {tag.toLowerCase() === "verified" ? t("adminTags.verified")
        : tag.toLowerCase() === "our choice" ? t("adminTags.ourChoice") : formatAdminTagLabel(tag)}
    </Badge>
  ))}</div>
}
