import * as assert from 'node:assert/strict'

import { normalizeQuery } from './book-search/normalize'
import { mergeCandidates } from './book-search/merge'
import { scoreCandidate, rankResults } from './book-search/ranker'
import { makeCandidate } from './book-search/providers/utils'
import type { BookCandidate } from './book-search/types'

function c(partial: Partial<BookCandidate>): BookCandidate {
  return {
    ...makeCandidate({
      source: partial.source || 'google',
      sourceId: partial.source_edition_id || 'id-1',
      sourceWorkId: partial.source_work_id,
      sourceEditionId: partial.source_edition_id,
      title: partial.title || 'Unknown',
      authors: partial.authors || [],
      languages: partial.languages || [],
      isbn10: partial.isbn10,
      isbn13: partial.isbn13,
      publishDate: partial.publish_date,
      publishers: partial.publishers,
      coverUrl: partial.cover_url,
      pageCount: partial.page_count,
      description: partial.description,
    }),
    ...partial,
  }
}

function testSameBookAcrossSourcesMergeCorrectly() {
  const query = normalizeQuery('The Name of the Wind Patrick Rothfuss')
  const amazon = scoreCandidate(c({ source: 'amazon', source_edition_id: 'asin:1', title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], isbn13: ['9780756404741'], cover_url: 'https://img/a-400.jpg' }), query)
  const google = scoreCandidate(c({ source: 'google', source_edition_id: 'g1', title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], isbn13: ['9780756404741'], description: 'A fantasy novel.' }), query)
  const ol = scoreCandidate(c({ source: 'openlibrary', source_edition_id: 'OL1M', title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], isbn13: ['9780756404741'] }), query)
  const merged = mergeCandidates([amazon, google, ol], query)
  assert.equal(merged.groupedResults.length, 1)
  assert.equal(merged.groupedResults[0].primary.authors[0], 'Patrick Rothfuss')
}

function testSimilarTitlesDoNotMerge() {
  const query = normalizeQuery('The Stand')
  const a = scoreCandidate(c({ source: 'google', title: 'The Stand', authors: ['Stephen King'] }), query)
  const b = scoreCandidate(c({ source: 'google', title: 'The Stand', authors: ['Craig White'] }), query)
  const merged = mergeCandidates([a, b], query)
  assert.equal(merged.groupedResults.length, 2)
}

function testEnglishAndHebrewEditionsDoNotMerge() {
  const query = normalizeQuery('name of the wind')
  const english = scoreCandidate(c({ title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], languages: ['en'], isbn13: ['9780756404741'] }), query)
  const hebrew = scoreCandidate(c({ title: 'שם הרוח', authors: ['פטריק רותפס'], languages: ['he'], isbn13: ['9789650719755'] }), query)
  const merged = mergeCandidates([english, hebrew], query)
  assert.equal(merged.groupedResults.length, 2)
}

function testHardcoverPaperbackDifferentIdentityStaySeparate() {
  const query = normalizeQuery('Dune Frank Herbert')
  const hardcover = scoreCandidate(c({ source: 'google', source_edition_id: 'g-hard', title: 'Dune', authors: ['Frank Herbert'], isbn13: ['9780441172719'], format: 'hardcover' }), query)
  const paperback = scoreCandidate(c({ source: 'google', source_edition_id: 'g-paper', title: 'Dune', authors: ['Frank Herbert'], isbn13: ['9780593099322'], format: 'paperback' }), query)
  const merged = mergeCandidates([hardcover, paperback], query)
  assert.equal(merged.groupedResults.length, 2)
}

function testOpenLibraryEditionMatchingByIsbnWorks() {
  const query = normalizeQuery('9780590353427')
  const google = scoreCandidate(c({ source: 'google', source_edition_id: 'g-hp', title: 'Harry Potter', authors: ['J.K. Rowling'], isbn13: ['9780590353427'] }), query)
  const ol = scoreCandidate(c({ source: 'openlibrary', source_edition_id: 'OLHPM', title: 'Harry Potter and the Sorcerers Stone', authors: ['J. K. Rowling'], isbn13: ['9780590353427'] }), query)
  const merged = mergeCandidates([google, ol], query)
  assert.equal(merged.groupedResults.length, 1)
}

