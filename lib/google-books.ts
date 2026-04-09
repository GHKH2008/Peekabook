export type GoogleBook = {
  id: string
  source?: 'google' | 'openlibrary' | 'gutendex' | 'wikipedia'
  volumeInfo: {
    title: string
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
}

export type GoogleBooksResponse = {
  totalItems: number
  items?: GoogleBook[]
}

type OpenLibrarySearchDoc = {
  key?: string
  title?: string
  author_name?: string[]
  first_sentence?: string | { value?: string }
  subject?: string[]
  isbn?: string[]
  language?: string[]
  cover_i?: number
  publisher?: string[]
  first_publish_year?: number
  number_of_pages_median?: number
}

type OpenLibrarySearchResponse = {
  numFound?: number
  docs?: OpenLibrarySearchDoc[]
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

type RankedBook = {
  book: GoogleBook
  score: number
}

const HEBREW_RE = /[\u0590-\u05FF]/
const NIKKUD_RE = /[\u0591-\u05C7]/g
const OPEN_LIBRARY_LANGUAGE_FILTER: Record<string, string> = {
  en: 'eng',
  he: 'heb',
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function normalizeIdentifier(value: string | null | undefined): string {
  return String(value || '').replace(/[^0-9X]/gi, '').toUpperCase()
}

function normalizeLanguage(value: string | null | undefined): string | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized.startsWith('he')) return 'he'
  if (normalized.startsWith('en')) return 'en'
  return normalized
}

function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('//')) return `https:${url}`
  return url.replace('http://', 'https://')
}

function getPublishedYear(value: string | undefined): string {
  return String(value || '').slice(0, 4)
}

function isLikelyIsbn(value: string): boolean {
  return /^[\dX-]{10,17}$/i.test(value.trim())
}

function removeNikkud(value: string): string {
  return value.replace(NIKKUD_RE, '').trim()
}

function fetchDescriptionSentence(
  firstSentence: string | { value?: string } | undefined
): string | undefined {
  if (typeof firstSentence === 'string') return firstSentence
  return firstSentence?.value
}

function getBookIsbnCandidates(book: GoogleBook): string[] {
  return (book.volumeInfo.industryIdentifiers || [])
    .map((identifier) => normalizeIdentifier(identifier.identifier))
    .filter(Boolean)
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
  baseDelay = 1500
): Promise<Response> {
  let lastError: Error | null = null

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      })

      if (response.ok) {
        return response
      }

      if (response.status === 429) {
        lastError = new Error(`Rate limited: ${response.status}`)
        if (i < retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, baseDelay * Math.pow(2, i))
          )
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

  const isbn10 = doc.isbn?.find((isbn) => normalizeIdentifier(isbn).length === 10)
  const isbn13 = doc.isbn?.find((isbn) => normalizeIdentifier(isbn).length === 13)
  const coverUrl = normalizeImageUrl(buildOpenLibraryCoverUrl(doc))

  return {
    id: `openlibrary:${doc.key || doc.title}`,
    source: 'openlibrary',
    volumeInfo: {
      title: doc.title,
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
      publishedDate: doc.first_publish_year
        ? String(doc.first_publish_year)
        : undefined,
      pageCount: doc.number_of_pages_median,
      maturityRating: 'NOT_MATURE',
    },
  }
}

function mapGutendexBook(book: GutendexBook): GoogleBook | null {
  if (!book.title) return null

  const coverUrl = normalizeImageUrl(
    book.formats?.['image/jpeg'] || book.formats?.['image/png'] || undefined
  )

  return {
    id: `gutendex:${book.id}`,
    source: 'gutendex',
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
  }
}

function mapWikipediaPageToBook(
  page: WikipediaPage,
  language: 'he' | 'en'
): GoogleBook | null {
  if (!page.title) return null

  const coverUrl = normalizeImageUrl(page.thumbnail?.source)

  return {
    id: `wikipedia:${language}:${page.pageid || page.title}`,
    source: 'wikipedia',
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
  }
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
  const mergedCover = primaryCover || secondaryCover

  return {
    ...primary,
    volumeInfo: {
      ...secondary.volumeInfo,
      ...primary.volumeInfo,
      title:
        primary.volumeInfo.title || secondary.volumeInfo.title || 'Unknown title',
      authors:
        primary.volumeInfo.authors?.length
          ? primary.volumeInfo.authors
          : secondary.volumeInfo.authors,
      description:
        primary.volumeInfo.description || secondary.volumeInfo.description,
      categories:
        primary.volumeInfo.categories?.length
          ? primary.volumeInfo.categories
          : secondary.volumeInfo.categories,
      industryIdentifiers: Array.from(dedupedIdentifiers.values()),
      language:
        normalizeLanguage(primary.volumeInfo.language) ||
        normalizeLanguage(secondary.volumeInfo.language),
      imageLinks: mergedCover
        ? {
            thumbnail: mergedCover,
            smallThumbnail:
              normalizeImageUrl(primary.volumeInfo.imageLinks?.smallThumbnail) ||
              normalizeImageUrl(secondary.volumeInfo.imageLinks?.smallThumbnail) ||
              mergedCover,
          }
        : undefined,
      publisher: primary.volumeInfo.publisher || secondary.volumeInfo.publisher,
      publishedDate:
        primary.volumeInfo.publishedDate || secondary.volumeInfo.publishedDate,
      pageCount: primary.volumeInfo.pageCount || secondary.volumeInfo.pageCount,
      maturityRating:
        primary.volumeInfo.maturityRating || secondary.volumeInfo.maturityRating,
    },
  }
}

