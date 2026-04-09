import type { BookCandidate, ProviderSearchOptions } from '../types'

export type ProviderCapabilities = {
  supportsIsbnSearch?: boolean
  supportsAuthorSearch?: boolean
  supportsLanguageFilter?: boolean
  preferredForHebrew?: boolean
}

export interface BookSearchProvider {
  name: BookCandidate['source']
  capabilities?: ProviderCapabilities
  enabled(): boolean
  search(query: string, language?: string, limit?: number, options?: ProviderSearchOptions): Promise<BookCandidate[]>
  getWorkDetails(id: string, options?: ProviderSearchOptions): Promise<BookCandidate | null>
  getEditionDetails(id: string, options?: ProviderSearchOptions): Promise<BookCandidate | null>
}
