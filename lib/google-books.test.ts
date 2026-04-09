import assert from 'node:assert/strict'

import { mergeDuplicateBooks } from '@/lib/book-merge'
import { __testables, type GoogleBook } from '@/lib/google-books'

function makeGoogleBook(partial: Partial<GoogleBook>): GoogleBook {
  return {
    id: partial.id || 'book:test',
    source: partial.source || 'google',
    sourceDetails: partial.sourceDetails || { sources: {} },
    volumeInfo: {
      title: partial.volumeInfo?.title || 'Unknown',
      ...(partial.volumeInfo || {}),
    },
    ...(partial.sourceTrace ? { sourceTrace: partial.sourceTrace } : {}),
  }
}

export function testHebrewEditionRanking() {
  const work = __testables.mapOpenLibraryDocToBook({
    key: '/works/OL82563W',
    title: 'The Name of the Wind',
    language: ['eng'],
    author_name: ['Patrick Rothfuss'],
  })!

  const hebrewEdition = __testables.mapOpenLibraryEditionToBook(
    {
      key: '/books/OL33735767M',
      title: 'שם הרוח',
      subtitle: 'רשומות קוטל המלכים',
      languages: [{ key: '/languages/heb' }],
      isbn_13: ['9789650719755'],
      covers: [12345],
      publishers: ['כנרת'],
      publish_date: '2010',
      authors: [{ name: 'פטריק רותפס' }],
    },
    '/works/OL82563W'
  )!

  const ranked = __testables.rankAndDedupeBooks([work, hebrewEdition], 'שם הרוח', 'he')
  assert.equal(ranked[0].sourceDetails?.openLibrary?.editionKey, '/books/OL33735767M')
  assert.equal(ranked[0].volumeInfo.language, 'he')
}

export function testEditionEnrichesWorkResult() {
  const work = __testables.mapOpenLibraryDocToBook({
    key: '/works/OL82563W',
    title: 'The Name of the Wind',
    author_name: ['Patrick Rothfuss'],
  })!

  const edition = __testables.mapOpenLibraryEditionToBook(
    {
      key: '/books/OL33735767M',
      title: 'שם הרוח',
      languages: [{ key: '/languages/heb' }],
      publishers: ['כנרת'],
      publish_date: '2010',
      isbn_13: ['9789650719755'],
    },
    '/works/OL82563W'
  )!

  const merged = mergeDuplicateBooks([work, edition])
  assert.equal(merged.length, 1)
  assert.ok((merged[0].sourceTrace || []).includes('openlibrary'))
  assert.ok(Boolean(merged[0].volumeInfo.publisher))
}

export function testDuplicateMergeAcrossSources() {
  const openLibraryBook = makeGoogleBook({
    id: 'openlibrary:/books/OL1M',
    source: 'openlibrary',
    sourceDetails: {
      sources: { openlibrary: { id: '/books/OL1M' } },
      openLibrary: { editionKey: '/books/OL1M', isEdition: true },
    },
    volumeInfo: {
      title: 'שם הרוח',
      authors: ['פטריק רותפס'],
      language: 'he',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9789650719755' }],
    },
  })

  const googleBook = makeGoogleBook({
    id: 'google:abc',
    source: 'google',
    sourceDetails: { sources: { google: { id: 'abc' } } },
    volumeInfo: {
      title: 'שם הרוח',
      authors: ['פטריק רותפס'],
      language: 'he',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9789650719755' }],
    },
  })

  const merged = mergeDuplicateBooks([openLibraryBook, googleBook])
  assert.equal(merged.length, 1)
  assert.ok((merged[0].sourceTrace || []).includes('openlibrary'))
  assert.ok((merged[0].sourceTrace || []).includes('google'))
}

export function testCoverSelectionFromOpenLibrary() {
  const withCover = __testables.mapOpenLibraryEditionToBook({
    key: '/books/OL33735767M',
    title: 'שם הרוח',
    covers: [98765],
    isbn_13: ['9789650719755'],
  })!

  const withoutCover = makeGoogleBook({
    id: 'google:without-cover',
    source: 'google',
    sourceDetails: { sources: { google: { id: 'without-cover' } } },
    volumeInfo: {
      title: 'שם הרוח',
      authors: ['פטריק רותפס'],
      language: 'he',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9789650719755' }],
    },
  })

  const merged = mergeDuplicateBooks([withoutCover, withCover])
  const thumbnail = merged[0].volumeInfo.imageLinks?.thumbnail
  assert.ok(thumbnail?.includes('covers.openlibrary.org/b/id/98765-L.jpg'))
}
