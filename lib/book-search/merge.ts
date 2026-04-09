import { stripPunctuation } from './normalize'
import type {
  BookIdentityKeys,
  CatalogEdition,
  CatalogWork,
  GroupedBookResult,
  NormalizedBookResult,
  SearchOrchestratorOptions,
} from './types'

type MergeDecision = { kept: string; merged: string; confidence: number; reasons: string[] }
type MergeLog = {
  workKey: string
  candidateId: string
  matched: boolean
  score: number
  reasons: string[]
  blockedBy?: string[]
}

function normalizeId(value?: string): string {
  return String(value || '').replace(/[^0-9X]/gi, '').toUpperCase()
}

function normalizeText(value?: string): string {
  return stripPunctuation(String(value || '').toLowerCase())
}

function parseOpenLibraryIds(result: NormalizedBookResult): { workId?: string; editionId?: string } {
  const sourceId = String(result.source_id || '')
  const raw = (result.raw_source_data || {}) as any

  const workFromKey = sourceId.match(/\/works\/(OL\d+W)/i)?.[1]
  const editionFromKey = sourceId.match(/\/books\/(OL\d+M)/i)?.[1]
  const workFromRaw = raw?.key?.match?.(/\/works\/(OL\d+W)/i)?.[1]
  const editionFromRaw = raw?.key?.match?.(/\/books\/(OL\d+M)/i)?.[1]
  const workFromWorksArray = raw?.works?.[0]?.key?.match?.(/\/works\/(OL\d+W)/i)?.[1]

  return {
    workId: workFromKey || workFromRaw || workFromWorksArray,
    editionId: editionFromKey || editionFromRaw || raw?.cover_edition_key,
  }
}

function extractIdentity(result: NormalizedBookResult): BookIdentityKeys {
  const isbns = [normalizeId(result.isbn_10), normalizeId(result.isbn_13)].filter(Boolean)
  const raw = (result.raw_source_data || {}) as any
  const openLibrary = result.source === 'openlibrary' ? parseOpenLibraryIds(result) : { workId: undefined, editionId: undefined }

  return {
    openlibrary_work_id: openLibrary.workId,
    openlibrary_edition_id: openLibrary.editionId,
    google_volume_id: result.source === 'google' ? result.source_id : undefined,
    internal_book_code: String(raw?.book_code || raw?.code || '').trim() || undefined,
    isbns,
  }
}

function chooseCleanerTitle(values: string[]): string {
  const scored = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => {
      const editionNoise = /\b(edition|ed\.?|trade paperback|paperback|hardcover|mass market|volume|vol\.?|book\s+\d+)\b/i.test(value)
      const parenNoise = /\([^)]*(edition|paperback|hardcover|trade|mass market|\d+x\d+)\)/i.test(value)
      return {
        value,
        score: (editionNoise ? -2 : 0) + (parenNoise ? -1 : 0) + Math.min(value.length, 90) / 90,
      }
    })
    .sort((a, b) => b.score - a.score)

  return scored[0]?.value || 'Unknown'
}

function baseEditionScore(candidate: NormalizedBookResult, options: SearchOrchestratorOptions = {}): number {
  const preferredLanguage = String(options.language || '').toLowerCase()
  let score = 0

  if (candidate.cover_image) score += 20
  if (candidate.description) score += 16
  if (candidate.isbn_10 || candidate.isbn_13) score += 14
  if (candidate.language && preferredLanguage && candidate.language.toLowerCase().startsWith(preferredLanguage)) score += 12
  if (candidate.authors.length > 0) score += 8
  if (candidate.categories && candidate.categories.length > 0) score += 8
  if (candidate.publisher) score += 4
  if (candidate.published_date) score += 4

  const noisyTitle = /\b(paperback|hardcover|kindle|ebook|audiobook|mass market|edition|vol\.?|volume)\b/i.test(candidate.title)
  if (noisyTitle) score -= 5

  const sourcePriority: Record<string, number> = {
    openlibrary: 7,
    steimatzky: 6,
    booknet: 6,
    indiebook: 6,
    simania: 5,
    google: 4,
  }
  score += sourcePriority[candidate.source] || 2

  return score
}

