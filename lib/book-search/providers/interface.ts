import type { NormalizedBookResult, ProviderSearchOptions } from '../types'

export interface BookSearchProvider {
  name: NormalizedBookResult['source']
  enabled(): boolean
  search(query: string, options?: ProviderSearchOptions): Promise<NormalizedBookResult[]>
  lookupByExternalId(id: string, options?: ProviderSearchOptions): Promise<NormalizedBookResult | null>
}
