import * as assert from 'node:assert/strict'

import { normalizeHebrewText, buildSearchVariants, normalizeHebrewFinalForms } from './book-search/normalize'
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
  assert.equal(normalizeHebrewFinalForms('מלך קטן'), 'מלכ קטנ')
  const variants = buildSearchVariants('שומרי הזמן')
  assert.ok(variants.includes('"שומרי הזמן"'))
}

export function testMergeDuplicateByIsbnAndTitle() {
  const a = makeResult({ source: 'steimatzky', source_id: 's1', title: 'שומרי הזמן', authors: ['נועה'], isbn_13: '9789650000000' })
  const b = makeResult({ source: 'simania', source_id: 'sm1', title: 'שומרי-הזמן', authors: ['נועה'], isbn_13: '9789650000000' })
  const merged = mergeCandidates([a, b])
  assert.equal(merged.groupedResults.length, 1)
  assert.equal(merged.groupedResults[0].total_editions, 1)
}

export function testHebrewRankingBoost() {
  const hebrew = makeResult({ source: 'booknet', source_id: 'h', title: 'שומרי הזמן', language: 'he' })
  const english = makeResult({ source: 'google', source_id: 'e', title: 'Time Keepers', language: 'en' })
  const ranked = rankResults([english, hebrew], 'שומרי הזמן')
  assert.equal(ranked[0].source_id, 'h')
}

export function testMisspelledTitleRanksIntendedBookFirst() {
  const intended = makeResult({
    source: 'openlibrary',
    source_id: 'hwfm-1',
    title: 'He Who Fights with Monsters',
    authors: ['Shirtaloon'],
  })
  const noisy = makeResult({
    source: 'google',
    source_id: 'noise-1',
    title: 'Monsters of Men',
    authors: ['Patrick Ness'],
    description: 'A dystopian story involving monsters.',
  })
  const ranked = rankResults([noisy, intended], 'he who fight with monsters')
  assert.equal(ranked[0].source_id, 'hwfm-1')
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

export function testAuthorMiddleInitialFallbackMerge() {
  const a = makeResult({ source: 'openlibrary', source_id: 'a2', title: 'Unsouled', authors: ['Will Wight'], published_date: '2017' })
  const b = makeResult({ source: 'openlibrary', source_id: 'b2', title: 'Unsouled', authors: ['Will L. Wight'], published_date: '2023' })
  const merged = mergeCandidates([a, b])
  assert.equal(merged.groupedResults.length, 1)
}

export function testUnsouledGroupedAsSingleWorkWithEditionVariants() {
  const work = makeResult({
    source: 'openlibrary',
    source_id: '/works/OL777W',
    title: 'Unsouled',
    authors: ['Will Wight'],
    raw_source_data: { key: '/works/OL777W' },
  })
  const paperback = makeResult({
    source: 'google',
    source_id: 'gb-1',
    title: 'Unsouled (Paperback)',
    authors: ['Will Wight'],
    published_date: '2018',
    isbn_13: '9780989671769',
  })
  const ebook = makeResult({
    source: 'google',
    source_id: 'gb-2',
    title: 'Unsouled',
    authors: ['Will Wight'],
    published_date: '2020',
    isbn_13: '9780989671769',
  })

  const merged = mergeCandidates([work, paperback, ebook])
  assert.equal(merged.groupedResults.length, 1)
  assert.ok(merged.groupedResults[0].editions.length <= 3)
}

export function testDifferentSeriesEntriesDoNotMergeOnPrefixTitle() {
  const a = makeResult({ source: 'google', source_id: 's1', title: 'He Who Fights with Monsters', authors: ['Shirtaloon'] })
  const b = makeResult({ source: 'google', source_id: 's2', title: 'He Who Fights with Monsters: Hero', authors: ['Shirtaloon'] })
  const merged = mergeCandidates([a, b])
  assert.equal(merged.groupedResults.length, 2)
}

export function testOpenLibraryConflictingWorkIdsCanMergeWhenTitleAuthorExact() {
  const a = makeResult({
    source: 'openlibrary',
    source_id: '/works/OL111W',
    title: 'Unsouled',
    authors: ['Will Wight'],
    raw_source_data: { key: '/works/OL111W' },
  })
  const b = makeResult({
    source: 'openlibrary',
    source_id: '/works/OL222W',
    title: 'Unsouled',
    authors: ['Will L. Wight'],
    raw_source_data: { key: '/works/OL222W' },
  })

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

export function testOpenLibraryWorkIdentityPreferredGrouping() {
  const workA = makeResult({
    source: 'openlibrary',
    source_id: '/works/OL111W',
    title: 'The Name of the Wind (Paperback Edition)',
    authors: ['Patrick Rothfuss'],
    raw_source_data: { key: '/works/OL111W' },
  })
  const workB = makeResult({
    source: 'openlibrary',
    source_id: '/books/OL22M',
    title: 'The Name of the Wind',
    authors: ['Patrick Rothfuss'],
    raw_source_data: { key: '/books/OL22M', works: [{ key: '/works/OL111W' }] },
  })

  const merged = mergeCandidates([workA, workB])
  assert.equal(merged.groupedResults.length, 1)
  assert.equal(merged.groupedResults[0].work.display_title, 'The Name of the Wind')
}

export function testIsbnQueryRanksDirectEditionFirst() {
  const exact = makeResult({
    source: 'openlibrary',
    source_id: 'exact-isbn',
    title: 'The Name of the Wind',
    authors: ['Patrick Rothfuss'],
    isbn_13: '9780756404741',
  })
  const other = makeResult({
    source: 'google',
    source_id: 'other-isbn',
    title: 'The Name of the Wind',
    authors: ['Patrick Rothfuss'],
    isbn_13: '9780756405892',
  })

  const ranked = rankResults([other, exact], '9780756404741')
  assert.equal(ranked[0].source_id, 'exact-isbn')
}

export function runBookSearchTests() {
  testHebrewNormalization()
  testMergeDuplicateByIsbnAndTitle()
  testHebrewRankingBoost()
  testMisspelledTitleRanksIntendedBookFirst()
  testSameTitleDifferentBooksNotMerged()
  testAuthorSpellingVariationMerges()
  testAuthorMiddleInitialFallbackMerge()
  testUnsouledGroupedAsSingleWorkWithEditionVariants()
  testDifferentSeriesEntriesDoNotMergeOnPrefixTitle()
  testOpenLibraryConflictingWorkIdsCanMergeWhenTitleAuthorExact()
  testDifferentOpenLibraryWorksDoNotMergeByTitleFallback()
  testOpenLibraryWorkIdentityPreferredGrouping()
  testIsbnQueryRanksDirectEditionFirst()
}

runBookSearchTests()
