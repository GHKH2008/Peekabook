import { normalizeBookIdentifier, normalizeBookLanguage, normalizeBookText, normalizeHebrewForComparison } from '@/lib/book-merge'
import { searchBooksOrchestrated } from '@/lib/book-search/orchestrator'
import { stripPunctuation } from '@/lib/book-search/normalize'
import type { GroupedBookResult, NormalizedBookResult } from '@/lib/book-search/types'

export type BookSourceName =
  | 'google'
  | 'openlibrary'
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

export type GoogleBooksResponse = {
  totalItems: number
  items?: GoogleBook[]
}

type OpenLibrarySearchDoc = {
  key?: string
  type?: 'work' | 'edition'
  edition_key?: string[]
  cover_edition_key?: string
  subtitle?: string
  title?: string
  author_name?: string[]
  author_key?: string[]
  first_sentence?: string | { value?: string }
  first_publish_year?: number
  publish_year?: number[]
  publish_date?: string[]
  subject?: string[]
  isbn?: string[]
  id_goodreads?: string[]
  id_librarything?: string[]
  language?: string[]
  cover_i?: number
  publisher?: string[]
  number_of_pages_median?: number
}

type OpenLibrarySearchResponse = {
  numFound?: number
  docs?: OpenLibrarySearchDoc[]
}

type OpenLibraryEdition = {
  key?: string
  title?: string
  subtitle?: string
  works?: Array<{ key?: string }>
  authors?: Array<{ key?: string; name?: string }>
  by_statement?: string
  isbn_10?: string[]
  isbn_13?: string[]
  covers?: number[]
  languages?: Array<{ key?: string }>
  publishers?: string[]
  publish_date?: string
  publish_places?: string[]
  number_of_pages?: number
  description?: string | { value?: string }
}

type OpenLibraryEditionsResponse = {
  entries?: OpenLibraryEdition[]
}

type GutendexPerson = {
  name?: string
}

type GutendexBook = {
  id: number
  title?: string
  subjects?: string[]
  authors?: GutendexPerson[]
  summaries?: string[]
  languages?: string[]
  formats?: Record<string, string>
}

type GutendexResponse = {
  results?: GutendexBook[]
}

type WikipediaPageThumbnail = {
  source?: string
}

type WikipediaPageTerms = {
  description?: string[]
}

type WikipediaPage = {
  pageid?: number
  title?: string
  extract?: string
  thumbnail?: WikipediaPageThumbnail
  categories?: Array<{ title?: string }>
  terms?: WikipediaPageTerms
}

type WikipediaQueryResponse = {
  query?: {
    pages?: Record<string, WikipediaPage>
  }
}

type WikidataSearchResult = {
  id?: string
  label?: string
  description?: string
}

type WikidataSearchResponse = {
  search?: WikidataSearchResult[]
}

type RankedBook = {
  book: GoogleBook
  score: number
  reasons: string[]
}

type BookSourceAdapter = {
  name: BookSourceName
  priority: number
  supportsLanguageFilter?: boolean
  isHebrewFocused?: boolean
  enabled?: () => boolean
  search: (query: string, langRestrict?: string) => Promise<GoogleBook[]>
}

const HEBREW_RE = /[\u0590-\u05FF]/
const NIKKUD_RE = /[\u0591-\u05C7]/g
const OPEN_LIBRARY_LANGUAGE_FILTER: Record<string, string> = {
  en: 'eng',
  he: 'heb',
}
const SOURCE_HEBREW_QUALITY: Partial<Record<BookSourceName, number>> = {
  google: 24,
  openlibrary: 34,
  steimatzky: 48,
  booknet: 46,
  indiebook: 44,
  simania: 42,
  wikidata: 8,
  wikipedia: 10,
  gutendex: -8,
  nli_catalog: 36,
  hebrewbooks_catalog: 26,
  israel_books_catalog: 30,
}
const SOURCE_BASE_QUALITY: Partial<Record<BookSourceName, number>> = {
  openlibrary: 22,
  google: 18,
  steimatzky: 28,
  booknet: 27,
  indiebook: 25,
  simania: 24,
  wikidata: 4,
  wikipedia: 0,
  gutendex: -2,
}
const OPEN_LIBRARY_FETCH_TIMEOUT_MS = 6000
const OPEN_LIBRARY_EDITION_EXPANSION_LIMIT = 4
const OPEN_LIBRARY_EDITIONS_PER_WORK_LIMIT = 40
const openLibraryWorkEditionsCache = new Map<string, Promise<GoogleBook[]>>()
const HEBREW_PUBLISHER_HINTS = [
  'כתר',
  'עם עובד',
  'ידיעות',
  'ספרית',
  'מוסד ביאליק',
  'כתר הוצאה',
  'יד ושם',
  'כנרת',
  'זמורה',
  'דביר',
]

function normalizeText(value: string | null | undefined): string {
  return normalizeBookText(value)
}

function normalizeHebrewForMatch(value: string | null | undefined): string {
  return normalizeHebrewForComparison(value)
}

function normalizeIdentifier(value: string | null | undefined): string {
  return normalizeBookIdentifier(value)
}

function normalizeLanguage(value: string | null | undefined): string | undefined {
  return normalizeBookLanguage(value)
}

function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('//')) return `https:${url}`
  return url.replace('http://', 'https://')
}

function isLikelyIsbn(value: string): boolean {
  return /^[\dX-]{10,17}$/i.test(value.trim())
}

function fetchDescriptionSentence(
  firstSentence: string | { value?: string } | undefined
): string | undefined {
  if (typeof firstSentence === 'string') return firstSentence
  return firstSentence?.value
}

