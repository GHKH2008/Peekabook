import type { BookSearchProvider } from './interface'
import { fetchJson, withAttribution } from './utils'
import type { NormalizedBookResult, ProviderSearchOptions } from '../types'

function mapGoogleItem(item: any): NormalizedBookResult {
  const ids = item.volumeInfo?.industryIdentifiers || []
  const isbn10 = ids.find((id: any) => id.type === 'ISBN_10')?.identifier
  const isbn13 = ids.find((id: any) => id.type === 'ISBN_13')?.identifier

  return withAttribution(
    {
      source: 'google',
      source_id: item.id,
      title: item.volumeInfo?.title || 'Unknown',
      subtitle: item.volumeInfo?.subtitle,
      authors: item.volumeInfo?.authors || [],
      description: item.volumeInfo?.description,
      language: item.volumeInfo?.language,
      publisher: item.volumeInfo?.publisher,
      published_date: item.volumeInfo?.publishedDate,
      isbn_10: isbn10,
      isbn_13: isbn13,
      page_count: item.volumeInfo?.pageCount,
      categories: item.volumeInfo?.categories,
      cover_image: item.volumeInfo?.imageLinks?.thumbnail,
      thumbnail_image: item.volumeInfo?.imageLinks?.smallThumbnail,
      canonical_url: item.volumeInfo?.infoLink,
      rating: item.volumeInfo?.averageRating,
      rating_count: item.volumeInfo?.ratingsCount,
      raw_source_data: item,
      work: {
        display_title: item.volumeInfo?.title || 'Unknown',
        display_authors: item.volumeInfo?.authors || [],
        language: item.volumeInfo?.language,
        subjects: item.volumeInfo?.categories || [],
        description: item.volumeInfo?.description,
        cover: item.volumeInfo?.imageLinks?.thumbnail,
      },
      edition: {
        edition_title: item.volumeInfo?.title || 'Unknown',
        publication_date: item.volumeInfo?.publishedDate,
        publisher: item.volumeInfo?.publisher,
        isbn_10: isbn10,
        isbn_13: isbn13,
        format: item.saleInfo?.isEbook ? 'ebook' : undefined,
        page_count: item.volumeInfo?.pageCount,
        language: item.volumeInfo?.language,
      },
    },
    ['title', 'authors', 'description', 'language', 'isbn_10', 'isbn_13', 'cover_image']
  )
}

export const googleProvider: BookSearchProvider = {
  capabilities: { supportsIsbnSearch: true, supportsAuthorSearch: true, supportsLanguageFilter: true },
  name: 'google',
  enabled: () => true,
  async search(query: string, options?: ProviderSearchOptions): Promise<NormalizedBookResult[]> {
    const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20`, options?.timeoutMs)
    return (data?.items || []).map(mapGoogleItem)
  },
  async lookupByExternalId(id: string, options?: ProviderSearchOptions) {
    const item = await fetchJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`, options?.timeoutMs)
    if (!item?.id) return null
    return mapGoogleItem(item)
  },
}
