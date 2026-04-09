import { searchBooksOrchestrated } from '@/lib/book-search/orchestrator'
import { stripPunctuation } from '@/lib/book-search/normalize'
import type { GroupedBookResult, NormalizedBookResult } from '@/lib/book-search/types'

export type BookSourceName =
  | 'google'
  | 'openlibrary'
  | 'amazon'
  | 'steimatzky'
  | 'booknet'
  | 'indiebook'
  | 'simania'
  | 'gutendex'
  | 'wikipedia'
  | 'wikidata'
  | 'nli_catalog'
  | 'hebrewbooks_catalog'
  | 'israel_books_catalog'

export type GoogleBook = {
  id: string
  groupId?: string
  source?: BookSourceName
  sourceTrace?: BookSourceName[]
  sourceDetails?: {
    sources: Partial<Record<BookSourceName, { id?: string; link?: string }>>
    debug?: {
      mergedIds: string[]
      reasons: string[]
      confidence: number
      score?: number
    }
    openLibrary?: {
      workKey?: string
      editionKey?: string
      isEdition?: boolean
      rankReasons?: string[]
    }
    retailers?: Array<Record<string, unknown>>
    topics?: string[]
    allCoverUrls?: string[]
  }
  volumeInfo: {
    title: string
    subtitle?: string
    authors?: string[]
    description?: string
    categories?: string[]
    industryIdentifiers?: Array<{
      type: string
      identifier: string
    }>
    language?: string
    imageLinks?: {
      thumbnail?: string
      smallThumbnail?: string
    }
    publisher?: string
    publishedDate?: string
    pageCount?: number
    maturityRating?: string
  }
  editions?: GoogleBook[]
  editionCount?: number
}

function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('//')) return `https:${url}`
  return url.replace('http://', 'https://')
}

export async function searchGoogleBooks(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const debugEnabled = process.env.BOOK_SEARCH_DEBUG === 'true'
  const response = await searchBooksOrchestrated(normalizedQuery, {
    language: langRestrict,
    timeoutMs: Number(process.env.BOOK_PROVIDER_TIMEOUT_MS || 4500),
    debug: debugEnabled,
    maxResults: 100,
  })

  if (debugEnabled && response.debug) {
    console.info('[books-search] provider debug', response.debug)
  }

  return response.results.map(mapGroupedResultToGoogleBook)
}

function mapNormalizedResultToGoogleBook(result: NormalizedBookResult): GoogleBook {
  const identifiers = [
    result.isbn10?.[0] ? { type: 'ISBN_10', identifier: result.isbn10[0] } : null,
    result.isbn13?.[0] ? { type: 'ISBN_13', identifier: result.isbn13[0] } : null,
  ].filter((value): value is { type: string; identifier: string } => Boolean(value))

  return {
    id: `${result.source}:${result.source_edition_id || result.source_work_id || result.title_key}`,
    source: result.source,
    sourceTrace: Array.from(new Set([result.source, ...(result.source_attribution || []).map((item) => item.source)])),
    sourceDetails: {
      sources: Object.fromEntries(
        (result.source_attribution || []).map((item) => [item.source, { id: item.source_id, link: item.source_url }])
      ),
      debug: {
        mergedIds: [],
        reasons: [],
        confidence: 0,
      },
      openLibrary:
        result.source === 'openlibrary'
          ? {
              workKey: result.source_work_id,
              editionKey: result.source_edition_id,
              isEdition: Boolean(result.source_edition_id),
            }
          : undefined,
    },
    volumeInfo: {
      title: result.title,
      subtitle: result.subtitle,
      authors: result.authors,
      description: result.description,
      categories: result.subjects,
      industryIdentifiers: identifiers,
      language: result.languages?.[0],
      imageLinks: result.cover_url
        ? {
            thumbnail: normalizeImageUrl(result.cover_url),
            smallThumbnail: normalizeImageUrl(result.cover_url),
          }
        : undefined,
      publisher: result.publishers?.[0],
      publishedDate: result.publish_date,
      pageCount: result.page_count,
      maturityRating: 'NOT_MATURE',
    },
  }
}

