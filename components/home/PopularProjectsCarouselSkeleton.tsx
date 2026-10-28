'use client'

import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'

const CARD_CLASS =
  'min-w-[280px] max-w-[280px] snap-start flex-shrink-0 rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm h-full flex flex-col'

export function PopularProjectsCarouselSkeleton({
  heading,
}: {
  heading?: string
}) {
  const t = useTranslations('home')
  const headingText = heading ?? t('popularProjects.heading')

  return (
    <div className="mt-10 max-w-5xl mx-auto text-left" aria-hidden>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{headingText}</h3>
        <div className="flex gap-2">
          <span className="p-1.5 rounded-full border border-gray-200">
            <Skeleton className="h-4 w-4 rounded-full" />
          </span>
          <span className="p-1.5 rounded-full border border-gray-200">
            <Skeleton className="h-4 w-4 rounded-full" />
          </span>
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden pb-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className={CARD_CLASS}>
            <Skeleton className="h-40 w-full rounded-none" />
            <div className="p-3.5 flex flex-col flex-grow">
              <Skeleton className="h-4 w-11/12 mb-1.5" />
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-5 w-16 rounded-full mb-2" />
              <Skeleton className="h-4 w-24 mb-2" />
              <div className="mt-auto pt-2.5 border-t border-gray-100 flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
