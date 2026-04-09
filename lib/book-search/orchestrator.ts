import { readCache, writeCache } from './cache'
import { buildSearchVariants, normalizeQuery } from './normalize'
import { mergeCandidates, computeGroupScore } from './merge'
import { getBookProviders } from './providers'
import { amazonProvider } from './providers/amazon'
import { rankResults, scoreCandidate } from './ranker'
import type { BookCandidate, CandidateDebugLog, SearchOrchestratorOptions, SearchResponse } from './types'

const CACHE_TTL_MS = 1000 * 60 * 5
const DEFAULT_PER_SOURCE_LIMIT = 70
const RETAILER_SOURCES = new Set(['steimatzky', 'booknet', 'indiebook', 'simania'])

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)),
  ])
}

function fanoutStrategies(query: ReturnType<typeof normalizeQuery>): string[] {
  const variants = buildSearchVariants(query.raw_query)
  const base = [
    query.phrase_query,
    query.stopword_light_query,
    query.tokenized_query.join(' '),
    `${query.significant_tokens.join(' ')} ${query.tokenized_query.slice(0, 2).join(' ')}`.trim(),
    ...query.isbn_candidates,
    ...variants,
  ]
  return Array.from(new Set(base.filter(Boolean))).slice(0, 8)
}

function sourcePriority(source: BookCandidate['source'], languageGuess: string): number {
  const base: Record<string, number> = {
    google: 100,
    openlibrary: 90,
    amazon: 40,
    steimatzky: languageGuess === 'he' ? 85 : 55,
    booknet: languageGuess === 'he' ? 82 : 52,
    indiebook: languageGuess === 'he' ? 80 : 50,
    simania: languageGuess === 'he' ? 78 : 48,
  }
  return base[source] || 40
}

export async function searchBooksOrchestrated(query: string, options: SearchOrchestratorOptions = {}): Promise<SearchResponse> {
  const normalized = query.trim()
  const queryPlan = normalizeQuery(normalized)
  if (!normalized) {
    return { query: queryPlan, total_raw_candidates: 0, total_grouped_works: 0, results: [] }
  }

  const cacheKey = `book-search:v2:${queryPlan.normalized_query}:${options.language || queryPlan.language_guess}:${options.maxResults || 100}`
  const cached = readCache<SearchResponse>(cacheKey)
  if (cached) return cached

  const providers = getBookProviders().filter(({ provider }) => provider.enabled())
  const orderedProviders = providers.sort((a, b) => b.priority - a.priority)
  const strategies = fanoutStrategies(queryPlan)

  const providerTimings: Record<string, number> = {}
  const providerErrors: Array<{ provider: any; message: string }> = []
  const rawCandidates: BookCandidate[] = []

  await Promise.all(
    orderedProviders.map(async ({ provider }) => {
      const start = Date.now()
      try {
        const tasks = strategies.map((variant) =>
          withTimeout(provider.search(variant, options.language || queryPlan.language_guess, options.limit || DEFAULT_PER_SOURCE_LIMIT, options), options.timeoutMs || 5000)
        )
        const batches = await Promise.allSettled(tasks)
        batches.forEach((batch) => {
          if (batch.status === 'fulfilled') rawCandidates.push(...batch.value)
        })
      } catch (error) {
        providerErrors.push({ provider: provider.name, message: error instanceof Error ? error.message : 'unknown error' })
      }
      providerTimings[provider.name] = Date.now() - start
    })
  )

  const scoredCandidates = rawCandidates.map((candidate) => scoreCandidate(candidate, queryPlan, options.language))
  const amazonEnrichedCandidates =
    queryPlan.language_guess === 'en'
      ? (
          await Promise.all(
            scoredCandidates.map(async (candidate) => {
              const isbn = [...(candidate.isbn13 || []), ...(candidate.isbn10 || [])].find((value) => value?.length === 13 || value?.length === 10)
              if (!isbn) return null
              const amazon = await amazonProvider.getEditionDetails(isbn, { ...options, language: options.language || queryPlan.language_guess })
              if (!amazon) return null
              return scoreCandidate(
                {
                  ...candidate,
                  source: 'amazon',
                  source_edition_id: amazon.source_edition_id || `isbn:${isbn}`,
                  source_url: amazon.source_url,
                  tags: Array.from(new Set(['amazon', ...(candidate.tags || [])])),
                  retailer_data: [...(candidate.retailer_data || []), { source: 'amazon', url: amazon.source_url, isbn }],
                  source_attribution: [...(candidate.source_attribution || []), ...(amazon.source_attribution || [])],
                },
                queryPlan,
                options.language
              )
            })
          )
        ).filter((candidate): candidate is BookCandidate => Boolean(candidate))
      : []
  const rankedCandidates = rankResults([...scoredCandidates, ...amazonEnrichedCandidates], query, options.language)
  const candidateLogs: CandidateDebugLog[] = rankedCandidates.map((candidate) => ({
    source: candidate.source,
    source_ids: {
      work: candidate.source_work_id,
      edition: candidate.source_edition_id,
      source: candidate.source_edition_id || candidate.source_work_id || candidate.title_key,
    },
    raw_title: candidate.title,
    normalized_title: candidate.raw_title_normalized,
    authors: candidate.authors,
    language: candidate.languages?.[0],
    isbns: [...(candidate.isbn10 || []), ...(candidate.isbn13 || [])],
    score_breakdown: {
      title: candidate.title_match_score,
      author: candidate.author_match_score,
      isbn: candidate.isbn_match_score,
      language: candidate.language_match_score,
      source: candidate.source_confidence,
      metadata: candidate.metadata_completeness_score,
      cover: candidate.cover_score || 0,
      overall: candidate.overall_candidate_score,
    },
    work_key_candidate: candidate.work_key_candidate,
  }))

  const { groupedResults, clusterLogs } = mergeCandidates(rankedCandidates, queryPlan, options)

  const rankedGroups = groupedResults
    .map((group) => {
      const retailerSupportBonus = group.grouped_work.source_summary.filter((source) => RETAILER_SOURCES.has(source)).length * (queryPlan.language_guess === 'he' ? 16 : 4)
      const groupScore = computeGroupScore(group, queryPlan) + sourcePriority(group.primary.source, queryPlan.language_guess) + retailerSupportBonus
      return {
        ...group,
        group_score: groupScore,
      }
    })
    .sort((a, b) => b.group_score - a.group_score)
    .slice(0, Math.min(options.maxResults || 100, 100))

  const response: SearchResponse = {
    query: queryPlan,
    total_raw_candidates: rankedCandidates.length,
    total_grouped_works: rankedGroups.length,
    results: rankedGroups,
    debug: options.debug
      ? {
          providerTimings,
          providerErrors,
          candidateLogs,
          clusterLogs,
          ranking: rankedGroups.map((group) => ({ id: group.group_id, score: group.group_score, reasons: [`best:${group.primary.overall_candidate_score.toFixed(1)}`] })),
        }
      : undefined,
  }

  writeCache(cacheKey, response, CACHE_TTL_MS)
  return response
}
