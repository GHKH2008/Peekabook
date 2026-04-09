import assert from 'node:assert/strict'

import { normalizeHebrewText, buildSearchVariants } from './book-search/normalize'
import { mergeCandidates } from './book-search/merge'
import { rankResults } from './book-search/ranker'
import type { NormalizedBookResult } from './book-search/types'

function makeResult(partial: Partial<NormalizedBookResult>): NormalizedBookResult {
  return {
    source: 'google',
    source_id: 'id-1',
    title: 'Unknown',
    authors: [],
    ...partial,
  }
}

export function testHebrewNormalization() {
  assert.equal(normalizeHebrewText('  שומרי   הזמן '), 'שומרי הזמן')
  const variants = buildSearchVariants('שומרי הזמן')
  assert.ok(variants.includes('"שומרי הזמן"'))
}

export function testMergeDuplicateByIsbnAndTitle() {
  const a = makeResult({ source: 'steimatzky', source_id: 's1', title: 'שומרי הזמן', authors: ['נועה'], isbn_13: '9789650000000' })
  const b = makeResult({ source: 'simania', source_id: 'sm1', title: 'שומרי-הזמן', authors: ['נועה'], isbn_13: '9789650000000' })
  const merged = mergeCandidates([a, b])
  assert.equal(merged.groupedResults.length, 1)
  assert.equal(merged.groupedResults[0].total_editions, 2)
}

export function testHebrewRankingBoost() {
  const hebrew = makeResult({ source: 'booknet', source_id: 'h', title: 'שומרי הזמן', language: 'he' })
  const english = makeResult({ source: 'google', source_id: 'e', title: 'Time Keepers', language: 'en' })
  const ranked = rankResults([english, hebrew], 'שומרי הזמן')
  assert.equal(ranked[0].source_id, 'h')
}

export function testSameTitleDifferentBooksNotMerged() {
  const a = makeResult({ source: 'google', source_id: '1', title: 'שומרי הזמן', authors: ['אורי'], published_date: '2018' })
  const b = makeResult({ source: 'google', source_id: '2', title: 'שומרי הזמן', authors: ['דנה'], published_date: '2024' })
  const merged = mergeCandidates([a, b])
  assert.equal(merged.groupedResults.length, 2)
}

export function testAuthorSpellingVariationMerges() {
  const a = makeResult({ source: 'openlibrary', source_id: 'a', title: 'שם הרוח', authors: ['פטריק רותפס'], isbn_13: '9789650719755' })
  const b = makeResult({ source: 'steimatzky', source_id: 'b', title: 'שם הרוח', authors: ['פטריק רוטפס'], isbn_13: '9789650719755' })
  const merged = mergeCandidates([a, b])
  assert.equal(merged.groupedResults.length, 1)
}

export function testDifferentOpenLibraryWorksDoNotMergeByTitleFallback() {
  const a = makeResult({
    source: 'openlibrary',
    source_id: '/works/OL123W',
    title: 'Unsouled',
    authors: ['Will Wight'],
    raw_source_data: { key: '/works/OL123W' },
  })
  const b = makeResult({
    source: 'openlibrary',
    source_id: '/works/OL999W',
    title: 'Unsouled',
    authors: ['Will Wight'],
    raw_source_data: { key: '/works/OL999W' },
  })

  const merged = mergeCandidates([a, b])
  assert.equal(merged.groupedResults.length, 2)
}

export function runBookSearchTests() {
  testHebrewNormalization()
  testMergeDuplicateByIsbnAndTitle()
  testHebrewRankingBoost()
  testSameTitleDifferentBooksNotMerged()
  testAuthorSpellingVariationMerges()
  testDifferentOpenLibraryWorksDoNotMergeByTitleFallback()
}

runBookSearchTests()