function hasHebrewText(value: string | null | undefined): boolean {
  return HEBREW_RE.test(String(value || ''))
}

function getPrimaryBookText(book: GoogleBook): string {
  return `${book.volumeInfo.title || ''} ${(book.volumeInfo.authors || []).join(' ')}`
}

function getBookIsbnCandidates(book: GoogleBook): string[] {
  return (book.volumeInfo.industryIdentifiers || [])
    .map((identifier) => normalizeIdentifier(identifier.identifier))
    .filter(Boolean)
}

function withSourceTrace(book: GoogleBook): GoogleBook {
  const trace = new Set<BookSourceName>(book.source ? [book.source] : [])
  for (const source of book.sourceTrace || []) {
    trace.add(source)
  }

  const sources: Partial<Record<BookSourceName, { id?: string; link?: string }>> = {
    ...(book.sourceDetails?.sources || {}),
  }

  if (book.source && !sources[book.source]) {
    sources[book.source] = { id: book.id }
  }

  return {
    ...book,
    sourceTrace: Array.from(trace),
    sourceDetails: {
      ...(book.sourceDetails || { sources: {} }),
      sources,
    },
  }
}

function buildOpenLibraryCoverUrl(
  doc: Pick<OpenLibrarySearchDoc, 'cover_i' | 'isbn' | 'key'>
): string | undefined {
  if (doc.cover_i) {
    return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
  }

  const isbn13 = doc.isbn?.find((isbn) => normalizeIdentifier(isbn).length === 13)
  if (isbn13) {
    return `https://covers.openlibrary.org/b/isbn/${normalizeIdentifier(isbn13)}-L.jpg`
  }

  const isbn10 = doc.isbn?.find((isbn) => normalizeIdentifier(isbn).length === 10)
  if (isbn10) {
    return `https://covers.openlibrary.org/b/isbn/${normalizeIdentifier(isbn10)}-L.jpg`
  }

  if (doc.key) {
    const olid = doc.key.split('/').filter(Boolean).pop()
    if (olid) {
      return `https://covers.openlibrary.org/b/olid/${olid}-L.jpg`
    }
  }

  return undefined
}

async function fetchWithRetry(
  url: string,
  retries = 2,
  baseDelay = 1500,
  timeoutMs = OPEN_LIBRARY_FETCH_TIMEOUT_MS
): Promise<Response> {
  let lastError: Error | null = null

  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await fetch(url, {
          headers: {
            Accept: 'application/json',
          },
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      if (response.ok) {
        return response
      }

      if (response.status === 429) {
        lastError = new Error(`Rate limited: ${response.status}`)
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, i)))
          continue
        }
        throw lastError
      }

      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status}`)
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, baseDelay * (i + 1)))
          continue
        }
        throw lastError
      }

      throw new Error(`Request failed: ${response.status}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Request failed:')) {
        throw error
      }

      lastError = error instanceof Error ? error : new Error('Unknown error')

      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelay * (i + 1)))
        continue
      }
    }
  }

  throw lastError || new Error('Request failed after retries')
}

function mapOpenLibraryDocToBook(doc: OpenLibrarySearchDoc): GoogleBook | null {
  if (!doc.title) return null
  const workKey = doc.key?.startsWith('/works/') ? doc.key : undefined
  const editionKey =
    doc.key?.startsWith('/books/') ? doc.key : doc.cover_edition_key ? `/books/${doc.cover_edition_key}` : undefined

  const isbn10 = doc.isbn?.find((isbn) => normalizeIdentifier(isbn).length === 10)
  const isbn13 = doc.isbn?.find((isbn) => normalizeIdentifier(isbn).length === 13)
  const coverUrl = normalizeImageUrl(buildOpenLibraryCoverUrl(doc))
  const publishedYear =
    doc.publish_year?.sort((a, b) => b - a)?.[0] || doc.first_publish_year

  return withSourceTrace({
    id: `openlibrary:${editionKey || workKey || doc.title}`,
    source: 'openlibrary',
    sourceDetails: {
      sources: {
        openlibrary: {
          id: editionKey || workKey,
          link: editionKey || workKey ? `https://openlibrary.org${editionKey || workKey}` : undefined,
        },
      },
      openLibrary: {
        workKey,
        editionKey,
        isEdition: Boolean(editionKey),
      },
    },
    volumeInfo: {
      title: doc.title,
      subtitle: doc.subtitle,
      authors: doc.author_name || [],
      description: fetchDescriptionSentence(doc.first_sentence),
      categories: doc.subject?.slice(0, 5),
      industryIdentifiers: [
        ...(isbn10 ? [{ type: 'ISBN_10', identifier: normalizeIdentifier(isbn10) }] : []),
        ...(isbn13 ? [{ type: 'ISBN_13', identifier: normalizeIdentifier(isbn13) }] : []),
      ],
      language: normalizeLanguage(doc.language?.[0]),
      imageLinks: coverUrl
        ? {
            thumbnail: coverUrl,
            smallThumbnail: coverUrl,
          }
        : undefined,
      publisher: doc.publisher?.[0],
      publishedDate:
        doc.publish_date?.find((value) => Boolean(value)) ||
        (publishedYear ? String(publishedYear) : undefined),
      pageCount: doc.number_of_pages_median,
      maturityRating: 'NOT_MATURE',
    },
  })
}

function parseOpenLibraryLanguage(languageKey: string | undefined): string | undefined {
  if (!languageKey) return undefined
  const raw = languageKey.split('/').filter(Boolean).pop()
  return normalizeLanguage(raw)
}

