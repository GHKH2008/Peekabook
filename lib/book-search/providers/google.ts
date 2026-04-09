import type { BookSearchProvider } from './interface'
import { fetchJson, makeCandidate } from './utils'
import type { BookCandidate, ProviderSearchOptions } from '../types'

function mapGoogleItem(item: any): BookCandidate {
  const ids = item.volumeInfo?.industryIdentifiers || []
  const isbn10 = ids.filter((id: any) => id.type === 'ISBN_10').map((id: any) => id.identifier)
  const isbn13 = ids.filter((id: any) => id.type === 'ISBN_13').map((id: any) => id.identifier)

  return makeCandidate({
    source: 'google',
    sourceId: item.id,
    sourceUrl: item.volumeInfo?.infoLink,
    title: item.volumeInfo?.title || 'Unknown',
    subtitle: item.volumeInfo?.subtitle,
    authors: item.volumeInfo?.authors || [],
    description: item.volumeInfo?.description,
    languages: item.volumeInfo?.language ? [item.volumeInfo.language] : [],
    subjects: item.volumeInfo?.categories || [],
    publishers: item.volumeInfo?.publisher ? [item.volumeInfo.publisher] : [],
    publishDate: item.volumeInfo?.publishedDate,
    isbn10,
    isbn13,
    coverUrl: item.volumeInfo?.imageLinks?.thumbnail,
    pageCount: item.volumeInfo?.pageCount,
    format: item.saleInfo?.isEbook ? 'ebook' : undefined,
    raw: item,
  })
}

export const googleProvider: BookSearchProvider = {
  capabilities: { supportsIsbnSearch: true, supportsAuthorSearch: true, supportsLanguageFilter: true },
  name: 'google',
  enabled: () => true,
  async search(query: string, language?: string, limit = 40, options?: ProviderSearchOptions): Promise<BookCandidate[]> {
    const languageQuery = language ? `+language:${language}` : ''
    const data = await fetchJson(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query + languageQuery)}&maxResults=${Math.min(Math.max(limit, 1), 40)}`,
      options?.timeoutMs
    )
    return (data?.items || []).map(mapGoogleItem)
  },
  async getWorkDetails(id: string, options?: ProviderSearchOptions) {
    return this.getEditionDetails(id, options)
  },
  async getEditionDetails(id: string, options?: ProviderSearchOptions) {
    const item = await fetchJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`, options?.timeoutMs)
    if (!item?.id) return null
    return mapGoogleItem(item)
  },
}