async function searchGoogleSource(
  query: string,
  langRestrict?: string
): Promise<GoogleBook[]> {
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

      const response = await fetchWithRetry(
        `https://www.googleapis.com/books/v1/volumes?${params.toString()}`
      )
      const data: GoogleBooksResponse = await response.json()
      return (data.items || []).map((item) => ({
        ...item,
        source: 'google' as const,
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
      }))
    })
  )

  const deduped = new Map<string, GoogleBook>()
  for (const books of batches) {
    for (const book of books) {
      if (!deduped.has(book.id)) {
        deduped.set(book.id, book)
      }
    }
  }

  return Array.from(deduped.values())
}

async function searchOpenLibraryBooks(
  query: string,
  langRestrict?: string
): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const requests: string[] = []
  const fieldList = [
    'key',
    'title',
    'author_name',
    'first_sentence',
    'subject',
    'isbn',
    'language',
    'cover_i',
    'publisher',
    'first_publish_year',
    'number_of_pages_median',
  ].join(',')

  const preferredLang = langRestrict ? OPEN_LIBRARY_LANGUAGE_FILTER[langRestrict] : null

  const primaryParams = new URLSearchParams({
    q: trimmed,
    fields: fieldList,
    limit: '12',
  })

  if (langRestrict) {
    primaryParams.set('lang', langRestrict)
  }

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
    if (langRestrict) {
      titleParams.set('lang', langRestrict)
    }
    requests.push(`https://openlibrary.org/search.json?${titleParams.toString()}`)
  }

  const settled = await Promise.allSettled(
    requests.map(async (url) => {
      const response = await fetchWithRetry(url)
      const data: OpenLibrarySearchResponse = await response.json()
      return (data.docs || [])
        .map(mapOpenLibraryDocToBook)
        .filter((book): book is GoogleBook => Boolean(book))
    })
  )

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function searchGutendexBooks(
  query: string,
  langRestrict?: string
): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({
    search: trimmed,
  })

  if (langRestrict) {
    params.set('languages', langRestrict)
  }

  const response = await fetchWithRetry(`https://gutendex.com/books?${params.toString()}`)
  const data: GutendexResponse = await response.json()

  return (data.results || [])
    .map(mapGutendexBook)
    .filter((book): book is GoogleBook => Boolean(book))
}

async function searchWikipediaBooks(
  query: string,
  langRestrict?: string
): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const queryHasHebrew = HEBREW_RE.test(trimmed)
  const languages: Array<'he' | 'en'> =
    langRestrict === 'he'
      ? ['he', 'en']
      : langRestrict === 'en'
        ? ['en', 'he']
        : queryHasHebrew
          ? ['he', 'en']
          : ['en', 'he']

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

      const response = await fetchWithRetry(
        `https://${language}.wikipedia.org/w/api.php?${params.toString()}`
      )
      const data: WikipediaQueryResponse = await response.json()
      const pages = Object.values(data.query?.pages || {})
      return pages
        .map((page) => mapWikipediaPageToBook(page, language))
        .filter((book): book is GoogleBook => Boolean(book))
    })
  )

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

