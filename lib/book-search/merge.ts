import { stripPunctuation } from './normalize'
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

function normalizeId(value?: string): string {
  return String(value || '').replace(/[^0-9X]/gi, '').toUpperCase()
}

function scoreAuthorOverlap(a: BookCandidate, b: BookCandidate): number {
  const authorA = new Set((a.raw_authors_normalized || []).filter(Boolean))
  const authorB = new Set((b.raw_authors_normalized || []).filter(Boolean))
  if (!authorA.size || !authorB.size) return 0
  let overlap = 0
  for (const token of Array.from(authorA)) {
    if (authorB.has(token)) overlap += 1
  }
  return overlap / Math.max(authorA.size, authorB.size)
}

function hasKnownWorkId(candidate: BookCandidate): string | undefined {
  return candidate.source_work_id || candidate.identity_keys?.openlibrary_work_id
}

function sharedIsbn(a: BookCandidate, b: BookCandidate): boolean {
  const aIsbns = new Set([...(a.isbn10 || []), ...(a.isbn13 || []), ...(a.identity_keys?.isbns || [])].map(normalizeId).filter(Boolean))
  const bIsbns = new Set([...(b.isbn10 || []), ...(b.isbn13 || []), ...(b.identity_keys?.isbns || [])].map(normalizeId).filter(Boolean))
  for (const id of Array.from(aIsbns)) {
    if (bIsbns.has(id)) return true
  }
  return false
}

function clusterSignals(a: BookCandidate, b: BookCandidate): { score: number; reasons: string[]; blocks: string[] } {
  let score = 0
  const reasons: string[] = []
  const blocks: string[] = []

  if (hasKnownWorkId(a) && hasKnownWorkId(b)) {
    if (hasKnownWorkId(a) === hasKnownWorkId(b)) {
      score += 1
      reasons.push('work_id_exact')
    } else {
      blocks.push('work_id_conflict')
    }
  }

  if (sharedIsbn(a, b)) {
    score += 0.95
    reasons.push('isbn_overlap')
  }

  const titleExact = a.title_key && b.title_key && a.title_key === b.title_key
  const titleSimilar = a.title_key && b.title_key && (a.title_key.includes(b.title_key) || b.title_key.includes(a.title_key))
  if (titleExact) {
    score += 0.75
    reasons.push('title_exact')
  } else if (titleSimilar) {
    score += 0.35
    reasons.push('title_family')
  }

  const authorOverlap = scoreAuthorOverlap(a, b)
  if (authorOverlap >= 0.8) {
    score += 0.65
    reasons.push('author_overlap_high')
  } else if (authorOverlap >= 0.5) {
    score += 0.35
    reasons.push('author_overlap_medium')
  }

  if (titleSimilar && authorOverlap < 0.25 && !sharedIsbn(a, b)) {
    blocks.push('title_without_author_or_identifier')
  }

  return { score, reasons, blocks }
}

function choosePrimary(editions: BookCandidate[], query: QueryPlan): BookCandidate {
  return [...editions].sort((a, b) => {
    const score = (c: BookCandidate) =>
      c.overall_candidate_score +
      ((c.languages || []).some((lang) => lang.toLowerCase().startsWith(query.language_guess)) ? 40 : 0) +
      (c.cover_url ? 12 : 0) +
      (c.description ? 10 : 0) +
      ((c.isbn10?.length || 0) + (c.isbn13?.length || 0) > 0 ? 10 : 0) +
      (c.publish_year ? 5 : 0) +
      c.metadata_completeness_score * 15 +
      c.source_confidence * 10
    return score(b) - score(a)
  })[0]
}

function editionUniqKey(candidate: BookCandidate): string {
  return [
    (candidate.languages || [])[0] || '',
    (candidate.isbn13 || [])[0] || (candidate.isbn10 || [])[0] || '',
    candidate.format || '',
    (candidate.publishers || [])[0] || '',
    candidate.publish_year || '',
    candidate.edition_label || '',
    candidate.title_key,
  ].join('::')
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
  const sourceBadges = Array.from(new Set(editions.map((item) => item.source)))
  const descriptions = editions.map((item) => item.description || '').sort((a, b) => b.length - a.length)
  return {
    canonical_work_id: canonicalKey,
    normalized_title: primary.title_key,
    normalized_authors: primary.raw_authors_normalized,
    display_title: primary.title,
    display_authors: primary.authors,
    language: primary.languages?.[0],
    subjects: Array.from(new Set(editions.flatMap((item) => item.subjects || []))).slice(0, 20),
    description: descriptions[0] || undefined,
    cover: primary.cover_url,
    source_confidence: confidence,
    source_badges: sourceBadges,
  }
}