function mapOpenLibraryEditionToBook(edition: OpenLibraryEdition, workKey?: string): GoogleBook | null {
  if (!edition.title || !edition.key) return null

  const isbn10 = edition.isbn_10?.find((isbn) => normalizeIdentifier(isbn).length === 10)
  const isbn13 = edition.isbn_13?.find((isbn) => normalizeIdentifier(isbn).length === 13)
  const description = fetchDescriptionSentence(edition.description)
  const language = parseOpenLibraryLanguage(edition.languages?.[0]?.key)
  const coverId = edition.covers?.[0]
  const coverUrl = normalizeImageUrl(
    coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : buildOpenLibraryCoverUrl({
          key: edition.key,
          isbn: [...(edition.isbn_13 || []), ...(edition.isbn_10 || [])],
        })
  )

  return withSourceTrace({
    id: `openlibrary:${edition.key}`,
    source: 'openlibrary',
    sourceDetails: {
      sources: {
        openlibrary: {
          id: edition.key,
          link: `https://openlibrary.org${edition.key}`,
        },
      },
      openLibrary: {
        workKey: workKey || edition.works?.[0]?.key,
        editionKey: edition.key,
        isEdition: true,
      },
    },
    volumeInfo: {
      title: edition.title,
      subtitle: edition.subtitle,
      authors: (edition.authors || []).map((author) => author.name).filter((name): name is string => Boolean(name)),
      description,
      industryIdentifiers: [
        ...(isbn10 ? [{ type: 'ISBN_10', identifier: normalizeIdentifier(isbn10) }] : []),
        ...(isbn13 ? [{ type: 'ISBN_13', identifier: normalizeIdentifier(isbn13) }] : []),
      ],
      language,
      imageLinks: coverUrl ? { thumbnail: coverUrl, smallThumbnail: coverUrl } : undefined,
      publisher: edition.publishers?.[0],
      publishedDate: edition.publish_date,
      pageCount: edition.number_of_pages,
      maturityRating: 'NOT_MATURE',
    },
  })
}

function mapGutendexBook(book: GutendexBook): GoogleBook | null {
  if (!book.title) return null

  const coverUrl = normalizeImageUrl(
    book.formats?.['image/jpeg'] || book.formats?.['image/png'] || undefined
  )

  return withSourceTrace({
    id: `gutendex:${book.id}`,
    source: 'gutendex',
    sourceDetails: {
      sources: {
        gutendex: {
          id: String(book.id),
          link: `https://gutendex.com/books/${book.id}`,
        },
      },
    },
    volumeInfo: {
      title: book.title,
      authors: (book.authors || [])
        .map((author) => author.name)
        .filter((name): name is string => Boolean(name)),
      description: book.summaries?.[0],
      categories: [...(book.subjects || [])].slice(0, 5),
      language: normalizeLanguage(book.languages?.[0]),
      imageLinks: coverUrl
        ? {
            thumbnail: coverUrl,
            smallThumbnail: coverUrl,
          }
        : undefined,
      maturityRating: 'NOT_MATURE',
    },
  })
}

function mapWikipediaPageToBook(page: WikipediaPage, language: 'he' | 'en'): GoogleBook | null {
  if (!page.title) return null

  const coverUrl = normalizeImageUrl(page.thumbnail?.source)

  return withSourceTrace({
    id: `wikipedia:${language}:${page.pageid || page.title}`,
    source: 'wikipedia',
    sourceDetails: {
      sources: {
        wikipedia: {
          id: page.pageid ? String(page.pageid) : page.title,
          link: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        },
      },
    },
    volumeInfo: {
      title: page.title,
      authors: [],
      description: page.extract || page.terms?.description?.[0],
      categories: (page.categories || [])
        .map((category) => category.title?.replace(/^Category:/, ''))
        .filter((value): value is string => Boolean(value))
        .slice(0, 5),
      language,
      imageLinks: coverUrl
        ? {
            thumbnail: coverUrl,
            smallThumbnail: coverUrl,
          }
        : undefined,
      maturityRating: 'NOT_MATURE',
    },
  })
}

function mapWikidataResultToBook(result: WikidataSearchResult, languageHint?: string): GoogleBook | null {
  if (!result.id || !result.label) return null

  return withSourceTrace({
    id: `wikidata:${result.id}`,
    source: 'wikidata',
    sourceDetails: {
      sources: {
        wikidata: {
          id: result.id,
          link: `https://www.wikidata.org/wiki/${result.id}`,
        },
      },
    },
    volumeInfo: {
      title: result.label,
      authors: [],
      description: result.description,
      language: normalizeLanguage(languageHint) || (hasHebrewText(result.label) ? 'he' : undefined),
      maturityRating: 'NOT_MATURE',
    },
  })
}

function getOpenLibraryWorkKey(book: GoogleBook): string | undefined {
  const fromMeta = book.sourceDetails?.openLibrary?.workKey
  if (fromMeta?.startsWith('/works/')) return fromMeta
  const sourceId = book.sourceDetails?.sources?.openlibrary?.id
  if (sourceId?.startsWith('/works/')) return sourceId
  return undefined
}

function getOpenLibraryEditionKey(book: GoogleBook): string | undefined {
  const fromMeta = book.sourceDetails?.openLibrary?.editionKey
  if (fromMeta?.startsWith('/books/')) return fromMeta
  const sourceId = book.sourceDetails?.sources?.openlibrary?.id
  if (sourceId?.startsWith('/books/')) return sourceId
  return undefined
}

