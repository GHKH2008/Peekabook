import { stripPunctuation } from './normalize'
import type { BookIdentityKeys, GroupedBookResult, NormalizedBookResult, SearchOrchestratorOptions } from './types'

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

function hasStrongIdentity(result: NormalizedBookResult): boolean {
  const keys: BookIdentityKeys = result.identity_keys || extractIdentity(result)
  return Boolean(
    keys.openlibrary_work_id ||
      keys.openlibrary_edition_id ||
      keys.google_volume_id ||
      keys.internal_book_code ||
      keys.isbns.length > 0
  )
}

function identitiesOverlap(a: NormalizedBookResult, b: NormalizedBookResult): { exact: boolean; reasons: string[] } {
  const reasons: string[] = []
  const left: BookIdentityKeys = a.identity_keys || extractIdentity(a)
  const right: BookIdentityKeys = b.identity_keys || extractIdentity(b)

  if (left.openlibrary_work_id && right.openlibrary_work_id && left.openlibrary_work_id === right.openlibrary_work_id) {
    reasons.push('openlibrary_work_exact')
  }
  if (left.openlibrary_edition_id && right.openlibrary_edition_id && left.openlibrary_edition_id === right.openlibrary_edition_id) {
    reasons.push('openlibrary_edition_exact')
  }
  if (left.google_volume_id && right.google_volume_id && left.google_volume_id === right.google_volume_id) {
    reasons.push('google_volume_exact')
  }
  if (left.internal_book_code && right.internal_book_code && left.internal_book_code === right.internal_book_code) {
    reasons.push('internal_code_exact')
  }

  const isbnOverlap = left.isbns.some((isbn) => right.isbns.includes(isbn))
  if (isbnOverlap) reasons.push('isbn_exact')

  return { exact: reasons.length > 0 || isbnOverlap, reasons }
}

function hasConflictingStrongIdentity(a: NormalizedBookResult, b: NormalizedBookResult): boolean {
  const left: BookIdentityKeys = a.identity_keys || extractIdentity(a)
  const right: BookIdentityKeys = b.identity_keys || extractIdentity(b)

  if (left.openlibrary_work_id && right.openlibrary_work_id && left.openlibrary_work_id !== right.openlibrary_work_id) return true
  if (left.openlibrary_edition_id && right.openlibrary_edition_id && left.openlibrary_edition_id !== right.openlibrary_edition_id) return true
  if (left.internal_book_code && right.internal_book_code && left.internal_book_code !== right.internal_book_code) return true

  if (left.google_volume_id && right.google_volume_id && left.google_volume_id !== right.google_volume_id) {
    const overlap = left.isbns.some((isbn) => right.isbns.includes(isbn))
    if (!overlap && !left.openlibrary_work_id && !right.openlibrary_work_id) return true
  }

  return false
}

