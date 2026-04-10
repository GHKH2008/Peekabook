import { hardDedupeEnglishBooks, mergeMissingFields } from './english-utils'
import { enrichFromGoogle } from './providers/google'
import { searchGoodreadsBooks } from './providers/goodreads'
import { enrichFromOpenLibrary } from './providers/open-library'
import type { EnglishBook } from './types'

function cleanString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const lowered = trimmed.toLowerCase()
  if (
    lowered === 'unknown' ||
    lowered === 'n/a' ||
    lowered === 'not available' ||
    lowered === 'none' ||
    lowered === 'null' ||
    lowered === 'undefined'
  ) {
    return undefined
  }
  return trimmed
}

function cleanPageCount(value?: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0) return undefined
  return Math.floor(value)
}

function normalizeBook(book: EnglishBook): EnglishBook {
  return {
    ...book,
    title: cleanString(book.title) || book.title,
    series: cleanString(book.series),
    authors: Array.isArray(book.authors) ? book.authors.map((a) => a.trim()).filter(Boolean) : [],
    summary: cleanString(book.summary),
    genres: Array.isArray(book.genres) ? book.genres.map((g) => g.trim()).filter(Boolean) : [],
    isbn: cleanString(book.isbn),
    isbn13: cleanString(book.isbn13),
    language: cleanString(book.language),
    cover: cleanString(book.cover),
    publisher: cleanString(book.publisher),
    publishedDate: cleanString(book.publishedDate),
    pageCount: cleanPageCount(book.pageCount),
    sourceTrace: Array.isArray(book.sourceTrace) ? book.sourceTrace.map((s) => s.trim()).filter(Boolean) : [],
  }
}

function needsFallbackEnrichment(book: EnglishBook): boolean {
  return !book.publisher || !book.publishedDate || !book.pageCount || !book.isbn || !book.isbn13 || !book.language || !book.summary
}

export async function searchBooksSequential(query: string): Promise<EnglishBook[]> {
  let goodreadsResults: EnglishBook[] = []

  try {
    goodreadsResults = await searchGoodreadsBooks(query, 20)
  } catch (error) {
    console.error('goodreads search pipeline crashed:', { query, error })
    return []
  }

  if (!goodreadsResults.length) return []

  const normalized = goodreadsResults.map((book) => normalizeBook(book))
  const enriched: EnglishBook[] = []

  for (const book of normalized) {
    let current = book

    if (needsFallbackEnrichment(current)) {
      const googleEnrichment = await enrichFromGoogle(current)
      current = normalizeBook(mergeMissingFields(current, googleEnrichment, 'google'))
    }

    if (needsFallbackEnrichment(current)) {
      const openLibraryEnrichment = await enrichFromOpenLibrary(current)
      current = normalizeBook(mergeMissingFields(current, openLibraryEnrichment, 'open-library'))
    }

    enriched.push(current)
  }

  return hardDedupeEnglishBooks(enriched).slice(0, 20)
}
