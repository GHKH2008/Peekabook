import type { BookSearchProvider } from './interface'
import { fetchJson, withAttribution } from './utils'
import type { NormalizedBookResult, ProviderSearchOptions } from '../types'

export const openLibraryProvider: BookSearchProvider = {
  capabilities: { supportsIsbnSearch: true, supportsAuthorSearch: true, supportsLanguageFilter: true, preferredForHebrew: true },
  name: 'openlibrary',
  enabled: () => true,
  async search(query: string, options?: ProviderSearchOptions): Promise<NormalizedBookResult[]> {
    const data = await fetchJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20`, options?.timeoutMs)
    return (data?.docs || []).map((doc: any) => {
      const isbn10 = (doc.isbn || []).find((value: string) => value.length === 10)
      const isbn13 = (doc.isbn || []).find((value: string) => value.length === 13)
      const cover = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined
      return withAttribution(
        {
          source: 'openlibrary',
          source_id: doc.key,
          title: doc.title || 'Unknown',
          subtitle: doc.subtitle,
          authors: doc.author_name || [],
          language: doc.language?.[0],
          publisher: doc.publisher?.[0],
          published_date: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
          isbn_10: isbn10,
          isbn_13: isbn13,
          page_count: doc.number_of_pages_median,
          categories: doc.subject?.slice(0, 8),
          cover_image: cover,
          thumbnail_image: cover,
          canonical_url: doc.key ? `https://openlibrary.org${doc.key}` : undefined,
          raw_source_data: doc,
          work: {
            display_title: doc.title || 'Unknown',
            display_authors: doc.author_name || [],
            language: doc.language?.[0],
            subjects: doc.subject?.slice(0, 8) || [],
            cover,
          },
          edition: {
            edition_title: doc.title || 'Unknown',
            publication_date: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
            publisher: doc.publisher?.[0],
            isbn_10: isbn10,
            isbn_13: isbn13,
            page_count: doc.number_of_pages_median,
            language: doc.language?.[0],
          },
        },
        ['title', 'authors', 'language', 'publisher', 'published_date', 'isbn_10', 'isbn_13', 'cover_image']
      )
    })
  },
  async lookupByExternalId(id: string, options?: ProviderSearchOptions) {
    const key = id.startsWith('/') ? id : `/works/${id}`
    const doc = await fetchJson(`https://openlibrary.org${key}.json`, options?.timeoutMs)
    if (!doc) return null
    return {
      source: 'openlibrary',
      source_id: key,
      title: doc.title || 'Unknown',
      subtitle: doc.subtitle,
      authors: [],
      description: typeof doc.description === 'string' ? doc.description : doc.description?.value,
      published_date: doc.first_publish_date,
      canonical_url: `https://openlibrary.org${key}`,
      raw_source_data: doc,
      work: {
        display_title: doc.title || 'Unknown',
        subjects: [],
        description: typeof doc.description === 'string' ? doc.description : doc.description?.value,
      },
      edition: {
        edition_title: doc.title || 'Unknown',
        publication_date: doc.first_publish_date,
      },
      source_attribution: [{ source: 'openlibrary', source_id: key, source_url: `https://openlibrary.org${key}`, fields: ['title', 'description', 'published_date'] }],
    }
  },
}
