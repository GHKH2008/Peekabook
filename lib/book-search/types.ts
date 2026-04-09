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

export type BookIdentityKeys = {
  openlibrary_work_id?: string
  openlibrary_edition_id?: string
  google_volume_id?: string
  internal_book_code?: string
  isbns: string[]
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
  identity_keys?: BookIdentityKeys
  source_attribution?: Array<{
    source: BookProviderName
    source_url?: string
    source_id: string
    fields: string[]
  }>
}

export type GroupedBookResult = {
  group_id: string
  primary: NormalizedBookResult
  editions: NormalizedBookResult[]
  total_editions: number
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
  results: GroupedBookResult[]
  debug?: SearchDebugInfo
}
