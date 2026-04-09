import { stripPunctuation } from './normalize'
import type { NormalizedBookResult } from './types'

function normalizeId(value?: string): string {
  return String(value || '').replace(/[^0-9X]/gi, '').toUpperCase()
}

function year(value?: string): string {
  return (value || '').match(/\d{4}/)?.[0] || ''
}

function mergeTwo(primary: NormalizedBookResult, secondary: NormalizedBookResult): NormalizedBookResult {
  return {
    ...primary,
    title: primary.title.length >= secondary.title.length ? primary.title : secondary.title,
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

export function matchConfidence(a: NormalizedBookResult, b: NormalizedBookResult): { confidence: number; reasons: string[] } {
  let confidence = 0
  const reasons: string[] = []

  if (a.isbn_13 && b.isbn_13 && normalizeId(a.isbn_13) === normalizeId(b.isbn_13)) {
    confidence += 0.95
    reasons.push('isbn13_exact')
  }
  if (a.isbn_10 && b.isbn_10 && normalizeId(a.isbn_10) === normalizeId(b.isbn_10)) {
    confidence += 0.9
    reasons.push('isbn10_exact')
  }
  if (stripPunctuation(a.title) === stripPunctuation(b.title)) {
    confidence += 0.5
    reasons.push('title_normalized')
  }
  if (
    stripPunctuation(a.title) === stripPunctuation(b.title) &&
    stripPunctuation(a.authors[0] || '') === stripPunctuation(b.authors[0] || '')
  ) {
    confidence += 0.55
    reasons.push('title_author_match')
  }
  if (a.cover_image && b.cover_image && a.cover_image.split('/').pop() === b.cover_image.split('/').pop()) {
    confidence += 0.15
    reasons.push('cover_similarity')
  }
  if (a.publisher && b.publisher && year(a.published_date) && year(a.published_date) === year(b.published_date)) {
    confidence += 0.2
    reasons.push('publisher_year')
  }
  if (a.page_count && b.page_count && a.page_count === b.page_count) {
    confidence += 0.15
    reasons.push('page_count')
  }

  return { confidence, reasons }
}

export function mergeCandidates(results: NormalizedBookResult[]): { mergedResults: NormalizedBookResult[]; decisions: Array<{ kept: string; merged: string; confidence: number; reasons: string[] }> } {
  const merged: NormalizedBookResult[] = []
  const decisions: Array<{ kept: string; merged: string; confidence: number; reasons: string[] }> = []

  for (const candidate of results) {
    let mergedInto = false
    for (let i = 0; i < merged.length; i++) {
      const scored = matchConfidence(merged[i], candidate)
      if (scored.confidence >= 0.9) {
        decisions.push({ kept: merged[i].source_id, merged: candidate.source_id, confidence: scored.confidence, reasons: scored.reasons })
        merged[i] = mergeTwo(merged[i], candidate)
        mergedInto = true
        break
      }
    }
    if (!mergedInto) merged.push(candidate)
  }

  return { mergedResults: merged, decisions }
}