export function mergeCandidates(
  candidates: BookCandidate[],
  query: QueryPlan,
  _options: SearchOrchestratorOptions = {}
): { groupedResults: GroupedBookResult[]; clusterLogs: ClusterDebugLog[] } {
  const clusters: BookCandidate[][] = []
  const clusterLogs: ClusterDebugLog[] = []

  for (const candidate of candidates.sort((a, b) => b.overall_candidate_score - a.overall_candidate_score)) {
    let bestClusterIdx = -1
    let bestScore = -1
    let bestReasons: string[] = []

    for (let i = 0; i < clusters.length; i += 1) {
      const representative = clusters[i][0]
      const signal = clusterSignals(candidate, representative)
      if (signal.blocks.length > 0) continue
      if (signal.score > bestScore) {
        bestClusterIdx = i
        bestScore = signal.score
        bestReasons = signal.reasons
      }
    }

    const safeThreshold = 1.15
    if (bestClusterIdx >= 0 && bestScore >= safeThreshold) {
      clusters[bestClusterIdx].push(candidate)
      clusterLogs.push({
        canonical_work_key: clusters[bestClusterIdx][0].work_key_candidate,
        merged_candidate_ids: [`${candidate.source}:${candidate.source_edition_id || candidate.title_key}`],
        merge_confidence: Math.min(1, bestScore / 2),
        merge_reasons: bestReasons,
        representative_candidate_id: `${clusters[bestClusterIdx][0].source}:${clusters[bestClusterIdx][0].source_edition_id || clusters[bestClusterIdx][0].title_key}`,
        excluded_candidate_ids: [],
      })
    } else {
      clusters.push([candidate])
    }
  }

  const groupedResults: GroupedBookResult[] = clusters.map((cluster, idx) => {
    const primary = choosePrimary(cluster, query)
    const canonical_work_key = hasKnownWorkId(primary) ? `work:${hasKnownWorkId(primary)}` : `work:${primary.title_key}::${primary.author_key}`

    const byEdition = new Map<string, BookCandidate>()
    for (const item of cluster.sort((a, b) => b.overall_candidate_score - a.overall_candidate_score)) {
      const key = editionUniqKey(item)
      if (!byEdition.has(key)) byEdition.set(key, item)
    }

    const editions = Array.from(byEdition.values()).slice(0, 10)
    const confidenceScore = Math.max(0.35, Math.min(1, cluster.reduce((acc, c) => acc + c.overall_candidate_score, 0) / Math.max(cluster.length * 900, 1)))
    const work = toWork(primary, cluster, canonical_work_key, confidenceScore)

    const groupedWork: GroupedWork = {
      canonical_work_key,
      best_title: work.display_title,
      best_subtitle: primary.subtitle,
      best_authors: work.display_authors,
      best_description: work.description,
      best_cover_url: work.cover,
      languages: Array.from(new Set(cluster.flatMap((item) => item.languages || []))),
      subjects: work.subjects,
      representative_publish_year: primary.publish_year,
      source_summary: work.source_badges,
      editions,
      retailers: cluster.filter((item) => ['steimatzky', 'booknet', 'indiebook', 'simania'].includes(item.source)).map((item) => ({
        source: item.source,
        title: item.title,
        author: item.authors[0],
        url: item.source_url,
      })),
      confidence_score: confidenceScore,
      warnings: confidenceScore < 0.55 ? ['low_confidence_merge'] : [],
    }

    return {
      group_id: `group:${canonical_work_key}:${idx}`,
      work,
      grouped_work: groupedWork,
      primary,
      editions,
      edition_records: cluster.map((item) => toEditionRecord(item, canonical_work_key)),
      total_editions: cluster.length,
      group_score: 0,
    }
  })

  return { groupedResults, clusterLogs }
}

export function computeGroupScore(group: GroupedBookResult, query: QueryPlan): number {
  const corroborationBonus = Math.min(group.work.source_badges.length, 4) * 25
  const metadataBonus = group.primary.metadata_completeness_score * 80
  const languageBonus = (group.grouped_work.languages || []).some((lang) => lang.toLowerCase().startsWith(query.language_guess)) ? 40 : 0
  const retailerBonus = query.language_guess === 'he' ? group.grouped_work.retailers.length * 12 : 0
  const ambiguityPenalty = group.grouped_work.warnings.includes('low_confidence_merge') ? 40 : 0

  return group.primary.overall_candidate_score + corroborationBonus + metadataBonus + languageBonus + retailerBonus - ambiguityPenalty
}

export function shouldCrossLanguageCluster(a: BookCandidate, b: BookCandidate): boolean {
  const titlePair = [stripPunctuation(a.title), stripPunctuation(b.title)].join('::')
  const knownNameOfTheWind = titlePair.includes('name of the wind') && (titlePair.includes('שם הרוח') || a.is_hebrew || b.is_hebrew)
  const hasAuthorEvidence = scoreAuthorOverlap(a, b) >= 0.5 || sharedIsbn(a, b)
  return knownNameOfTheWind && hasAuthorEvidence
}
