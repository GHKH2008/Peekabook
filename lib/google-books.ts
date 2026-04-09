export type GoogleBook = {
  id: string
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

async function fetchWithRetry(
  url: string,
  retries = 2,
  baseDelay = 2000
): Promise<Response> {
  let lastError: Error | null = null
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url)
      
      if (response.ok) {
        return response
      }
      
      // If rate limited (429), wait longer before retry
      if (response.status === 429) {
        lastError = new Error('Rate limited by Google Books API')
        if (i < retries - 1) {
          // Exponential backoff: 2s, 4s
          await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, i)))
          continue
        }
        throw lastError
      }
      
      // For server errors (5xx), retry with backoff
      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status}`)
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, baseDelay * (i + 1)))
          continue
        }
        throw lastError
      }
      
      // For other errors (4xx except 429), don't retry
      throw new Error(`Google Books API error: ${response.status}`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Google Books API error')) {
        throw error
      }
      lastError = error instanceof Error ? error : new Error('Unknown error')
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * (i + 1)))
        continue
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch from Google Books API after retries')
}

export async function searchGoogleBooks(
  query: string,
  langRestrict?: string
): Promise<GoogleBook[]> {
  if (!query.trim()) return []

  const params = new URLSearchParams({
    q: query,
    maxResults: '12',
  })

  if (langRestrict) {
    params.set('langRestrict', langRestrict)
  }

  try {
    const response = await fetchWithRetry(
      `https://www.googleapis.com/books/v1/volumes?${params.toString()}`
    )

    const data: GoogleBooksResponse = await response.json()
    const googleResults = data.items || []

    if (googleResults.length > 0) {
      return googleResults
    }

    return searchOpenLibraryBooks(query, langRestrict)
  } catch (error) {
    console.error('Google Books search error:', error)

    const fallbackResults = await searchOpenLibraryBooks(query, langRestrict)
    if (fallbackResults.length > 0) {
      return fallbackResults
    }

    throw new Error('Failed to search books right now. Please try again in a moment.')
  }
}

async function searchOpenLibraryBooks(
  query: string,
  langRestrict?: string
): Promise<GoogleBook[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '12',
  })

  if (langRestrict) {
    params.set('language', langRestrict)
  }

  const response = await fetch(
    `https://openlibrary.org/search.json?${params.toString()}`
  )

  if (!response.ok) {
    return []
  }

  const data: OpenLibrarySearchResponse = await response.json()
  const docs = data.docs || []

  return docs
    .filter((doc) => !!doc.title)
    .map((doc): GoogleBook => {
      const isbn10 = doc.isbn?.find((isbn) => isbn.length === 10)
      const isbn13 = doc.isbn?.find((isbn) => isbn.length === 13)
      const coverUrl = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : undefined

      return {
        id: `openlibrary:${doc.key || doc.title}`,
        volumeInfo: {
          title: doc.title || 'Unknown title',
          authors: doc.author_name || [],
          description:
            typeof doc.first_sentence === 'string'
              ? doc.first_sentence
              : doc.first_sentence?.value,
          categories: doc.subject?.slice(0, 5),
          industryIdentifiers: [
            ...(isbn10 ? [{ type: 'ISBN_10', identifier: isbn10 }] : []),
            ...(isbn13 ? [{ type: 'ISBN_13', identifier: isbn13 }] : []),
          ],
          language: doc.language?.[0],
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
    })
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
    isbn: identifiers.find(i => i.type === 'ISBN_10')?.identifier || null,
    isbn_13: identifiers.find(i => i.type === 'ISBN_13')?.identifier || null,
    language: info.language || null,
    cover_url: info.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
    publisher: info.publisher || null,
    published_date: info.publishedDate || null,
    page_count: info.pageCount || null,
    is_adult: info.maturityRating === 'MATURE',
  }
}
