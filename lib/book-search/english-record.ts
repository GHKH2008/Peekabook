import type { BookCandidate, BookRecord, FieldValue, SourceSnapshot } from './types'
import { normalizeIsbn, normalizeLanguage, normalizePageCount, normalizePublisher, normalizeTitle } from './normalize'

const ENGLISH_FIELD_PRIORITY: Record<string, Array<BookCandidate['source']>> = {
  title: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  series: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  authors: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  summary: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  genres: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  isbn10: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  isbn13: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
  language: ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'],
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

function normalizeCover(url?: string | null): string | null {
  if (!url) return null
  if (url.startsWith('//')) return `https:${url}`
  return url.replace('http://', 'https://')
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

function getLanguage(candidate: BookCandidate): string | null {
  const lang = normalizeLanguage(candidate.languages?.[0])
  return lang === 'unknown' ? null : lang
}

function getYear(candidate: BookCandidate): number | null {
  const raw = candidate.publish_date?.match(/\d{4}/)?.[0]
  if (raw) return Number(raw)
  if (candidate.publish_year) return candidate.publish_year
  return null
}

function titleCompatible(a: BookCandidate, b: BookCandidate): boolean {
  const ta = normalizeTitle(a.title)
  const tb = normalizeTitle(b.title)
  return ta.normalized === tb.normalized || ta.withoutSubtitle === tb.withoutSubtitle
}

function authorsCompatible(a: BookCandidate, b: BookCandidate): boolean {
  const aa = (a.authors || []).map((x) => x.trim().toLowerCase()).filter(Boolean)
  const bb = (b.authors || []).map((x) => x.trim().toLowerCase()).filter(Boolean)

  if (!aa.length || !bb.length) return true

  const overlap = aa.filter((name) => bb.includes(name))
  return overlap.length > 0
}

function publisherCompatible(a: BookCandidate, b: BookCandidate): boolean {
  const pa = normalizePublisher(a.publishers?.[0])
  const pb = normalizePublisher(b.publishers?.[0])
  if (!pa || !pb) return true
  return pa === pb
}

function yearCompatible(a: BookCandidate, b: BookCandidate): boolean {
  const ya = getYear(a)
  const yb = getYear(b)
  if (!ya || !yb) return true
  return Math.abs(ya - yb) <= 1
}

function pageCountCompatible(a: BookCandidate, b: BookCandidate): boolean {
  const pa = normalizePageCount(a.page_count)
  const pb = normalizePageCount(b.page_count)
  if (!pa || !pb) return true
  return Math.abs(pa - pb) <= 10
}

function sameEditionSafe(primary: BookCandidate, candidate: BookCandidate): boolean {
  const primaryIsbn13 = normalizeIsbn(primary.isbn13?.[0])
  const candidateIsbn13 = normalizeIsbn(candidate.isbn13?.[0])
  if (primaryIsbn13 && candidateIsbn13) return primaryIsbn13 === candidateIsbn13

  const primaryIsbn10 = normalizeIsbn(primary.isbn10?.[0])
  const candidateIsbn10 = normalizeIsbn(candidate.isbn10?.[0])
  if (primaryIsbn10 && candidateIsbn10) return primaryIsbn10 === candidateIsbn10

  if (primary.source === 'openlibrary' && candidate.source === 'openlibrary') {
    if (primary.source_edition_id && candidate.source_edition_id) {
      return primary.source_edition_id === candidate.source_edition_id
    }
  }

  return (
    getLanguage(primary) === getLanguage(candidate) &&
    titleCompatible(primary, candidate) &&
    authorsCompatible(primary, candidate) &&
    publisherCompatible(primary, candidate) &&
    yearCompatible(primary, candidate) &&
    pageCountCompatible(primary, candidate)
  )
}

function choosePrimaryEdition(editions: BookCandidate[]): BookCandidate {
  return [...editions].sort((a, b) => {
    const score = (c: BookCandidate) =>
      c.overall_candidate_score +
      (c.source === 'amazon' ? 120 : 0) +
      (c.cover_url ? 60 : 0) +
      (c.description ? 25 : 0) +
      (c.isbn13?.length ? 30 : 0) +
      (c.isbn10?.length ? 20 : 0)

    return score(b) - score(a)
  })[0]
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

function pickFieldFromSafeCandidates<T>(
  safeCandidates: BookCandidate[],
  field: keyof typeof ENGLISH_FIELD_PRIORITY,
  getter: (candidate: BookCandidate) => T | null | undefined
): FieldValue<T> {
  const sorted = [...safeCandidates].sort((a, b) => {
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

export function buildEnglishBookRecord(editions: BookCandidate[]): BookRecord {
  const primary = choosePrimaryEdition(editions)
  const safeCandidates = editions.filter((candidate) => sameEditionSafe(primary, candidate))

  const title = pickFieldFromSafeCandidates(safeCandidates, 'title', (c) => c.title || null)
  const series = pickFieldFromSafeCandidates(safeCandidates, 'series', (c) => extractSeries(c))
  const authors = pickFieldFromSafeCandidates(safeCandidates, 'authors', (c) => (c.authors?.length ? c.authors : null))
  const summary = pickFieldFromSafeCandidates(safeCandidates, 'summary', (c) => c.description || null)
  const genres = pickFieldFromSafeCandidates(safeCandidates, 'genres', (c) => (c.subjects?.length ? c.subjects : null))
  const isbn10 = pickFieldFromSafeCandidates(safeCandidates, 'isbn10', (c) => normalizeIsbn(c.isbn10?.[0]) || null)
  const isbn13 = pickFieldFromSafeCandidates(safeCandidates, 'isbn13', (c) => normalizeIsbn(c.isbn13?.[0]) || null)
  const language = pickFieldFromSafeCandidates(safeCandidates, 'language', (c) => getLanguage(c))
  const cover = pickFieldFromSafeCandidates(safeCandidates, 'cover', (c) => normalizeCover(c.cover_url))
  const publisher = pickFieldFromSafeCandidates(safeCandidates, 'publisher', (c) => c.publishers?.[0] || null)
  const publishedDate = pickFieldFromSafeCandidates(safeCandidates, 'publishedDate', (c) => c.publish_date || null)
  const pageCount = pickFieldFromSafeCandidates(safeCandidates, 'pageCount', (c) => normalizePageCount(c.page_count) || null)

  const key =
    isbn13.value ||
    isbn10.value ||
    `${normalizeTitle(String(title.value || primary.title || '')).withoutSubtitle}::${(authors.value || primary.authors || [])[0] || ''}::${language.value || getLanguage(primary) || 'en'}`

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
    sources: buildSourceSnapshots(safeCandidates),
    confidence,
  }
}
