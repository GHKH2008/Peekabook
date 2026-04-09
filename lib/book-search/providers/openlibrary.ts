import type { BookSearchProvider } from './interface'
import { fetchJson, makeCandidate } from './utils'
import type { BookCandidate, ProviderSearchOptions } from '../types'

function parseWorkId(doc: any): string | undefined {
  return doc?.key?.match(/\/works\/(OL\d+W)/i)?.[1] || doc?.works?.[0]?.key?.match(/\/works\/(OL\d+W)/i)?.[1]
}

function parseEditionId(doc: any): string | undefined {
  return doc?.key?.match(/\/books\/(OL\d+M)/i)?.[1] || doc?.cover_edition_key
}

function mapSearchDoc(doc: any): BookCandidate {
  const isbn10 = (doc.isbn || []).filter((value: string) => value.length === 10)
  const isbn13 = (doc.isbn || []).filter((value: string) => value.length === 13)
  const cover = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined

  const sourceWorkId = parseWorkId(doc)
  const sourceEditionId = parseEditionId(doc)
  const sourcePath = doc.key || (sourceWorkId ? `/works/${sourceWorkId}` : '')

  return makeCandidate({
    source: 'openlibrary',
    sourceId: sourcePath || sourceWorkId || sourceEditionId || String(doc.key || doc.title || ''),
    sourceWorkId,
    sourceEditionId,
    sourceUrl: sourcePath ? `https://openlibrary.org${sourcePath}` : undefined,
    title: doc.title || 'Unknown',
    subtitle: doc.subtitle,
    authors: doc.author_name || [],
    description: typeof doc.description === 'string' ? doc.description : doc.description?.value,
    languages: (doc.language || []).map((lang: string) => String(lang).replace('/languages/', '')),
    subjects: doc.subject?.slice(0, 10) || [],
    publishers: doc.publisher?.slice(0, 2) || [],
    publishDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
    isbn10,
    isbn13,
    coverUrl: cover,
    pageCount: doc.number_of_pages_median,
    raw: doc,
  })
}

export const openLibraryProvider: BookSearchProvider = {
  capabilities: { supportsIsbnSearch: true, supportsAuthorSearch: true, supportsLanguageFilter: true, preferredForHebrew: true },
  name: 'openlibrary',
  enabled: () => true,
  async search(query: string, language?: string, limit = 100, options?: ProviderSearchOptions): Promise<BookCandidate[]> {
    const languageCode = language === 'he' ? 'heb' : language === 'en' ? 'eng' : undefined
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 100)}${languageCode ? `&language=${languageCode}` : ''}`
    const data = await fetchJson(url, options?.timeoutMs)
    const docs = (data?.docs || []).map(mapSearchDoc)
    if (language !== 'he') return docs
    return docs.filter((item: BookCandidate) => (item.languages || []).some((lang: string) => /heb|he/i.test(lang)))
  },
  async getWorkDetails(id: string, options?: ProviderSearchOptions) {
    const key = id.startsWith('/') ? id : `/works/${id}`
    const doc = await fetchJson(`https://openlibrary.org${key}.json`, options?.timeoutMs)
    if (!doc) return null
    return mapSearchDoc({ ...doc, key })
  },
  async getEditionDetails(id: string, options?: ProviderSearchOptions) {
    const key = id.startsWith('/') ? id : `/books/${id}`
    const doc = await fetchJson(`https://openlibrary.org${key}.json`, options?.timeoutMs)
    if (!doc) return null
    return mapSearchDoc({ ...doc, key })
  },
}
