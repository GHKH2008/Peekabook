export type BookProviderName =
  | 'google'
  | 'openlibrary'
  | 'steimatzky'
  | 'booknet'
  | 'indiebook'
  | 'simania'

export type SearchDebugInfo = {
  providerTimings: Record<string, number>
  providerErrors: Array<{ provider: BookProviderName; message: string }>
  ranking?: Array<{ id: string; score: number; reasons: string[] }>
  mergeDecisions?: Array<{ kept: string; merged: string; confidence: number; reasons: string[] }>
}

export type NormalizedBookResult = {
  source: BookProviderName
  source_id: string
  title: string
  subtitle?: string
  authors: string[]
  description?: string
  language?: string
  publisher?: string
  published_date?: string
  isbn_10?: string
  isbn_13?: string
  page_count?: number
  categories?: string[]
  cover_image?: string
  thumbnail_image?: string
  format?: string
  price?: number
  currency?: string
  availability?: string
  canonical_url?: string
  rating?: number
  rating_count?: number
  raw_source_data?: unknown
  source_attribution?: Array<{
    source: BookProviderName
    source_url?: string
    source_id: string
    fields: string[]
  }>
}

export type ProviderSearchOptions = {
  language?: string
  timeoutMs?: number
  debug?: boolean
}

export type SearchOrchestratorOptions = ProviderSearchOptions & {
  maxResults?: number
}

export type SearchResponse = {
  results: NormalizedBookResult[]
  debug?: SearchDebugInfo
}
