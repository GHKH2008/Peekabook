import * as assert from 'node:assert/strict'

import { normalizeQuery } from './book-search/normalize'
import { mergeCandidates, shouldCrossLanguageCluster } from './book-search/merge'
import { rankResults, scoreCandidate } from './book-search/ranker'
import { makeCandidate } from './book-search/providers/utils'
import type { BookCandidate } from './book-search/types'

function c(partial: Partial<BookCandidate>): BookCandidate {
  return {
    ...makeCandidate({
      source: 'google',
      sourceId: partial.source_edition_id || 'id-1',
      sourceWorkId: partial.source_work_id,
      title: partial.title || 'Unknown',
      authors: partial.authors || [],
      languages: partial.languages || [],
      isbn10: partial.isbn10,
      isbn13: partial.isbn13,
      publishDate: partial.publish_date,
      publishers: partial.publishers,
    }),
    ...partial,
  }
}

export function testExactNearTitleRescue() {
  const query = normalizeQuery('he who fight with monsters')
  const intended = scoreCandidate(c({ source: 'openlibrary', source_work_id: 'OL1W', title: 'He Who Fights with Monsters', authors: ['Shirtaloon'] }), query)
  const noisy = scoreCandidate(c({ source: 'google', source_work_id: 'OL2W', title: 'Monsters and Other Tales', authors: ['Someone Else'] }), query)
  const ranked = rankResults([noisy, intended], query.raw_query)
  assert.equal(ranked[0].title, 'He Who Fights with Monsters')
}

export function testWorkGroupingUnsouledSingleWork() {
  const query = normalizeQuery('unsouled')
  const work = scoreCandidate(c({ source: 'openlibrary', source_work_id: 'OL777W', title: 'Unsouled', authors: ['Will Wight'] }), query)
  const paperback = scoreCandidate(c({ source: 'google', title: 'Unsouled (Paperback)', authors: ['Will Wight'], isbn13: ['9780989671769'] }), query)
  const ebook = scoreCandidate(c({ source: 'google', title: 'Unsouled', authors: ['Will Wight'], isbn13: ['9780989671769'], format: 'ebook' }), query)

  const merged = mergeCandidates([work, paperback, ebook], query)
  assert.equal(merged.groupedResults.length, 1)
}

export function testSameTitleDifferentAuthorNotMerged() {
  const query = normalizeQuery('the stand')
  const a = scoreCandidate(c({ source: 'google', title: 'The Stand', authors: ['Stephen King'] }), query)
  const b = scoreCandidate(c({ source: 'google', title: 'The Stand', authors: ['Craig White'] }), query)
  const merged = mergeCandidates([a, b], query)
  assert.equal(merged.groupedResults.length, 2)
}

export function testHebrewTitleWithRetailerEnrichment() {
  const query = normalizeQuery('שם הרוח')
  const openLibrary = scoreCandidate(
    c({ source: 'openlibrary', source_work_id: 'OLNOWW', title: 'שם הרוח', authors: ['פטריק רותפס'], languages: ['he'], isbn13: ['9789650719755'] }),
    query
  )
  const retailer = scoreCandidate(
    c({ source: 'steimatzky', title: 'שם הרוח', authors: ['פטריק רותפס'], languages: ['he'], isbn13: ['9789650719755'], source_url: 'https://store.example/item' }),
    query
  )

  const merged = mergeCandidates([openLibrary, retailer], query)
  assert.equal(merged.groupedResults.length, 1)
  assert.ok(merged.groupedResults[0].grouped_work.retailers.length >= 1)
}

export function testEnglishHebrewCrossLinkEvidenceGuarded() {
  const english = c({ title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], isbn13: ['9780756404741'] })
  const hebrew = c({ title: 'שם הרוח', authors: ['פטריק רותפס'], languages: ['he'], isbn13: ['9780756404741'] })
  assert.equal(shouldCrossLanguageCluster(english, hebrew), true)
}

export function testIsbnDirectMatch() {
  const query = normalizeQuery('9780756404741')
  const exact = scoreCandidate(c({ title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], isbn13: ['9780756404741'] }), query)
  const other = scoreCandidate(c({ title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], isbn13: ['9780756405892'] }), query)
  const ranked = rankResults([other, exact], query.raw_query)
  assert.equal(ranked[0].isbn13?.[0], '9780756404741')
}

export function testNoisyKeywordDoesNotBeatSpecificTitle() {
  const query = normalizeQuery('monsters')
  const specific = scoreCandidate(c({ title: 'He Who Fights with Monsters', authors: ['Shirtaloon'] }), query)
  const generic = scoreCandidate(c({ title: 'Monster Encyclopedia', authors: ['Various'] }), query)
  const ranked = rankResults([generic, specific], query.raw_query)
  assert.equal(ranked[0].title, 'He Who Fights with Monsters')
}

export function testTranslationSafetyRequireEvidence() {
  const query = normalizeQuery('name of the wind')
  const original = scoreCandidate(c({ source: 'google', title: 'The Name of the Wind', authors: ['Patrick Rothfuss'] }), query)
  const unrelated = scoreCandidate(c({ source: 'google', title: 'שם הרוח', authors: ['מחבר אחר'] }), query)
  const merged = mergeCandidates([original, unrelated], query)
  assert.equal(merged.groupedResults.length, 2)
}

export function runBookSearchTests() {
  testExactNearTitleRescue()
  testWorkGroupingUnsouledSingleWork()
  testSameTitleDifferentAuthorNotMerged()
  testHebrewTitleWithRetailerEnrichment()
  testEnglishHebrewCrossLinkEvidenceGuarded()
  testIsbnDirectMatch()
  testNoisyKeywordDoesNotBeatSpecificTitle()
  testTranslationSafetyRequireEvidence()
}

runBookSearchTests()