async function fetchOpenLibraryWorkEditions(workKey: string): Promise<GoogleBook[]> {
  if (openLibraryWorkEditionsCache.has(workKey)) {
    return openLibraryWorkEditionsCache.get(workKey)!
  }

  const task = (async () => {
    const params = new URLSearchParams({
      limit: String(OPEN_LIBRARY_EDITIONS_PER_WORK_LIMIT),
    })
    const response = await fetchWithRetry(`https://openlibrary.org${workKey}/editions.json?${params.toString()}`)
    const data: OpenLibraryEditionsResponse = await response.json()
    return (data.entries || [])
      .map((edition) => mapOpenLibraryEditionToBook(edition, workKey))
      .filter((book): book is GoogleBook => Boolean(book))
  })()
  openLibraryWorkEditionsCache.set(workKey, task)
  return task
}

function shouldExpandOpenLibraryDoc(doc: GoogleBook, query: string, langRestrict?: string): boolean {
  const workKey = getOpenLibraryWorkKey(doc)
  if (!workKey) return false
  if (isLikelyIsbn(query)) return true
  const queryHasHebrew = hasHebrewText(query)
  if (queryHasHebrew) return true
  if (langRestrict && normalizeLanguage(doc.volumeInfo.language) !== langRestrict) return true

  const title = normalizeHebrewForMatch(doc.volumeInfo.title)
  const normalizedQuery = normalizeHebrewForMatch(query)
  if (!title || !normalizedQuery) return false

  return title.includes(normalizedQuery) || normalizedQuery.includes(title)
}

function booksShareIsbn(primary: GoogleBook, secondary: GoogleBook): boolean {
  const primaryIsbns = new Set(getBookIsbnCandidates(primary))
  if (primaryIsbns.size === 0) return false

  return getBookIsbnCandidates(secondary).some((isbn) => primaryIsbns.has(isbn))
}

function titlesLookCompatible(primary: GoogleBook, secondary: GoogleBook): boolean {
  const primaryTitle = normalizeHebrewForMatch(primary.volumeInfo.title)
  const secondaryTitle = normalizeHebrewForMatch(secondary.volumeInfo.title)

  if (!primaryTitle || !secondaryTitle) return false
  if (primaryTitle === secondaryTitle) return true
  if (primaryTitle.includes(secondaryTitle) || secondaryTitle.includes(primaryTitle)) {
    return true
  }

  return false
}

function authorsLookCompatible(primary: GoogleBook, secondary: GoogleBook): boolean {
  const primaryAuthor = normalizeHebrewForMatch(primary.volumeInfo.authors?.[0])
  const secondaryAuthor = normalizeHebrewForMatch(secondary.volumeInfo.authors?.[0])

  if (!primaryAuthor || !secondaryAuthor) return true
  if (primaryAuthor === secondaryAuthor) return true
  if (primaryAuthor.includes(secondaryAuthor) || secondaryAuthor.includes(primaryAuthor)) {
    return true
  }

  return false
}

function shouldUseCoverFromCandidate(primary: GoogleBook, candidate: GoogleBook): boolean {
  const candidateCover = normalizeImageUrl(candidate.volumeInfo.imageLinks?.thumbnail)
  if (!candidateCover) return false

  const primaryText = getPrimaryBookText(primary)
  const candidateText = getPrimaryBookText(candidate)

  const primaryHasHebrew = hasHebrewText(primaryText)
  const candidateHasHebrew = hasHebrewText(candidateText)

  const primaryLang = normalizeLanguage(primary.volumeInfo.language)
  const candidateLang = normalizeLanguage(candidate.volumeInfo.language)

  const sameTitle = titlesLookCompatible(primary, candidate)
  const sameAuthor = authorsLookCompatible(primary, candidate)
  const sharedIsbn = booksShareIsbn(primary, candidate)

  if (primaryHasHebrew !== candidateHasHebrew) return false

  if (primaryLang && candidateLang && primaryLang !== candidateLang) {
    if (!sharedIsbn) return false
    return false
  }

  if (sharedIsbn) return true
  if (sameTitle && sameAuthor) return true

  return false
}

function mergeBooks(primary: GoogleBook, secondary: GoogleBook): GoogleBook {
  const primaryIdentifiers = primary.volumeInfo.industryIdentifiers || []
  const secondaryIdentifiers = secondary.volumeInfo.industryIdentifiers || []
  const dedupedIdentifiers = new Map<string, { type: string; identifier: string }>()

  for (const identifier of [...primaryIdentifiers, ...secondaryIdentifiers]) {
    const normalized = normalizeIdentifier(identifier.identifier)
    if (!normalized) continue
    dedupedIdentifiers.set(`${identifier.type}:${normalized}`, {
      type: identifier.type,
      identifier: normalized,
    })
  }

  const primaryCover = normalizeImageUrl(primary.volumeInfo.imageLinks?.thumbnail)
  const secondaryCover = normalizeImageUrl(secondary.volumeInfo.imageLinks?.thumbnail)
  const allowSecondaryCover = shouldUseCoverFromCandidate(primary, secondary)
  const mergedCover = primaryCover || (allowSecondaryCover ? secondaryCover : undefined)

  const sourceTrace = new Set<BookSourceName>([
    ...(primary.sourceTrace || []),
    ...(secondary.sourceTrace || []),
    ...(primary.source ? [primary.source] : []),
    ...(secondary.source ? [secondary.source] : []),
  ])

  return {
    ...primary,
    sourceTrace: Array.from(sourceTrace),
    volumeInfo: {
      ...secondary.volumeInfo,
      ...primary.volumeInfo,
      title: primary.volumeInfo.title || secondary.volumeInfo.title || 'Unknown title',
      authors:
        primary.volumeInfo.authors?.length ? primary.volumeInfo.authors : secondary.volumeInfo.authors,
      description: primary.volumeInfo.description || secondary.volumeInfo.description,
      categories:
        primary.volumeInfo.categories?.length ? primary.volumeInfo.categories : secondary.volumeInfo.categories,
      industryIdentifiers: Array.from(dedupedIdentifiers.values()),
      language:
        normalizeLanguage(primary.volumeInfo.language) || normalizeLanguage(secondary.volumeInfo.language),
      imageLinks: mergedCover
        ? {
            thumbnail: mergedCover,
            smallThumbnail:
              normalizeImageUrl(primary.volumeInfo.imageLinks?.smallThumbnail) ||
              (allowSecondaryCover
                ? normalizeImageUrl(secondary.volumeInfo.imageLinks?.smallThumbnail)
                : undefined) ||
              mergedCover,
          }
        : undefined,
      publisher: primary.volumeInfo.publisher || secondary.volumeInfo.publisher,
      publishedDate: primary.volumeInfo.publishedDate || secondary.volumeInfo.publishedDate,
      pageCount: primary.volumeInfo.pageCount || secondary.volumeInfo.pageCount,
      maturityRating: primary.volumeInfo.maturityRating || secondary.volumeInfo.maturityRating,
    },
  }
}

