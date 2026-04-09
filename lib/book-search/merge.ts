import { normalizeAuthorArray, normalizeDate, normalizeIsbn, normalizeLanguage, normalizePageCount, normalizePublisher, normalizeTitle, stripPunctuation } from './normalize'
import type {
  BookCandidate,
  CatalogEdition,
  CatalogWork,
  ClusterDebugLog,
  GroupedBookResult,
  GroupedWork,
  QueryPlan,
  SearchOrchestratorOptions,
} from './types'

const RETAILER_SET = new Set(['steimatzky', 'booknet', 'indiebook', 'simania'])

function first<T>(values?: T[]): T | undefined {
  return values?.find(Boolean)
}

function candidateCodes(c: BookCandidate): { isbn10?: string; isbn13?: string; editionId?: string; sourceIdentity?: string } {
  return {
    isbn10: first(c.isbn10?.map(normalizeIsbn).filter(Boolean) as string[]),
    isbn13: first(c.isbn13?.map(normalizeIsbn).filter(Boolean) as string[]),
    editionId: c.source === 'openlibrary' ? c.source_edition_id : c.source_edition_id || undefined,
    sourceIdentity: c.source_edition_id ? `${c.source}:${c.source_edition_id}` : undefined,
  }
}

function conflictPenalty(a: BookCandidate, b: BookCandidate): string[] {
  const conflicts: string[] = []
  const langA = normalizeLanguage(first(a.languages))
  const langB = normalizeLanguage(first(b.languages))
  if (langA !== 'unknown' && langB !== 'unknown' && langA !== langB) conflicts.push('language_conflict')

  const pubA = normalizePublisher(first(a.publishers))
  const pubB = normalizePublisher(first(b.publishers))
  if (pubA && pubB && pubA !== pubB) conflicts.push('publisher_conflict')

  const yearA = Number(normalizeDate(a.publish_date)?.slice(0, 4) || a.publish_year || 0)
  const yearB = Number(normalizeDate(b.publish_date)?.slice(0, 4) || b.publish_year || 0)
  if (yearA && yearB && Math.abs(yearA - yearB) >= 2) conflicts.push('year_conflict')

  const pagesA = normalizePageCount(a.page_count)
  const pagesB = normalizePageCount(b.page_count)
  if (pagesA && pagesB && Math.abs(pagesA - pagesB) >= 20) conflicts.push('page_count_conflict')

  return conflicts
}

function authorMatch(a: BookCandidate, b: BookCandidate): number {
  const aa = new Set(normalizeAuthorArray(a.authors || []))
  const bb = new Set(normalizeAuthorArray(b.authors || []))
  if (!aa.size || !bb.size) return 0
  const overlap = Array.from(aa).filter((item) => bb.has(item)).length
  return overlap / Math.max(aa.size, bb.size)
}

function titleMatch(a: BookCandidate, b: BookCandidate): boolean {
  const at = normalizeTitle(a.title)
  const bt = normalizeTitle(b.title)
  return at.normalized === bt.normalized || Boolean(at.withoutSubtitle && at.withoutSubtitle === bt.withoutSubtitle)
}

