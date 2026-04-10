import { detectBookLanguage } from './language'
import {
  hardDedupeEnglishBooks,
  mergeMissingFields,
} from './english-utils'
import { enrichFromExtras } from './providers/extras'
import { enrichFromGoogle } from './providers/google'
import { enrichFromOpenLibrary } from './providers/open-library'
import { enrichAmazonCandidate, searchAmazonEnglishCandidates } from './providers/amazon'
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

function isWeakBook(book: EnglishBook): boolean {
  return !cleanString(book.publisher) || !cleanPageCount(book.pageCount)
}

function normalizeBook(book: EnglishBook): EnglishBook {
  return {
    ...book,
    title: cleanString(book.title) || book.title,
    series: cleanString(book.series),
    authors: Array.isArray(book.authors)
      ? book.authors.map((a) => a.trim()).filter(Boolean)
      : [],
    summary: cleanString(book.summary),
    genres: Array.isArray(book.genres)
      ? book.genres.map((g) => g.trim()).filter(Boolean)
      : [],
    isbn: cleanString(book.isbn),
    isbn13: cleanString(book.isbn13),
    language: cleanString(book.language),
    cover: cleanString(book.cover),
    publisher: cleanString(book.publisher),
    publishedDate: cleanString(book.publishedDate),
    pageCount: cleanPageCount(book.pageCount),
    sourceTrace: Array.isArray(book.sourceTrace)
      ? book.sourceTrace.map((s) => s.trim()).filter(Boolean)
      : [],
  }
}

export async function searchBooksSequential(query: string): Promise<EnglishBook[]> {
  const language = detectBookLanguage(query)
  if (language !== 'en') return []

  const amazonCandidates = await searchAmazonEnglishCandidates(query, 20)

  const normalizedCandidates: EnglishBook[] = amazonCandidates.map((candidate) =>
    normalizeBook({
      title: candidate.title,
      series: candidate.series,
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
      sourceEditionId: candidate.sourceEditionId,
      sourceRefs: candidate.sourceRefs,
      sourceTrace: ['amazon-search'],
    })
  )

  const enrichedSequentially: EnglishBook[] = []

  for (const candidate of normalizedCandidates) {
    let current = candidate

    const amazonEnrichment = await enrichAmazonCandidate(current)
    current = normalizeBook(mergeMissingFields(current, amazonEnrichment, 'amazon-detail'))

    if (isWeakBook(current)) {
      const googleEnrichment = await enrichFromGoogle(current)
      current = normalizeBook(mergeMissingFields(current, googleEnrichment, 'google'))
    }

    if (isWeakBook(current)) {
      const openLibraryEnrichment = await enrichFromOpenLibrary(current)
      current = normalizeBook(mergeMissingFields(current, openLibraryEnrichment, 'open-library'))
    }

    if (isWeakBook(current)) {
      const extrasEnrichment = await enrichFromExtras(current)
      current = normalizeBook(mergeMissingFields(current, extrasEnrichment, 'extras'))
    }

    enrichedSequentially.push(current)
  }

  return hardDedupeEnglishBooks(enrichedSequentially).slice(0, 20)
}
