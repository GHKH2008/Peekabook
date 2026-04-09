import type { BookCandidate, BookRecord, FieldValue, SourceSnapshot } from './types'
import { normalizeIsbn, normalizeLanguage, normalizePageCount, normalizeTitle } from './normalize'

const ENGLISH_FIELD_PRIORITY: Record<string, Array<BookCandidate['source']>> = {
  title: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  series: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  authors: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  summary: ['google', 'amazon', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  genres: ['google', 'openlibrary', 'amazon', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  isbn10: ['openlibrary', 'google', 'amazon', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  isbn13: ['openlibrary', 'google', 'amazon', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  language: ['google', 'openlibrary', 'amazon', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  cover: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  publisher: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  publishedDate: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  pageCount: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
}

function emptyField<T>(): FieldValue<T> {
  return { value: null, source: null, confidence: 0 }
}

function hasValue(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function sourcePriorityIndex(field: keyof typeof ENGLISH_FIELD_PRIORITY, source: BookCandidate['source']): number {
  const list = ENGLISH_FIELD_PRIORITY[field]
  const idx = list.indexOf(source)
  return idx === -1 ? 999 : idx
}

function pickBestCandidateForField<T>(
  editions: BookCandidate[],
  field: keyof typeof ENGLISH_FIELD_PRIORITY,
  getter: (candidate: BookCandidate) => T | null | undefined
): FieldValue<T> {
  const sorted = [...editions].sort((a, b) => {
    const pa = sourcePriorityIndex(field, a.source)
    const pb = sourcePriorityIndex(field, b.source)
    if (pa !== pb) return pa - pb
    return b.overall_candidate_score - a.overall_candidate_score
  })

  for (const candidate of sorted) {
    const value = getter(candidate)
    if (hasValue(value)) {
      return {
        value: value as T,
        source: candidate.source,
        confidence: Math.max(0.5, Math.min(1, candidate.source_confidence || 0.75)),
      }
    }
  }

  return emptyField<T>()
}

function extractSeries(candidate: BookCandidate): string | null {
  if (candidate.series?.trim()) return candidate.series.trim()
  if (candidate.series_name?.trim()) return candidate.series_name.trim()

  const subtitle = candidate.subtitle?.trim()
  if (!subtitle) return null

  const m = subtitle.match(/^(.+?)\s+#?\d+$/i)
  if (m?.[1]) return m[1].trim()

  return null
}

function normalizeCover(url?: string | null): string | null {
  if (!url) return null
  if (url.startsWith('//')) return `https:${url}`
  return url.replace('http://', 'https://')
}

function buildSourceSnapshots(editions: BookCandidate[]): SourceSnapshot[] {
  const seen = new Set<string>()
  const result: SourceSnapshot[] = []

  for (const edition of editions) {
    const key = `${edition.source}:${edition.source_edition_id || edition.source_work_id || edition.title_key}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      source: edition.source,
      sourceId: edition.source_edition_id || edition.source_work_id || edition.title_key || null,
      url: edition.source_url || null,
      raw: edition.raw,
    })
  }

  return result
}

export function buildEnglishBookRecord(editions: BookCandidate[]): BookRecord {
  const title = pickBestCandidateForField(editions, 'title', (c) => c.title || null)
  const series = pickBestCandidateForField(editions, 'series', (c) => extractSeries(c))
  const authors = pickBestCandidateForField(editions, 'authors', (c) => (c.authors?.length ? c.authors : null))
  const summary = pickBestCandidateForField(editions, 'summary', (c) => c.description || null)
  const genres = pickBestCandidateForField(editions, 'genres', (c) => (c.subjects?.length ? c.subjects : null))
  const isbn10 = pickBestCandidateForField(editions, 'isbn10', (c) => normalizeIsbn(c.isbn10?.[0]) || null)
  const isbn13 = pickBestCandidateForField(editions, 'isbn13', (c) => normalizeIsbn(c.isbn13?.[0]) || null)
  const language = pickBestCandidateForField(editions, 'language', (c) => {
    const lang = normalizeLanguage(c.languages?.[0])
    return lang === 'unknown' ? null : lang
  })
  const cover = pickBestCandidateForField(editions, 'cover', (c) => normalizeCover(c.cover_url))
  const publisher = pickBestCandidateForField(editions, 'publisher', (c) => c.publishers?.[0] || null)
  const publishedDate = pickBestCandidateForField(editions, 'publishedDate', (c) => c.publish_date || null)
  const pageCount = pickBestCandidateForField(editions, 'pageCount', (c) => normalizePageCount(c.page_count) || null)

  const key =
    isbn13.value ||
    isbn10.value ||
    `${normalizeTitle(String(title.value || '')).withoutSubtitle}::${(authors.value || [])[0] || ''}::${language.value || 'en'}`

  const fields = [title, series, authors, summary, genres, isbn10, isbn13, language, cover, publisher, publishedDate, pageCount]
  const totalConfidence = fields.reduce((sum, field) => sum + field.confidence, 0)
  const confidence = Number((totalConfidence / fields.length).toFixed(3))

  return {
    key,
    language,
    title,
    series,
    authors,
    summary,
    genres,
    isbn10,
    isbn13,
    cover,
    publisher,
    publishedDate,
    pageCount,
    hebrewCategory: emptyField<string>(),
    hebrewSku: emptyField<string>(),
    sources: buildSourceSnapshots(editions),
    confidence,
  }
}
