import { readCache, writeCache } from './cache'
import { buildSearchVariants, normalizeQuery } from './normalize'
import { mergeCandidates, computeGroupScore } from './merge'
import { getBookProviders } from './providers'
import { amazonProvider } from './providers/amazon'
import { rankResults, scoreCandidate } from './ranker'
import type { BookCandidate, CandidateDebugLog, SearchOrchestratorOptions, SearchResponse } from './types'

const CACHE_TTL_MS = 1000 * 60 * 5
const DEFAULT_PER_SOURCE_LIMIT = 60

const FLOW_EN = ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'] as const
const FLOW_HE = ['google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania'] as const

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)),
  ])
}

function buildStrategyPlan(query: ReturnType<typeof normalizeQuery>): string[] {
  const variants = buildSearchVariants(query.raw_query)
  if (query.language_guess === 'en') {
    return Array.from(
      new Set([
        ...query.isbn_candidates,
        `${query.phrase_query}`.trim(),
        query.phrase_query,
        `${query.stopword_light_query}`.trim(),
        variants.find((v) => !v.includes(':')),
      ].filter((value): value is string => Boolean(value && value.trim())))
    )
  }
  return Array.from(new Set([query.phrase_query, `${query.phrase_query} ${query.significant_tokens[0] || ''}`.trim(), query.query_without_punctuation, ...variants]))
}

export async function searchBooksOrchestrated(query: string, options: SearchOrchestratorOptions = {}): Promise<SearchResponse> {
  const normalized = query.trim()
  const queryPlan = normalizeQuery(normalized)
  if (!normalized) return { query: queryPlan, total_raw_candidates: 0, total_grouped_works: 0, results: [] }

  const cacheKey = `book-search:v3:${queryPlan.normalized_query}:${options.language || queryPlan.language_guess}:${options.maxResults || 100}`
  const cached = readCache<SearchResponse>(cacheKey)
  if (cached) return cached

  const providerMap = new Map(getBookProviders().map(({ provider }) => [provider.name, provider]))
  const flow = (queryPlan.language_guess === 'he' ? FLOW_HE : FLOW_EN).filter((name) => providerMap.get(name)?.enabled())
  const strategies = buildStrategyPlan(queryPlan)

  const providerTimings: Record<string, number> = {}
  const providerErrors: Array<{ provider: any; message: string }> = []
  const rawCandidates: BookCandidate[] = []
  const debugSteps: string[] = []

  for (const sourceName of flow) {
    const provider = providerMap.get(sourceName)
    if (!provider) continue
    const start = Date.now()
    debugSteps.push(`source:start:${sourceName}`)
    try {
      let sourceCount = 0
      for (const strategy of strategies.slice(0, 6)) {
        const batch = await withTimeout(
          provider.search(strategy, options.language || queryPlan.language_guess, options.limit || DEFAULT_PER_SOURCE_LIMIT, options),
          options.timeoutMs || 5000
        )
        const scored = batch.map((candidate) => scoreCandidate(candidate, queryPlan, options.language))
        rawCandidates.push(...scored)
        sourceCount += batch.length
      }
      debugSteps.push(`source:end:${sourceName}:count=${sourceCount}`)
    } catch (error) {
      providerErrors.push({ provider: provider.name, message: error instanceof Error ? error.message : 'unknown error' })
      debugSteps.push(`source:error:${sourceName}`)
    }
    providerTimings[sourceName] = Date.now() - start
  }

  const rankedCandidates = rankResults(rawCandidates, query, options.language)
  const amazonEnrichedCandidates =
    queryPlan.language_guess === 'en'
      ? (
          await Promise.all(
            rankedCandidates.map(async (candidate) => {
              const isbn = [...(candidate.isbn13 || []), ...(candidate.isbn10 || [])].find((value) => value?.length === 13 || value?.length === 10)
              if (!isbn) return null
              const amazon = await amazonProvider.getEditionDetails(isbn, { ...options, language: options.language || queryPlan.language_guess })
              if (!amazon) return null

              return scoreCandidate(
                {
                  ...amazon,
                  title: candidate.title,
                  subtitle: candidate.subtitle,
                  authors: candidate.authors,
                  description: candidate.description,
                  languages: candidate.languages,
                  publishers: candidate.publishers,
                  publish_date: candidate.publish_date,
                  page_count: candidate.page_count,
                  isbn10: candidate.isbn10?.length ? candidate.isbn10 : amazon.isbn10,
                  isbn13: candidate.isbn13?.length ? candidate.isbn13 : amazon.isbn13,
                  cover_url: candidate.cover_url || amazon.cover_url,
                  source_attribution: [
                    ...(candidate.source_attribution || []),
                    ...(amazon.source_attribution || []),
                  ],
                  tags: Array.from(new Set(['amazon', ...(candidate.tags || [])])),
                },
                queryPlan,
                options.language
              )
            })
          )
        ).filter((candidate): candidate is BookCandidate => Boolean(candidate))
      : []
  if (queryPlan.language_guess === 'en') {
    debugSteps.push(`enrichment:amazon:count=${amazonEnrichedCandidates.length}`)
  }
  const allRankedCandidates = rankResults([...rankedCandidates, ...amazonEnrichedCandidates], query, options.language)
  const candidateLogs: CandidateDebugLog[] = allRankedCandidates.map((candidate) => ({
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

  const { groupedResults, clusterLogs } = mergeCandidates(allRankedCandidates, queryPlan, options)
  const rankedGroups = groupedResults
    .map((group) => ({ ...group, group_score: computeGroupScore(group, queryPlan) }))
    .sort((a, b) => b.group_score - a.group_score)
    .slice(0, Math.min(options.maxResults || 100, 100))

  const response: SearchResponse = {
    query: queryPlan,
    total_raw_candidates: allRankedCandidates.length,
    total_grouped_works: rankedGroups.length,
    results: rankedGroups,
    debug: options.debug
      ? {
          providerTimings,
          providerErrors,
          candidateLogs,
          clusterLogs,
          ranking: rankedGroups.map((group) => ({ id: group.group_id, score: group.group_score, reasons: [`score:${group.group_score.toFixed(1)}`] })),
          pipelineSteps: debugSteps,
        }
      : undefined,
  }

  writeCache(cacheKey, response, CACHE_TTL_MS)
  return response
}