async function searchGoogleSource(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const isbnQuery = isLikelyIsbn(normalizedQuery)
  const searchQueries = [
    normalizedQuery,
    ...(isbnQuery ? [`isbn:${normalizeIdentifier(normalizedQuery)}`] : []),
    ...(!isbnQuery ? [`intitle:${normalizedQuery}`, `inauthor:${normalizedQuery}`] : []),
  ]

  const batches = await Promise.all(
    searchQueries.map(async (searchTerm) => {
      const params = new URLSearchParams({
        q: searchTerm,
        maxResults: '12',
        printType: 'books',
      })

      if (langRestrict) {
        params.set('langRestrict', langRestrict)
      }

      const response = await fetchWithRetry(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`)
      const data: GoogleBooksResponse = await response.json()
      return (data.items || []).map((item) =>
        withSourceTrace({
          ...item,
          source: 'google' as const,
          sourceDetails: {
            sources: {
              google: {
                id: item.id,
                link: item.id ? `https://books.google.com/books?id=${encodeURIComponent(item.id)}` : undefined,
              },
            },
          },
          volumeInfo: {
            ...item.volumeInfo,
            language: normalizeLanguage(item.volumeInfo.language),
            imageLinks: item.volumeInfo.imageLinks
              ? {
                  thumbnail: normalizeImageUrl(item.volumeInfo.imageLinks.thumbnail),
                  smallThumbnail: normalizeImageUrl(item.volumeInfo.imageLinks.smallThumbnail),
                }
              : undefined,
          },
        })
      )
    })
  )

  const deduped = new Map<string, GoogleBook>()
  for (const books of batches) {
    for (const book of books) {
      if (!deduped.has(book.id)) deduped.set(book.id, book)
    }
  }

  return Array.from(deduped.values())
}

async function searchOpenLibraryBooks(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const requests: string[] = []
  const fieldList = [
    'key',
    'type',
    'edition_key',
    'cover_edition_key',
    'title',
    'subtitle',
    'author_name',
    'author_key',
    'first_sentence',
    'subject',
    'isbn',
    'language',
    'cover_i',
    'publisher',
    'first_publish_year',
    'publish_year',
    'publish_date',
    'number_of_pages_median',
  ].join(',')

  const preferredLang = langRestrict ? OPEN_LIBRARY_LANGUAGE_FILTER[langRestrict] : null

  const primaryParams = new URLSearchParams({
    q: trimmed,
    fields: fieldList,
    limit: '12',
  })

  if (langRestrict) primaryParams.set('lang', langRestrict)

  requests.push(`https://openlibrary.org/search.json?${primaryParams.toString()}`)

  if (preferredLang) {
    const filteredParams = new URLSearchParams({
      q: `${trimmed} language:${preferredLang}`,
      fields: fieldList,
      limit: '12',
    })
    filteredParams.set('lang', langRestrict!)
    requests.push(`https://openlibrary.org/search.json?${filteredParams.toString()}`)
  }

  if (!isLikelyIsbn(trimmed)) {
    const titleParams = new URLSearchParams({
      title: trimmed,
      fields: fieldList,
      limit: '12',
    })
    if (langRestrict) titleParams.set('lang', langRestrict)
    requests.push(`https://openlibrary.org/search.json?${titleParams.toString()}`)
  }

  const settled = await Promise.allSettled(
    requests.map(async (url) => {
      const response = await fetchWithRetry(url)
      const data: OpenLibrarySearchResponse = await response.json()
      return (data.docs || []).map(mapOpenLibraryDocToBook).filter((book): book is GoogleBook => Boolean(book))
    })
  )

  const baseResults = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  if (baseResults.length === 0) return []

  const dedupedBase = new Map<string, GoogleBook>()
  for (const item of baseResults) {
    if (!dedupedBase.has(item.id)) dedupedBase.set(item.id, item)
  }

  const rankedForExpansion = Array.from(dedupedBase.values())
    .map((book) => ({
      book,
      score: scoreBook(book, query, langRestrict).score,
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.book)

  const workKeys = Array.from(
    new Set(
      rankedForExpansion
        .filter((book) => shouldExpandOpenLibraryDoc(book, query, langRestrict))
        .slice(0, OPEN_LIBRARY_EDITION_EXPANSION_LIMIT)
        .map((book) => getOpenLibraryWorkKey(book))
        .filter((key): key is string => Boolean(key))
    )
  )

  const expansions = await Promise.allSettled(workKeys.map((workKey) => fetchOpenLibraryWorkEditions(workKey)))
  const editionResults = expansions.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  if (editionResults.length > 0) {
    console.info('[books-search] openlibrary editions expanded', {
      query,
      workKeys,
      editions: editionResults.length,
    })
  }

  return [...dedupedBase.values(), ...editionResults]
}

async function searchGutendexBooks(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({ search: trimmed })
  if (langRestrict) params.set('languages', langRestrict)

  const response = await fetchWithRetry(`https://gutendex.com/books?${params.toString()}`)
  const data: GutendexResponse = await response.json()

  return (data.results || []).map(mapGutendexBook).filter((book): book is GoogleBook => Boolean(book))
}

async function searchWikipediaBooks(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const queryHasHebrew = HEBREW_RE.test(trimmed)
  const languages: Array<'he' | 'en'> =
    langRestrict === 'he' ? ['he', 'en'] : langRestrict === 'en' ? ['en', 'he'] : queryHasHebrew ? ['he', 'en'] : ['en', 'he']

  const settled = await Promise.allSettled(
    languages.map(async (language) => {
      const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        generator: 'search',
        gsrsearch: `${trimmed} intitle:${trimmed}`,
        gsrlimit: '6',
        prop: 'extracts|pageimages|categories|pageterms',
        exintro: '1',
        explaintext: '1',
        exsentences: '2',
        piprop: 'thumbnail',
        pithumbsize: '300',
        pilimit: '6',
        cllimit: '5',
        wbptterms: 'description',
      })

      const response = await fetchWithRetry(`https://${language}.wikipedia.org/w/api.php?${params.toString()}`)
      const data: WikipediaQueryResponse = await response.json()
      const pages = Object.values(data.query?.pages || {})
      return pages
        .map((page) => mapWikipediaPageToBook(page, language))
        .filter((book): book is GoogleBook => Boolean(book))
    })
  )

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function searchWikidataBooks(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const useHebrewLanguage = langRestrict === 'he' || hasHebrewText(trimmed)
  const language = useHebrewLanguage ? 'he' : 'en'

  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: trimmed,
    language,
    uselang: language,
    type: 'item',
    format: 'json',
    limit: '10',
  })

  const response = await fetchWithRetry(`https://www.wikidata.org/w/api.php?${params.toString()}`)
  const data: WikidataSearchResponse = await response.json()

  return (data.search || [])
    .map((result) => mapWikidataResultToBook(result, useHebrewLanguage ? 'he' : langRestrict))
    .filter((book): book is GoogleBook => Boolean(book))
}

