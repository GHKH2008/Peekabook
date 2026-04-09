import { readCache, writeCache } from './cache'
import { buildSearchVariants } from './normalize'
import { getBookProviders } from './providers'
import { mergeCandidates } from './merge'
import { rankResults } from './ranker'
import type { NormalizedBookResult, SearchOrchestratorOptions, SearchResponse } from './types'

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
  const aggregated: NormalizedBookResult[] = []

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

  const { groupedResults, decisions, logs } = mergeCandidates(aggregated, options)
  const rankedPrimary = rankResults(
    groupedResults.map((group) => group.primary),
    query
  )

  const rankingMap = new Map(rankedPrimary.map((entry, index) => [`${entry.source}:${entry.source_id}`, { ...entry, index }]))
  const rankedGroups = groupedResults
    .map((group) => {
      const key = `${group.primary.source}:${group.primary.source_id}`
      const rankMeta = rankingMap.get(key)
      const baseScore = rankMeta?._score || 0
      const groupBonus = Math.min(group.total_editions - 1, 5) * 8
      const sourceBonus = Math.min(new Set((group.primary.source_attribution || []).map((item) => item.source)).size, 3) * 4
      return {
        ...group,
        _score: baseScore + groupBonus + sourceBonus,
        _reasons: [...(rankMeta?._reasons || []), 'groupedEditionsBoost'],
      }
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, options.maxResults || 8)

  const response: SearchResponse = {
    results: rankedGroups.map(({ _score, _reasons, ...group }) => group),
    debug: options.debug
      ? {
          providerTimings,
          providerErrors,
          mergeDecisions: decisions,
          mergeLogs: logs,
          ranking: rankedGroups.map((entry) => ({ id: entry.group_id, score: entry._score, reasons: entry._reasons })),
        }
      : undefined,
  }

  writeCache(cacheKey, response, CACHE_TTL_MS)
  return response
}