function classifyMerge(a: BookCandidate, b: BookCandidate): { allow: boolean; confidence: number; reasons: string[]; blocked: string[] } {
  const reasons: string[] = []
  const blocked = conflictPenalty(a, b)
  const aCodes = candidateCodes(a)
  const bCodes = candidateCodes(b)

  if (aCodes.isbn13 && bCodes.isbn13 && aCodes.isbn13 === bCodes.isbn13) {
    reasons.push('isbn13_exact')
    return { allow: blocked.length === 0, confidence: 1, reasons, blocked }
  }
  if (aCodes.isbn10 && bCodes.isbn10 && aCodes.isbn10 === bCodes.isbn10) {
    reasons.push('isbn10_exact')
    return { allow: blocked.length === 0, confidence: 0.98, reasons, blocked }
  }
  if (a.source === 'openlibrary' && b.source === 'openlibrary' && aCodes.editionId && aCodes.editionId === bCodes.editionId) {
    reasons.push('openlibrary_edition_exact')
    return { allow: blocked.length === 0, confidence: 0.96, reasons, blocked }
  }
  if (aCodes.sourceIdentity && bCodes.sourceIdentity && aCodes.sourceIdentity === bCodes.sourceIdentity) {
    reasons.push('source_identity_exact')
    return { allow: blocked.length === 0, confidence: 0.95, reasons, blocked }
  }

  const hasCodes = Boolean(aCodes.isbn10 || aCodes.isbn13 || bCodes.isbn10 || bCodes.isbn13 || aCodes.editionId || bCodes.editionId)
  if (hasCodes) {
    return { allow: false, confidence: 0, reasons: [], blocked: ['coded_identity_mismatch', ...blocked] }
  }

  const sameLang = normalizeLanguage(first(a.languages)) === normalizeLanguage(first(b.languages))
  const fuzzyTitle = titleMatch(a, b)
  const fuzzyAuthor = authorMatch(a, b)
  if (sameLang && fuzzyTitle && fuzzyAuthor >= 0.95 && blocked.length === 0) {
    reasons.push('fuzzy_title_author_strict')
    return { allow: true, confidence: 0.9, reasons, blocked }
  }

  return { allow: false, confidence: 0, reasons, blocked: [...blocked, 'fuzzy_not_high_enough'] }
}

function selectBestCover(candidates: BookCandidate[]): string | undefined {
  const urls = candidates.flatMap((item) => [item.cover_url, ...(item.cover_urls || [])]).filter(Boolean) as string[]
  if (!urls.length) return undefined
  return urls.sort((a, b) => {
    const score = (url: string) => {
      const m = url.match(/(?:[?&](?:w|width|h|height)=)(\d+)|\b([0-9]{3,4})\.(?:jpg|jpeg|png)/i)
      return Number(m?.[1] || m?.[2] || 0)
    }
    return score(b) - score(a)
  })[0]
}

function enrichPrimary(primary: BookCandidate, editions: BookCandidate[], language: 'he' | 'en' | 'unknown'): BookCandidate {
  const priority =
    language === 'he'
      ? ['steimatzky', 'booknet', 'indiebook', 'simania', 'google', 'openlibrary']
      : ['amazon', 'google', 'openlibrary', 'steimatzky', 'booknet', 'indiebook', 'simania']
  const priorityIndex = (source: string) => {
    const idx = priority.indexOf(source)
    return idx === -1 ? 999 : idx
  }
  const ordered = [...editions].sort((a, b) => priorityIndex(a.source) - priorityIndex(b.source))
  const pick = <T>(selector: (item: BookCandidate) => T | undefined, current?: T): T | undefined => {
    if (current !== undefined && current !== null && (!(Array.isArray(current)) || current.length > 0)) return current
    for (const candidate of ordered) {
      const value = selector(candidate)
      if (value !== undefined && value !== null && (!(Array.isArray(value)) || value.length > 0)) return value
    }
    return current
  }

  const bestCover = selectBestCover(ordered)
  return {
    ...primary,
    title: pick((c) => c.title, primary.title) || primary.title,
    authors: pick((c) => (c.authors?.length ? c.authors : undefined), primary.authors) || primary.authors,
    description: language === 'en' ? pick((c) => c.description, primary.description) : pick((c) => c.description, primary.description),
    subjects: pick((c) => (c.subjects?.length ? c.subjects : undefined), primary.subjects) || primary.subjects,
    isbn10: pick((c) => (c.isbn10?.length ? c.isbn10 : undefined), primary.isbn10) || primary.isbn10,
    isbn13: pick((c) => (c.isbn13?.length ? c.isbn13 : undefined), primary.isbn13) || primary.isbn13,
    languages: pick((c) => (c.languages?.length ? c.languages : undefined), primary.languages) || primary.languages,
    cover_url: bestCover || primary.cover_url,
    publishers: pick((c) => (c.publishers?.length ? c.publishers : undefined), primary.publishers) || primary.publishers,
    publish_date: pick((c) => c.publish_date, primary.publish_date) || primary.publish_date,
    page_count: pick((c) => c.page_count, primary.page_count) || primary.page_count,
  }
}