function getOptionalCatalogAdapters(): BookSourceAdapter[] {
  const adapters: BookSourceAdapter[] = []

  const nliEndpoint = process.env.NLI_SRU_ENDPOINT?.trim()
  if (nliEndpoint) {
    adapters.push({
      name: 'nli_catalog',
      priority: 14,
      supportsLanguageFilter: true,
      isHebrewFocused: true,
      enabled: () => Boolean(process.env.NLI_SRU_ENDPOINT),
      search: async () => {
        return []
      },
    })
  }

  if (process.env.HEBREWBOOKS_ENABLE_ADAPTER === 'true') {
    adapters.push({
      name: 'hebrewbooks_catalog',
      priority: 12,
      supportsLanguageFilter: false,
      isHebrewFocused: true,
      search: async () => {
        return []
      },
    })
  }

  if (process.env.ISRAEL_BOOKSTORE_FEED_URL?.trim()) {
    adapters.push({
      name: 'israel_books_catalog',
      priority: 13,
      supportsLanguageFilter: true,
      isHebrewFocused: true,
      search: async () => {
        return []
      },
    })
  }

  return adapters
}

function getSourceAdapters(): BookSourceAdapter[] {
  const core: BookSourceAdapter[] = [
    {
      name: 'openlibrary',
      priority: 12,
      supportsLanguageFilter: true,
      search: searchOpenLibraryBooks,
    },
    {
      name: 'google',
      priority: 11,
      supportsLanguageFilter: true,
      search: searchGoogleSource,
    },
    {
      name: 'wikidata',
      priority: 8,
      supportsLanguageFilter: true,
      isHebrewFocused: true,
      search: searchWikidataBooks,
    },
    {
      name: 'gutendex',
      priority: 4,
      supportsLanguageFilter: true,
      search: searchGutendexBooks,
    },
  ]

  return [...core, ...getOptionalCatalogAdapters()]
}

async function searchHebrewFallbackBooks(query: string): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed || !HEBREW_RE.test(trimmed)) return []

  const withoutNikkud = trimmed.replace(NIKKUD_RE, '').trim()
  const variants = Array.from(
    new Set([
      trimmed,
      withoutNikkud,
      `"${trimmed}"`,
      withoutNikkud && withoutNikkud !== trimmed ? `"${withoutNikkud}"` : '',
    ].filter(Boolean))
  )

  const adapters = getSourceAdapters().filter((adapter) => adapter.name !== 'gutendex')

  const settled = await Promise.allSettled(
    variants.flatMap((variant) => adapters.map((adapter) => adapter.search(variant, 'he')))
  )

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

function makeBookDedupeKey(book: GoogleBook): string {
  const openLibraryEditionKey = getOpenLibraryEditionKey(book)
  if (openLibraryEditionKey) return `openlibrary-edition:${openLibraryEditionKey}`

  const identifiers = book.volumeInfo.industryIdentifiers || []
  const isbn13 = identifiers.find((item) => item.type === 'ISBN_13')?.identifier
  const isbn10 = identifiers.find((item) => item.type === 'ISBN_10')?.identifier

  if (isbn13) return `isbn13:${normalizeIdentifier(isbn13)}`
  if (isbn10) return `isbn10:${normalizeIdentifier(isbn10)}`

  const author = book.volumeInfo.authors?.[0] || ''
  return ['title', normalizeHebrewForMatch(book.volumeInfo.title), 'author', normalizeHebrewForMatch(author)].join(':')
}

