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

/** Per-field limits the backend prompt uses (fixera-server projectCopyGeneration.ts). */
const LIST_LIMITS = { keywords: 10, subprojects: 8, items: 10, extraOptions: 10, termsConditions: 10, faq: 8 } as const
/** The generate-copy route accepts at most 16 KB of JSON; stay well below it. */
const MAX_REQUEST_JSON = 14_000

const clip = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value
const listOf = <T,>(value: T[] | undefined, max: number): T[] | undefined => (Array.isArray(value) ? value.slice(0, max) : value)
const withClipped = <T extends Record<string, unknown>>(entry: T, fields: Record<string, number>): T => {
  const next: Record<string, unknown> = { ...entry }
  for (const [field, max] of Object.entries(fields)) if (field in next) next[field] = clip(next[field], max)
  return next as T
}

/**
 * Fits wizard facts to what the copy endpoint accepts (FT1 #3/#8): a valid,
 * detailed project (long FAQ answers, many items, many keywords) must still
 * get suggestions instead of a "generation failed" toast. Lists and texts are
 * cut to the backend limits; if the request is still too large, the least
 * important facts (existing FAQ answers, item descriptions, extra packages)
 * are reduced first. The backend applies the final prompt budget.
 */
export function fitProjectCopyRequest<I extends { context: ProjectCopyContext }>(input: I): I {
  const c = input.context
  let context: ProjectCopyContext = {
    ...c,
    description: (clip(c.description, 2400) as string) || '',
    title: clip(c.title, 90) as string | undefined,
    keywords: listOf(c.keywords, LIST_LIMITS.keywords)?.map((k) => clip(k, 80) as string),
    subprojects: listOf(c.subprojects, LIST_LIMITS.subprojects)?.map((sp) => ({
      ...withClipped(sp, { name: 120, description: 600 }),
      included: listOf(sp.included as Array<Record<string, unknown>> | undefined, LIST_LIMITS.items)?.map((i) => withClipped(i, { name: 120, description: 400 })),
      materials: listOf(sp.materials as Array<Record<string, unknown>> | undefined, LIST_LIMITS.items)?.map((m) => withClipped(m, { name: 120, description: 250 })),
    })),
    extraOptions: listOf(c.extraOptions, LIST_LIMITS.extraOptions)?.map((o) => withClipped(o, { name: 120, description: 500 })),
    termsConditions: listOf(c.termsConditions, LIST_LIMITS.termsConditions)?.map((t) => withClipped(t, { name: 120, description: 500 })),
    faq: listOf(c.faq, LIST_LIMITS.faq)?.map((f) => ({ question: clip(f.question, 240) as string, answer: clip(f.answer, 600) as string })),
  }
  const shrink: Array<(ctx: ProjectCopyContext) => ProjectCopyContext> = [
    (ctx) => ({ ...ctx, faq: ctx.faq?.map((f) => ({ ...f, answer: clip(f.answer, 200) as string })) }),
    (ctx) => ({ ...ctx, faq: [] }),
    (ctx) => ({
      ...ctx,
      subprojects: ctx.subprojects?.map((sp) => ({
        ...sp,
        description: clip(sp.description, 300),
        included: (sp.included as Array<Record<string, unknown>> | undefined)?.map(({ name }) => ({ name })),
        materials: (sp.materials as Array<Record<string, unknown>> | undefined)?.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
      })),
    }),
    (ctx) => ({ ...ctx, subprojects: ctx.subprojects?.slice(0, 4) }),
    (ctx) => ({ ...ctx, extraOptions: ctx.extraOptions?.map((o) => withClipped(o, { description: 80 })), termsConditions: ctx.termsConditions?.map((t) => withClipped(t, { description: 80 })) }),
  ]
  for (const step of shrink) {
    if (JSON.stringify({ ...input, context }).length <= MAX_REQUEST_JSON) break
    context = step(context)
  }
  return { ...input, context }
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
    body: JSON.stringify(fitProjectCopyRequest(input)),
  })
  let result: { success?: boolean; data?: T; code?: string }
  try {
    result = await response.json()
  } catch {
    throw new ProjectCopyApiError('AI_UNAVAILABLE')
  }
  const data = result.data
  const requiredList = input.kind === 'title' ? data?.titles : data?.faqs
  // Never hand back a partial payload: callers read `.length`/`.map` directly.
  if (!response.ok || !result.success || !data || !Array.isArray(requiredList)) {
    throw new ProjectCopyApiError(result.code || 'AI_UNAVAILABLE')
  }
  return data
}
