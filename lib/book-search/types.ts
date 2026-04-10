export type BookLanguage = 'en' | 'other'

export type EnglishBookFormat =
  | 'paperback'
  | 'hardcover'
  | 'kindle'
  | 'audiobook'
  | 'mass_market_paperback'
  | 'audio_cd'
  | 'unknown'

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
  format?: EnglishBookFormat
  formatLabel?: string
  narrator?: string
  edition?: string
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
  format?: EnglishBookFormat
  formatLabel?: string
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
  'format',
  'formatLabel',
  'narrator',
  'edition',
]