type ScoreResult = {
  score: number
  reasons: string[]
}

function getMetadataRichnessScore(book: GoogleBook): number {
  const info = book.volumeInfo
  let richness = 0
  if (info.subtitle) richness += 6
  if (info.description) richness += 8
  if ((info.authors || []).length > 0) richness += 6
  if ((info.industryIdentifiers || []).length > 0) richness += 12
  if (info.publisher) richness += 5
  if (info.publishedDate) richness += 5
  if (info.language) richness += 4
  if (info.imageLinks?.thumbnail) richness += 8
  return richness
}

export function scoreBook(book: GoogleBook, query: string, langRestrict?: string): ScoreResult {
  const normalizedQuery = normalizeHebrewForMatch(query)
  const tokens = normalizedQuery.split(' ').filter(Boolean)
  const title = normalizeHebrewForMatch(book.volumeInfo.title)
  const authors = normalizeHebrewForMatch((book.volumeInfo.authors || []).join(' '))
  const publisher = normalizeHebrewForMatch(book.volumeInfo.publisher)
  const identifiers = book.volumeInfo.industryIdentifiers || []
  const queryHasHebrew = hasHebrewText(query)

  let score = 0
  const reasons: string[] = []

  if (title === normalizedQuery) {
    score += 240
    reasons.push('exact_title')
  } else if (title.startsWith(normalizedQuery)) {
    score += 160
    reasons.push('title_prefix')
  } else if (title.includes(normalizedQuery)) {
    score += 110
    reasons.push('title_contains')
  }

  for (const token of tokens) {
    if (token.length <= 1) continue
    if (title.includes(token)) score += 22
    if (authors.includes(token)) score += 12
    if (publisher.includes(token)) score += 8
  }

  if (isLikelyIsbn(query)) {
    const normalizedIsbn = normalizeIdentifier(query)
    if (identifiers.some((identifier) => normalizeIdentifier(identifier.identifier) === normalizedIsbn)) {
      score += 320
      reasons.push('isbn_match')
    }
  }

  const normalizedBookLanguage = normalizeLanguage(book.volumeInfo.language)
  if (langRestrict && normalizedBookLanguage === langRestrict) {
    score += 55
    reasons.push('language_filter_match')
  }

  if (queryHasHebrew) {
    if (hasHebrewText(book.volumeInfo.title)) score += 75
    if (hasHebrewText((book.volumeInfo.authors || []).join(' '))) score += 35
    if (hasHebrewText(book.volumeInfo.publisher)) score += 20
    if (normalizedBookLanguage === 'he') reasons.push('hebrew_language')

    for (const hint of HEBREW_PUBLISHER_HINTS) {
      if (publisher.includes(normalizeHebrewForMatch(hint))) {
        score += 16
        break
      }
    }

    score += SOURCE_HEBREW_QUALITY[book.source || 'google'] || 0

    if (normalizedBookLanguage && normalizedBookLanguage !== 'he') {
      score -= 45
    }
    if (!hasHebrewText(getPrimaryBookText(book)) && normalizedBookLanguage !== 'he') {
      score -= 40
    }
  } else if (book.source === 'google') {
    score += 8
  }

  if (book.source === 'wikipedia') score -= 18
  score += SOURCE_BASE_QUALITY[book.source || 'google'] || 0
  if (book.sourceDetails?.openLibrary?.isEdition) {
    score += 26
    reasons.push('openlibrary_edition')
  }
  if (getOpenLibraryEditionKey(book)) {
    score += 8
  }
  if (book.volumeInfo.imageLinks?.thumbnail) reasons.push('has_cover')
  if ((book.volumeInfo.industryIdentifiers || []).length > 0) reasons.push('has_isbn')
  score += getMetadataRichnessScore(book)
  reasons.push(`metadata_richness:${getMetadataRichnessScore(book)}`)

  return { score, reasons }
}

function rankAndDedupeBooks(books: GoogleBook[], query: string, langRestrict?: string): GoogleBook[] {
  const ranked: RankedBook[] = books.map((book) => {
    const scored = scoreBook(book, query, langRestrict)
    return {
      book,
      score: scored.score,
      reasons: scored.reasons,
    }
  })

  ranked.sort((a, b) => b.score - a.score)
  console.info('[books-search] ranking snapshot', {
    query,
    langRestrict,
    top: ranked.slice(0, 8).map((entry) => ({
      id: entry.book.id,
      source: entry.book.source,
      score: Number(entry.score.toFixed(2)),
      reasons: entry.reasons.slice(0, 6),
      title: entry.book.volumeInfo.title,
    })),
  })

  const deduped = new Map<string, GoogleBook>()
  for (const entry of ranked) {
    const withDebug: GoogleBook = {
      ...entry.book,
      sourceDetails: {
        ...(entry.book.sourceDetails || { sources: {} }),
        debug: {
          mergedIds: entry.book.sourceDetails?.debug?.mergedIds || [entry.book.id],
          confidence: entry.book.sourceDetails?.debug?.confidence || Number(entry.score.toFixed(2)),
          score: Number(entry.score.toFixed(2)),
          reasons: entry.reasons,
        },
      },
    }
    const key = makeBookDedupeKey(entry.book)
    const existing = deduped.get(key)
    deduped.set(key, existing ? mergeBooks(existing, withDebug) : withDebug)
  }

  return Array.from(deduped.values()).slice(0, 20)
}

