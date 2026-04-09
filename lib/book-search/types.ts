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
  mergeLogs?: Array<{
    workKey: string
    candidateId: string
    matched: boolean
    score: number
    reasons: string[]
    blockedBy?: string[]
  }>
}

export type BookIdentityKeys = {
  openlibrary_work_id?: string
  openlibrary_edition_id?: string
  google_volume_id?: string
  internal_book_code?: string
  isbns: string[]
}

export type CatalogWork = {
  canonical_work_id: string
  normalized_title: string
  normalized_authors: string[]
  display_title: string
  display_authors: string[]
  language?: string
  series?: string
  volume?: string
  subjects: string[]
  description?: string
  cover?: string
  source_confidence: number
  source_badges: BookProviderName[]
}

export type CatalogEdition = {
  edition_id: string
  work_id: string
  edition_title: string
  publication_date?: string
  publisher?: string
  isbn_10?: string
  isbn_13?: string
  format?: string
  page_count?: number
  language?: string
  source_ids: Partial<Record<BookProviderName, string>>
  source_confidence: number
  raw_payloads: Array<{ source: BookProviderName; payload: unknown }>
}

export type UserCopy = {
  owner_user_id: number
  visibility: 'public' | 'friends' | 'private'
  availability: 'available' | 'requested' | 'loaned' | 'unavailable'
  condition?: string
  notes?: string
  local_cover_override?: string
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
  series?: string
  volume?: string
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
  work?: Partial<CatalogWork>
  edition?: Partial<CatalogEdition>
}

export type GroupedBookResult = {
  group_id: string
  work: CatalogWork
  primary: NormalizedBookResult
  editions: NormalizedBookResult[]
  edition_records: CatalogEdition[]
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
