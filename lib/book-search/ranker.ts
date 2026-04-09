import { isHebrewQuery, stripPunctuation } from './normalize'
import type { NormalizedBookResult } from './types'

const SOURCE_TRUST: Record<string, number> = {
  steimatzky: 0.9,
  booknet: 0.85,
  indiebook: 0.8,
  simania: 0.78,
  google: 0.72,
  openlibrary: 0.66,
}

export function scoreResult(result: NormalizedBookResult, query: string): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const queryNorm = stripPunctuation(query)
  const titleNorm = stripPunctuation(result.title)
  const authorNorm = stripPunctuation((result.authors || []).join(' '))
  let score = 0

  if (titleNorm === queryNorm) { score += 180; reasons.push('titleExact') }
  else if (titleNorm.includes(queryNorm)) { score += 120; reasons.push('titleContains') }

  if (queryNorm && authorNorm.includes(queryNorm)) { score += 80; reasons.push('authorExact') }

  if (result.isbn_10 || result.isbn_13) { score += 45; reasons.push('isbnMatch') }
  if (result.language) { score += 20; reasons.push('languageMatch') }
  if (result.cover_image) { score += 20; reasons.push('coverPresent') }
  if (result.description) { score += 15; reasons.push('descriptionPresent') }

  const completeness = [result.publisher, result.published_date, result.page_count, result.categories?.length].filter(Boolean).length
  score += completeness * 8
  reasons.push('metadataCompleteness')

  score += (SOURCE_TRUST[result.source] || 0.5) * 40
  reasons.push('sourceTrust')

  const hebrewQuery = isHebrewQuery(query)
  if (hebrewQuery && (result.language === 'he' || isHebrewQuery(result.title))) {
    score += 75
    reasons.push('HebrewQueryBoost')
  }
  if (hebrewQuery && ['steimatzky', 'booknet', 'indiebook', 'simania'].includes(result.source)) {
    score += 85
    reasons.push('IsraeliCatalogBoost')
  }

  return { score, reasons }
}

export function rankResults(results: NormalizedBookResult[], query: string): Array<NormalizedBookResult & { _score: number; _reasons: string[] }> {
  return results
    .map((result) => {
      const scored = scoreResult(result, query)
      return { ...result, _score: scored.score, _reasons: scored.reasons }
    })
    .sort((a, b) => b._score - a._score)
}