function fillMissingCoversFromMatches(books: GoogleBook[]): GoogleBook[] {
  const booksWithCovers = books.filter((book) => Boolean(normalizeImageUrl(book.volumeInfo.imageLinks?.thumbnail)))

  return books.map((book) => {
    const currentCover = normalizeImageUrl(book.volumeInfo.imageLinks?.thumbnail)
    if (currentCover) return book

    const bookKey = makeBookDedupeKey(book)
    const isbnCandidates = new Set(getBookIsbnCandidates(book))

    const match = booksWithCovers.find((candidate) => {
      if (candidate.id === book.id) return false
      if (!shouldUseCoverFromCandidate(book, candidate)) return false
      if (makeBookDedupeKey(candidate) === bookKey) return true

      const candidateIsbns = getBookIsbnCandidates(candidate)
      return candidateIsbns.some((isbn) => isbnCandidates.has(isbn))
    })

    if (!match) return book
    return mergeBooks(book, match)
  })
}

function areLikelySameBook(primary: GoogleBook, candidate: GoogleBook): boolean {
  if (booksShareIsbn(primary, candidate)) return true

  const primaryHasHebrew = hasHebrewText(getPrimaryBookText(primary))
  const candidateHasHebrew = hasHebrewText(getPrimaryBookText(candidate))

  if (primaryHasHebrew !== candidateHasHebrew) return false
  if (!titlesLookCompatible(primary, candidate)) return false
  if (!authorsLookCompatible(primary, candidate)) return false

  return true
}

function getPreferredLanguageHint(book: GoogleBook): string | undefined {
  const explicit = normalizeLanguage(book.volumeInfo.language)
  if (explicit) return explicit
  return hasHebrewText(getPrimaryBookText(book)) ? 'he' : undefined
}

export async function enrichGoogleBook(book: GoogleBook): Promise<GoogleBook> {
  try {
    const queries = Array.from(
      new Set(
        [
          book.volumeInfo.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier,
          book.volumeInfo.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier,
          `${book.volumeInfo.title} ${book.volumeInfo.authors?.[0] || ''}`.trim(),
          book.volumeInfo.title,
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    )

    if (queries.length === 0) return book

    const langHint = getPreferredLanguageHint(book)
    const aggregated = new Map<string, GoogleBook>()

    for (const query of queries.slice(0, 4)) {
      try {
        const results = await searchGoogleBooks(query, langHint)
        for (const result of results) aggregated.set(result.id, result)
      } catch {
        // Ignore individual enrichment failures
      }
    }

    const compatible = Array.from(aggregated.values())
      .filter((candidate) => candidate.id !== book.id)
      .filter((candidate) => areLikelySameBook(book, candidate))
      .sort((a, b) => {
        const query = `${book.volumeInfo.title} ${(book.volumeInfo.authors || []).join(' ')}`
        return scoreBook(b, query, langHint).score - scoreBook(a, query, langHint).score
      })

    let enriched = book
    for (const candidate of compatible) {
      enriched = mergeBooks(enriched, candidate)
    }

    return enriched
  } catch (error) {
    console.error('Failed to enrich book, returning original data', error)
    return book
  }
}

export async function searchGoogleBooks(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []
  const debugEnabled = process.env.BOOK_SEARCH_DEBUG === 'true'
  const response = await searchBooksOrchestrated(normalizedQuery, {
    language: langRestrict,
    timeoutMs: Number(process.env.BOOK_PROVIDER_TIMEOUT_MS || 4500),
    debug: debugEnabled,
    maxResults: 8,
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
    },
    volumeInfo: {
      title: result.title,
      subtitle: result.subtitle,
      authors: result.authors,
      description: result.description,
      categories: result.subjects,
      industryIdentifiers: identifiers,
      language: result.languages?.[0],
      imageLinks: {
        thumbnail: result.cover_url,
        smallThumbnail: result.cover_url,
      },
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
    .slice(0, 3)
    .map(mapNormalizedResultToGoogleBook)

  const displayTitle = group.work.display_title || primary.volumeInfo.title
  const displayAuthors = group.work.display_authors?.length ? group.work.display_authors : primary.volumeInfo.authors
  const displayDescription = group.work.description || primary.volumeInfo.description
  const displayCategories = group.work.subjects?.length ? group.work.subjects : primary.volumeInfo.categories

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
    },
    volumeInfo: {
      ...primary.volumeInfo,
      title: displayTitle,
      authors: displayAuthors,
      description: displayDescription,
      categories: displayCategories,
      language: group.work.language || primary.volumeInfo.language,
      imageLinks: {
        thumbnail: group.work.cover || primary.volumeInfo.imageLinks?.thumbnail,
        smallThumbnail: group.work.cover || primary.volumeInfo.imageLinks?.smallThumbnail,
      },
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
    language: normalizeLanguage(info.language) || null,
    cover_url:
      normalizeImageUrl(info.imageLinks?.thumbnail) ||
      normalizeImageUrl(info.imageLinks?.smallThumbnail) ||
      null,
    publisher: info.publisher || null,
    published_date: info.publishedDate || null,
    page_count: info.pageCount || null,
    is_adult: info.maturityRating === 'MATURE',
    source_refs: Object.keys(book.sourceDetails?.sources || {}).length > 0 ? book.sourceDetails?.sources : null,
    source_trace: book.sourceTrace || null,
  }
}

export const __testables = {
  mapOpenLibraryDocToBook,
  mapOpenLibraryEditionToBook,
  rankAndDedupeBooks,
}
