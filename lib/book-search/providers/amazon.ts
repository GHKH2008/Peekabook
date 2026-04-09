import type { BookSearchProvider } from './interface'
import { makeCandidate } from './utils'
import type { BookCandidate, ProviderSearchOptions } from '../types'

function isEnglishLanguage(language?: string): boolean {
  if (!language) return true
  const normalized = language.toLowerCase()
  return normalized.startsWith('en') || normalized === 'unknown'
}

function toAmazonLink(isbn: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(isbn)}&i=stripbooks`
}

export const amazonProvider: BookSearchProvider = {
  capabilities: { supportsIsbnSearch: true, supportsAuthorSearch: false, supportsLanguageFilter: true },
  name: 'amazon',
  enabled: () => process.env.BOOK_PROVIDER_AMAZON_ENABLED !== 'false',
  async search(_query: string, _language?: string, _limit = 20, _options?: ProviderSearchOptions): Promise<BookCandidate[]> {
    // Amazon is used as enrichment based on known identifiers to avoid noisy duplicate cards.
    return []
  },
  async getWorkDetails(_id: string, _options?: ProviderSearchOptions) {
    return null
  },
  async getEditionDetails(id: string, options?: ProviderSearchOptions) {
    const isbn = String(id || '').replace(/[^0-9X]/gi, '').toUpperCase()
    if ((isbn.length !== 10 && isbn.length !== 13) || !isEnglishLanguage(options?.language)) return null
    return makeCandidate({
      source: 'amazon',
      sourceId: `isbn:${isbn}`,
      sourceEditionId: `isbn:${isbn}`,
      sourceUrl: toAmazonLink(isbn),
      title: 'Amazon listing',
      isbn10: isbn.length === 10 ? [isbn] : [],
      isbn13: isbn.length === 13 ? [isbn] : [],
      format: 'retailer',
      tags: ['amazon'],
      raw: { isbn, type: 'amazon_enrichment' },
    })
  },
}