function testHebrewStoreSkuStaysSeparate() {
  const query = normalizeQuery('שם הרוח')
  const storeA = scoreCandidate(c({ source: 'steimatzky', source_edition_id: 'sku-1', title: 'שם הרוח', authors: ['פטריק רותפס'], languages: ['he'] }), query)
  const storeB = scoreCandidate(c({ source: 'steimatzky', source_edition_id: 'sku-2', title: 'שם הרוח', authors: ['פטריק רותפס'], languages: ['he'] }), query)
  const merged = mergeCandidates([storeA, storeB], query)
  assert.equal(merged.groupedResults.length, 2)
}

function testMissingFieldsFilledFromLaterSources() {
  const query = normalizeQuery('Mistborn')
  const amazon = scoreCandidate(c({ source: 'amazon', source_edition_id: 'asin-m', title: 'Mistborn', authors: ['Brandon Sanderson'], isbn13: ['9780765311788'] }), query)
  const google = scoreCandidate(c({ source: 'google', source_edition_id: 'g-m', title: 'Mistborn', authors: ['Brandon Sanderson'], isbn13: ['9780765311788'], description: 'Epic fantasy novel', page_count: 541 }), query)
  const merged = mergeCandidates([amazon, google], query)
  assert.equal(merged.groupedResults[0].primary.page_count, 541)
  assert.equal(merged.groupedResults[0].primary.description, 'Epic fantasy novel')
}

function testBetterCoverReplacesWorse() {
  const query = normalizeQuery('Unsouled')
  const lowCover = scoreCandidate(c({ source: 'google', title: 'Unsouled', authors: ['Will Wight'], isbn13: ['9780989671769'], cover_url: 'https://img/cover-120.jpg' }), query)
  const highCover = scoreCandidate(c({ source: 'openlibrary', title: 'Unsouled', authors: ['Will Wight'], isbn13: ['9780989671769'], cover_url: 'https://img/cover-1200.jpg' }), query)
  const merged = mergeCandidates([lowCover, highCover], query)
  assert.equal(merged.groupedResults[0].grouped_work.best_cover_url, 'https://img/cover-1200.jpg')
}

function testDuplicatesRemovedProperly() {
  const query = normalizeQuery('The Hobbit')
  const a = scoreCandidate(c({ source: 'google', source_edition_id: 'g-hob', title: 'The Hobbit', authors: ['J.R.R. Tolkien'], isbn13: ['9780547928227'] }), query)
  const b = scoreCandidate(c({ source: 'openlibrary', source_edition_id: 'OLHOBM', title: 'The Hobbit', authors: ['J. R. R. Tolkien'], isbn13: ['9780547928227'] }), query)
  const merged = mergeCandidates([a, b], query)
  assert.equal(merged.groupedResults.length, 1)
  assert.equal(merged.groupedResults[0].editions.length, 2)
}

function testHebrewQueriesPreferHebrewResults() {
  const query = 'שם הרוח'
  const ranked = rankResults([
    c({ source: 'google', title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], languages: ['en'] }),
    c({ source: 'steimatzky', title: 'שם הרוח', authors: ['פטריק רותפס'], languages: ['he'] }),
  ], query, 'he')
  assert.equal(ranked[0].languages?.[0], 'he')
}

export function runBookSearchTests() {
  testSameBookAcrossSourcesMergeCorrectly()
  testSimilarTitlesDoNotMerge()
  testEnglishAndHebrewEditionsDoNotMerge()
  testHardcoverPaperbackDifferentIdentityStaySeparate()
  testOpenLibraryEditionMatchingByIsbnWorks()
  testHebrewStoreSkuStaysSeparate()
  testMissingFieldsFilledFromLaterSources()
  testBetterCoverReplacesWorse()
  testDuplicatesRemovedProperly()
  testHebrewQueriesPreferHebrewResults()
}

runBookSearchTests()