function titleAuthorFallbackMatch(a: NormalizedBookResult, b: NormalizedBookResult): boolean {
  const titleA = normalizeText(a.title)
  const titleB = normalizeText(b.title)
  if (!titleA || !titleB || titleA !== titleB) return false

  const authorA = normalizeText(a.authors[0] || '')
  const authorB = normalizeText(b.authors[0] || '')
  if (!authorA || !authorB) return false

  return authorA === authorB
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

function scorePrimaryEdition(candidate: NormalizedBookResult, options: SearchOrchestratorOptions = {}): number {
  const preferredLanguage = String(options.language || '').toLowerCase()
  let score = 0

  if (candidate.cover_image) score += 30
  if (candidate.description) score += 24
  if (candidate.isbn_10 || candidate.isbn_13) score += 20
  if (candidate.published_date && /^\d{4}-\d{2}-\d{2}$/.test(candidate.published_date)) score += 12
  else if (candidate.published_date && /^\d{4}/.test(candidate.published_date)) score += 6

  const completeness = [
    candidate.publisher,
    candidate.page_count,
    candidate.categories?.length,
    candidate.canonical_url,
    candidate.rating,
    candidate.rating_count,
  ].filter(Boolean).length
  score += completeness * 4

  if (preferredLanguage && candidate.language?.toLowerCase().startsWith(preferredLanguage)) score += 14

  const sourcePriority: Record<string, number> = {
    steimatzky: 9,
    booknet: 8,
    indiebook: 7,
    simania: 6,
    google: 5,
    openlibrary: 4,
  }
  score += sourcePriority[candidate.source] || 2

  return score
}

function mergeTwo(primary: NormalizedBookResult, secondary: NormalizedBookResult): NormalizedBookResult {
  return {
    ...primary,
    identity_keys: primary.identity_keys || secondary.identity_keys,
    title: chooseCleanerTitle([primary.title, secondary.title]),
    subtitle: primary.subtitle || secondary.subtitle,
    authors: primary.authors.length ? primary.authors : secondary.authors,
    description:
      (primary.description || '').length >= (secondary.description || '').length
        ? primary.description
        : secondary.description,
    language: primary.language || secondary.language,
    publisher: primary.publisher || secondary.publisher,
    published_date: primary.published_date || secondary.published_date,
    isbn_10: primary.isbn_10 || secondary.isbn_10,
    isbn_13: primary.isbn_13 || secondary.isbn_13,
    page_count: primary.page_count || secondary.page_count,
    categories: primary.categories?.length ? primary.categories : secondary.categories,
    cover_image: primary.cover_image || secondary.cover_image,
    thumbnail_image: primary.thumbnail_image || secondary.thumbnail_image,
    format: primary.format || secondary.format,
    price: primary.price || secondary.price,
    currency: primary.currency || secondary.currency,
    availability: primary.availability || secondary.availability,
    canonical_url: primary.canonical_url || secondary.canonical_url,
    rating: primary.rating || secondary.rating,
    rating_count: primary.rating_count || secondary.rating_count,
    source_attribution: [...(primary.source_attribution || []), ...(secondary.source_attribution || [])],
  }
}

function mergeCluster(cluster: NormalizedBookResult[], options: SearchOrchestratorOptions = {}): NormalizedBookResult {
  const sorted = [...cluster].sort((a, b) => scorePrimaryEdition(b, options) - scorePrimaryEdition(a, options))
  const best = sorted[0]

  return cluster.reduce((acc, item) => mergeTwo(acc, item), { ...best, identity_keys: best.identity_keys || extractIdentity(best) })
}

export function mergeCandidates(
  results: NormalizedBookResult[],
  options: SearchOrchestratorOptions = {}
): {
  groupedResults: GroupedBookResult[]
  decisions: Array<{ kept: string; merged: string; confidence: number; reasons: string[] }>
} {
  const clusters: NormalizedBookResult[][] = []
  const decisions: Array<{ kept: string; merged: string; confidence: number; reasons: string[] }> = []

  const candidates = results.map((item) => ({ ...item, identity_keys: item.identity_keys || extractIdentity(item) }))

  for (const candidate of candidates) {
    let mergedInto = false

    for (let i = 0; i < clusters.length; i++) {
      const lead = clusters[i][0]
      const identity = identitiesOverlap(lead, candidate)

      if (identity.exact) {
        decisions.push({ kept: lead.source_id, merged: candidate.source_id, confidence: 1, reasons: identity.reasons })
        clusters[i].push(candidate)
        mergedInto = true
        break
      }

      if (hasConflictingStrongIdentity(lead, candidate)) {
        continue
      }

      const fallbackAllowed = !hasStrongIdentity(lead) && !hasStrongIdentity(candidate)
      const sameLanguage = !lead.language || !candidate.language || lead.language === candidate.language
      if (fallbackAllowed && sameLanguage && titleAuthorFallbackMatch(lead, candidate)) {
        decisions.push({ kept: lead.source_id, merged: candidate.source_id, confidence: 0.62, reasons: ['title_author_fallback'] })
        clusters[i].push(candidate)
        mergedInto = true
        break
      }
    }

    if (!mergedInto) clusters.push([candidate])
  }

  const groupedResults = clusters.map((cluster, index) => {
    const primary = mergeCluster(cluster, options)
    const sortedEditions = [...cluster].sort((a, b) => scorePrimaryEdition(b, options) - scorePrimaryEdition(a, options))
    const groupIdBase =
      primary.identity_keys?.openlibrary_work_id ||
      primary.identity_keys?.isbns?.[0] ||
      `${primary.source}:${primary.source_id}`

    return {
      group_id: `group:${groupIdBase}:${index}`,
      primary,
      editions: sortedEditions,
      total_editions: cluster.length,
    }
  })

  return { groupedResults, decisions }
}
