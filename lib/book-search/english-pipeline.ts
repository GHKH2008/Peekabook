import { buildSearchVariants, normalizeIsbn, normalizeLanguage, normalizePublisher, normalizeQuery, normalizeTitle, stripPunctuation } from './normalize'
import { scoreCandidate } from './ranker'
import type { BookCandidate, BookProviderName, GroupedBookResult, ProviderSearchOptions, QueryPlan, SearchOrchestratorOptions } from './types'
import type { BookSearchProvider } from './providers/interface'

const AMAZON_SEARCH_LIMIT = 20
const MAX_AMAZON_CANDIDATES = 12
const MAX_VARIANTS = 4
const MAX_PER_PROVIDER_QUERY = 12

export type EnglishPipelineDebug = {
  providerTimings: Record<string, number>
  providerErrors: Array<{ provider: BookProviderName; message: string }>
  pipelineSteps: string[]
}

type EnglishBookCandidate = {
  seed: BookCandidate
  enriched: BookCandidate
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)),
  ])
}

function hasValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function cleanAuthor(name: string): string {
  return name
    .replace(/\((illustrator|editor|translator|foreword|introduction|contributor|artist)\)/gi, '')
    .replace(/\b(illustrator|editor|translator|foreword|introduction|contributor|artist)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeAuthors(authors: string[] = []): string[] {
  return Array.from(new Set(authors.map(cleanAuthor).filter((name) => name.length > 1)))
}

function normalizeCandidate(candidate: BookCandidate): BookCandidate {
  return {
    ...candidate,
    authors: sanitizeAuthors(candidate.authors || []),
    languages: (candidate.languages || []).filter(Boolean),
    isbn10: (candidate.isbn10 || []).map((value) => normalizeIsbn(value)).filter((value): value is string => Boolean(value)),
    isbn13: (candidate.isbn13 || []).map((value) => normalizeIsbn(value)).filter((value): value is string => Boolean(value)),
  }
}

function hardIdentityKey(candidate: BookCandidate): string {
  const isbn13 = normalizeIsbn(candidate.isbn13?.[0])
  if (isbn13) return `isbn13:${isbn13}`
  const isbn10 = normalizeIsbn(candidate.isbn10?.[0])
  if (isbn10) return `isbn10:${isbn10}`
  if (candidate.source_edition_id) return `${candidate.source}:${candidate.source_edition_id}`
  if (candidate.source_work_id) return `${candidate.source}:${candidate.source_work_id}`
  return `${candidate.source}:${candidate.title_key}:${candidate.author_key}`
}

function titleStrongMatch(a: BookCandidate, b: BookCandidate): boolean {
  const an = normalizeTitle(a.title)
  const bn = normalizeTitle(b.title)
  return an.withoutSubtitle === bn.withoutSubtitle || an.normalized === bn.normalized
}

function authorOverlap(a: BookCandidate, b: BookCandidate): boolean {
  const aa = sanitizeAuthors(a.authors || []).map((name) => stripPunctuation(name))
  const bb = sanitizeAuthors(b.authors || []).map((name) => stripPunctuation(name))
  if (!aa.length || !bb.length) return true
  return aa.some((name) => bb.includes(name))
}

function isEnglishCandidate(candidate: BookCandidate): boolean {
  const language = normalizeLanguage(candidate.languages?.[0])
  if (language === 'he') return false
  return true
}

function chooseBestMatch(seed: BookCandidate, pool: BookCandidate[]): BookCandidate | null {
  const byIsbn = pool.find((item) => {
    const isbns = new Set([...(seed.isbn10 || []), ...(seed.isbn13 || [])].map((value) => normalizeIsbn(value)).filter(Boolean))
    return [...(item.isbn10 || []), ...(item.isbn13 || [])].some((value) => isbns.has(normalizeIsbn(value) || ''))
  })
  if (byIsbn) return byIsbn

  const compatible = pool.filter((item) => titleStrongMatch(seed, item) && authorOverlap(seed, item) && isEnglishCandidate(item))
  if (!compatible.length) return null

  return compatible.sort((a, b) => b.overall_candidate_score - a.overall_candidate_score)[0]
}

function mergeMissingFields(base: BookCandidate, incoming: BookCandidate): BookCandidate {
  const merged: BookCandidate = { ...base }

  const copy = <K extends keyof BookCandidate>(key: K) => {
    if (!hasValue(merged[key]) && hasValue(incoming[key])) {
      ;(merged[key] as BookCandidate[K]) = incoming[key] as BookCandidate[K]
    }
  }

  copy('title')
  copy('subtitle')
  copy('series')
  copy('description')
  copy('subjects')
  copy('publishers')
  copy('publish_date')
  copy('page_count')
  copy('cover_url')
  copy('format')
  copy('edition_label')
  copy('series_name')

  if (!(merged.authors || []).length && (incoming.authors || []).length) merged.authors = sanitizeAuthors(incoming.authors || [])
  if (!(merged.languages || []).length && (incoming.languages || []).length) merged.languages = incoming.languages
  if (!(merged.isbn10 || []).length && (incoming.isbn10 || []).length) merged.isbn10 = incoming.isbn10
  if (!(merged.isbn13 || []).length && (incoming.isbn13 || []).length) merged.isbn13 = incoming.isbn13
  merged.cover_urls = Array.from(new Set([...(merged.cover_urls || []), ...(incoming.cover_urls || []), incoming.cover_url].filter(Boolean) as string[]))
  merged.source_attribution = Array.from(new Set([...(merged.source_attribution || []), ...(incoming.source_attribution || [])]))
  merged.tags = Array.from(new Set([...(merged.tags || []), ...(incoming.tags || [])]))

  return merged
}

function importantFieldScore(candidate: BookCandidate): number {
  const checks = [
    hasValue(candidate.title),
    hasValue(candidate.authors),
    hasValue(candidate.description),
    hasValue(candidate.subjects),
    hasValue(candidate.isbn13) || hasValue(candidate.isbn10),
    hasValue(candidate.languages),
    hasValue(candidate.cover_url),
    hasValue(candidate.publishers),
    hasValue(candidate.publish_date),
    hasValue(candidate.page_count),
  ]
  return checks.filter(Boolean).length
}

function sufficientlyComplete(candidate: BookCandidate): boolean {
  return importantFieldScore(candidate) >= 8
}

function isSpecialEdition(candidate: BookCandidate): boolean {
  const signal = [candidate.title, candidate.subtitle, candidate.edition_label, candidate.format, ...(candidate.tags || [])].join(' ').toLowerCase()
  return /special|collector|anniversary|deluxe|limited|signed|illustrated|gift/.test(signal)
}

function sameNormalEdition(a: BookCandidate, b: BookCandidate): boolean {
  if (isSpecialEdition(a) || isSpecialEdition(b)) return false
  if (!titleStrongMatch(a, b)) return false
  if (!authorOverlap(a, b)) return false
  const pa = normalizePublisher(a.publishers?.[0])
  const pb = normalizePublisher(b.publishers?.[0])
  if (pa && pb && pa !== pb) return false

  const ya = Number(a.publish_date?.match(/\d{4}/)?.[0]) || a.publish_year
  const yb = Number(b.publish_date?.match(/\d{4}/)?.[0]) || b.publish_year
  if (ya && yb && Math.abs(ya - yb) > 1) return false

  return true
}

function choosePrimary(candidates: BookCandidate[]): BookCandidate {
  return [...candidates].sort((a, b) => {
    const score = (item: BookCandidate) =>
      item.overall_candidate_score +
      (item.source === 'amazon' ? 150 : 0) +
      (item.cover_url ? 20 : 0) +
      (item.description ? 15 : 0) +
      (item.isbn13?.length ? 20 : 0)

    return score(b) - score(a)
  })[0]
}

function buildGroupedResult(candidates: BookCandidate[], queryPlan: QueryPlan, idx: number): GroupedBookResult {
  const primary = choosePrimary(candidates)
  const badges = Array.from(new Set(candidates.map((item) => item.source)))
  const title = primary.title
  const authors = primary.authors
  const language = primary.languages?.[0] || queryPlan.language_guess || 'en'
  const groupId = `en:${hardIdentityKey(primary)}:${idx}`

  return {
    group_id: groupId,
    group_score: primary.overall_candidate_score,
    total_editions: candidates.length,
    primary,
    editions: candidates,
    grouped_work: {
      canonical_work_key: `${normalizeTitle(title).withoutSubtitle}::${(authors[0] || '').toLowerCase()}`,
      best_title: title,
      best_subtitle: primary.subtitle,
      best_authors: authors,
      best_description: primary.description,
      best_cover_url: primary.cover_url,
      all_cover_urls: Array.from(new Set(candidates.flatMap((item) => [item.cover_url, ...(item.cover_urls || [])].filter(Boolean) as string[]))),
      languages: Array.from(new Set(candidates.flatMap((item) => item.languages || []))),
      subjects: Array.from(new Set(candidates.flatMap((item) => item.subjects || []))).slice(0, 20),
      tags: Array.from(new Set(candidates.flatMap((item) => item.tags || []))),
      representative_publish_year: Number(primary.publish_date?.match(/\d{4}/)?.[0]) || primary.publish_year,
      source_summary: badges,
      editions: candidates,
      retailers: [],
      confidence_score: primary.source_confidence,
      warnings: [],
    },
    work: {
      canonical_work_id: `${normalizeTitle(title).withoutSubtitle}:${authors.join('|')}`,
      normalized_title: normalizeTitle(title).normalized,
      normalized_authors: authors.map((name) => stripPunctuation(name)),
      display_title: title,
      display_authors: authors,
      language,
      series: primary.series || primary.series_name,
      subjects: Array.from(new Set(candidates.flatMap((item) => item.subjects || []))).slice(0, 20),
      description: primary.description,
      cover: primary.cover_url,
      source_confidence: primary.source_confidence,
      source_badges: badges,
    },
    edition_records: candidates.map((item) => ({
      edition_id: `${item.source}:${item.source_edition_id || item.source_work_id || item.title_key}`,
      work_id: `${normalizeTitle(title).withoutSubtitle}:${authors.join('|')}`,
      edition_title: item.title,
      publication_date: item.publish_date,
      publisher: item.publishers?.[0],
      isbn_10: item.isbn10?.[0],
      isbn_13: item.isbn13?.[0],
      format: item.format,
      page_count: item.page_count,
      language: item.languages?.[0],
      source_ids: { [item.source]: item.source_edition_id || item.source_work_id || item.title_key },
      source_confidence: item.source_confidence,
      raw_payloads: [{ source: item.source, payload: item.raw }],
    })),
  }
}

async function runProviderSearch(
  provider: BookSearchProvider,
  query: string,
  language: string,
  limit: number,
  options: ProviderSearchOptions,
  debug: EnglishPipelineDebug
): Promise<BookCandidate[]> {
  const start = Date.now()
  try {
    const batch = await withTimeout(provider.search(query, language, limit, options), options.timeoutMs || 5000)
    return batch.map(normalizeCandidate)
  } catch (error) {
    debug.providerErrors.push({ provider: provider.name, message: error instanceof Error ? error.message : 'unknown error' })
    return []
  } finally {
    debug.providerTimings[provider.name] = (debug.providerTimings[provider.name] || 0) + (Date.now() - start)
  }
}

async function enrichCandidate(
  candidate: BookCandidate,
  queryPlan: QueryPlan,
  providers: { google?: BookSearchProvider; openlibrary?: BookSearchProvider; extras: BookSearchProvider[] },
  options: SearchOrchestratorOptions,
  debug: EnglishPipelineDebug
): Promise<BookCandidate> {
  let current = candidate

  const enrichmentQueries = Array.from(
    new Set([
      normalizeIsbn(candidate.isbn13?.[0]),
      normalizeIsbn(candidate.isbn10?.[0]),
      `${candidate.title} ${(candidate.authors || [])[0] || ''}`.trim(),
      queryPlan.phrase_query,
    ].filter((item): item is string => Boolean(item && item.trim())))
  )

  const fillFromProvider = async (provider?: BookSearchProvider) => {
    if (!provider || sufficientlyComplete(current)) return
    for (const query of enrichmentQueries.slice(0, 3)) {
      const result = await runProviderSearch(provider, query, 'en', MAX_PER_PROVIDER_QUERY, options, debug)
      const scored = result.map((item) => scoreCandidate(item, queryPlan, 'en')).filter(isEnglishCandidate)
      const best = chooseBestMatch(current, scored)
      if (!best) continue
      current = mergeMissingFields(current, best)
      debug.pipelineSteps.push(`enrich:${provider.name}:filled:${hardIdentityKey(candidate)}`)
      if (sufficientlyComplete(current)) break
    }
  }

  await fillFromProvider(providers.google)
  await fillFromProvider(providers.openlibrary)

  if (!sufficientlyComplete(current)) {
    for (const extra of providers.extras) {
      await fillFromProvider(extra)
      if (sufficientlyComplete(current)) break
    }
  }

  return current
}

function hardDedupe(candidates: BookCandidate[]): BookCandidate[] {
  const map = new Map<string, BookCandidate>()
  for (const candidate of candidates) {
    const key = hardIdentityKey(candidate)
    const existing = map.get(key)
    if (!existing || candidate.overall_candidate_score > existing.overall_candidate_score) {
      map.set(key, candidate)
    }
  }
  return [...map.values()]
}

function collapseNormalEditions(candidates: BookCandidate[]): BookCandidate[][] {
  const groups: BookCandidate[][] = []

  for (const candidate of candidates) {
    const found = groups.find((group) => sameNormalEdition(group[0], candidate))
    if (!found) {
      groups.push([candidate])
      continue
    }
    found.push(candidate)
  }

  return groups
}

export async function searchEnglishBooksSequential(
  query: string,
  options: SearchOrchestratorOptions,
  providers: Map<string, BookSearchProvider>
): Promise<{ results: GroupedBookResult[]; debug: EnglishPipelineDebug }> {
  const queryPlan = normalizeQuery(query)
  const debug: EnglishPipelineDebug = { providerTimings: {}, providerErrors: [], pipelineSteps: [] }
  const amazon = providers.get('amazon')
  const google = providers.get('google')
  const openlibrary = providers.get('openlibrary')
  const extras = ['steimatzky', 'booknet', 'indiebook', 'simania'].map((name) => providers.get(name)).filter((provider): provider is BookSearchProvider => Boolean(provider))

  if (!amazon) {
    return { results: [], debug }
  }

  const strategies = buildSearchVariants(query).slice(0, MAX_VARIANTS)
  const amazonRaw: BookCandidate[] = []

  for (const strategy of strategies) {
    if (amazonRaw.length >= MAX_AMAZON_CANDIDATES) break
    const batch = await runProviderSearch(amazon, strategy, 'en', AMAZON_SEARCH_LIMIT, options, debug)
    const scored = batch.map((item) => scoreCandidate(item, queryPlan, 'en')).filter((item) => isEnglishCandidate(item) && item.title_match_score >= 0.35)
    amazonRaw.push(...scored)
    debug.pipelineSteps.push(`amazon:search:${strategy}:count=${batch.length}`)
  }

  const amazonCandidates = hardDedupe(amazonRaw).sort((a, b) => b.overall_candidate_score - a.overall_candidate_score).slice(0, MAX_AMAZON_CANDIDATES)
  const seeds: EnglishBookCandidate[] = amazonCandidates.map((seed) => ({ seed, enriched: seed }))

  const enriched = await Promise.all(
    seeds.map(async (item) => {
      const enrichedCandidate = await enrichCandidate(item.seed, queryPlan, { google, openlibrary, extras }, options, debug)
      return scoreCandidate(normalizeCandidate(enrichedCandidate), queryPlan, 'en')
    })
  )

  const unique = hardDedupe(enriched)
  const collapsed = collapseNormalEditions(unique)
  const grouped = collapsed.map((group) => group.map((item) => scoreCandidate(item, queryPlan, 'en')))
  const results = grouped
    .map((group, idx) => buildGroupedResult(group, queryPlan, idx))
    .sort((a, b) => b.group_score - a.group_score)
    .slice(0, Math.min(options.maxResults || 100, 100))

  debug.pipelineSteps.push(`english:seed_count=${amazonCandidates.length}`)
  debug.pipelineSteps.push(`english:result_count=${results.length}`)

  return { results, debug }
}