async function searchHebrewFallbackBooks(query: string): Promise<GoogleBook[]> {
  const trimmed = query.trim()
  if (!trimmed || !HEBREW_RE.test(trimmed)) return []

  const withoutNikkud = removeNikkud(trimmed)
  const variants = Array.from(
    new Set(
      [
        trimmed,
        withoutNikkud,
        `"${trimmed}"`,
        withoutNikkud && withoutNikkud !== trimmed ? `"${withoutNikkud}"` : '',
      ].filter(Boolean)
    )
  )

  const settled = await Promise.allSettled(
    variants.flatMap((variant) => [
      searchGoogleSource(variant, 'he'),
      searchOpenLibraryBooks(variant, 'he'),
    ])
  )

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

function makeBookDedupeKey(book: GoogleBook): string {
  const identifiers = book.volumeInfo.industryIdentifiers || []
  const isbn13 = identifiers.find((item) => item.type === 'ISBN_13')?.identifier
  const isbn10 = identifiers.find((item) => item.type === 'ISBN_10')?.identifier

  if (isbn13) return `isbn13:${normalizeIdentifier(isbn13)}`
  if (isbn10) return `isbn10:${normalizeIdentifier(isbn10)}`

  const author = book.volumeInfo.authors?.[0] || ''
  const year = getPublishedYear(book.volumeInfo.publishedDate)

  return [
    'title',
    normalizeText(book.volumeInfo.title),
    'author',
    normalizeText(author),
    'year',
    year,
  ].join(':')
}

function scoreBook(
  book: GoogleBook,
  query: string,
  langRestrict?: string
): number {
  const normalizedQuery = normalizeText(query)
  const tokens = normalizedQuery.split(' ').filter(Boolean)
  const title = normalizeText(book.volumeInfo.title)
  const authors = normalizeText((book.volumeInfo.authors || []).join(' '))
  const identifiers = book.volumeInfo.industryIdentifiers || []
  const queryHasHebrew = HEBREW_RE.test(query)

  let score = 0

  if (title === normalizedQuery) {
    score += 220
  } else if (title.startsWith(normalizedQuery)) {
    score += 140
  } else if (title.includes(normalizedQuery)) {
    score += 95
  }

  for (const token of tokens) {
    if (title.includes(token)) score += 18
    if (authors.includes(token)) score += 10
  }

  if (isLikelyIsbn(query)) {
    const normalizedIsbn = normalizeIdentifier(query)
    if (
      identifiers.some(
        (identifier) =>
          normalizeIdentifier(identifier.identifier) === normalizedIsbn
      )
    ) {
      score += 300
    }
  }

  if (langRestrict) {
    if (normalizeLanguage(book.volumeInfo.language) === langRestrict) {
      score += 50
    }

    if (
      langRestrict === 'he' &&
      (HEBREW_RE.test(book.volumeInfo.title) ||
        HEBREW_RE.test((book.volumeInfo.authors || []).join(' ')))
    ) {
      score += 40
    }

    if (
      langRestrict === 'en' &&
      !HEBREW_RE.test(book.volumeInfo.title) &&
      !HEBREW_RE.test((book.volumeInfo.authors || []).join(' '))
    ) {
      score += 20
    }
  }

  if (queryHasHebrew) {
    if (HEBREW_RE.test(book.volumeInfo.title)) score += 35
    if (book.source === 'openlibrary') score += 12
    if (book.source === 'gutendex') score -= 12
    if (book.source === 'wikipedia' && normalizeLanguage(book.volumeInfo.language) === 'he') {
      score += 8
    }
  } else if (book.source === 'google') {
    score += 6
  }

  if (book.source === 'wikipedia') {
    score -= 25
  }

  if (book.volumeInfo.imageLinks?.thumbnail) score += 10
  if ((book.volumeInfo.industryIdentifiers || []).length > 0) score += 4
  if (book.volumeInfo.description) score += 2

  return score
}

function rankAndDedupeBooks(
  books: GoogleBook[],
  query: string,
  langRestrict?: string
): GoogleBook[] {
  const ranked: RankedBook[] = books.map((book) => ({
    book,
    score: scoreBook(book, query, langRestrict),
  }))

  ranked.sort((a, b) => b.score - a.score)

  const deduped = new Map<string, GoogleBook>()
  for (const entry of ranked) {
    const key = makeBookDedupeKey(entry.book)
    const existing = deduped.get(key)
    deduped.set(key, existing ? mergeBooks(existing, entry.book) : entry.book)
  }

  return Array.from(deduped.values()).slice(0, 20)
}

function fillMissingCoversFromMatches(books: GoogleBook[]): GoogleBook[] {
  const booksWithCovers = books.filter((book) =>
    Boolean(normalizeImageUrl(book.volumeInfo.imageLinks?.thumbnail))
  )

  return books.map((book) => {
    const currentCover = normalizeImageUrl(book.volumeInfo.imageLinks?.thumbnail)
    if (currentCover) return book

    const bookKey = makeBookDedupeKey(book)
    const isbnCandidates = new Set(getBookIsbnCandidates(book))

    const match = booksWithCovers.find((candidate) => {
      if (candidate.id === book.id) return false
      if (makeBookDedupeKey(candidate) === bookKey) return true

      const candidateIsbns = getBookIsbnCandidates(candidate)
      return candidateIsbns.some((isbn) => isbnCandidates.has(isbn))
    })

    if (!match) return book

    return mergeBooks(book, match)
  })
}

export async function searchGoogleBooks(
  query: string,
  langRestrict?: string
): Promise<GoogleBook[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const settled = await Promise.allSettled([
    searchGoogleSource(normalizedQuery, langRestrict),
    searchOpenLibraryBooks(normalizedQuery, langRestrict),
    searchGutendexBooks(normalizedQuery, langRestrict),
  ])

  let books = settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )

  if (books.length === 0 && HEBREW_RE.test(normalizedQuery)) {
    const hebrewFallbackBooks = await searchHebrewFallbackBooks(normalizedQuery)
    books = [...books, ...hebrewFallbackBooks]
  }

  if (books.length === 0) {
    const wikipediaBooks = await searchWikipediaBooks(normalizedQuery, langRestrict)
    books = [...books, ...wikipediaBooks]
  }

  if (books.length > 0) {
    return rankAndDedupeBooks(
      fillMissingCoversFromMatches(books),
      normalizedQuery,
      langRestrict
    )
  }

  if (settled.every((result) => result.status === 'rejected')) {
    console.error('All book sources failed', settled)
    throw new Error('Failed to search books right now. Please try again in a moment.')
  }

  return []
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
  }
}
