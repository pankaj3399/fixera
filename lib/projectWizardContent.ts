export const normalizeProjectKeywords = (existing: string[], input: string) => {
  const result = [...existing]
  input.split(',').map((keyword) => keyword.trim()).filter(Boolean).forEach((keyword) => {
    if (!result.some((current) => current.toLocaleLowerCase() === keyword.toLocaleLowerCase())) result.push(keyword)
  })
  return result
}

/**
 * Shorten text to at most `max` characters without cutting a word (FT1-3/8
 * no-AI fallback): prefer the end of a sentence, otherwise the last whole
 * word followed by an ellipsis. Text that fits is returned unchanged.
 */
export const clipAtWord = (text: string, max: number): string => {
  const value = text.replace(/\s+/g, ' ').trim()
  if (value.length <= max) return value
  const room = value.slice(0, Math.max(0, max - 1))
  const sentenceEnd = Math.max(room.lastIndexOf('. '), room.lastIndexOf('! '), room.lastIndexOf('? '))
  if (sentenceEnd >= max * 0.5) return room.slice(0, sentenceEnd + 1)
  const space = room.lastIndexOf(' ')
  const words = (space > 0 ? room.slice(0, space) : room).replace(/[\s,;:·—–-]+$/u, '')
  return `${words}…`
}

const firstSentence = (text?: string) => {
  const value = text?.replace(/\s+/g, ' ').trim() || ''
  const match = /^(.+?[.!?])(\s|$)/.exec(value)
  return (match ? match[1] : value).replace(/[.!?]+$/, '')
}

const TITLE_MAX = 90
const TITLE_MIN = 30

export const buildProjectTitleSuggestion = (input: {
  service: string
  area?: string
  packageName?: string
  keyword?: string
  description: string
}, fallbackSuffix = 'project scope and service details') => buildProjectTitleSuggestions(input, fallbackSuffix)[0]

/**
 * Three distinct local title ideas from the project facts, used when the AI
 * copy service is not configured (the AI returns three titles). Titles stay
 * within 30–90 characters and never end in a cut-off word.
 */
export const buildProjectTitleSuggestions = (input: {
  service: string
  area?: string
  packageName?: string
  keyword?: string
  description: string
}, fallbackSuffix = 'project scope and service details'): string[] => {
  const clean = (value?: string) => value?.replace(/\s+/g, ' ').trim() || ''
  const service = clean(input.service)
  const area = clean(input.area)
  const packageName = clean(input.packageName)
  const keyword = clean(input.keyword)
  const sentence = firstSentence(input.description)
  const padded = (title: string) => {
    const fitted = clipAtWord(title, TITLE_MAX)
    return fitted.length >= TITLE_MIN ? fitted : clipAtWord(`${fitted} — ${service} ${fallbackSuffix}`, TITLE_MAX)
  }
  const candidates = [
    `${service}: ${[area, packageName, keyword].filter(Boolean).join(' · ') || sentence}`,
    `${service}: ${sentence || [packageName, area].filter(Boolean).join(' · ')}`,
    [packageName || keyword || area, `${service} ${fallbackSuffix}`].filter(Boolean).join(' — '),
    sentence ? `${sentence} — ${service}` : `${service} — ${[keyword, area, packageName].filter(Boolean).join(', ')}`,
    `${service} ${fallbackSuffix}`,
  ].map((title) => padded(title.replace(/:\s*$/, '')))
  const titles: string[] = []
  for (const title of candidates) {
    if (title && !titles.some((existing) => existing.toLocaleLowerCase() === title.toLocaleLowerCase())) titles.push(title)
    if (titles.length === 3) break
  }
  return titles
}

export const mergeFAQSuggestions = <T extends { question: string }>(existing: T[], suggestions: T[]) => {
  const merged = [...existing]
  suggestions.forEach((suggestion) => {
    if (!merged.some((current) => current.question.trim().toLocaleLowerCase() === suggestion.question.trim().toLocaleLowerCase())) merged.push(suggestion)
  })
  return merged
}
