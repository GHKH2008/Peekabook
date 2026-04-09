import { isHebrewQuery, stripPunctuation } from './normalize'
import type { NormalizedBookResult } from './types'

const SOURCE_TRUST: Record<string, number> = {
  steimatzky: 0.92,
  booknet: 0.9,
  indiebook: 0.86,
  simania: 0.82,
  openlibrary: 0.78,
  google: 0.74,
}

function normalized(value: string | undefined): string {
  return stripPunctuation(String(value || ''))
}

function formatNoisePenalty(title: string): number {
  return /\b(paperback|hardcover|kindle|ebook|audiobook|mass market|edition|vol\.?|volume)\b/i.test(title) ? 18 : 0
}

export function scoreResult(result: NormalizedBookResult, query: string): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const queryNorm = normalized(query)
  const titleNorm = normalized(result.title)
  const primaryAuthorNorm = normalized((result.authors || [])[0])
  const joinedAuthorsNorm = normalized((result.authors || []).join(' '))

  let score = 0

  if (titleNorm === queryNorm) {
    score += 180
    reasons.push('titleExact')
  } else if (titleNorm.includes(queryNorm)) {
    score += 120
    reasons.push('titleContains')
  }

  if (queryNorm && primaryAuthorNorm === queryNorm) {
    score += 90
    reasons.push('authorExact')
  } else if (queryNorm && joinedAuthorsNorm.includes(queryNorm)) {
    score += 62
    reasons.push('authorContains')
  }

  if (result.isbn_10 || result.isbn_13) {
    score += 45
    reasons.push('isbnPresent')
  }
  if (result.cover_image) {
    score += 28
    reasons.push('coverPresent')
  }
  if (result.description) {
    score += 24
    reasons.push('descriptionPresent')
  }

  const completeness = [
    result.publisher,
    result.published_date,
    result.page_count,
    result.categories?.length,
    result.language,
  ].filter(Boolean).length
  score += completeness * 8
  reasons.push('metadataCompleteness')

  const sourceScore = (SOURCE_TRUST[result.source] || 0.5) * 40
  score += sourceScore
  reasons.push('sourceTrust')

  const hebrewQuery = isHebrewQuery(query)
  if (hebrewQuery && (result.language === 'he' || isHebrewQuery(result.title))) {
    score += 75
    reasons.push('HebrewQueryBoost')
  }

  score -= formatNoisePenalty(result.title)
  if (formatNoisePenalty(result.title) > 0) {
    reasons.push('formatNoisePenalty')
  }

  return { score, reasons }
}

export function rankResults(
  results: NormalizedBookResult[],
  query: string
): Array<NormalizedBookResult & { _score: number; _reasons: string[] }> {
  return results
    .map((result) => {
      const scored = scoreResult(result, query)
      return { ...result, _score: scored.score, _reasons: scored.reasons }
    })
    .sort((a, b) => b._score - a._score)
}
