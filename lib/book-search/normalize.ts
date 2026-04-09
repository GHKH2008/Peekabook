const HEBREW_NIKKUD_RE = /[\u0591-\u05C7]/g
const QUOTE_RE = /[“”„‟«»]/g
const APOSTROPHE_RE = /[’‘‚‛`´]/g
const DASH_RE = /[‐‑‒–—―]/g

const EN_STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'from'])

const LANGUAGE_ALIAS: Record<string, 'en' | 'he' | 'unknown'> = {
  en: 'en',
  eng: 'en',
  english: 'en',
  he: 'he',
  heb: 'he',
  hebrew: 'he',
  עברית: 'he',
}

function normalizeBase(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(HEBREW_NIKKUD_RE, '')
    .replace(QUOTE_RE, '"')
    .replace(APOSTROPHE_RE, "'")
    .replace(DASH_RE, '-')
}

export function stripPunctuation(value: string): string {
  return normalizeBase(value)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/[\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function normalizeTitle(value: string): { normalized: string; withoutSubtitle: string } {
  const normalized = stripPunctuation(value)
  const withoutSubtitle = normalized.split(/\s[:\-–—]\s|\s[|]\s/)[0]?.trim() || normalized
  return { normalized, withoutSubtitle }
}

export function normalizeAuthorName(value: string): string {
  return stripPunctuation(value).replace(/\s+/g, ' ').trim()
}

export function normalizeAuthorArray(values: string[] = []): string[] {
  return values.map(normalizeAuthorName).filter(Boolean)
}

export function normalizeIsbn(value?: string | null): string | undefined {
  const normalized = String(value || '').replace(/[^0-9X]/gi, '').toUpperCase()
  if (normalized.length === 10 || normalized.length === 13) return normalized
  return undefined
}

export function normalizeLanguage(value?: string | null): 'en' | 'he' | 'unknown' {
  const input = stripPunctuation(String(value || '')).replace(/\s+/g, '')
  return LANGUAGE_ALIAS[input] || (/[\u0590-\u05FF]/.test(String(value || '')) ? 'he' : 'unknown')
}

export function normalizePublisher(value?: string | null): string {
  return stripPunctuation(String(value || '')).replace(/\b(inc|ltd|llc|publishing|publishers|publisher)\b/g, '').replace(/\s+/g, ' ').trim()
}

export function normalizeDate(value?: string | null): string | undefined {
  const str = String(value || '').trim()
  if (!str) return undefined
  const year = str.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/)?.[1]
  if (!year) return undefined
  if (/^\d{4}$/.test(str)) return year
  const monthDay = str.match(/\d{4}-(\d{2})(?:-(\d{2}))?/)
  if (!monthDay) return year
  return `${year}-${monthDay[1]}${monthDay[2] ? `-${monthDay[2]}` : ''}`
}

export function normalizePageCount(value?: number | string | null): number | undefined {
  const n = Number(String(value ?? '').replace(/[^0-9]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

export function tokenizeTitle(value: string): string[] {
  return stripPunctuation(value)
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function isHebrewQuery(query: string): boolean {
  return /[\u0590-\u05FF]/.test(query)
}

function detectLanguage(query: string): 'he' | 'en' | 'unknown' {
  if (isHebrewQuery(query)) return 'he'
  if (/[a-z]/i.test(query)) return 'en'
  return 'unknown'
}

function extractIsbnCandidates(query: string): string[] {
  const compact = query.replace(/[^0-9X]/gi, '').toUpperCase()
  const tokens = query
    .split(/\s+/)
    .map((token) => token.replace(/[^0-9X-]/gi, '').replace(/-/g, '').toUpperCase())
    .filter((token) => token.length === 10 || token.length === 13)
  if (compact.length === 10 || compact.length === 13) tokens.push(compact)
  return Array.from(new Set(tokens))
}

export type NormalizedQuery = {
  raw_query: string
  normalized_query: string
  tokenized_query: string[]
  query_without_punctuation: string
  compact_query: string
  language_guess: 'he' | 'en' | 'unknown'
  isbn_candidates: string[]
  phrase_query: string
  significant_tokens: string[]
  stopword_light_query: string
  typo_tolerant_query: string
  raw: string
  tokens: string[]
}

export function normalizeQuery(query: string): NormalizedQuery {
  const raw_query = String(query || '')
  const normalized_query = normalizeBase(raw_query).replace(/\s+/g, ' ').trim().toLowerCase()
  const query_without_punctuation = stripPunctuation(raw_query)
  const tokenized_query = tokenizeTitle(raw_query)
  const compact_query = query_without_punctuation.replace(/\s+/g, '')
  const language_guess = detectLanguage(raw_query)
  const isbn_candidates = extractIsbnCandidates(raw_query)
  const significant_tokens = language_guess === 'en' ? tokenized_query.filter((token) => !EN_STOPWORDS.has(token)) : [...tokenized_query]
  const stopword_light_query = significant_tokens.join(' ')
  const typo_tolerant_query = significant_tokens.map((token) => token.replace(/(ing|ed|es|s)$/i, '')).join(' ')

  return {
    raw_query,
    normalized_query,
    tokenized_query,
    query_without_punctuation,
    compact_query,
    language_guess,
    isbn_candidates,
    phrase_query: raw_query.trim(),
    significant_tokens,
    stopword_light_query,
    typo_tolerant_query,
    raw: query_without_punctuation,
    tokens: tokenized_query,
  }
}

function transliterationHint(value: string): string | undefined {
  if (!isHebrewQuery(value)) return undefined
  const map: Record<string, string> = {
    א: 'a', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'v', ז: 'z', ח: 'ch', ט: 't', י: 'i', כ: 'k', ל: 'l', מ: 'm', נ: 'n',
    ס: 's', ע: 'a', פ: 'p', צ: 'tz', ק: 'k', ר: 'r', ש: 'sh', ת: 't',
  }
  const translated = normalizeBase(value)
    .split('')
    .map((char) => (char === ' ' ? ' ' : map[char] ?? ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return translated.length >= 4 ? translated : undefined
}

export function buildSearchVariants(query: string): string[] {
  const q = normalizeQuery(query)
  const transliterated = transliterationHint(query)
  const titleForms = normalizeTitle(query)
  return Array.from(
    new Set(
      [q.raw_query, `"${q.phrase_query}"`, q.normalized_query, q.query_without_punctuation, q.stopword_light_query, q.typo_tolerant_query, titleForms.withoutSubtitle, transliterated].filter(
        (v): v is string => Boolean(v && v.trim())
      )
    )
  )
}