function identitiesOverlap(a: BookIdentityKeys, b: BookIdentityKeys): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  if (a.openlibrary_work_id && b.openlibrary_work_id && a.openlibrary_work_id === b.openlibrary_work_id) {
    score += 100
    reasons.push('openlibrary_work_exact')
  }
  if (a.openlibrary_edition_id && b.openlibrary_edition_id && a.openlibrary_edition_id === b.openlibrary_edition_id) {
    score += 95
    reasons.push('openlibrary_edition_exact')
  }
  if (a.google_volume_id && b.google_volume_id && a.google_volume_id === b.google_volume_id) {
    score += 90
    reasons.push('google_volume_exact')
  }
  if (a.internal_book_code && b.internal_book_code && a.internal_book_code === b.internal_book_code) {
    score += 80
    reasons.push('internal_code_exact')
  }

  const isbnOverlap = a.isbns.some((isbn) => b.isbns.includes(isbn))
  if (isbnOverlap) {
    score += 85
    reasons.push('isbn_exact')
  }

  return { score, reasons }
}

function hasConflictingStrongIdentity(a: BookIdentityKeys, b: BookIdentityKeys): string[] {
  const blocked: string[] = []

  if (a.openlibrary_work_id && b.openlibrary_work_id && a.openlibrary_work_id !== b.openlibrary_work_id) blocked.push('openlibrary_work_conflict')
  if (a.openlibrary_edition_id && b.openlibrary_edition_id && a.openlibrary_edition_id !== b.openlibrary_edition_id) blocked.push('openlibrary_edition_conflict')
  if (a.internal_book_code && b.internal_book_code && a.internal_book_code !== b.internal_book_code) blocked.push('internal_code_conflict')

  if (a.google_volume_id && b.google_volume_id && a.google_volume_id !== b.google_volume_id) {
    const overlap = a.isbns.some((isbn) => b.isbns.includes(isbn))
    if (!overlap && !a.openlibrary_work_id && !b.openlibrary_work_id) blocked.push('google_volume_conflict')
  }

  return blocked
}


function hasAnyIsbn(item: NormalizedBookResult): boolean {
  const keys = item.identity_keys || extractIdentity(item)
  return keys.isbns.length > 0
}

function isbnOverlap(a: NormalizedBookResult, b: NormalizedBookResult): boolean {
  const left = (a.identity_keys || extractIdentity(a)).isbns
  const right = (b.identity_keys || extractIdentity(b)).isbns
  return left.some((isbn) => right.includes(isbn))
}

function authorSimilarityScore(authorA: string, authorB: string): { score: number; reason?: string } {
  if (!authorA || !authorB) return { score: 0 }
  if (authorA === authorB) return { score: 28, reason: 'author_exact_normalized' }

  if (authorA.includes(authorB) || authorB.includes(authorA)) {
    return { score: 22, reason: 'author_contains_normalized' }
  }

  const tokensA = new Set(authorA.split(' ').filter(Boolean))
  const tokensB = new Set(authorB.split(' ').filter(Boolean))
  let overlap = 0
  for (const t of Array.from(tokensA)) {
    if (tokensB.has(t)) overlap += 1
  }

  if (overlap >= 2) return { score: 18, reason: 'author_token_overlap' }
  if (overlap === 1 && (tokensA.size <= 2 || tokensB.size <= 2)) return { score: 12, reason: 'author_partial_overlap' }

  return { score: 0 }
}

function textFallbackScore(a: NormalizedBookResult, b: NormalizedBookResult): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  const titleA = normalizeText(a.title)
  const titleB = normalizeText(b.title)
  const authorA = normalizeText(a.authors[0] || '')
  const authorB = normalizeText(b.authors[0] || '')

  if (titleA && titleB && titleA === titleB) {
    score += 42
    reasons.push('title_exact_normalized')
  }

  const authorSimilarity = authorSimilarityScore(authorA, authorB)
  score += authorSimilarity.score
  if (authorSimilarity.reason) reasons.push(authorSimilarity.reason)

  if (a.language && b.language && a.language === b.language) {
    score += 8
    reasons.push('language_exact')
  }

  const yearA = (a.published_date || '').match(/\d{4}/)?.[0]
  const yearB = (b.published_date || '').match(/\d{4}/)?.[0]
  if (yearA && yearB && Math.abs(Number(yearA) - Number(yearB)) >= 15) {
    score -= 8
    reasons.push('publication_year_far_apart')
  }

  return { score, reasons }
}

function buildWorkKey(item: NormalizedBookResult): string {
  const ids = item.identity_keys || extractIdentity(item)
  if (ids.openlibrary_work_id) return `work:olw:${ids.openlibrary_work_id}`
  const isbn = ids.isbns[0]
  if (isbn) return `work:isbn:${isbn}`
  const base = `${normalizeText(item.title)}::${normalizeText(item.authors[0] || '')}`
  return `work:text:${base || `${item.source}:${item.source_id}`}`
}

