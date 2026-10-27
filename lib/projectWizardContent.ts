export const normalizeProjectKeywords = (existing: string[], input: string) => {
  const result = [...existing]
  input.split(',').map((keyword) => keyword.trim()).filter(Boolean).forEach((keyword) => {
    if (!result.some((current) => current.toLocaleLowerCase() === keyword.toLocaleLowerCase())) result.push(keyword)
  })
  return result
}

export const buildProjectTitleSuggestion = (input: {
  service: string
  area?: string
  packageName?: string
  keyword?: string
  description: string
}) => {
  const facts = [input.area, input.packageName, input.keyword, input.description]
    .map((value) => value?.replace(/\s+/g, ' ').trim())
    .filter((value): value is string => Boolean(value))
  const prefix = `${input.service.trim()}: `
  const title = `${prefix}${facts.join(' · ')}`.slice(0, 90).trim().replace(/[·\s]+$/u, '')
  return title.length >= 30 ? title : `${title} — ${input.service.trim()} project scope and service details`.slice(0, 90)
}

export const mergeFAQSuggestions = <T extends { question: string }>(existing: T[], suggestions: T[]) => {
  const merged = [...existing]
  suggestions.forEach((suggestion) => {
    if (!merged.some((current) => current.question.trim().toLocaleLowerCase() === suggestion.question.trim().toLocaleLowerCase())) merged.push(suggestion)
  })
  return merged
}
