const HEBREW_NIKKUD_RE = /[\u0591-\u05C7]/g
const QUOTE_RE = /[“”„‟«»]/g
const APOSTROPHE_RE = /[’‘‚‛`´]/g
const DASH_RE = /[‐‑‒–—―]/g

export function normalizeHebrewText(value: string): string {
  return value
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

export function stripPunctuation(value: string): string {
  return normalizeHebrewText(value)
    .replace(/["'.,/#!$%^&*;:{}=\-_`~()\[\]\\|?<>]/g, ' ')
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
  const normalized = normalizeHebrewText(value)
  if (!/[\u0590-\u05FF]/.test(normalized)) return undefined

  const map: Record<string, string> = {
    ש: 'sh',
    ו: 'v',
    מ: 'm',
    ר: 'r',
    י: 'i',
    ה: 'h',
    ז: 'z',
    נ: 'n',
    ל: 'l',
    ת: 't',
    ק: 'k',
  }

  const translated = normalized
    .split('')
    .map((char) => map[char] ?? '')
    .join('')

  return translated.length >= 4 ? translated : undefined
}

export function buildSearchVariants(query: string): string[] {
  const normalized = normalizeHebrewText(query)
  const stripped = stripPunctuation(query)
  const quoted = `"${normalized}"`
  const transliterated = transliterationHint(query)

  return Array.from(new Set([query.trim(), normalized, stripped, quoted, transliterated].filter(Boolean) as string[]))
}

export function isHebrewQuery(query: string): boolean {
  return /[\u0590-\u05FF]/.test(query)
}
