export type BookLanguage = 'en' | 'other'

export type EnglishBook = {
  title: string
  series?: string
  authors: string[]
  summary?: string
  genres: string[]
  isbn?: string
  isbn13?: string
  language?: string
  cover?: string
  publisher?: string
  publishedDate?: string
  pageCount?: number
  sourceEditionId?: string
  sourceRefs?: {
    amazonAsin?: string
    googleVolumeId?: string
    openLibraryWorkKey?: string
    openLibraryEditionKey?: string
  }
  sourceTrace?: string[]
}

export type EnglishBookCandidate = {
  title: string
  series?: string
  authors: string[]
  cover?: string
  language?: string
  sourceEditionId: string
  sourceRefs: {
    amazonAsin: string
  }
}

export const ENGLISH_VISIBLE_FIELDS: Array<keyof EnglishBook> = [
  'title',
  'series',
  'authors',
  'summary',
  'genres',
  'isbn',
  'isbn13',
  'language',
  'cover',
  'publisher',
  'publishedDate',
  'pageCount',
]