function mapGroupedResultToGoogleBook(group: GroupedBookResult): GoogleBook {
  const primary = mapNormalizedResultToGoogleBook(group.primary)

  const seenEditionKeys = new Set<string>()
  const seenEditionSignatures = new Set<string>()

  const editionVariants = group.editions
    .filter(
      (edition) =>
        `${edition.source}:${edition.source_edition_id || edition.source_work_id || edition.title_key}` !==
        `${group.primary.source}:${group.primary.source_edition_id || group.primary.source_work_id || group.primary.title_key}`
    )
    .filter((edition) => {
      const key = `${edition.source}:${edition.source_edition_id || edition.source_work_id || edition.title_key}`
      if (seenEditionKeys.has(key)) return false
      seenEditionKeys.add(key)

      const isbn = [edition.isbn13?.[0], edition.isbn10?.[0]].find(Boolean) || ''
      const year = edition.publish_date?.match(/\d{4}/)?.[0] || ''
      const signature = [
        stripPunctuation(edition.title),
        stripPunctuation((edition.authors || [])[0] || ''),
        stripPunctuation((edition.publishers || [])[0] || ''),
        stripPunctuation((edition.languages || [])[0] || ''),
        year,
        isbn,
      ].join('::')

      if (seenEditionSignatures.has(signature)) return false
      seenEditionSignatures.add(signature)
      return true
    })
    .slice(0, 6)
    .map(mapNormalizedResultToGoogleBook)

  const displayTitle = group.primary.title || group.work.display_title || primary.volumeInfo.title
  const displayAuthors =
    group.primary.authors?.length ? group.primary.authors : group.work.display_authors?.length ? group.work.display_authors : primary.volumeInfo.authors
  const displayDescription = group.primary.description || group.work.description || primary.volumeInfo.description
  const displayCategories =
    group.primary.subjects?.length ? group.primary.subjects : group.work.subjects?.length ? group.work.subjects : primary.volumeInfo.categories

  const mergedTopics = Array.from(
    new Set([...(group.grouped_work.tags || []), ...(displayCategories || [])])
  ).slice(0, 30)

  return {
    ...primary,
    groupId: group.group_id,
    sourceTrace: Array.from(new Set([...(primary.sourceTrace || []), ...(group.work.source_badges || [])])),
    sourceDetails: {
      ...(primary.sourceDetails || { sources: {} }),
      debug: {
        mergedIds: editionVariants.map((item) => item.id),
        reasons: [`work:${group.work.canonical_work_id}`, `confidence:${group.work.source_confidence.toFixed(2)}`],
        confidence: group.work.source_confidence,
      },
      retailers: group.grouped_work.retailers,
      topics: mergedTopics,
      allCoverUrls: group.grouped_work.all_cover_urls || [],
      openLibrary:
        primary.source === 'openlibrary'
          ? {
              workKey: group.primary.source_work_id,
              editionKey: group.primary.source_edition_id,
              isEdition: Boolean(group.primary.source_edition_id),
            }
          : primary.sourceDetails?.openLibrary,
    },
    volumeInfo: {
      ...primary.volumeInfo,
      title: displayTitle,
      authors: displayAuthors,
      description: displayDescription,
      categories: displayCategories,
      language: group.primary.languages?.[0] || group.work.language || primary.volumeInfo.language,
      imageLinks: {
        thumbnail: normalizeImageUrl(group.grouped_work.best_cover_url || primary.volumeInfo.imageLinks?.thumbnail),
        smallThumbnail: normalizeImageUrl(group.grouped_work.best_cover_url || primary.volumeInfo.imageLinks?.smallThumbnail),
      },
      publisher: group.primary.publishers?.[0] || primary.volumeInfo.publisher,
      publishedDate: group.primary.publish_date || primary.volumeInfo.publishedDate,
      pageCount: group.primary.page_count || primary.volumeInfo.pageCount,
    },
    editions: editionVariants,
    editionCount: group.total_editions,
  }
}

export function parseGoogleBook(book: GoogleBook) {
  const info = book.volumeInfo
  const identifiers = info.industryIdentifiers || []

  return {
    google_books_id: book.id,
    title: info.title,
    authors: info.authors || null,
    summary: info.description || null,
    genres: info.categories || null,
    isbn: identifiers.find((i) => i.type === 'ISBN_10')?.identifier || null,
    isbn_13: identifiers.find((i) => i.type === 'ISBN_13')?.identifier || null,
    language: info.language || null,
    cover_url: normalizeImageUrl(info.imageLinks?.thumbnail) || normalizeImageUrl(info.imageLinks?.smallThumbnail) || null,
    publisher: info.publisher || null,
    published_date: info.publishedDate || null,
    page_count: info.pageCount || null,
    is_adult: info.maturityRating === 'MATURE',
    source_refs: Object.keys(book.sourceDetails?.sources || {}).length > 0 ? book.sourceDetails?.sources : null,
    source_trace: book.sourceTrace || null,
  }
}
