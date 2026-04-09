import type { BookLanguage } from './types'

const HEBREW_CHAR_REGEX = /[\u0590-\u05FF]/
const LATIN_CHAR_REGEX = /[A-Za-z]/

export function detectBookLanguage(query: string): BookLanguage {
  const trimmed = query.trim()
  if (!trimmed) return 'other'

  const hasHebrew = HEBREW_CHAR_REGEX.test(trimmed)
  const hasLatin = LATIN_CHAR_REGEX.test(trimmed)

  if (hasLatin && !hasHebrew) {
    return 'en'
  }

  return 'other'
}