function choosePrimary(editions: BookCandidate[], query: QueryPlan): BookCandidate {
  return [...editions].sort((a, b) => {
    const score = (c: BookCandidate) =>
      c.overall_candidate_score +
      (c.cover_url ? 120 : 0) +
      ((c.languages || []).some((lang) => normalizeLanguage(lang) === query.language_guess) ? 60 : 0) +
      ((c.isbn10?.length || 0) + (c.isbn13?.length || 0) > 0 ? 40 : 0) +
      (c.description ? 20 : 0)
    return score(b) - score(a)
  })[0]
}

function editionUniqKey(candidate: BookCandidate): string {
  const id = candidate.source_edition_id || ''
  const isbn13 = first(candidate.isbn13) || ''
  const isbn10 = first(candidate.isbn10) || ''
  return [candidate.source, id, isbn13 || isbn10, normalizeLanguage(first(candidate.languages)), normalizeTitle(candidate.title).withoutSubtitle].join('::')
}

function toEditionRecord(candidate: BookCandidate, workId: string): CatalogEdition {
  return {
    edition_id: candidate.source_edition_id || `${candidate.source}:${candidate.title_key}:${candidate.author_key}`,
    work_id: workId,
    edition_title: candidate.title,
    publication_date: candidate.publish_date,
    publisher: candidate.publishers?.[0],
    isbn_10: candidate.isbn10?.[0],
    isbn_13: candidate.isbn13?.[0],
    format: candidate.format,
    page_count: candidate.page_count,
    language: candidate.languages?.[0],
    source_ids: { [candidate.source]: candidate.source_edition_id || candidate.source_work_id || candidate.title_key },
    source_confidence: candidate.source_confidence,
    raw_payloads: [{ source: candidate.source, payload: candidate.raw }],
  }
}

function toWork(primary: BookCandidate, editions: BookCandidate[], canonicalKey: string, confidence: number): CatalogWork {
  return {
    canonical_work_id: canonicalKey,
    normalized_title: primary.title_key,
    normalized_authors: primary.raw_authors_normalized,
    display_title: primary.title,
    display_authors: primary.authors,
    language: primary.languages?.[0],
    subjects: Array.from(new Set(editions.flatMap((item) => item.subjects || []))).slice(0, 30),
    description: [(primary.description || ''), ...editions.map((item) => item.description || '')].sort((a, b) => b.length - a.length)[0] || undefined,
    cover: selectBestCover(editions),
    source_confidence: confidence,
    source_badges: Array.from(new Set(editions.map((item) => item.source))),
  }
}

