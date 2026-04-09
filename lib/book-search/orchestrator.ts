import { detectBookLanguage } from './language'
import {
  collapseFormatVariants,
  hardDedupeEnglishBooks,
  isSufficientlyComplete,
  mergeMissingFields,
} from './english-utils'
import { enrichFromExtras } from './providers/extras'
import { enrichFromGoogle } from './providers/google'
import { enrichFromOpenLibrary } from './providers/open-library'
import { searchAmazonEnglishCandidates } from './providers/amazon'
import type { EnglishBook } from './types'

export async function searchBooksSequential(query: string): Promise<EnglishBook[]> {
  const language = detectBookLanguage(query)

  if (language !== 'en') {
    // Keep non-English behavior unchanged for now.
    return []
  }

  const amazonCandidates = await searchAmazonEnglishCandidates(query, 12)

  const normalizedCandidates: EnglishBook[] = amazonCandidates.map((candidate) => ({
    title: candidate.title,
    authors: candidate.authors,
    summary: undefined,
    genres: [],
    isbn: undefined,
    isbn13: undefined,
    language: candidate.language,
    cover: candidate.cover,
    publisher: undefined,
    publishedDate: undefined,
    pageCount: undefined,
    sourceEditionId: candidate.sourceEditionId,
    sourceRefs: candidate.sourceRefs,
    sourceTrace: ['amazon'],
  }))

  const enrichedSequentially: EnglishBook[] = []

  for (const candidate of normalizedCandidates) {
    let current = candidate

    if (!isSufficientlyComplete(current)) {
      const googleEnrichment = await enrichFromGoogle(current)
      current = mergeMissingFields(current, googleEnrichment, 'google')
    }

    if (!isSufficientlyComplete(current)) {
      const openLibraryEnrichment = await enrichFromOpenLibrary(current)
      current = mergeMissingFields(current, openLibraryEnrichment, 'open-library')
    }

    if (!isSufficientlyComplete(current)) {
      const extrasEnrichment = await enrichFromExtras(current)
      current = mergeMissingFields(current, extrasEnrichment, 'extras')
    }

    enrichedSequentially.push(current)
  }

  const deduped = hardDedupeEnglishBooks(enrichedSequentially)
  const collapsed = collapseFormatVariants(deduped)

  return collapsed.slice(0, 10)
}
