export type BookProviderName =
  | 'google'
  | 'openlibrary'
  | 'amazon'
  | 'steimatzky'
  | 'booknet'
  | 'indiebook'
  | 'simania'

export type SearchDebugInfo = {
  providerTimings: Record<string, number>
  providerErrors: Array<{ provider: BookProviderName; message: string }>
  candidateLogs?: CandidateDebugLog[]
  clusterLogs?: ClusterDebugLog[]
  ranking?: Array<{ id: string; score: number; reasons: string[] }>
}

export type CandidateDebugLog = {
  source: BookProviderName
  source_ids: { work?: string; edition?: string; source: string }
  raw_title: string
  normalized_title: string
  authors: string[]
  language?: string
  isbns: string[]
  score_breakdown: Record<string, number>
  work_key_candidate: string
}

export type ClusterDebugLog = {
  canonical_work_key: string
  merged_candidate_ids: string[]
  merge_confidence: number
  merge_reasons: string[]
  representative_candidate_id: string
  excluded_candidate_ids: string[]
}

export type BookIdentityKeys = {
  openlibrary_work_id?: string
  openlibrary_edition_id?: string
  google_volume_id?: string
  internal_book_code?: string
  isbns: string[]
}

export type QueryPlan = {
  raw_query: string
  normalized_query: string
  tokenized_query: string[]
  query_without_punctuation: string
  compact_query: string
  language_guess: 'he' | 'en' | 'unknown'
  isbn_candidates: string[]
  phrase_query: string
  significant_tokens: string[]
  stopword_light_query: string
  typo_tolerant_query: string
}

export type BookCandidate = {
  source: BookProviderName
  source_work_id?: string
  source_edition_id?: string
  source_url?: string

  title: string
  subtitle?: string
  authors: string[]
  contributors?: string[]
  description?: string
  languages?: string[]
  subjects?: string[]
  publishers?: string[]
  publish_year?: number
  publish_date?: string
  isbn10?: string[]
  isbn13?: string[]
  identifiers?: string[]
  cover_url?: string
  cover_urls?: string[]
  cover_score?: number
  page_count?: number
  format?: string
  edition_label?: string
  tags?: string[]
  series_name?: string
  series_index?: number

  raw_title_normalized: string
  raw_authors_normalized: string[]
  title_key: string
  author_key: string
  work_key_candidate: string

  source_confidence: number
  metadata_completeness_score: number
  title_match_score: number
  author_match_score: number
  isbn_match_score: number
  language_match_score: number
  retailer_match_score: number
  overall_candidate_score: number

  is_hebrew: boolean
  is_edition: boolean
  retailer_data?: Array<Record<string, unknown>>
  identity_keys?: BookIdentityKeys
  source_attribution?: Array<{
    source: BookProviderName
    source_url?: string
    source_id: string
    fields: string[]
  }>
  raw?: unknown
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

export type GroupedWork = {
  canonical_work_key: string
  best_title: string
  best_subtitle?: string
  best_authors: string[]
  best_description?: string
  best_cover_url?: string
  all_cover_urls?: string[]
  languages: string[]
  subjects: string[]
  tags?: string[]
  representative_publish_year?: number
  source_summary: BookProviderName[]
  editions: BookCandidate[]
  retailers: Array<Record<string, unknown>>
  confidence_score: number
  warnings: string[]
}

export type GroupedBookResult = {
  group_id: string
  work: CatalogWork
  grouped_work: GroupedWork
  primary: BookCandidate
  editions: BookCandidate[]
  edition_records: CatalogEdition[]
  total_editions: number
  group_score: number
}

export type ProviderSearchOptions = {
  language?: string
  timeoutMs?: number
  debug?: boolean
  limit?: number
}

export type SearchOrchestratorOptions = ProviderSearchOptions & {
  maxResults?: number
}

export type SearchResponse = {
  query: QueryPlan
  total_raw_candidates: number
  total_grouped_works: number
  results: GroupedBookResult[]
  debug?: SearchDebugInfo
}

// Backward-compat aliases for existing call sites.
export type NormalizedBookResult = BookCandidate
