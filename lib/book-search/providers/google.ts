import type { BookSearchProvider } from './interface'
import { fetchJson, withAttribution } from './utils'
import type { NormalizedBookResult, ProviderSearchOptions } from '../types'

export const googleProvider: BookSearchProvider = {
  name: 'google',
  enabled: () => true,
  async search(query: string, options?: ProviderSearchOptions): Promise<NormalizedBookResult[]> {
    const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20`, options?.timeoutMs)
    return (data?.items || []).map((item: any) => {
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
        },
        ['title', 'authors', 'description', 'language', 'isbn_10', 'isbn_13', 'cover_image']
      )
    })
  },
  async lookupByExternalId(id: string, options?: ProviderSearchOptions) {
    const item = await fetchJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`, options?.timeoutMs)
    if (!item?.id) return null
    const ids = item.volumeInfo?.industryIdentifiers || []
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
        isbn_10: ids.find((value: any) => value.type === 'ISBN_10')?.identifier,
        isbn_13: ids.find((value: any) => value.type === 'ISBN_13')?.identifier,
        page_count: item.volumeInfo?.pageCount,
        categories: item.volumeInfo?.categories,
        cover_image: item.volumeInfo?.imageLinks?.thumbnail,
        thumbnail_image: item.volumeInfo?.imageLinks?.smallThumbnail,
        canonical_url: item.volumeInfo?.infoLink,
        rating: item.volumeInfo?.averageRating,
        rating_count: item.volumeInfo?.ratingsCount,
        raw_source_data: item,
      },
      ['title', 'authors', 'description', 'language', 'isbn_10', 'isbn_13', 'cover_image']
    )
  },
}
