import { readCache, writeCache } from './cache'
import { buildSearchVariants } from './normalize'
import { getBookProviders } from './providers'
import { mergeCandidates } from './merge'
import { rankResults } from './ranker'
import type { SearchOrchestratorOptions, SearchResponse } from './types'

const CACHE_TTL_MS = 1000 * 60 * 5

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)),
  ])
}

export async function searchBooksOrchestrated(query: string, options: SearchOrchestratorOptions = {}): Promise<SearchResponse> {
  const normalized = query.trim()
  if (!normalized) return { results: [] }

  const cacheKey = `book-search:${normalized}:${options.language || 'all'}`
  const cached = readCache<SearchResponse>(cacheKey)
  if (cached) return cached

  const variants = buildSearchVariants(normalized)
  const providerTimings: Record<string, number> = {}
  const providerErrors: Array<{ provider: any; message: string }> = []

  const providers = getBookProviders().sort((a, b) => b.order - a.order)
  const aggregated: SearchResponse['results'] = []

  for (const { provider } of providers) {
    if (!provider.enabled()) continue
    const start = Date.now()

    for (const variant of variants.slice(0, 4)) {
      try {
        const items = await withTimeout(provider.search(variant, options), options.timeoutMs || 4500)
        aggregated.push(...items)
      } catch (error) {
        providerErrors.push({ provider: provider.name, message: error instanceof Error ? error.message : 'unknown error' })
        break
      }
    }

    providerTimings[provider.name] = Date.now() - start
  }

  const { mergedResults, decisions } = mergeCandidates(aggregated)
  const ranked = rankResults(mergedResults, query).slice(0, options.maxResults || 20)

  const response: SearchResponse = {
    results: ranked.map(({ _score, _reasons, ...book }) => book),
    debug: options.debug
      ? {
          providerTimings,
          providerErrors,
          mergeDecisions: decisions,
          ranking: ranked.map((entry) => ({ id: entry.source_id, score: entry._score, reasons: entry._reasons })),
        }
      : undefined,
  }

  writeCache(cacheKey, response, CACHE_TTL_MS)
  return response
}
