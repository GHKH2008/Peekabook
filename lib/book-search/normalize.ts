const HEBREW_NIKKUD_RE = /[\u0591-\u05C7]/g
const QUOTE_RE = /[“”„‟«»]/g
const APOSTROPHE_RE = /[’‘‚‛`´]/g
const DASH_RE = /[‐‑‒–—―]/g
const FINAL_FORM_REPLACEMENTS: Record<string, string> = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
}

export function normalizeHebrewText(value: string): string {
  return String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(HEBREW_NIKKUD_RE, '')
    .replace(QUOTE_RE, '"')
    .replace(APOSTROPHE_RE, "'")
    .replace(DASH_RE, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeHebrewFinalForms(value: string): string {
  return normalizeHebrewText(value)
    .split('')
    .map((char) => FINAL_FORM_REPLACEMENTS[char] || char)
    .join('')
}

export function stripPunctuation(value: string): string {
  return normalizeHebrewFinalForms(value)
    .replace(/["'.,/#!$%^&*;:{}=_`~()\[\]\\|?<>+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function tokenizeTitle(value: string): string[] {
  return stripPunctuation(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
}

function transliterationHint(value: string): string | undefined {
  const normalized = normalizeHebrewFinalForms(value)
  if (!/[\u0590-\u05FF]/.test(normalized)) return undefined

  const map: Record<string, string> = {
    א: 'a',
    ב: 'b',
    ג: 'g',
    ד: 'd',
    ה: 'h',
    ו: 'v',
    ז: 'z',
    ח: 'ch',
    ט: 't',
    י: 'i',
    כ: 'k',
    ל: 'l',
    מ: 'm',
    נ: 'n',
    ס: 's',
    ע: 'a',
    פ: 'p',
    צ: 'tz',
    ק: 'k',
    ר: 'r',
    ש: 'sh',
    ת: 't',
  }

  const translated = normalized
    .split('')
    .map((char) => (char === ' ' ? ' ' : map[char] ?? ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

  return translated.length >= 4 ? translated : undefined
}

export function buildSearchVariants(query: string): string[] {
  const trimmed = query.trim()
  const normalized = normalizeHebrewText(trimmed)
  const normalizedFinalForms = normalizeHebrewFinalForms(trimmed)
  const stripped = stripPunctuation(trimmed)
  const quoted = `"${normalized}"`
  const transliterated = transliterationHint(trimmed)

  return Array.from(new Set([trimmed, normalized, normalizedFinalForms, stripped, quoted, transliterated].filter(Boolean) as string[]))
}

export function isHebrewQuery(query: string): boolean {
  return /[\u0590-\u05FF]/.test(query)
}
