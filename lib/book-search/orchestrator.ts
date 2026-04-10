import { mergeMissingFields } from './english-utils'
import { enrichFromGoogle } from './providers/google'
import { enrichFromOpenLibrary } from './providers/open-library'
import { enrichAmazonEdition, searchAmazonEnglishEditions } from './providers/amazon'
import type { EnglishBookEdition, EnglishBookGroup } from './types'

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

function normalizeEdition(book: EnglishBookEdition): EnglishBookEdition {
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
    formatLabel: cleanString(book.formatLabel),
    narrator: cleanString(book.narrator),
    edition: cleanString(book.edition),
    sourceTrace: Array.isArray(book.sourceTrace)
      ? book.sourceTrace.map((s) => s.trim()).filter(Boolean)
      : [],
  }
}

function needsEnrichment(book: EnglishBookEdition): boolean {
  return !book.publisher || !book.pageCount
}

function editionKey(book: EnglishBookEdition): string {
  return [
    book.title.toLowerCase(),
    (book.series || '').toLowerCase(),
    (book.formatLabel || book.format || 'unknown').toLowerCase(),
    (book.isbn13 || '').toLowerCase(),
    (book.isbn || '').toLowerCase(),
    (book.publishedDate || '').toLowerCase(),
    (book.sourceRefs?.amazonAsin || '').toLowerCase(),
  ].join('|')
}

function dedupeEditions(books: EnglishBookEdition[]): EnglishBookEdition[] {
  const seen = new Set<string>()
  const result: EnglishBookEdition[] = []

  for (const raw of books) {
    const book = normalizeEdition(raw)
    const key = editionKey(book)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(book)
  }

  return result
}

function groupBooks(editions: EnglishBookEdition[]): EnglishBookGroup[] {
  const groups = new Map<string, EnglishBookGroup>()

  for (const edition of editions) {
    const key = `${edition.title.toLowerCase()}|${(edition.series || '').toLowerCase()}|${edition.authors.join('|').toLowerCase()}`

    if (!groups.has(key)) {
      groups.set(key, {
        groupId: key,
        title: edition.title,
        series: edition.series,
        authors: edition.authors,
        cover: edition.cover,
        summary: edition.summary,
        editions: [],
      })
    }

    const group = groups.get(key)!
    if (!group.cover && edition.cover) group.cover = edition.cover
    if (!group.summary && edition.summary) group.summary = edition.summary
    group.editions.push(edition)
  }

  return Array.from(groups.values())
}

export async function searchBooksSequential(query: string): Promise<EnglishBookGroup[]> {
  const amazonEditions = await searchAmazonEnglishEditions(query, 20)

  const enriched: EnglishBookEdition[] = []

  for (const edition of amazonEditions) {
    let current = normalizeEdition(edition)

    const amazonDetails = await enrichAmazonEdition(current)
    current = normalizeEdition(mergeMissingFields(current, amazonDetails, 'amazon-detail'))

    if (needsEnrichment(current)) {
      const google = await enrichFromGoogle(current)
      current = normalizeEdition(mergeMissingFields(current, google, 'google'))
    }

    if (needsEnrichment(current)) {
      const openLibrary = await enrichFromOpenLibrary(current)
      current = normalizeEdition(mergeMissingFields(current, openLibrary, 'open-library'))
    }

    enriched.push(current)
  }

  return groupBooks(dedupeEditions(enriched))
}