function buildEditionRecord(item: NormalizedBookResult, workId: string): CatalogEdition {
  const ids = item.identity_keys || extractIdentity(item)
  const editionId = ids.openlibrary_edition_id
    ? `edition:ole:${ids.openlibrary_edition_id}`
    : ids.google_volume_id
      ? `edition:gb:${ids.google_volume_id}`
      : ids.isbns[0]
        ? `edition:isbn:${ids.isbns[0]}`
        : `edition:${item.source}:${item.source_id}`

  return {
    edition_id: editionId,
    work_id: workId,
    edition_title: item.title,
    publication_date: item.published_date,
    publisher: item.publisher,
    isbn_10: item.isbn_10,
    isbn_13: item.isbn_13,
    format: item.format,
    page_count: item.page_count,
    language: item.language,
    source_ids: {
      [item.source]: item.source_id,
      ...(ids.openlibrary_edition_id ? { openlibrary: ids.openlibrary_edition_id } : {}),
      ...(ids.google_volume_id ? { google: ids.google_volume_id } : {}),
    },
    source_confidence: Math.max(0.1, Math.min(1, baseEditionScore(item) / 80)),
    raw_payloads: [{ source: item.source, payload: item.raw_source_data }],
  }
}

function buildWorkRecord(primary: NormalizedBookResult, editions: NormalizedBookResult[], workKey: string): CatalogWork {
  const all = [primary, ...editions]
  const sourceBadges = Array.from(new Set(all.map((x) => x.source)))
  const descriptions = all.map((item) => item.description || '').filter(Boolean)
  const bestDescription = descriptions.sort((a, b) => b.length - a.length)[0]
  const titles = all.map((item) => item.title)
  const subjectPool = new Set<string>()
  all.forEach((item) => (item.categories || []).slice(0, 8).forEach((cat) => subjectPool.add(cat)))

  const sourceConfidenceRaw = all.reduce((acc, item) => acc + baseEditionScore(item), 0) / Math.max(all.length * 70, 1)

  return {
    canonical_work_id: workKey,
    normalized_title: normalizeText(chooseCleanerTitle(titles)),
    normalized_authors: primary.authors.map((author) => normalizeText(author)).filter(Boolean),
    display_title: chooseCleanerTitle(titles),
    display_authors: primary.authors,
    language: primary.language,
    series: primary.series,
    volume: primary.volume,
    subjects: Array.from(subjectPool).slice(0, 8),
    description: bestDescription,
    cover: primary.cover_image,
    source_confidence: Math.max(0.15, Math.min(1, sourceConfidenceRaw)),
    source_badges: sourceBadges,
  }
}

function mergeField<T>(a: T | undefined, b: T | undefined): T | undefined {
  return a ?? b
}

function mergeTwo(primary: NormalizedBookResult, secondary: NormalizedBookResult): NormalizedBookResult {
  return {
    ...primary,
    identity_keys: primary.identity_keys || secondary.identity_keys,
    title: chooseCleanerTitle([primary.title, secondary.title]),
    subtitle: mergeField(primary.subtitle, secondary.subtitle),
    authors: primary.authors.length ? primary.authors : secondary.authors,
    description: (primary.description || '').length >= (secondary.description || '').length ? primary.description : secondary.description,
    language: mergeField(primary.language, secondary.language),
    publisher: mergeField(primary.publisher, secondary.publisher),
    published_date: mergeField(primary.published_date, secondary.published_date),
    isbn_10: mergeField(primary.isbn_10, secondary.isbn_10),
    isbn_13: mergeField(primary.isbn_13, secondary.isbn_13),
    page_count: mergeField(primary.page_count, secondary.page_count),
    categories: primary.categories?.length ? primary.categories : secondary.categories,
    cover_image: mergeField(primary.cover_image, secondary.cover_image),
    thumbnail_image: mergeField(primary.thumbnail_image, secondary.thumbnail_image),
    format: mergeField(primary.format, secondary.format),
    series: mergeField(primary.series, secondary.series),
    volume: mergeField(primary.volume, secondary.volume),
    price: mergeField(primary.price, secondary.price),
    currency: mergeField(primary.currency, secondary.currency),
    availability: mergeField(primary.availability, secondary.availability),
    canonical_url: mergeField(primary.canonical_url, secondary.canonical_url),
    rating: mergeField(primary.rating, secondary.rating),
    rating_count: mergeField(primary.rating_count, secondary.rating_count),
    source_attribution: [...(primary.source_attribution || []), ...(secondary.source_attribution || [])],
  }
}

function mergeCluster(cluster: NormalizedBookResult[], options: SearchOrchestratorOptions = {}): NormalizedBookResult {
  const sorted = [...cluster].sort((a, b) => baseEditionScore(b, options) - baseEditionScore(a, options))
  const best = sorted[0]
  return cluster.reduce((acc, item) => mergeTwo(acc, item), { ...best, identity_keys: best.identity_keys || extractIdentity(best) })
}

