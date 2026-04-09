import { isHebrewQuery, normalizeQuery, stripPunctuation } from './normalize'
import type { BookCandidate, QueryPlan } from './types'

const SOURCE_TRUST: Record<string, number> = {
  google: 0.84,
  openlibrary: 0.86,
  steimatzky: 0.74,
  booknet: 0.72,
  indiebook: 0.7,
  simania: 0.68,
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

function tokenContainmentScore(queryTokens: string[], title: string): number {
  if (queryTokens.length === 0) return 0
  const titleTokens = new Set(stripPunctuation(title).split(' ').filter(Boolean))
  const matched = queryTokens.filter((token) => titleTokens.has(token)).length
  if (matched === queryTokens.length) return 0.92
  if (matched >= Math.max(1, queryTokens.length - 1)) return 0.76
  return matched / Math.max(queryTokens.length, 1)
}

export function scoreCandidate(candidate: BookCandidate, queryPlan: QueryPlan, language?: string): BookCandidate {
  const q = queryPlan
  const titleNorm = candidate.raw_title_normalized || stripPunctuation(candidate.title)
  const subtitleNorm = stripPunctuation(candidate.subtitle || '')
  const authorsNorm = candidate.raw_authors_normalized || candidate.authors.map((a) => stripPunctuation(a))

  const isbnMatch = q.isbn_candidates.length > 0 && q.isbn_candidates.some((isbn) => (candidate.identifiers || []).includes(isbn)) ? 1 : 0
  const titleExact = titleNorm === q.query_without_punctuation && q.query_without_punctuation ? 1 : 0
  const titlePhrase = titleNorm.includes(q.query_without_punctuation) && q.query_without_punctuation.length > 1 ? 1 : 0
  const tokenScore = tokenContainmentScore(q.significant_tokens.length ? q.significant_tokens : q.tokenized_query, candidate.title)
  const fuzzy = Math.max(similarity(titleNorm, q.query_without_punctuation), similarity(titleNorm, q.typo_tolerant_query))
  const titleMatch = Math.max(titleExact, titlePhrase * 0.9, tokenScore * 0.85, fuzzy * 0.8)

  const queryAuthorToken = q.significant_tokens.find((token) => authorsNorm.some((author) => author.includes(token)))
  const authorMatch = queryAuthorToken ? 0.7 : 0

  const normalizedLang = (language || q.language_guess || '').toLowerCase()
  const candidateLanguages = (candidate.languages || []).map((l) => l.toLowerCase())
  const languageMatch =
    normalizedLang && normalizedLang !== 'unknown'
      ? candidateLanguages.some((l) => l.startsWith(normalizedLang))
        ? 1
        : 0
      : 0

  const fieldsPresent = [
    candidate.description,
    candidate.cover_url,
    candidate.publish_date,
    candidate.publish_year,
    candidate.identifiers?.length,
    candidate.subjects?.length,
    candidate.page_count,
    candidate.publishers?.length,
  ].filter(Boolean).length
  const metadataCompleteness = Math.min(1, fieldsPresent / 8)

  const retailerMatch = candidate.source === 'steimatzky' || candidate.source === 'booknet' || candidate.source === 'indiebook' || candidate.source === 'simania' ? 1 : 0
  const sourceConfidence = SOURCE_TRUST[candidate.source] || 0.55

  const titlePenalty = titleMatch < 0.4 ? 0.35 : 0
  const noisySubjectPenalty =
    titleMatch < 0.45 && (stripPunctuation(candidate.description || '').includes(q.query_without_punctuation) || stripPunctuation((candidate.subjects || []).join(' ')).includes(q.query_without_punctuation))
      ? 0.12
      : 0

  const overall =
    isbnMatch * 1000 +
    titleMatch * 700 +
    authorMatch * 180 +
    languageMatch * 120 +
    metadataCompleteness * 90 +
    sourceConfidence * 80 +
    retailerMatch * 20 -
    titlePenalty * 200 -
    noisySubjectPenalty * 80

  return {
    ...candidate,
    isbn_match_score: isbnMatch,
    title_match_score: titleMatch,
    author_match_score: authorMatch,
    language_match_score: languageMatch,
    retailer_match_score: retailerMatch,
    metadata_completeness_score: metadataCompleteness,
    source_confidence: sourceConfidence,
    overall_candidate_score: overall,
  }
}

export function rankResults(results: BookCandidate[], query: string, language?: string): Array<BookCandidate & { _score: number; _reasons: string[] }> {
  const queryPlan = normalizeQuery(query)
  return results
    .map((candidate) => {
      const scored = scoreCandidate(candidate, queryPlan, language)
      return {
        ...scored,
        _score: scored.overall_candidate_score,
        _reasons: [
          `isbn:${scored.isbn_match_score.toFixed(2)}`,
          `title:${scored.title_match_score.toFixed(2)}`,
          `author:${scored.author_match_score.toFixed(2)}`,
          `lang:${scored.language_match_score.toFixed(2)}`,
        ],
      }
    })
    .sort((a, b) => b._score - a._score)
}

export const __rankerTestables = { similarity, tokenContainmentScore, isHebrewQuery }
