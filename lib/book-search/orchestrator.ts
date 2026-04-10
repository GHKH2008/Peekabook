import { detectBookLanguage } from './language'
import { mergeMissingFields } from './english-utils'
import { enrichFromExtras } from './providers/extras'
import { enrichFromGoogle } from './providers/google'
import { enrichFromOpenLibrary } from './providers/open-library'
import { enrichAmazonEdition, searchAmazonEnglishCandidates } from './providers/amazon'
import type { EnglishBook } from './types'

function cleanString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const lowered = trimmed.toLowerCase()
  if (lowered === 'unknown' || lowered === 'n/a' || lowered === 'not available') return undefined
  return trimmed
}

function cleanPageCount(value?: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0) return undefined
  return Math.floor(value)
}

function isWeakEdition(book: EnglishBook): boolean {
  const publisher = cleanString(book.publisher)
  const pageCount = cleanPageCount(book.pageCount)
  return !publisher || !pageCount
}

function hardDedupeByEdition(books: EnglishBook[]): EnglishBook[] {
  const seen = new Set<string>()
  const result: EnglishBook[] = []

  for (const book of books) {
    const key = [
      book.sourceEditionId || '',
      (book.formatLabel || book.format || 'unknown').toLowerCase(),
      (book.isbn13 || '').toLowerCase(),
      (book.isbn || '').toLowerCase(),
      book.title.toLowerCase(),
      (book.publishedDate || '').toLowerCase(),
    ].join('|')

    if (seen.has(key)) continue
    seen.add(key)
    result.push(book)
  }

  return result
}

function sortBooks(books: EnglishBook[]): EnglishBook[] {
  return [...books].sort((a, b) => {
    const aHasPublisher = cleanString(a.publisher) ? 1 : 0
    const bHasPublisher = cleanString(b.publisher) ? 1 : 0
    if (bHasPublisher !== aHasPublisher) return bHasPublisher - aHasPublisher

    const aHasPages = cleanPageCount(a.pageCount) ? 1 : 0
    const bHasPages = cleanPageCount(b.pageCount) ? 1 : 0
    if (bHasPages !== aHasPages) return bHasPages - aHasPages

    const aHasIsbn = a.isbn13 || a.isbn ? 1 : 0
    const bHasIsbn = b.isbn13 || b.isbn ? 1 : 0
    if (bHasIsbn !== aHasIsbn) return bHasIsbn - aHasIsbn

    return a.title.localeCompare(b.title)
  })
}

export async function searchBooksSequential(query: string): Promise<EnglishBook[]> {
  const language = detectBookLanguage(query)
  if (language !== 'en') return []

  const amazonCandidates = await searchAmazonEnglishCandidates(query, 20)

  const baseCandidates: EnglishBook[] = amazonCandidates.map((candidate) => ({
    title: candidate.title,
    authors: candidate.authors,
    summary: undefined,
    genres: [],
    isbn: undefined,
    isbn13: undefined,
    language: candidate.language,
    cover: candidate.cover,
    publisher: undefined,
    publishedDate: undefined,
    pageCount: undefined,
    format: candidate.format,
    formatLabel: candidate.formatLabel,
    sourceEditionId: candidate.sourceEditionId,
    sourceRefs: candidate.sourceRefs,
    sourceTrace: ['amazon-search'],
  }))

  const enrichedSequentially: EnglishBook[] = []

  for (const candidate of baseCandidates) {
    let current = candidate

    const amazonEdition = await enrichAmazonEdition(current)
    current = mergeMissingFields(current, amazonEdition, 'amazon-detail')

    if (isWeakEdition(current)) {
      const googleEnrichment = await enrichFromGoogle(current)
      current = mergeMissingFields(current, googleEnrichment, 'google')
    }

    if (isWeakEdition(current)) {
      const openLibraryEnrichment = await enrichFromOpenLibrary(current)
      current = mergeMissingFields(current, openLibraryEnrichment, 'open-library')
    }

    if (isWeakEdition(current)) {
      const extrasEnrichment = await enrichFromExtras(current)
      current = mergeMissingFields(current, extrasEnrichment, 'extras')
    }

    current = {
      ...current,
      publisher: cleanString(current.publisher),
      publishedDate: cleanString(current.publishedDate),
      language: cleanString(current.language),
      isbn: cleanString(current.isbn),
      isbn13: cleanString(current.isbn13),
      cover: cleanString(current.cover),
      series: cleanString(current.series),
      pageCount: cleanPageCount(current.pageCount),
    }

    enrichedSequentially.push(current)
  }

  const deduped = hardDedupeByEdition(enrichedSequentially)
  return sortBooks(deduped).slice(0, 20)
}