export function mergeCandidates(
  candidates: BookCandidate[],
  query: QueryPlan,
  _options: SearchOrchestratorOptions = {}
): { groupedResults: GroupedBookResult[]; clusterLogs: ClusterDebugLog[] } {
  const clusters: BookCandidate[][] = []
  const clusterLogs: ClusterDebugLog[] = []

  for (const candidate of [...candidates].sort((a, b) => b.overall_candidate_score - a.overall_candidate_score)) {
    let bestIdx = -1
    let bestConfidence = 0
    let bestReasons: string[] = []
    let bestBlocked: string[] = []

    for (let i = 0; i < clusters.length; i += 1) {
      const representative = clusters[i][0]
      const check = classifyMerge(candidate, representative)
      if (check.allow && check.confidence > bestConfidence) {
        bestIdx = i
        bestConfidence = check.confidence
        bestReasons = check.reasons
      } else if (!check.allow && check.blocked.length > 0 && i === 0) {
        bestBlocked = check.blocked
      }
    }

    if (bestIdx >= 0) {
      clusters[bestIdx].push(candidate)
      clusterLogs.push({
        canonical_work_key: clusters[bestIdx][0].work_key_candidate,
        merged_candidate_ids: [`${candidate.source}:${candidate.source_edition_id || candidate.title_key}`],
        merge_confidence: bestConfidence,
        merge_reasons: bestReasons,
        representative_candidate_id: `${clusters[bestIdx][0].source}:${clusters[bestIdx][0].source_edition_id || clusters[bestIdx][0].title_key}`,
        excluded_candidate_ids: [],
      })
    } else {
      if (bestBlocked.length) {
        clusterLogs.push({
          canonical_work_key: candidate.work_key_candidate,
          merged_candidate_ids: [],
          merge_confidence: 0,
          merge_reasons: ['merge_rejected'],
          representative_candidate_id: `${candidate.source}:${candidate.source_edition_id || candidate.title_key}`,
          excluded_candidate_ids: bestBlocked,
        })
      }
      clusters.push([candidate])
    }
  }

  const groupedResults: GroupedBookResult[] = clusters.map((cluster, idx) => {
    const selectedPrimary = choosePrimary(cluster, query)
    const primary = enrichPrimary(selectedPrimary, cluster, query.language_guess)
    const lang = normalizeLanguage(first(primary.languages))
    const canonical = first(primary.isbn13) || first(primary.isbn10) || primary.source_edition_id || `${primary.title_key}::${primary.author_key}::${lang}`
    const canonical_work_key = `edition:${canonical}`

    const byEdition = new Map<string, BookCandidate>()
    for (const item of cluster) {
      const key = editionUniqKey(item)
      if (!byEdition.has(key)) byEdition.set(key, item)
    }

    const editions = Array.from(byEdition.values())
    const confidenceScore = Math.max(0.25, Math.min(1, primary.overall_candidate_score / 1300))
    const work = toWork(primary, editions, canonical_work_key, confidenceScore)

    const groupedWork: GroupedWork = {
      canonical_work_key,
      best_title: work.display_title,
      best_subtitle: primary.subtitle,
      best_authors: work.display_authors,
      best_description: work.description,
      best_cover_url: work.cover,
      all_cover_urls: Array.from(new Set(cluster.flatMap((item) => [item.cover_url, ...(item.cover_urls || [])].filter(Boolean) as string[]))),
      languages: Array.from(new Set(cluster.flatMap((item) => item.languages || []))),
      subjects: work.subjects,
      tags: Array.from(new Set(cluster.flatMap((item) => [...(item.tags || []), ...(item.subjects || [])]))).filter(Boolean),
      representative_publish_year: primary.publish_year,
      source_summary: work.source_badges,
      editions,
      retailers: cluster.filter((item) => RETAILER_SET.has(item.source)).map((item) => ({ source: item.source, title: item.title, author: item.authors[0], url: item.source_url })),
      confidence_score: confidenceScore,
      warnings: confidenceScore < 0.55 ? ['low_confidence_merge'] : [],
    }

    return {
      group_id: `group:${canonical_work_key}:${idx}`,
      work,
      grouped_work: groupedWork,
      primary,
      editions,
      edition_records: editions.map((item) => toEditionRecord(item, canonical_work_key)),
      total_editions: editions.length,
      group_score: 0,
    }
  })

  return { groupedResults, clusterLogs }
}

export function computeGroupScore(group: GroupedBookResult, query: QueryPlan): number {
  const coverBonus = group.grouped_work.best_cover_url ? 110 : 0
  const isbnBonus = group.primary.isbn13?.length || group.primary.isbn10?.length ? 80 : 0
  const authorBonus = group.primary.authors?.length ? 60 : 0
  const summaryBonus = group.primary.description ? 30 : 0
  const publisherBonus = group.primary.publishers?.length ? 18 : 0
  const dateBonus = group.primary.publish_date ? 16 : 0
  const pageBonus = group.primary.page_count ? 16 : 0
  const languageBonus = (group.grouped_work.languages || []).some((lang) => normalizeLanguage(lang) === query.language_guess) ? 45 : -40
  const sourceConfidence = group.primary.source_confidence * 90
  const conflictPenalty = group.grouped_work.warnings.includes('low_confidence_merge') ? 40 : 0

  return group.primary.overall_candidate_score + coverBonus + isbnBonus + authorBonus + summaryBonus + publisherBonus + dateBonus + pageBonus + languageBonus + sourceConfidence - conflictPenalty
}

export function shouldCrossLanguageCluster(a: BookCandidate, b: BookCandidate): boolean {
  return Boolean(first(a.isbn13) && first(b.isbn13) && normalizeIsbn(first(a.isbn13)) === normalizeIsbn(first(b.isbn13))) &&
    authorMatch(a, b) >= 0.5 &&
    stripPunctuation(a.title) !== stripPunctuation(b.title)
}
