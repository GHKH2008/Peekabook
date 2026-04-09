import type { NormalizedBookResult, ProviderSearchOptions } from '../types'

export type ProviderCapabilities = {
  supportsIsbnSearch?: boolean
  supportsAuthorSearch?: boolean
  supportsLanguageFilter?: boolean
  preferredForHebrew?: boolean
}

export interface BookSearchProvider {
  name: NormalizedBookResult['source']
  capabilities?: ProviderCapabilities
  enabled(): boolean
  search(query: string, options?: ProviderSearchOptions): Promise<NormalizedBookResult[]>
  lookupByExternalId(id: string, options?: ProviderSearchOptions): Promise<NormalizedBookResult | null>
}
