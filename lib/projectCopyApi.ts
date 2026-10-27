import { getAuthFetchOptions } from '@/lib/utils'

export type ProjectCopyKind = 'title' | 'faqs'
export type ProjectCopyLocale = 'en' | 'nl' | 'fr'
export type ProjectCopyContext = {
  category?: string
  service: string
  areaOfWork?: string
  description: string
  title?: string
  keywords?: string[]
  selectedPricingOption?: { name?: string; pricingType?: string; unit?: string }
  subprojects?: Array<Record<string, unknown>>
  extraOptions?: Array<Record<string, unknown>>
  termsConditions?: Array<Record<string, unknown>>
  faq?: Array<{ question: string; answer: string }>
}

export class ProjectCopyApiError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export const generateProjectCopy = async <T extends { titles?: string[]; faqs?: Array<{ question: string; answer: string }> }>(input: {
  kind: ProjectCopyKind
  locale: ProjectCopyLocale
  projectId?: string
  context: ProjectCopyContext
}): Promise<T> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/projects/generate-copy`, {
    ...getAuthFetchOptions({ 'Content-Type': 'application/json' }),
    method: 'POST',
    body: JSON.stringify(input),
  })
  let result: { success?: boolean; data?: T; code?: string }
  try {
    result = await response.json()
  } catch {
    throw new ProjectCopyApiError('AI_UNAVAILABLE')
  }
  if (!response.ok || !result.success || !result.data) {
    throw new ProjectCopyApiError(result.code || 'AI_UNAVAILABLE')
  }
  return result.data
}
