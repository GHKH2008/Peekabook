import { isHebrewQuery, normalizeQuery, stripPunctuation } from './normalize'
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

function isLikelyIsbn(value: string): string | undefined {
  const normalizedId = value.replace(/[^0-9X]/gi, '').toUpperCase()
  return normalizedId.length === 10 || normalizedId.length === 13 ? normalizedId : undefined
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
    }
  }

  return matrix[a.length][b.length]
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  if (!maxLen) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

function formatNoisePenalty(title: string): number {
  return /\b(paperback|hardcover|kindle|ebook|audiobook|mass market|edition|vol\.?|volume)\b/i.test(title) ? 18 : 0
}

export function scoreResult(result: NormalizedBookResult, query: string): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const queryNormalized = normalizeQuery(query)
  const queryNorm = queryNormalized.raw
  const queryTokens = queryNormalized.tokens
  const titleNorm = normalized(result.title)
  const subtitleNorm = normalized(result.subtitle)
  const primaryAuthorNorm = normalized((result.authors || [])[0])
  const joinedAuthorsNorm = normalized((result.authors || []).join(' '))
  const descriptionNorm = normalized(result.description)
  const categoriesNorm = normalized((result.categories || []).join(' '))
  const queryIsbn = isLikelyIsbn(queryNorm)

  let score = 0

  if (queryIsbn) {
    const isbn10 = isLikelyIsbn(result.isbn_10 || '')
    const isbn13 = isLikelyIsbn(result.isbn_13 || '')
    if (isbn10 === queryIsbn || isbn13 === queryIsbn) {
      score += 200
      reasons.push('isbnExact')
    }
  }

  if (titleNorm === queryNorm && queryNorm) {
    score += 360
    reasons.push('titleExact')
  } else if (titleNorm.startsWith(queryNorm) && queryNorm) {
    score += 280
    reasons.push('titleStartsWithQuery')
  } else if (titleNorm.includes(queryNorm) && queryNorm) {
    score += 230
    reasons.push('titleContains')
  }

  if (queryTokens.length > 1) {
    const missingToken = queryTokens.some((token) => !titleNorm.includes(token))
    if (!missingToken) {
      score += 180
      reasons.push('titleAllQueryTokens')
    }
  }

  const titleFuzzy = similarity(titleNorm, queryNorm)
  if (titleFuzzy >= 0.88) {
    score += 165
    reasons.push('titleFuzzyHigh')
  } else if (titleFuzzy >= 0.8) {
    score += 115
    reasons.push('titleFuzzyMedium')
  } else if (titleFuzzy >= 0.72) {
    score += 68
    reasons.push('titleFuzzyLow')
  }

  if (queryTokens.length > 1 && titleNorm.includes(queryTokens.join(' '))) {
    score += 120
    reasons.push('titlePhraseMatch')
  }

  if (queryNorm && primaryAuthorNorm === queryNorm) {
    score += 90
    reasons.push('authorExact')
  } else if (queryNorm && joinedAuthorsNorm.includes(queryNorm)) {
    score += 62
    reasons.push('authorContains')
  }

  if (queryNorm && subtitleNorm.includes(queryNorm)) {
    score += 28
    reasons.push('subtitleContains')
  }

  if (queryNorm && descriptionNorm.includes(queryNorm)) {
    score += 12
    reasons.push('descriptionContains')
  }

  if (queryNorm && categoriesNorm.includes(queryNorm)) {
    score += 10
    reasons.push('categoriesContains')
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

  const noisePenalty = formatNoisePenalty(result.title)
  score -= noisePenalty
  if (noisePenalty > 0) {
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
