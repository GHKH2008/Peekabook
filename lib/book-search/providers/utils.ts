import { isHebrewQuery, stripPunctuation, tokenizeTitle } from '../normalize'
import type { BookCandidate, BookProviderName } from '../types'

export async function fetchJson(url: string, timeoutMs = 5000): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'PeekabookBot/1.0 (+contact admin)' } })
    if (!res.ok) return null
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchHtml(url: string, timeoutMs = 5000): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'PeekabookBot/1.0 (+contact admin)' } })
    if (!res.ok) return null
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

export function readMetaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const m = html.match(pattern)
    if (m?.[1]) return m[1].trim()
  }
  return undefined
}

export function makeCandidate(input: {
  source: BookProviderName
  sourceId: string
  sourceWorkId?: string
  sourceEditionId?: string
  sourceUrl?: string
  title: string
  subtitle?: string
  authors?: string[]
  contributors?: string[]
  description?: string
  languages?: string[]
  subjects?: string[]
  publishers?: string[]
  publishDate?: string
  isbn10?: string[]
  isbn13?: string[]
  identifiers?: string[]
  coverUrl?: string
  pageCount?: number
  format?: string
  editionLabel?: string
  raw?: unknown
}): BookCandidate {
  const title = input.title || 'Unknown'
  const authors = input.authors || []
  const raw_title_normalized = stripPunctuation(title)
  const raw_authors_normalized = authors.map((author) => stripPunctuation(author)).filter(Boolean)
  const title_key = tokenizeTitle(title).join(' ')
  const author_key = raw_authors_normalized[0] || ''
  const isbn10 = (input.isbn10 || []).map((v) => v.replace(/[^0-9X]/gi, '').toUpperCase()).filter(Boolean)
  const isbn13 = (input.isbn13 || []).map((v) => v.replace(/[^0-9]/g, '')).filter(Boolean)
  const identifiers = Array.from(new Set([...(input.identifiers || []), ...isbn10, ...isbn13]))
  const publish_year = Number(input.publishDate?.match(/\d{4}/)?.[0]) || undefined
  const languages = (input.languages || []).filter(Boolean)

  return {
    source: input.source,
    source_work_id: input.sourceWorkId,
    source_edition_id: input.sourceEditionId || input.sourceId,
    source_url: input.sourceUrl,
    title,
    subtitle: input.subtitle,
    authors,
    contributors: input.contributors || [],
    description: input.description,
    languages,
    subjects: input.subjects || [],
    publishers: input.publishers || [],
    publish_year,
    publish_date: input.publishDate,
    isbn10,
    isbn13,
    identifiers,
    cover_url: input.coverUrl,
    page_count: input.pageCount,
    format: input.format,
    edition_label: input.editionLabel,
    raw_title_normalized,
    raw_authors_normalized,
    title_key,
    author_key,
    work_key_candidate: `${raw_title_normalized}::${author_key}`,
    source_confidence: 0,
    metadata_completeness_score: 0,
    title_match_score: 0,
    author_match_score: 0,
    isbn_match_score: 0,
    language_match_score: 0,
    retailer_match_score: 0,
    overall_candidate_score: 0,
    is_hebrew: isHebrewQuery(title) || languages.some((lang) => lang.toLowerCase().startsWith('he')),
    is_edition: Boolean(input.sourceEditionId || isbn10.length || isbn13.length),
    retailer_data: [],
    raw: input.raw,
    identity_keys: {
      openlibrary_work_id: input.source === 'openlibrary' ? input.sourceWorkId : undefined,
      openlibrary_edition_id: input.source === 'openlibrary' ? input.sourceEditionId : undefined,
      google_volume_id: input.source === 'google' ? input.sourceId : undefined,
      isbns: [...isbn10, ...isbn13],
    },
    source_attribution: [{ source: input.source, source_id: input.sourceId, source_url: input.sourceUrl, fields: ['title', 'authors'] }],
  }
}