function dedupeEditionRecords(records: CatalogEdition[]): CatalogEdition[] {
  const map = new Map<string, CatalogEdition>()

  for (const record of records) {
    const fallback = `${normalizeText(record.edition_title)}:${record.publisher || ''}:${record.publication_date || ''}`
    const key = record.edition_id || fallback
    const existing = map.get(key)

    if (!existing) {
      map.set(key, record)
      continue
    }

    map.set(key, {
      ...existing,
      edition_title: chooseCleanerTitle([existing.edition_title, record.edition_title]),
      publication_date: existing.publication_date || record.publication_date,
      publisher: existing.publisher || record.publisher,
      isbn_10: existing.isbn_10 || record.isbn_10,
      isbn_13: existing.isbn_13 || record.isbn_13,
      format: existing.format || record.format,
      page_count: existing.page_count || record.page_count,
      language: existing.language || record.language,
      source_ids: { ...existing.source_ids, ...record.source_ids },
      source_confidence: Math.max(existing.source_confidence, record.source_confidence),
      raw_payloads: [...existing.raw_payloads, ...record.raw_payloads],
    })
  }

  return Array.from(map.values())
}

export function mergeCandidates(
  results: NormalizedBookResult[],
  options: SearchOrchestratorOptions = {}
): {
  groupedResults: GroupedBookResult[]
  decisions: MergeDecision[]
  logs: MergeLog[]
} {
  const clusters: NormalizedBookResult[][] = []
  const decisions: MergeDecision[] = []
  const logs: MergeLog[] = []

  const candidates = results.map((item) => ({ ...item, identity_keys: item.identity_keys || extractIdentity(item) }))

  for (const candidate of candidates) {
    let mergedInto = false

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]
      const lead = cluster[0]
      const leadKeys = lead.identity_keys || extractIdentity(lead)
      const candidateKeys = candidate.identity_keys || extractIdentity(candidate)

      const identity = identitiesOverlap(leadKeys, candidateKeys)
      const text = textFallbackScore(lead, candidate)
      const matchScore = identity.score + text.score
      const reasons = [...identity.reasons, ...text.reasons]
      const dynamicThreshold = identity.score > 0 ? 40 : 50

      const blockedBy = hasConflictingStrongIdentity(leadKeys, candidateKeys)
      const canOverrideOpenLibraryConflict =
        blockedBy.length > 0 &&
        blockedBy.every((reason) => reason === 'openlibrary_work_conflict') &&
        lead.source === 'openlibrary' &&
        candidate.source === 'openlibrary' &&
        text.score >= 64 &&
        (!hasAnyIsbn(lead) || !hasAnyIsbn(candidate) || isbnOverlap(lead, candidate))

      if (blockedBy.length > 0 && !canOverrideOpenLibraryConflict) {
        logs.push({
          workKey: buildWorkKey(lead),
          candidateId: `${candidate.source}:${candidate.source_id}`,
          matched: false,
          score: matchScore,
          reasons,
          blockedBy,
        })
        continue
      }

      if (canOverrideOpenLibraryConflict) {
        reasons.push('openlibrary_conflict_overridden_by_exact_title_author')
      }

      logs.push({
        workKey: buildWorkKey(lead),
        candidateId: `${candidate.source}:${candidate.source_id}`,
        matched: matchScore >= dynamicThreshold,
        score: matchScore,
        reasons,
      })
      if (matchScore >= dynamicThreshold) {
        const confidence = Math.max(0.5, Math.min(1, matchScore / 100))
        decisions.push({ kept: `${lead.source}:${lead.source_id}`, merged: `${candidate.source}:${candidate.source_id}`, confidence, reasons })
        cluster.push(candidate)
        mergedInto = true
        break
      }
    }

    if (!mergedInto) clusters.push([candidate])
  }

  const groupedResults: GroupedBookResult[] = clusters.map((cluster, index) => {
    const primary = mergeCluster(cluster, options)
    const sortedEditions = [...cluster].sort((a, b) => baseEditionScore(b, options) - baseEditionScore(a, options))
    const workKey = buildWorkKey(primary)
    const editionRecords = dedupeEditionRecords(cluster.map((item) => buildEditionRecord(item, workKey)))
    const work = buildWorkRecord(primary, sortedEditions, workKey)

    return {
      group_id: `group:${work.canonical_work_id}:${index}`,
      work,
      primary,
      editions: sortedEditions,
      edition_records: editionRecords,
      total_editions: editionRecords.length,
    }
  })

  return { groupedResults, decisions, logs }
}
